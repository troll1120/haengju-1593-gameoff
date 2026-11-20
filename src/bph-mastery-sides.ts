import type { BphEffect } from "./bph-contract";

/**
 * The mastery web splits into an army side and a general side that share one mastery point pool
 * (general-growth design section 3, owner DM 1794929019.876699). A placement's side follows its node's effect
 * types; a node with any general-side type is general. Economy, buildings, tap volley, relic slots and the rest stay shared.
 */
export type BphMasterySide = "army" | "general";
export const BPH_MASTERY_SIDES: readonly BphMasterySide[] = ["army", "general"];

const ARMY_TYPES: ReadonlySet<string> = new Set([
  "HeroAttackPower", "HeroDuration", "HeroAttackSpeed", "TargetPackHeroDamage", "TargetPackHeroHp",
  "PackSpawnExtraTargetHeroCopies", "HeroBlockChance", "HeroCritChance", "HeroCritDamage",
  "BannermanAttackExtraChargeCount", "BannermanSpawnChargeCount", "ThiefBladeCount", "ArcherRange",
  "ArcherArrowBounce", "ArcherFireRate", "HeroAreaAttack", "FireMageAttackSpeed", "PaladinTauntArea",
  "HeroKillUpgradeUnlock", "OpenTargetPackExtraHeroChance",
  // The rest of the old skill-level stat set (skill-growth STAT_UPGRADES) goes to the army side too.
  "HeroMaxHP", "HeroAttackRange", "HeroMoveSpeed", "HeroDamageReduction",
]);
const GENERAL_TYPES: ReadonlySet<string> = new Set([
  "SpellAoeRadius", "TargetSpellRadius", "TargetSpellDamageBonus", "HeroCastCount", "SpellDuration",
  "SpellSurgeMasteryBonusPercent", "TomeBuffDurationIncrease", "ElectrifyExtraChainJumps",
  "ElectrifyChainDamagePercent", "ThunderboltDamageBonus", "TargetSpellBounce", "HeroBlockCastSpell",
  "HeroDeathCastSpellChance",
]);

/** The side of one upgrade node (type 0) from its effect types, or null when it is shared. */
export function bphMasterySideOf(effectTypes: readonly string[]): BphMasterySide | null {
  if (effectTypes.some(type => GENERAL_TYPES.has(type))) return "general";
  if (effectTypes.some(type => ARMY_TYPES.has(type))) return "army";
  return null;
}

/** Bought placements per side, counted from the effects a run carries (activeBphEffects); relics are not placements. */
export function bphMasterySideCounts(effects: readonly BphEffect[]): Readonly<Record<BphMasterySide, number>> {
  const types = new Map<string, string[]>();
  for (const effect of effects) {
    const id = effect.targets.placementId;
    if (!id || id.startsWith("relic:")) continue;
    const list = types.get(id);
    if (list) list.push(effect.type); else types.set(id, [effect.type]);
  }
  const counts = { army: 0, general: 0 };
  for (const list of types.values()) {
    const side = bphMasterySideOf(list);
    if (side) counts[side]++;
  }
  return counts;
}

/** Owner-approved cap: the general side can start a run at most at Lv3, so the small start stays small. */
export const BPH_START_LEVEL_CAP = 3;
export const BPH_GENERAL_SIDE_RULES = {
  cooldownPerNode: .02, cooldownCap: .30, radiusPerNode: .015, radiusCap: .20,
  startLevelAt: [4, 8],
} as const;

export type BphGeneralMastery = {
  readonly purchases: number;
  readonly cooldownCut: number;
  readonly radiusBonus: number;
  readonly startLevel: number;
};
export function bphGeneralMastery(effects: readonly BphEffect[]): BphGeneralMastery {
  const purchases = bphMasterySideCounts(effects).general, rules = BPH_GENERAL_SIDE_RULES;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    purchases,
    cooldownCut: round(Math.min(rules.cooldownCap, purchases * rules.cooldownPerNode)),
    radiusBonus: round(Math.min(rules.radiusCap, purchases * rules.radiusPerNode)),
    startLevel: Math.min(BPH_START_LEVEL_CAP, 1 + rules.startLevelAt.filter(at => purchases >= at).length),
  };
}

/**
 * The starting general level, for the in-run level lane: pass the run's upgrades (`run.bph.upgrades`),
 * or read the same number from `run.bph.generalMastery?.startLevel ?? 1` once the run exists.
 */
export function bphStartLevel(effects: readonly BphEffect[]): number {
  return bphGeneralMastery(effects).startLevel;
}
