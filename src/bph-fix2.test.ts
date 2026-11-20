import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { bphBattleMedals, createBphRun, ensureBphSave, settleBphRun } from "./bph-session";
import { addBphProfile, bphArms } from "./bph-combat";
import { advance, createRun } from "./rules";
import { freshBphSave } from "./bph-save";
import { buyBphNode, visibleBphPlacements } from "./bph-upgrades";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { bphFxContext } from "./bph-fx-dispatch";

test("the original Squire strikes one target even when legacy class upgrades exist", () => {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic", position: { x: 70, y: 100 } });
  const unit = run.squads[0].soldiers[0];
  const template = createRun(4).enemies[0];
  run.enemies = [90, 94].map(x => ({ ...template, id: run.nextId++, x, y: 100,
    hp: 100, maxHp: 100, speed: 0, clock: 1000, shielded: false }));
  run.squads[0].clock = 1000;
  unit.strikeAt = .001; unit.aim = run.enemies[0].id;
  run.tactics.spearman.storm = true; run.tactics.spearman.epic = true;

  advance(run, .05);

  expect(bphArms(unit, run)).toMatchObject({ cleave: 1, span: 0, shot: "" });
  expect(run.enemies.map(enemy => enemy.hp)).toEqual([99, 100]);
});

test("first upgrade reveals neighbors while distant branches remain hidden", () => {
  const save = freshBphSave(); save.resources.mastery = 7;
  const first = "_SkillTreeMain_Demo:23:15";
  expect(visibleBphPlacements(save, BPH_DEFAULT_GRID).map(p => p.id)).toEqual([first]);
  expect(visibleBphPlacements(save, BPH_DEFAULT_GRID).some(p => p.id === "_SkillTreeMain_Demo:21:15")).toBe(false);

  expect(buyBphNode(save, first)).toBe(true);

  const visible = visibleBphPlacements(save, BPH_DEFAULT_GRID);
  expect(visible.some(p => p.id === "_SkillTreeMain_Demo:21:15")).toBe(true);
  expect(visible.some(p => p.y > 30)).toBe(false);
});

test("combat coins cannot purchase permanent upgrades and expire after battle", () => {
  const meta = freshMeta(), save = ensureBphSave(meta);
  const run = createBphRun(meta, { seed: 1, general: "권율", upgrades: [] });
  run.gold = 100;
  expect(buyBphNode(save, "_SkillTreeMain_Demo:23:15")).toBe(false);
  run.phase = "lost";

  settleBphRun(meta, run);
  const next = createBphRun(meta, { seed: 2, general: "권율", upgrades: [] });

  expect(save.resources.mastery).toBe(0);
  expect(next.gold).toBe(3);
});

test.each([
  [17, 1, 0], [3, 0, 0], [16, 0, 1],
])("an ordinary BPH kill of enemy %i credits split drops and a full point of visible XP", (id, coins, medals) => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  const context = bphFxContext(run);
  if (!context) throw new Error("BPH context missing");
  const template = createRun(4).enemies[0];
  const enemy = { ...template, id, bphProfileId: "Monster1_Caveling", hp: 1, maxHp: 1 };
  run.enemies = [enemy];
  const before = { gold: run.gold, xp: run.xp, medals: bphBattleMedals(run) };

  context.applyDamage({ target: enemy, amount: 2, source: run.squads[0] });

  expect(run.gold - before.gold).toBe(coins);
  expect(run.xp).toBe(before.xp + 1);
  expect(bphBattleMedals(run) - before.medals).toBe(medals);
});
