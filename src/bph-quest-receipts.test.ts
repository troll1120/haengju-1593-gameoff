import { expect, test } from "bun:test";
import type { BphFxEvent } from "./bph-contract";
import { addBphProfile } from "./bph-combat";
import { bphFxContext } from "./bph-fx-dispatch";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { freshBphSave, parseBphSave } from "./bph-save";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { BPH_PLACEMENTS, canBuyBphNode, recordBphProgress } from "./bph-upgrades";
import { claimQuestRewards, migrateQuestIncomeReceipts, observeQuestEvent } from "./bph-quests";
import { createRun } from "./rules";

function fixture(id = "Q_DefeatCursor") {
  const save = freshBphSave();
  save.dimension = 2;
  const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === id);
  if (!placement) throw new RangeError(id);
  save.purchasedPlacements = [...BPH_PLACEMENTS.values()].filter(p => p.nodeId !== id).map(p => p.id);
  recordBphProgress(save, { kind: "chapter-entered", chapter: 0, dimension: 2 });
  const meta = freshMeta();
  meta.bph = save;
  const run = createBphRun(meta, { seed: 17, general: "권율", upgrades: [] });
  return { save, placement, run };
}

function damage(receiptId: number, dealt: number, side: "enemy" | "ally" = "enemy"):
  Extract<BphFxEvent, { readonly kind: "damage-dealt" }> & { readonly receiptId: number } {
  return { kind: "damage-dealt", receiptId, side, dealt, target: createRun(1).enemies[0],
    source: null, attempted: dealt + 700, blocked: 200, overkill: 500, critical: false };
}

test("combat damage reaches 2000 from actual enemy HP receipts, independently per AoE target", () => {
  const { save, placement } = fixture();
  observeQuestEvent(save, damage(1, 1200));
  observeQuestEvent(save, damage(2, 799));
  expect(save.questProgress[placement.id]).toBe(1999);
  expect(canBuyBphNode(save, placement.id)).toBe(false);
  observeQuestEvent(save, damage(2, 799));
  observeQuestEvent(save, damage(3, 800, "ally"));
  observeQuestEvent(save, damage(4, 0));
  expect(save.questProgress[placement.id]).toBe(1999);
  observeQuestEvent(save, damage(5, 1));
  expect(save.questProgress[placement.id]).toBe(2000);
  expect(canBuyBphNode(save, placement.id)).toBe(true);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  observeQuestEvent(restored, damage(5, 1));
  expect(restored.questProgress[placement.id]).toBe(2000);
});

test("damage without a receipt or before activation is never backfilled", () => {
  const { save, placement } = fixture();
  delete save.questActivatedAt[placement.id];
  observeQuestEvent(save, damage(1, 500));
  recordBphProgress(save, { kind: "chapter-entered", chapter: 0, dimension: 2 });
  observeQuestEvent(save, damage(1, 500));
  const { receiptId: _receiptId, ...unreceipted } = damage(2, 800);
  observeQuestEvent(save, unreceipted);
  expect(save.questProgress[placement.id]).toBe(0);
  observeQuestEvent(save, damage(3, 500));
  expect(save.questProgress[placement.id]).toBe(500);
});

test("native area damage counts each target HP loss and excludes overkill", () => {
  const { save, placement, run } = fixture();
  const context = bphFxContext(run);
  if (!context) throw new RangeError("missing battle context");
  const enemy = createRun(31).enemies[0];
  const first = { ...enemy, id: 10001, hp: 600, maxHp: 600, kind: "yari" as const, shielded: false };
  const second = { ...first, id: 10002, hp: 700, maxHp: 700 };
  const third = { ...first, id: 10003 };
  run.enemies = [first, second, third];
  // One area attack applies the same attempted hit to each living target.
  for (const target of run.enemies)
    context.applyDamage({ target, amount: 1000, spellId: "Spell_Fireball" });
  expect(first.hp).toBeLessThanOrEqual(0);
  expect(second.hp).toBeLessThanOrEqual(0);
  expect(save.questProgress[placement.id]).toBe(1900);
});

test("new summons and duplicates count while transforms and revived lives do not", () => {
  for (const [id, target] of [["Q_HeroSkeleton", "Hero_Skeleton"], ["Q_HeroIllusionist", "Hero3_Illusionist"]]) {
    const { save, placement, run } = fixture(id);
    for (const cause of ["summon", "duplicate", "revive", "transform"] as const)
      addBphProfile(run, { profileId: target, copies: 1, foil: false, discovered: false },
        { packId: "Pack1_Basic", cause });
    expect(save.questProgress[placement.id]).toBe(2);
    const unit = run.squads[0].soldiers.at(-1);
    if (!unit) throw new RangeError("missing unit");
    observeQuestEvent(save, { kind: "unit-spawn", unit, profileId: target,
      life: { unitId: unit.id, lifeId: 2, profileId: target, parentId: null, cause: "pack" } });
    expect(save.questProgress[placement.id]).toBe(2);
  }
});

test("all quest income uses one idempotent claim contract, including pack and kill quests", () => {
  const save = freshBphSave();
  const quests = [...BPH_PLACEMENTS.values()].filter(p => {
    const node = p.nodeId && BPH_UPGRADE_NODES[p.nodeId];
    return node && node.type === 4 && node.thresholds.length > 0;
  });
  const income = save.income;
  let expected = 0;
  for (const placement of quests) {
    const node = BPH_UPGRADE_NODES[placement.nodeId ?? ""];
    save.questProgress[`claims:${placement.id}`] = 1;
    const claim = { placementId: placement.id, nodeId: node.id, claim: 1, receiptId: `quest:${placement.id}:1` };
    claimQuestRewards(save, placement, node, claim);
    claimQuestRewards(save, placement, node, claim);
    expected += node.values.questIncomeFlatBonus ?? 0;
  }
  expect(save.income).toBe(income + expected);
});

test("legacy income migration fills paid receipts without paying or inventing progress", () => {
  const { save, placement } = fixture("Q_HeroMage");
  const node = BPH_UPGRADE_NODES.Q_HeroMage;
  save.questProgress[`claims:${placement.id}`] = 1;
  save.income = 13;
  const progress = structuredClone(save.questProgress);
  migrateQuestIncomeReceipts(save);
  const receipts = [...save.lifecycle.claimed];
  migrateQuestIncomeReceipts(save);
  expect(save.lifecycle.claimed).toEqual(receipts);
  expect(save.questProgress).toEqual(progress);
  expect(save.income).toBe(13);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  claimQuestRewards(restored, placement, node,
    { placementId: placement.id, nodeId: node.id, claim: 1, receiptId: `quest:${placement.id}:1` });
  expect(restored.income).toBe(13);
});
