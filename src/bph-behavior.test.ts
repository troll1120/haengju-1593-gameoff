import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { createBphRun, ensureBphSave } from "./bph-session";
import { addBphProfile, hitBphPack } from "./bph-combat";
import { buyBphOffer, createBphShop } from "./bph-shop";
import { advance, createRun, useSkill } from "./rules";
import { bphFxContext, updateBphPointer } from "./bph-fx-dispatch";
import { bphReelFrame } from "./bph";
import { setFieldSize } from "./geometry";

function prepared() {
  const meta = freshMeta(), save = ensureBphSave(meta);
  buyBphOffer(save, createBphShop(save, []), 0);
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: [] });
  hitBphPack(run, save.inventory[0].id);
  const receipt = hitBphPack(run, save.inventory[0].id)[0];
  return { run, save, receipt };
}
test("the first purchased pack produces exactly one soldier only on its second field hit", () => {
  const meta = freshMeta(), save = ensureBphSave(meta);
  buyBphOffer(save, createBphShop(save, []), 0);
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: [] });
  expect(run.squads[0].soldiers).toHaveLength(0);
  hitBphPack(run, 1);
  expect(run.squads[0].soldiers).toHaveLength(0);
  hitBphPack(run, 1); hitBphPack(run, 1);
  expect(run.squads[0].soldiers).toHaveLength(1);
  expect(save.totalOpened).toBe(1);
  expect(save.inventory).toHaveLength(0);
});
test.each([
  // Primary release 39461657, with four common spearmen per authored slot.
  ["ready", false, 3957, 0, [2250]],
  ["observed", false, 3706, 0, [2250]],
  ["ready", true, 5103, 14, [2250, 4500]],
  ["observed", true, 3907, 10, [2250]],
] as const)("run one loses through actual HQ damage with %s inputs and free supplies=%s",
  (input, supplies, lossTick, receipts, expectedMinibossTicks) => {
  setFieldSize(370, 800);
  try {
    const { run } = prepared();
    if (!supplies) run.bph!.supplyAt = Infinity;
    // First six skill clicks come from run1-proof-1794687159347.json.
    // The first pack's second touch is at (145, 470) in this 370x800 field.
    const clicks = [3.6666666666666634, 11.866666666666635, 20.033333333333488,
      28.633333333333916, 37.23333333333378, 45.49999999999998, 53.9, 62.3, 70.7, 79.1];
    let next = 0, tick = 0, previousBase = run.base;
    const minibossTicks: number[] = [], seenMinibosses = new Set<number>();
    if (input === "observed") updateBphPointer(run, { x: 145, y: 470 });
    while (run.phase === "playing" && tick <= lossTick) {
      tick++;
      previousBase = run.base;
      advance(run, 1 / 30);
      for (const enemy of run.enemies) if (enemy.miniboss && !seenMinibosses.has(enemy.id)) {
        seenMinibosses.add(enemy.id);
        minibossTicks.push(tick);
      }
      if (input === "ready") useSkill(run, 0);
      else if (run.time >= clicks[next]) { useSkill(run, 0); next++; }
    }
    expect(run.phase).toBe("lost");
    expect(tick).toBe(lossTick);
    expect(run.time).toBeCloseTo(lossTick / 30, 8);
    expect(minibossTicks).toEqual([...expectedMinibossTicks]);
    expect(run.bph!.barracksReceipts ?? []).toHaveLength(receipts);
    expect(previousBase).toBeGreaterThan(0);
    expect(run.base).toBe(0);
    expect(run.lossCause).toBe("army");
  } finally { setFieldSize(390, 650); }
});
test("roulette presentations leave real battle and account streams identical", () => {
  const first = prepared(), second = prepared();
  for (let tick = 0; tick < 150; tick++) {
    bphReelFrame(first.receipt, tick / 30, { seconds: 1.2, cells: 8, skipped: false });
    bphReelFrame(second.receipt, tick / 30, { seconds: 8, cells: 97, skipped: tick > 4 });
    advance(first.run, 1 / 30); advance(second.run, 1 / 30);
  }
  expect(first.run.rng).toBe(second.run.rng);
  expect(first.save).toEqual(second.save);
  expect(first.run.enemies).toEqual(second.run.enemies);
});
test("real lethal damage evolves the same soldier at 10, 20 and 50 cumulative kills", () => {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [{
    nodeId: "evolution", type: "HeroKillUpgradeUnlock", value: 3, effectPower: 0, effectPowerScale: 0,
    stackCap: 0, countStep: 0, targets: { targetHero: "Hero1_Squire" },
  }] });
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  const unit = run.squads[0].soldiers[0], context = bphFxContext(run);
  if (!context) throw new Error("The battle did not bind consumers");
  unit.hp = unit.maxHp / 2;
  const forms: (string | undefined)[] = [];
  const identities: (string | null)[] = [];
  for (let kill = 1; kill <= 50; kill++) {
    const enemy = { ...createRun(4).enemies[0], id: run.nextId++, hp: 1, maxHp: 1, shielded: false };
    run.enemies.push(enemy); context.applyDamage({ target: enemy, amount: 2, source: unit });
    if ([9, 10, 19, 20, 49, 50].includes(kill)) {
      forms.push(unit.bph?.profileId);
      identities.push(context.profileId(unit));
    }
  }
  expect(forms).toEqual(["Hero1_Squire", "Hero1_Squire2", "Hero1_Squire2", "Hero1_Squire3", "Hero1_Squire3", "Hero4_Bannerman"]);
  expect(identities).toEqual(["Hero1_Squire", "Hero1_Squire", "Hero1_Squire", "Hero1_Squire", "Hero1_Squire", "Hero4_Bannerman"]);
  expect(unit.hp / unit.maxHp).toBe(.5);
});
