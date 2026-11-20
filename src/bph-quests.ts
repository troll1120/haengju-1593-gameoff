import type { BphFxEvent, BphSave } from "./bph-contract";
import type { BphQuestClaim, BphQuestEntry } from "./bph-effects-entry";
import type { BphPlacement, BphUpgradeNode } from "./bph-upgrade-data";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES } from "./bph-upgrades";

const supported = new Set([
  "Q_HeroSquire", "Q_HeroArcher", "Q_HeroBarbarian", "Q_SpellThunder", "Q_HeroPaladin",
  "Q_HeroMage", "Q_HeroRogue", "Q_HeroSkeleton", "Q_HeroWitchDoctor",
  "Q_HeroThief", "Q_HeroIllusionist", "Q_DefeatCursor",
  "Q_HeroDeaths", "Q_BreakIceCubes",
]);
const observationFlags = [
  "questCursorMonsterKills", "questCursorDamage", "questStunMonsters", "questCriticalHits",
  "questFoilMonsters", "questSpellKills", "questSpecialOfferHeroes", "questSacrificeHeroes",
  "questSpectralHeroes", "questGiantHeroes", "questHeroDeaths", "questCombatCoins",
  "questTransformPacks", "questHealHeroes", "questBreakIceCubes", "questDiscoverSynergies", "questHaveRelics",
] as const;
// Runtime replay tracking is not account state. Allocate a persisted epoch only
// when an active Q1 placement actually consumes an observation.
const runs = new WeakMap<BphSave, { epoch: number | null; readonly seen: Set<string> }>();
// `claimed` keeps its array shape (persisted); this mirror only answers the hot per-damage lookups in O(1).
const claimedMirrors = new WeakMap<BphSave, Set<string>>();
function claimedHas(save: BphSave, key: string): boolean {
  let mirror = claimedMirrors.get(save);
  if (!mirror || mirror.size !== save.lifecycle.claimed.length) {
    mirror = new Set(save.lifecycle.claimed);
    claimedMirrors.set(save, mirror);
  }
  return mirror.has(key);
}
function claimedAdd(save: BphSave, key: string): void {
  if (claimedHas(save, key)) return;
  save.lifecycle.claimed.push(key);
  claimedMirrors.get(save)?.add(key);
}
// The placement definitions are immutable at runtime, so the authored half of the quest scan
// (supported node, target ref, no unsupported fields) is computed once per (field, target).
const questCandidates = new Map<string, readonly BphPlacement[]>();
function candidatesFor(field: "questHero" | "questSpell" | "damage" | "death" | "ice", target: string): readonly BphPlacement[] {
  const key = `${field}:${target}`, known = questCandidates.get(key);
  if (known) return known;
  const tally = field === "damage" || field === "death" || field === "ice";
  const list = [...BPH_PLACEMENTS.values()].filter(placement => {
    const node = placement.nodeId && BPH_UPGRADE_NODES[placement.nodeId];
    return !!node && supported.has(node.id) && (tally ? node.id === target : node.refs[field] === target)
      && !questUnsupportedFields(node).length;
  });
  questCandidates.set(key, list);
  return list;
}

/** Other quest definitions and unsupported flags retain their existing gates. */
export function questUnsupportedFields(node: BphUpgradeNode): readonly string[] {
  if (node.type !== 4) return [];
  return [
    ...observationFlags.filter(key => (node.values[key] ?? 0) !== 0 &&
      !(node.id === "Q_DefeatCursor" && key === "questCursorDamage") &&
      !(node.id === "Q_HeroDeaths" && key === "questHeroDeaths") &&
      !(node.id === "Q_BreakIceCubes" && key === "questBreakIceCubes")),
    ...["questHero", "questTome", "questSpell", "questEgg"].filter(key =>
      node.refs[key] && !(supported.has(node.id) && (key === "questHero" || key === "questSpell"))),
  ];
}

export function questAmount(save: BphSave, placement: BphPlacement, _node: BphUpgradeNode): number {
  return save.questProgress[placement.id] ?? 0;
}

