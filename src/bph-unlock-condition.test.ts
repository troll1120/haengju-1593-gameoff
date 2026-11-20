import { expect, test } from "bun:test";
import { BPH_GENERALS, BPH_GENERAL_UNLOCKS } from "./bph-commanders";
import { BPH_PROFILES } from "./bph-data";
import { freshBphSave } from "./bph-save";
import { bphConcealmentConditions, bphLockedCardCondition, bphLockedGeneralCondition, bphLockedPackCondition } from "./bph-unlock-condition";
import { activateBphQuests, activeBphEffects, BPH_UPGRADE_NODES, bphNodeBlockers, buyBphNode, recordBphProgress } from "./bph-upgrades";
import { bphUnlockedPacks } from "./bph-shop";
import { setLanguage } from "./i18n";

test("every tree troop has a gameplay condition or an explicit unavailable route", () => {
  setLanguage("ko");
  const save = freshBphSave();
  const unavailable = [];
  for (const profile of Object.values(BPH_PROFILES)) {
    const text = bphLockedCardCondition(save, profile.id);
    expect(text, profile.id).toMatch(/^해금 방법: \S/);
    expect(text, profile.id).not.toContain(profile.name);
    if (text.endsWith("현재 빌드에서 획득할 수 없음")) unavailable.push(profile.id);
  }
  expect(unavailable.sort()).toEqual([
    "Hero5_DinoRider", "Hero7_Warlord_Spiked", "Hero8_Doppelganger",
    "Hero9_BlackHole", "Hero9_Quasar", "Hero9_Supernova", "Hero_SkeletonUpgraded",
  ]);
});

test("forest scout follows the nature rift that opens forest packs and changes to the earned pack route", () => {
  setLanguage("ko");
  const save = freshBphSave();
  // The forest barracks cell sits behind "open 3 forest packs"; the nature rift entrance is what opens forest packs.
  expect(bphLockedCardCondition(save, "Hero5_Beastmaster")).toBe("해금 방법: 강화 공통 탭에서 의병 숲 구입 후 전투에서 해당 모집 열기");
  save.packs.Pack6_Forest = { opened: 0, sinceNewHero: 0, sinceNewFoil: 0 };
  expect(bphLockedCardCondition(save, "Hero5_Beastmaster")).toBe("해금 방법: 전투에서 산림 병력 모집 열기");
});

test("quest, evolution, and companion routes retain their actual requirements", () => {
  setLanguage("ko");
  const save = freshBphSave();
  expect(bphLockedCardCondition(save, "Hero6_BloodMage")).toContain("아군 25명 전사");
  expect(bphLockedCardCondition(save, "Hero7_Icebourne")).toContain("얼음 10개 파괴");
  expect(bphLockedCardCondition(save, "Hero1_Squire2")).toContain("1단계를 해금하고 같은 병력으로 10회 처치");
  expect(bphLockedCardCondition(save, "Hero1_Squire2")).toMatch(/\(전투 중 일시 진급\)$/);
  expect(bphLockedCardCondition(save, "Hero_Bear")).toContain("동물 지원병 강화를 구입");
});

test("every general uses its own milestone threshold and preserves secrecy", () => {
  setLanguage("ko");
  const save = freshBphSave(), milestones = { runs: 0, bestSeconds: 0, bossesReached: 0, bossesKilled: 0 };
  for (const [index, general] of BPH_GENERALS.entries()) {
    const text = bphLockedGeneralCondition(save, milestones, general)?.line;
    const gate = BPH_GENERAL_UNLOCKS[index];
    expect(text, general).toMatch(/^해금 방법: \S/);
    expect(text, general).not.toContain(general);
    if (gate.target) expect(text, general).toContain(`(0/${gate.target})`);
  }
});

