import type { BphEffect, BphSave, BphUnitUpgradeStages, BphUnitUpgradeTrack } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";

const tiers = [
  [5, ["Hero1_Squire", "Hero1_Barbarian", "Hero1_Archer"]],
  [20, ["Hero2_Monk", "Hero2_Knight", "Hero2_Pyromancer"]],
  [80, ["Hero5_Treant", "Hero5_Dino", "Hero5_Rider", "Hero5_Beastmaster", "Hero_Bear", "Hero_Jaguar", "Hero_Monkey", "Hero_Rat"]],
  [100, ["Hero6_Shotgun", "Hero6_BloodMage", "Hero6_Skelewheel"]],
  [120, ["Hero7_Warlord", "Hero7_AstralFisher", "Hero7_Icebourne"]],
  [150, ["Hero3_WitchDoctor", "Hero3_DemonSlayer", "Hero3_Illusionist", "Hero3_Portal", "Hero_Skeleton"]],
  [2000, ["Hero4_Bannerman", "Hero4_Duelist", "Hero4_Stormcaller"]],
] as const;

type SpecialEffect = readonly [type: string, values: readonly number[],
  targets?: BphEffect["targets"], power?: readonly number[]];
const counts = [1, 2, 3] as const;
const quarters = [.25, .50, .75] as const;
const fifths = [.20, .40, .60] as const;
const tenths = [.10, .20, .30] as const;
export const SQUIRE_PIERCE = "SquirePierceChance";
export const MILITIA_MOMENTUM = "MilitiaMomentumPerAlly";
export const EXTRA_COMPANIONS = "BeastmasterExtraCompanions";

const specials = {
  Hero1_Squire: [[SQUIRE_PIERCE, tenths]],
  Hero1_Barbarian: [[MILITIA_MOMENTUM, [.04, .06, .08]]],
  Hero1_Archer: [["HeroProjectileCount", counts]],
  Hero2_Monk: [["RogueDashCount", counts]],
  Hero2_Knight: [["HeroBlockChance", [.07, .14, .21]], ["HeroBlockCastSpell", [1, 1, 1], { targetSpell: "Spell_Stun" }]],
  Hero2_Pyromancer: [["HeroCastCount", [1, 2]]],
  Hero3_DemonSlayer: [["HeroCritChance", [.07, .14, .21]]],
  Hero3_Illusionist: [["PackSpawnExtraTargetHeroCopies", counts]],
  Hero3_Portal: [["HeroSpellCastSpeed", quarters]],
  Hero3_WitchDoctor: [["InfectedEnemyDamageBonus", fifths]],
  Hero4_Bannerman: [["BannermanAttackExtraChargeCount", counts]],
  Hero4_Duelist: [["HeroKillBonusCoinChance", tenths]],
  Hero4_Stormcaller: [["SpellDuration", fifths, { targetSpell: "Spell_Tornado" }]],
  Hero5_Treant: [["TreantSeedBounce", counts, {}, [.50, .50, .50]]],
  Hero5_Dino: [["DinoDashRepeatChance", quarters]],
  Hero5_Rider: [["TargetSpellBounce", counts, { targetSpell: "Spell_RiderPiercer" }]],
  Hero5_Beastmaster: [[EXTRA_COMPANIONS, counts]],
  Hero6_Shotgun: [["HeroProjectileCount", counts]],
  Hero6_BloodMage: [["BloodMageLifestealBonus", fifths]],
  Hero6_Skelewheel: [["HeroWheelModeDurationSeconds", counts]],
  Hero7_Warlord: [["HeroReflectDamagePercent", fifths], ["HeroSkillTreeVisualUpgrade", [1, 1, 1]]],
  Hero7_AstralFisher: [["AstralFisherPullSpeedPercent", quarters]],
  Hero7_Icebourne: [["RotatingSwordCount", counts]],
  Hero_Bear: [["HeroSpawnAsGiantChance", quarters]],
  Hero_Jaguar: [["HeroKillHealChance", [.25, .25, .25], {}, quarters]],
  Hero_Monkey: [["ArcherArrowBounce", counts]],
  Hero_Rat: [["HeroBlockChance", tenths]],
  Hero_Skeleton: [
    ["HeroDeathCastSpellChance", quarters, { targetSpell: "Spell_AoeCircle" }],
    ["HeroDeathCastSpellChance", quarters, { targetSpell: "Spell_AoeCircle", targetHero: "Hero_SkeletonUpgraded" }],
  ],
} as const satisfies Record<typeof tiers[number][1][number], readonly SpecialEffect[]>;