/** Consume applied transitions, never discovery, a queued cast, or a spell hit. */
export function observeQuestEvent(save: BphSave, event: BphFxEvent): void {
  if (event.kind === "run-start") {
    runs.set(save, { epoch: null, seen: new Set() });
    return;
  }
  let receipt: string, target: string, field: "questHero" | "questSpell" | "damage" | "death" | "ice";
  let amount = 1;
  switch (event.kind) {
    case "unit-spawn":
      if (!event.life || event.life.lifeId !== 1 || event.life.cause === "revive" ||
        event.life.cause === "transform" || event.life.profileId !== event.profileId) return;
      receipt = `unit:${event.life.unitId}:${event.life.lifeId}`;
      target = event.profileId;
      field = "questHero";
      break;
    case "spellCast":
      if (!event.cast || event.cast.spellId !== event.spellId) return;
      receipt = `cast:${event.cast.id}`;
      target = event.spellId;
      field = "questSpell";
      break;
    case "damage-dealt":
      if (event.side !== "enemy" || event.receiptId === undefined ||
        !Number.isFinite(event.dealt) || event.dealt <= 0) return;
      receipt = `damage:${event.receiptId}`;
      target = "Q_DefeatCursor";
      field = "damage";
      amount = event.dealt;
      break;
    case "unit-death":
      if (!event.unit.bph || event.unit.hp > 0) return;
      receipt = `death:${event.unit.id}:${event.unit.bph.lifeId}`;
      target = "Q_HeroDeaths";
      field = "death";
      break;
    case "ice-broken":
      if (!event.cast) return;
      receipt = `ice:${event.side}:${event.targetId}:${event.cast.id}`;
      target = "Q_BreakIceCubes";
      field = "ice";
      break;
    default: return;
  }
  const run = runs.get(save) ?? {
    epoch: save.questProgress["q1:run"] ?? 0, seen: new Set<string>(),
  };
  runs.set(save, run);
  if (run.seen.has(receipt)) return;
  run.seen.add(receipt);
  const placements = candidatesFor(field, target).filter(placement => {
    if (save.questActivatedAt[placement.id] === undefined) return false;
    const claim = save.questProgress[`claims:${placement.id}`] ?? 0;
    const node = placement.nodeId ? BPH_UPGRADE_NODES[placement.nodeId] : undefined;
    return !!node && node.thresholds[claim] !== undefined;
  });
  if (!placements.length) return;
  if (run.epoch === null) {
    run.epoch = (save.questProgress["q1:run"] ?? 0) + 1;
    save.questProgress["q1:run"] = run.epoch;
  }
  const key = `q1:observation:${run.epoch}:${receipt}`;
  if (claimedHas(save, key)) return;
  claimedAdd(save, key);
  for (const placement of placements)
    save.questProgress[placement.id] = (save.questProgress[placement.id] ?? 0) + amount;
}

/** Both authored unlock fields name permanent recruitment access, not a free draw. */
export function questRewardPack(node: BphUpgradeNode): string | undefined {
  return node.type === 4 ? node.refs.questUnlockPackReward ?? node.refs.questDisplayRewardPack : undefined;
}

/** buyBphNode owns eligibility and claim advancement; this owns all quest income. */
export function claimQuestRewards(
  save: BphSave, placement: BphPlacement, node: BphUpgradeNode, claim: BphQuestClaim,
): void {
  if (node.type !== 4 || claim.placementId !== placement.id || claim.nodeId !== node.id ||
    node.thresholds[claim.claim - 1] === undefined ||
    save.questProgress[`claims:${placement.id}`] !== claim.claim) return;
  const key = `reward:quest:${placement.id}:${claim.claim}`;
  if (save.lifecycle.claimed.includes(key)) return;
  save.lifecycle.claimed.push(key);
  save.income += node.values.questIncomeFlatBonus ?? 0;
  const pack = questRewardPack(node);
  if (pack && !save.packs[pack] && !save.inventory.some(p => p.packId === pack) &&
    !save.lifecycle.claimed.includes(`unlock:pack:${pack}`)) save.lifecycle.claimed.push(`unlock:pack:${pack}`);
}

/** Call once on legacy account entry before new claims. Existing income was paid already. */
export function migrateQuestIncomeReceipts(save: BphSave): void {
  for (const placement of BPH_PLACEMENTS.values()) {
    const node = placement.nodeId && BPH_UPGRADE_NODES[placement.nodeId];
    if (!node || node.type !== 4) continue;
    const paid = Math.min(save.questProgress[`claims:${placement.id}`] ?? 0, node.thresholds.length);
    for (let claim = 1; claim <= paid; claim++) {
      const key = `reward:quest:${placement.id}:${claim}`;
      if (!save.lifecycle.claimed.includes(key)) save.lifecycle.claimed.push(key);
    }
  }
}

export const BPH_QUEST_ENTRY = {
  observeQuestEvent, questUnsupportedFields, questAmount, claimQuestRewards,
} satisfies BphQuestEntry;
