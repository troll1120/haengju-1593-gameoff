import { expect, test } from "bun:test";
import type { BphFxEvent, BphSave } from "./bph-contract";
import type { BphQuestClaim } from "./bph-effects-entry";
import { beginBphCast } from "./bph-effects-entry";
import { addBphProfile, hitBphPack } from "./bph-combat";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { tickBphSpells } from "./bph-spells";
import { BPH_DEFAULT_GRID, BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import type { BphPlacement } from "./bph-upgrade-data";
import {
  BPH_PLACEMENTS, bphNodeBlockers, buyBphNode, canBuyBphNode, recordBphProgress,
} from "./bph-upgrades";
import { claimQuestRewards, observeQuestEvent, questUnsupportedFields } from "./bph-quests";
import { freshMeta, keepMeta, loadMeta } from "./meta";
import { advance, createRun } from "./rules";
import type { Run } from "./rules";

const cases = [
  { id: "Q_HeroSquire", target: "Hero1_Squire", quantity: 10 },
  { id: "Q_HeroArcher", target: "Hero1_Archer", quantity: 3 },
  { id: "Q_HeroBarbarian", target: "Hero1_Barbarian", quantity: 5 },
  { id: "Q_SpellThunder", target: "Spell_Thunderbolt", quantity: 100 },
  { id: "Q_HeroPaladin", target: "Hero2_Knight", quantity: 5 },
  { id: "Q_HeroMage", target: "Hero2_Pyromancer", quantity: 3 },
  { id: "Q_HeroRogue", target: "Hero2_Monk", quantity: 8 },
  { id: "Q_HeroSkeleton", target: "Hero_Skeleton", quantity: 66 },
  { id: "Q_HeroWitchDoctor", target: "Hero3_WitchDoctor", quantity: 8 },
  { id: "Q_HeroThief", target: "Hero3_DemonSlayer", quantity: 5 },
  { id: "Q_HeroIllusionist", target: "Hero3_Illusionist", quantity: 50 },
] as const;

function placement(id: string): BphPlacement {
  const found = [...BPH_PLACEMENTS.values()].find(p => p.gridId === BPH_DEFAULT_GRID && p.nodeId === id);
  if (!found) throw new RangeError(id);
  return found;
}
/** Progressed account fixture; no quest progress or claims are injected. */
function prepared(id: string): BphSave {
  const save = freshBphSave();
  save.dimension = 2;
  for (const key of Object.keys(save.resources)) Object.assign(save.resources, { [key]: 1_000_000_000 });
  const predecessors = [...BPH_PLACEMENTS.values()].filter(p =>
    p.nodeId && p.nodeId !== id && !BPH_HIDDEN_UPGRADES.has(p.nodeId));
  save.purchasedPlacements = predecessors.map(p => p.id);
  save.purchasedNodes = [...new Set(predecessors.flatMap(p => p.nodeId ? [p.nodeId] : []))];
  recordBphProgress(save, { kind: "chapter-entered", chapter: 0, dimension: save.dimension });
  return save;
}
function battle(save: BphSave, seed = 144): Run {
  const meta = freshMeta();
  meta.bph = save;
  return createBphRun(meta, { seed, general: "권율", upgrades: [] });
}
function context(run: Run) {
  const found = bphFxContext(run);
  if (!found) throw new RangeError("missing battle context");
  return found;
}
function emitTarget(run: Run, target: string, count: number): void {
  if (target !== "Spell_Thunderbolt") {
    addBphProfile(run, { profileId: target, copies: count, foil: false, discovered: false },
      { packId: "Pack1_Basic", cause: "pack", resultId: 42 });
    return;
  }
  const ctx = context(run);
  for (let i = 0; i < count; i++)
    beginBphCast(ctx, { spellId: target, source: null, target: null,
      position: { x: 0, y: 0 }, foil: false, power: 1 });
}
function lastObservation(run: Run, target: string): BphFxEvent {
  if (target === "Spell_Thunderbolt") {
    const id = run.bph?.fx.counters["wiring:cast"] ?? 0;
    return { kind: "spellCast", spellId: target, source: null, target: null, position: { x: 0, y: 0 },
      cast: { id, spellId: target, sourceId: null, sourceLifeId: null, tomeId: null,
        targetId: null, position: { x: 0, y: 0 }, foil: false, power: 1 } };
  }
  const unit = run.squads[0].soldiers.at(-1);
  const info = unit && context(run).unitInfo(unit);
  if (!unit || !info) throw new RangeError("missing spawned life");
  return { kind: "unit-spawn", unit, profileId: target,
    life: { unitId: unit.id, lifeId: info.lifeId, profileId: target,
      parentId: info.parentId, cause: info.cause } };
}

for (const row of cases) {
  test(`${row.id}: actual target reaches its authored threshold and pays income once across reload`, () => {
    const save = prepared(row.id), p = placement(row.id), run = battle(save);
    const reward = ["Q_HeroWitchDoctor", "Q_HeroThief", "Q_HeroIllusionist"].includes(row.id) ? 2 : 1;
    const wallet = structuredClone(save.resources), inventory = structuredClone(save.inventory);
    const income = save.income;
    emitTarget(run, row.target, row.quantity - 1);
    expect(save.questProgress[p.id]).toBe(row.quantity - 1);
    expect(canBuyBphNode(save, p.id)).toBe(false);
    expect(bphNodeBlockers(save, p.id)).not.toContain("집계 이벤트 미확인");
    emitTarget(run, row.target, 1);
    expect(save.questProgress[p.id]).toBe(row.quantity);
    // The discovery itself can complete a codex class. Isolate the reward from the quest purchase.
    const relics = structuredClone(save.relicState);
    expect(buyBphNode(save, p.id)).toBe(true);
    expect(save.income).toBe(income + reward);
    expect(save.questProgress[`claims:${p.id}`]).toBe(1);
    expect(save.resources).toEqual(wallet);
    expect(save.inventory).toEqual(inventory);
    expect(save.relicState).toEqual(relics);
    emitTarget(run, row.target, 1);
    expect(save.questProgress[p.id]).toBe(row.quantity);
    const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
    expect(buyBphNode(restored, p.id)).toBe(false);
    expect(restored.income).toBe(income + reward);
    expect(restored.questProgress[`claims:${p.id}`]).toBe(1);
  });

  test(`${row.id}: inactive, wrong-target, discovery and duplicate receipts cannot add progress`, () => {
    const save = prepared(row.id), p = placement(row.id);
    const run = battle(save);
    // Battle entry now refreshes activation; remove it after that refresh.
    delete save.questActivatedAt[p.id];
    emitTarget(run, row.target, 1);
    const beforeActivation = lastObservation(run, row.target);
    expect(save.questProgress[p.id]).toBe(0);
    recordBphProgress(save, { kind: "chapter-entered", chapter: 0, dimension: save.dimension });
    dispatchBphEffects(run, beforeActivation);
    recordBphProgress(save, { kind: "card-discovered", profileId: row.target, foil: false });
    emitTarget(run, row.target === "Hero1_Squire" ? "Hero1_Archer" : "Hero1_Squire", 1);
    expect(save.questProgress[p.id]).toBe(0);
    emitTarget(run, row.target, 1);
    const receipt = lastObservation(run, row.target);
    dispatchBphEffects(run, receipt);
    expect(save.questProgress[p.id]).toBe(1);
    const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
    observeQuestEvent(restored, receipt);
    expect(restored.questProgress[p.id]).toBe(1);
    expect(restored.income).toBe(save.income);
  });
}

test("real pack damage creates Squire progress that the purchase path can claim", () => {
  const save = prepared("Q_HeroSquire"), p = placement("Q_HeroSquire"), run = battle(save);
  const ctx = context(run), income = save.income;
  ctx.grantPack("Pack1_Basic", 40);
  for (const pack of [...(run.bph?.packs ?? [])]) {
    hitBphPack(run, pack.id);
    hitBphPack(run, pack.id);
    if ((save.questProgress[p.id] ?? 0) >= 10) break;
  }
  const spawned = run.squads[0].soldiers.filter(u => ctx.unitInfo(u)?.profileId === "Hero1_Squire").length;
  expect(save.questProgress[p.id]).toBe(spawned);
  expect(canBuyBphNode(save, p.id)).toBe(true);
  advance(run, 0.02);
  expect(buyBphNode(save, p.id)).toBe(true);
  expect(save.income).toBe(income + 1);
  expect(buyBphNode(save, p.id)).toBe(false);
});

test("Thunderstorm only counts executed casts with targets, not its queued tome or hits", () => {
  const save = prepared("Q_SpellThunder"), p = placement("Q_SpellThunder"), run = battle(save);
  addBphProfile(run, { profileId: "Tome_Thunderstorm", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic", cause: "pack" });
  run.enemies = [];
  tickBphSpells(run, 2);
  expect(save.questProgress[p.id]).toBe(0);
  const enemy = createRun(11).enemies[0];
  enemy.kind = "yari"; enemy.hp = enemy.maxHp = 1_000_000;
  run.enemies = [enemy];
  tickBphSpells(run, 2);
  expect(save.questProgress[p.id]).toBe(2);
  dispatchBphEffects(run, { kind: "spellHit", spellId: "Spell_Thunderbolt", source: null,
    target: enemy, position: { x: enemy.x, y: enemy.y }, amount: 3 });
  beginBphCast(context(run), { spellId: "Spell_Fireball", source: null, target: enemy,
    position: { x: enemy.x, y: enemy.y }, foil: false, power: 1 });
  expect(save.questProgress[p.id]).toBe(2);
});

test("Q1 receipt identity separates real new runs while keeping inactive state and RNG unchanged", () => {
  const inactive = freshBphSave(), snapshot = structuredClone(inactive);
  observeQuestEvent(inactive, { kind: "run-start" });
  const inactiveRun = battle(inactive);
  const control = battle(structuredClone(snapshot));
  emitTarget(inactiveRun, "Hero1_Squire", 1);
  emitTarget(control, "Hero1_Squire", 1);
  expect(inactive).toEqual(context(control).save);
  expect(inactiveRun.rng).toBe(control.rng);
  // The dimension gates are gone (owner DM 1794921703.908979), so reachable quests activate at run-start
  // and seed a zero. Observation itself still moves nothing: every entry the snapshot lacks is a zero.
  for (const [id, value] of Object.entries(inactive.questProgress))
    if (snapshot.questProgress[id] === undefined) expect(value).toBe(0);
  for (const [id, value] of Object.entries(snapshot.questProgress))
    expect(inactive.questProgress[id]).toBe(value);
  expect(inactive.lifecycle).toEqual(snapshot.lifecycle);
  const active = prepared("Q_HeroArcher"), p = placement("Q_HeroArcher");
  emitTarget(battle(active), "Hero1_Archer", 1);
  emitTarget(battle(active), "Hero1_Archer", 1);
  expect(active.questProgress[p.id]).toBe(2);
});

test("same seed active Q1 runs reproduce quest progress, receipts, account state and RNG", () => {
  const first = prepared("Q_HeroSquire"), second = structuredClone(first);
  const a = battle(first, 901), b = battle(second, 901);
  context(a).grantPack("Pack1_Basic", 8); context(b).grantPack("Pack1_Basic", 8);
  for (const run of [a, b]) for (const pack of [...(run.bph?.packs ?? [])]) {
    hitBphPack(run, pack.id); hitBphPack(run, pack.id);
  }
  expect(first).toEqual(second);
  expect(a.rng).toBe(b.rng);
  expect(first.questProgress[placement("Q_HeroSquire").id]).toBe(
    a.squads[0].soldiers.filter(u => context(a).unitInfo(u)?.profileId === "Hero1_Squire").length,
  );
});

test("non-Q1 observations and unsupported mixed fields remain gated", () => {
  const squire = BPH_UPGRADE_NODES.Q_HeroSquire;
  expect(questUnsupportedFields({ ...squire, values: { ...squire.values, questGiantHeroes: 1 } }))
    .toContain("questGiantHeroes");
  expect(questUnsupportedFields({ ...squire, id: "Q_NotAssigned" })).toContain("questHero");
  const save = prepared("Q_HeroPaladin"), p = placement("Q_HeroPaladin");
  save.purchasedPlacements = [];
  save.questActivatedAt = {};
  emitTarget(battle(save), "Hero2_Knight", 5);
  expect(save.questProgress[p.id]).toBe(0);
  expect(bphNodeBlockers(save, p.id)).toContain("연결된 선행 노드 필요");
});

test("claim receipts separate placements and threshold indices without paying twice", () => {
  const save = freshBphSave(), original = placement("Q_HeroArcher");
  // Synthetic placements/second threshold exercise the shared claim contract;
  // Q1's authored definitions still have one real placement/threshold each.
  const other = { ...original, id: "test:other-placement" };
  const node = { ...BPH_UPGRADE_NODES.Q_HeroArcher, thresholds: [3, 6] };
  const income = save.income;
  for (const p of [original, other]) for (const claim of [1, 2]) {
    save.questProgress[`claims:${p.id}`] = claim;
    const receipt: BphQuestClaim = {
      placementId: p.id, nodeId: node.id, claim, receiptId: `quest:${p.id}:${claim}`,
    };
    claimQuestRewards(save, p, node, receipt);
    claimQuestRewards(save, p, node, receipt);
  }
  expect(save.income).toBe(income + 4);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  claimQuestRewards(restored, other, node, {
    placementId: other.id, nodeId: node.id, claim: 2, receiptId: `quest:${other.id}:2`,
  });
  claimQuestRewards(restored, other, node, {
    placementId: other.id, nodeId: node.id, claim: 2, receiptId: "different-envelope-same-claim",
  });
  expect(restored.income).toBe(income + 4);
});

test("Q1 second account reload is byte-identical after the explicit legacy normalization", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  try {
    const save = prepared("Q_HeroArcher"), p = placement("Q_HeroArcher");
    emitTarget(battle(save), "Hero1_Archer", 3);
    expect(buyBphNode(save, p.id)).toBe(true);
    const meta = freshMeta();
    meta.version = 4; meta.bph = save; meta.bestSeconds = 40.03333333333362;
    meta.bossesReached = 0; meta.bossesKilled = 0;
    const wallet = structuredClone(save.resources), income = save.income;
    keepMeta(meta);
    const raw = storage.get("haengju1593-meta");
    const first = loadMeta();
    expect(first.bestSeconds).toBe(40);
    expect(first.bph?.hiddenUpgradeRefund).toMatchObject({ version: 2, count: 0, movedCount: 0, announced: true });
    // 790dd7b folds 조각·군량·전공·진영 점수 into 강화 포인트 once on load (rates 45/136/38/1500).
    expect(first.bph?.resources).toEqual({ ...wallet, skull: 0, shard: 0, fruit: 0, prestigePoint: 0,
      mastery: wallet.mastery + wallet.skull * 45 + wallet.shard * 136 + wallet.fruit * 38 + wallet.prestigePoint * 1500 });
    expect(first.bph?.income).toBe(income);
    keepMeta(first);
    const normalized = storage.get("haengju1593-meta");
    expect(normalized).not.toBe(raw);
    const second = loadMeta();
    if (!second.bph) throw new RangeError("missing reloaded account");
    expect(buyBphNode(second.bph, p.id)).toBe(false);
    keepMeta(second);
    expect(storage.get("haengju1593-meta")).toBe(normalized);
    expect(second.bph.income).toBe(income);
    expect(second.bph.questProgress[`claims:${p.id}`]).toBe(1);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