const tracks = ["attack", "attackSpeed", "health", "special"] as const satisfies readonly BphUnitUpgradeTrack[];
const statTracks = ["attack", "attackSpeed", "health"] as const;
export const BPH_UNIT_STAT_PERCENT = 9;
/** Health stages grow faster than attack and speed so a long-lived account's spearmen take more hits. */
export const BPH_UNIT_HEALTH_PERCENT = 16;
export const BPH_UNIT_PRICE_GROWTH = 1.04;
type UnitUpgradeRow = {
  readonly unitPrice: number;
  readonly statTracks: readonly typeof statTracks[number][];
  readonly specialMax: number;
  readonly specialEffects: readonly SpecialEffect[];
};

export const BPH_UNIT_UPGRADES: ReadonlyMap<string, UnitUpgradeRow> = new Map(tiers.flatMap(([unitPrice, ids]) =>
  ids.map(id => {
    const profile = BPH_PROFILES[id];
    const support = profile.range === 0 || id === "Hero7_Warlord";
    const availableStats = statTracks.filter(track => track === "health" ? support || profile.attackType !== 1
      : !support || (track === "attack" && id === "Hero3_Illusionist"));
    return [id, { unitPrice, statTracks: availableStats, specialMax: specials[id][0][1].length, specialEffects: specials[id] }] as const;
  })));

export function parseBphUnitUpgrades(input: unknown): BphSave["unitUpgrades"] {
  const stages: BphSave["unitUpgrades"] = {};
  if (!isRecord(input)) return stages;
  for (const [id, row] of BPH_UNIT_UPGRADES) {
    const raw = input[id];
    if (!isRecord(raw)) continue;
    const valid: BphUnitUpgradeStages = {};
    for (const track of tracks) {
      const stage = raw[track];
      if (typeof stage === "number" && Number.isSafeInteger(stage) && stage > 0 &&
          (track === "special" ? stage <= row.specialMax : row.statTracks.includes(track))) valid[track] = stage;
    }
    if (Object.keys(valid).length) stages[id] = valid;
  }
  return stages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Price for the next stage, before the discovery and wallet checks. */
export function bphUnitUpgradePrice(save: BphSave, id: string, track: BphUnitUpgradeTrack): number | undefined {
  const row = BPH_UNIT_UPGRADES.get(id);
  if (!row) return;
  const stage = save.unitUpgrades[id]?.[track] ?? 0;
  if (track === "special") {
    if (stage < row.specialMax) return row.unitPrice * (stage + 1) * 4;
  } else if (row.statTracks.includes(track) && stage < Number.MAX_SAFE_INTEGER) {
    return Math.min(Number.MAX_SAFE_INTEGER, Math.round(row.unitPrice * 5 * BPH_UNIT_PRICE_GROWTH ** Math.min(stage, 53)));
  }
}

export function buyBphUnitUpgrade(save: BphSave, id: string, track: BphUnitUpgradeTrack): boolean {
  if (!save.discovered.includes(id)) return false;
  const price = bphUnitUpgradePrice(save, id, track);
  if (price === undefined || save.resources.mastery < price) return false;
  save.resources.mastery -= price;
  const stages = save.unitUpgrades[id] ??= {};
  stages[track] = (stages[track] ?? 0) + 1;
  return true;
}

/** Fractions of the unboosted profile stats, added after the other combat modifiers. */
export function bphUnitBaseStatBonus(stages: BphUnitUpgradeStages | undefined, track: typeof statTracks[number]): number {
  return (stages?.[track] ?? 0) * ((track === "health" ? BPH_UNIT_HEALTH_PERCENT : BPH_UNIT_STAT_PERCENT) / 100);
}

export const BPH_UNIT_STAT_PURCHASES = "UnitStatPurchases";

/** These rows use no tree placement ID. */
export function bphUnitUpgradeEffects(save: BphSave): BphEffect[] {
  const effects: BphEffect[] = [];
  for (const [id, stages] of Object.entries(save.unitUpgrades)) {
    if (!stages.special) continue;
    const index = stages.special - 1;
    for (const [type, values, targets, powers] of BPH_UNIT_UPGRADES.get(id)?.specialEffects ?? []) {
      const value = values[index];
      if (value === undefined) continue;
      effects.push({ nodeId: `unit-upgrade:${targets?.targetHero ?? id}:special:${type}`, type, value,
        effectPower: powers?.[index] ?? 0,
        effectPowerScale: 0, stackCap: 0, countStep: 0, targets: { targetHero: id, ...targets } });
    }
  }
  return effects;
}

/** Each bought stat stage replaces one shared army-training purchase for general growth. */
export function bphUnitStatPurchaseEffect(save: BphSave): BphEffect[] {
  let purchases = 0;
  for (const stages of Object.values(save.unitUpgrades)) {
    for (const track of statTracks) purchases += stages[track] ?? 0;
  }
  return purchases > 0 ? [{ nodeId: "unit-stat-purchases", type: BPH_UNIT_STAT_PURCHASES, value: purchases,
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {} }] : [];
}
