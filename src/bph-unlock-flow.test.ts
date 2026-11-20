import { expect, test } from "bun:test";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphShop } from "./bph-shop";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, activeBphEffects, buyBphNode, canBuyBphNode, recordBphProgress } from "./bph-upgrades";
import { observeQuestEvent } from "./bph-quests";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { addBphProfile } from "./bph-combat";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { freezeMartialEnemy, martialIceHit, tickMartialIce } from "./bph-native-martial-ice";
import type { BphSave } from "./bph-contract";
import { spawn } from "./rules";

function ready(id: string) {
  const save = freshBphSave();
  save.dimension = 2; save.income = 100;
  const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === id);
  if (!placement) throw new Error(`Missing quest ${id}`);
  save.purchasedPlacements = [...BPH_PLACEMENTS.values()].filter(p => p.nodeId !== id).map(p => p.id);
  for (const key of Object.keys(save.resources)) Object.assign(save.resources, { [key]: 1_000_000 });
  recordBphProgress(save, { kind: "chapter-entered", chapter: 0, dimension: 2 });
  return { save, placement };
}
function offered(save: BphSave): string[] {
  return [...new Set(createBphShop(save, activeBphEffects(save)).offers.map(o => o.packId))];
}
for (const [id, pack, target] of [
  ["Q_DefeatOgre", "Pack2_Advanced", "Boss1_Apogre"],
  ["Q_DefeatBeast", "Pack3_Magic", "Boss2_Beast"],
  ["Q_DefeatWitch", "Pack4_Royal", "Boss3_Witch2"],
] as const) {
  test(`${pack} stays absent until its boss quest reward is claimed and survives reload`, () => {
    const { save, placement } = ready(id);
    // Unrelated purchased upgrade effects must not decide this quest's availability.
    save.purchasedPlacements = save.purchasedPlacements.filter(p => {
      const node = BPH_UPGRADE_NODES[BPH_PLACEMENTS.get(p)?.nodeId ?? ""];
      return !node?.effects.some(e => e.type === "ShopUnlockTargetPack");
    });
    expect(offered(save)).not.toContain(pack);
    recordBphProgress(save, { kind: "enemy-killed", enemyId: target, count: 1 });
    expect(offered(save)).not.toContain(pack);
    expect(buyBphNode(save, placement.id)).toBe(true);
    expect(offered(save)).toContain(pack);
    expect(offered(parseBphSave(JSON.parse(JSON.stringify(save))))).toContain(pack);
  });
}
test("a new save can recruit and an already owned locked pack remains available", () => {
  const save = freshBphSave();
  expect(offered(save)).toEqual(["Pack1_Basic"]);
  save.income = 4;
  save.packs.Pack2_Advanced = { opened: 1, sinceNewHero: 0, sinceNewFoil: 0 };
  expect(offered(save)).toContain("Pack2_Advanced");
});
test("25 real ally deaths unlock the death recruitment reward exactly once", () => {
  const { save, placement } = ready("Q_HeroDeaths"), meta = freshMeta();
  meta.bph = save;
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: [] });
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 25, foil: false, discovered: false },
    { packId: "Pack1_Basic" });
  const units = run.squads[0].soldiers;
  for (const unit of units.slice(0, 24)) {
    unit.hp = 0;
    dispatchBphEffects(run, { kind: "unit-death", unit, killer: null });
    dispatchBphEffects(run, { kind: "unit-death", unit, killer: null });
  }
  expect(save.questProgress[placement.id]).toBe(24);
  expect(canBuyBphNode(save, placement.id)).toBe(false);
  const last = units[24]; last.hp = 0;
  const death = { kind: "unit-death", unit: last, killer: null } as const;
  dispatchBphEffects(run, death);
  expect(buyBphNode(save, placement.id)).toBe(true);
  expect(offered(save)).toContain("Pack5_Skeleton");
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  observeQuestEvent(restored, death);
  expect(restored.questProgress[placement.id]).toBe(25);
  expect(buyBphNode(restored, placement.id)).toBe(false);
});
test("ten actual ice shatters unlock arctic recruitment; hits and expiry do not", () => {
  const { save, placement } = ready("Q_BreakIceCubes"), meta = freshMeta();
  meta.bph = save;
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: [] });
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic" });
  const ctx = bphFxContext(run);
  if (!ctx) throw new Error("Missing effect context");
  const source = run.squads[0].soldiers[0], enemy = spawn(run);
  freezeMartialEnemy(ctx, source, enemy);
  run.time += 6;
  tickMartialIce(ctx, 6);
  expect(save.questProgress[placement.id]).toBe(0);
  for (let n = 0; n < 10; n++) {
    freezeMartialEnemy(ctx, source, enemy);
    for (let hit = 0; hit < 3; hit++) martialIceHit(ctx, {
      kind: "before-enemy-damage", enemy, source, hit: { amount: 1, prevented: false, critical: false },
    });
    expect(save.questProgress[placement.id]).toBe(n);
    expect(canBuyBphNode(save, placement.id)).toBe(false);
    martialIceHit(ctx, { kind: "before-enemy-damage", enemy, source,
      hit: { amount: 1, prevented: false, critical: false } });
  }
  expect(save.questProgress[placement.id]).toBe(10);
  expect(buyBphNode(save, placement.id)).toBe(true);
  expect(offered(save)).toContain("Pack7_Arctic");
});
