import { afterEach, expect, test } from "bun:test";
import { bphGeneralProgress, unlockBphGeneral } from "./bph-commanders";
import { freshBphSave, parseBphSave } from "./bph-save";
import { bphMilestones, createBphRun, ensureBphSave, settleBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { setLanguage } from "./i18n";

afterEach(() => setLanguage("ko"));

test("a fresh account starts with Gwon Yul and only cleared combat objectives add generals", () => {
  const meta = freshMeta();
  const save = ensureBphSave(meta);
  save.resources.mastery = 1_000_000;
  expect(save.unlockedGenerals).toEqual(["권율"]);
  expect(unlockBphGeneral(save, bphMilestones(meta))).toEqual([]);

  const steps = [
    { runs: 1, bestSeconds: 0, bossesReached: 0, bossesKilled: 0, added: ["신립"] },
    { runs: 2, bestSeconds: 180, bossesReached: 1, bossesKilled: 0, added: ["송상현", "김시민"] },
    { runs: 3, bestSeconds: 240, bossesReached: 1, bossesKilled: 1, added: ["황진", "곽재우"] },
    { runs: 4, bestSeconds: 300, bossesReached: 1, bossesKilled: 1, added: ["사명대사"] },
    { runs: 7, bestSeconds: 300, bossesReached: 1, bossesKilled: 1, added: [] },
    { runs: 8, bestSeconds: 300, bossesReached: 1, bossesKilled: 1, added: ["이순신"] },
  ] as const;
  for (const { added, ...milestones } of steps) {
    expect(unlockBphGeneral(save, milestones)).toEqual(added);
  }
  expect(parseBphSave(JSON.parse(JSON.stringify(save))).unlockedGenerals)
    .toEqual(["권율", "신립", "송상현", "김시민", "황진", "곽재우", "사명대사", "이순신"]);
});

test("legacy starter slots cannot grant generals ahead of their combat objectives", () => {
  const meta = { ...freshMeta(), runs: 1, bestSeconds: 60, unlocked: 4 };
  const save = ensureBphSave(meta);
  unlockBphGeneral(save, bphMilestones(meta));

  expect(save.unlockedGenerals).toEqual(["권율", "신립"]);
});

test("Kim Si-min unlocks while Hwang Jin's survival gate remains unmet", () => {
  const save = freshBphSave();
  const milestones = { runs: 1, bestSeconds: 60, bossesReached: 1, bossesKilled: 0 };

  expect(unlockBphGeneral(save, milestones)).toEqual(["신립", "김시민"]);

  expect(save.unlockedGenerals).toEqual(["권율", "신립", "김시민"]);
  expect(bphGeneralProgress(save, milestones, "김시민")).toMatchObject({ line: "보스 1단계까지 도달 (1/1)", ratio: 1, icon: "skull" });
  expect(bphGeneralProgress(save, milestones, "황진")).toMatchObject({ ratio: .25 });
  expect(bphGeneralProgress(save, milestones)?.general).toBe("송상현");
});

test("the locked-general condition line reads short in Korean and English without the name", () => {
  const save = freshBphSave();
  const milestones = { runs: 7, bestSeconds: 220, bossesReached: 0, bossesKilled: 0 };
  expect(bphGeneralProgress(save, milestones, "황진")?.line).toBe("한 판에서 240초 버티기 (220/240)");
  expect(bphGeneralProgress(save, milestones, "이순신")?.line).toBe("전투 8판 완료 (7/8)");
  expect(bphGeneralProgress(save, milestones, "김시민")?.line).toBe("보스 1단계까지 도달 (0/1)");
  expect(bphGeneralProgress(save, milestones, "곽재우")?.line).toBe("보스 1번 처치 (0/1)");
  setLanguage("en");
  expect(bphGeneralProgress(save, milestones, "황진")?.line).toBe("Survive 240s in one battle (220/240)");
  expect(bphGeneralProgress(save, milestones, "이순신")?.line).toBe("Complete battles (7/8)");
  expect(bphGeneralProgress(save, milestones, "김시민")?.line).toBe("Reach boss stage 1 (0/1)");
  expect(bphGeneralProgress(save, milestones, "곽재우")?.line).toBe("Defeat bosses (0/1)");
});

test("saved milestones backfill once without changing draw state or other account data", () => {
  const save = parseBphSave(freshBphSave(88));
  const { unlockedGenerals, ...before } = structuredClone(save);
  const milestones = { runs: 8, bestSeconds: 60, bossesReached: 1, bossesKilled: 1 };

  expect(unlockBphGeneral(save, milestones)).toEqual(["신립", "김시민", "곽재우", "이순신"]);

  expect(unlockBphGeneral(save, milestones)).toEqual([]);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(unlockBphGeneral(restored, milestones)).toEqual([]);
  const { unlockedGenerals: after, ...rest } = save;
  expect(rest).toEqual(before);
  expect(after).toEqual([...unlockedGenerals, "신립", "김시민", "곽재우", "이순신"]);
});

test("terminal settlement grants every reached gate and settles only once", () => {
  const meta = freshMeta();
  const run = createBphRun(meta, { seed: 10, general: "권율", upgrades: [] });
  run.phase = "lost"; run.time = 300;

  expect(settleBphRun(meta, run)).toEqual(["신립", "송상현", "황진", "사명대사"]);

  expect(meta.bph?.unlockedGenerals).toEqual(["권율", "신립", "송상현", "황진", "사명대사"]);
  expect(settleBphRun(meta, run)).toEqual([]);
  expect(meta.runs).toBe(1);
});