test("a locked pack names itself and the real gameplay route, never an invented discovery route", () => {
  setLanguage("ko");
  const save = freshBphSave();
  for (const id of ["Pack6_Forest", "Pack_Tomes", "Pack6_Bush", "Pack_Relics1", "Pack9_Cosmic"])
    expect(bphLockedPackCondition(id), id).not.toContain("해당 그룹");
  expect(bphLockedPackCondition("Pack6_Forest")).toBe("해금 방법: 강화 공통 탭에서 의병 숲 구입 → 산림 병력 모집 해금");
  expect(bphLockedPackCondition("Pack_Tomes")).toBe("해금 방법: 강화 공통 탭에서 전술 도서관 건물 해금 구입 후 전투에서 건물 가동"
    + " 또는 강화 공통 탭에서 전술 모집 해금 구입 → 전술 모집 해금");
  expect(bphLockedPackCondition("Pack2_Advanced")).toBe("해금 방법: 고니시 유키나가 1마리 처치 후 퀘스트 보상 수령 → 숙련 병력 모집 해금");
  // The nature rift wave that spawns brush packs is never played, and nothing grants the relic pack.
  expect(bphLockedPackCondition("Pack6_Bush")).toBe("해금 방법: 수풀 모집 — 현재 빌드에서 획득할 수 없음");
  expect(bphLockedPackCondition("Pack_Relics1")).toBe("해금 방법: 유물 모집 — 현재 빌드에서 획득할 수 없음");
  // The owner's shared-tab tile: the forest rift entrance is the way to the forest pack, so that pack never hides it.
  expect(bphConcealmentConditions(save, BPH_UPGRADE_NODES.Rift_Nature)).toEqual([]);
});

test("a new account opens forest packs, the forest pack quest, and the forest barracks in order", () => {
  setLanguage("ko");
  const save = freshBphSave();
  for (const key of Object.keys(save.resources) as (keyof typeof save.resources)[]) save.resources[key] = 9999;
  const rift = "_SkillTreeMain_Demo:23:13", quest = "_SkillTreeNature:21:17", barracks = "_SkillTreeNature:21:18";
  expect(bphUnlockedPacks(save, activeBphEffects(save)).has("Pack6_Forest")).toBe(false);
  expect(buyBphNode(save, rift)).toBe(true);
  expect(bphUnlockedPacks(save, activeBphEffects(save)).has("Pack6_Forest")).toBe(true);
  expect(bphLockedCardCondition(save, "Hero5_Beastmaster")).toBe("해금 방법: 전투에서 산림 병력 모집 열기");
  activateBphQuests(save);
  expect(save.questActivatedAt[quest]).toBeDefined();
  expect(bphNodeBlockers(save, barracks)).toContain("연결된 선행 노드 필요");
  recordBphProgress(save, { kind: "pack-opened", packId: "Pack6_Forest", count: 3 });
  expect(buyBphNode(save, quest)).toBe(true);
  expect(bphNodeBlockers(save, barracks)).toEqual([]);
  expect(buyBphNode(save, barracks)).toBe(true);
});

test("the tactics unlock cell is not hidden behind the very pack it unlocks", () => {
  const save = freshBphSave();
  expect(bphConcealmentConditions(save, BPH_UPGRADE_NODES.SN_ShopUnlockTomePack)).toEqual([]);
});

test("English locked-pack routes name the pack and the upgrade tab", () => {
  setLanguage("en");
  try {
    expect(bphLockedPackCondition("Pack_Tomes")).toMatch(/^How to unlock: Buy [^가-힣]+ in Upgrades \(Shared tab\)[^가-힣]* → unlocks Tactics Recruit$/);
    expect(bphLockedPackCondition("Pack6_Forest")).toBe("How to unlock: Buy Militia Forest in Upgrades (Shared tab) → unlocks Forest Recruit");
    expect(bphLockedPackCondition("Pack6_Bush")).toBe("How to unlock: Brush Recruit — Unavailable in this build");
    expect(bphLockedPackCondition("Pack2_Advanced")).not.toMatch(/[가-힣]|Discover a troop/);
  } finally {
    setLanguage("ko");
  }
});

test("English uses localized pack and achievement text", () => {
  setLanguage("en");
  try {
    const save = freshBphSave();
    expect(bphLockedCardCondition(save, "Hero5_Beastmaster")).toMatch(/^How to unlock: Buy [^가-힣]+ in Upgrades/);
    expect(bphLockedCardCondition(save, "Hero6_BloodMage")).toBe(
      "How to unlock: Lose 25 allies, then claim the quest reward, then open its recruit pack in battle");
    expect(bphLockedGeneralCondition(save, { runs: 0, bestSeconds: 141, bossesReached: 0, bossesKilled: 0 },
      BPH_GENERALS[2])?.line).toMatch(/^How to unlock: [^가-힣]+ \(141\/180\)$/);
  } finally {
    setLanguage("ko");
  }
});
