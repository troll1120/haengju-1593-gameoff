import type { BphWaveId } from "./bph-waves";
import { BPH_MONSTERS } from "./bph-data";

/** Approved 900-second gameplay contract (owner DM 1794881206.309179); balance changes belong in this table. */
export const BPH_SURVIVAL_TABLE = {
  version: 3,
  duration: 900,
  batchSeconds: 30,
  supplySeconds: 15,
  // Split general strength between durability and basic attacks. Extra HP
  // alone kept generals standing without enough damage against final bosses.
  generalHpScale: 1.15,
  /** Owner 1795152518.741269: an ordinary soldier's hit (Monster1_Caveling at the opening) fells a fresh 1265-hp general on
   * exactly the 50th landed hit and a fresh 4-hp spearman on the 10th. Elite, miniboss and boss hits are strongHit ordinary hits
   * and take the same general multiplier. */
  generalIncoming: 61,
  /** Direction C: an elite, miniboss and boss hit is this many ordinary hits at the same battle time (spearman 4/2/1, general 20/10/5). */
  strongHit: { elite: 2.5, miniboss: 5, boss: 10 },
  meritCap: 60,
  generalBasic: 3.6,
  generalBasicGrowth: .08,
  generalSkill: 1.5,
  generalKillXp: .015,
  /** Owner 1795164775.139009: the central tent barracks falls on an opening spear soldier's 10th landed hit. A fresh-run
   * Monster1_Caveling keep hit lands 0.6 x 0.016 = 0.0096, so 9.5 hits of HP survives nine and falls on the tenth.
   * Every other keep hit (elites, commanders, later and stronger soldiers) keeps its share of this HP. */
  keepHp: 0.0912,
  killCoins: { perSecond: .42, burst: 3 },
  commander: { hp: 800, hit: 4, dps: 4, castleHit: 3, castleDps: 3, skill: .02 },
  approach: { outside: 80, speed: 1.6 },
  transportVolley: .75,
  earlyThreats: { eliteAt: 60, eliteHp: 3, rushAt: 120, rushAgain: 125, rushCount: 24, rushSpeed: 1.5 },
  chapter4Opening: { until: 60, count: 12 },
  /** Owner 2026-11-19: ten times the bodies on the field. Every ordinary slot below (batch, rush, commander
   * escort, endless) fields `count` bodies, each carrying these shares of the slot's hp and damage.
   * Elites and commanders are single bodies and are never split. */
  density: { count: 10, hp: .06, unitDamage: .20, castleDamage: .20 },
  /** The former ten-soldier spear file paid at least one coin per successful body roll. */
  infantryDropFloorPerFile: 10,
  /** Three-body files reach the live cap in sustained waves. Their drop covers the lower admission rate. */
  crowdedInfantryDropFloorPerFile: 13,
  /** Regular spear bodies per authored slot, by scheduled battle time in seconds. */
  infantryFile: [
    { at: 0, multiplier: 1 },
    { at: 60, multiplier: 1.5 },
    { at: 120, multiplier: 2 },
    { at: 180, multiplier: 3 },
  ],
  /** Owner 2026-11-19 (castle 1040): stronger existing types take the spearmen's place as the
   * battle runs. Target shares by enemy kind from each battle second on; before the first
   * step the authored chapter mix stands. A share no eligible kind can fill falls back to
   * the chapter's own kinds, so every chapter still drifts toward its strongest types. */
  rosterTiers: [
    { at: 180, kinds: { yari: .5, teppo: .2, cavalry: .15, samurai: .05, guard: .1 } },
    { at: 360, kinds: { yari: .2, teppo: .15, cavalry: .3, samurai: .25, guard: .1 } },
    { at: 540, kinds: { yari: .2, teppo: .15, cavalry: .2, samurai: .3, guard: .15 } },
  ],
  /** One borrowed profile per kind a spear chapter's own waves never field (castle 1040). */
  rosterReinforcements: { samurai: "Monster4_Bandit", teppo: "Monster6_Spider" },
  intensity: [
    { at: 0, count: 90, hp: 0.9, unitDamage: 2.1, castleDamage: 0.08 },
    { at: 60, count: 74, hp: 1, unitDamage: 2.15, castleDamage: 0.096 },
    { at: 120, count: 70, hp: 1.1, unitDamage: 2.2, castleDamage: 0.12 },
    { at: 180, count: 44, hp: 1.2, unitDamage: 2.3, castleDamage: 0.148 },
    { at: 360, count: 40, hp: 1.21, unitDamage: 2.4, castleDamage: 0.152 },
    { at: 480, count: 46, hp: 1.22, unitDamage: 2.5, castleDamage: 0.16 },
    { at: 540, count: 51, hp: 1.23, unitDamage: 2.6, castleDamage: 0.172 },
    { at: 720, count: 59, hp: 1.24, unitDamage: 2.7, castleDamage: 0.212 },
    { at: 840, count: 67, hp: 1.25, unitDamage: 2.8, castleDamage: 0.24 },
  ],
  /** Boss groups; each member is a commander drawn per run from the side boss stream.
   * The 15:00 win also requires every final commander that appeared to have fallen. */
  bosses: [
    { at: 180, count: 1, hp: .8, unitDamage: .75, castleDamage: .8 / 3, final: false },
    { at: 360, count: 1, hp: 1.4, unitDamage: .875, castleDamage: 1 / 3, final: false },
    { at: 540, count: 2, hp: 2, unitDamage: 1, castleDamage: 1.2 / 3, final: false },
    { at: 720, count: 2, hp: 2.7, unitDamage: 1.125, castleDamage: 1.4 / 3, final: false },
    { at: 810, count: 3, hp: 3.2, unitDamage: 1.125, castleDamage: 1.6 / 3, final: true },
  ],
  /** The eight Japanese commanders, as their BPH boss profiles. */
  commanders: ["Boss1_Apogre", "Boss2_Beast", "Boss3_Witch", "Boss4_Forger",
    "Boss5_Niro", "Boss6_SpiderQueen", "Boss7_FrozenHead", "Boss9_Final"],
  /** After the win: every `every` seconds one intensity step and one larger boss group. */
  endless: { every: 180, count: 18, hpGrowth: 1.25, damageStep: .2,
    bossFirstCount: 4, bossCountStep: 1, bossMaxCount: 8, bossHp: 1 },
} as const;

export function infantryMultiplierAt(time: number): number {
  const steps = BPH_SURVIVAL_TABLE.infantryFile;
  let index = 0;
  while (index + 1 < steps.length && steps[index + 1].at <= time) index++;
  return steps[index].multiplier;
}

/** Kind shares in force at `time`, or null while the authored chapter mix still stands. */
export function bphSurvivalRosterShares(time: number) {
  const tiers = BPH_SURVIVAL_TABLE.rosterTiers, index = bphSurvivalRosterTier(time);
  return index < 0 ? null : tiers[index].kinds;
}

/** Roster tier index in force at `time`, or -1 while the authored chapter mix stands. */
export function bphSurvivalRosterTier(time: number): number {
  const tiers = BPH_SURVIVAL_TABLE.rosterTiers;
  let index = -1;
  while (index + 1 < tiers.length && tiers[index + 1].at <= time) index++;
  return index;
}

/** Survival slots own encounter strength. Imported commander profiles supply
 * movement, cadence and identity, never a 159-fold HP lottery. The Witch's
 * two bodies share one encounter budget rather than receiving it twice. */
export function bphSurvivalMonster(profileId: string) {
  const raw = BPH_MONSTERS[profileId];
  if (!(BPH_SURVIVAL_TABLE.commanders as readonly string[]).includes(profileId)
    && profileId !== "Boss3_Witch2") return raw;
  const budget = BPH_SURVIVAL_TABLE.commander;
  const hp = profileId === "Boss3_Witch" || profileId === "Boss3_Witch2"
    ? budget.hp * raw.hp / (BPH_MONSTERS.Boss3_Witch.hp + BPH_MONSTERS.Boss3_Witch2.hp)
    : budget.hp;
  return { ...raw, hp, damage: Math.min(budget.hit, budget.dps / raw.attackSpeed),
    towerDamage: Math.min(budget.castleHit, budget.castleDps / raw.attackSpeed) };
}

/** Battle order by save.chapter: a win advances it and the last chapter repeats. */
export const BPH_SURVIVAL_CHAPTERS = ["WaveChapter1", "WaveChapter2", "WaveChapter3", "WaveChapter4"] as const satisfies readonly BphWaveId[];

export type BphSurvivalChapter = {
  readonly hp: number;
  readonly unitDamage: number;
  readonly castleDamage: number;
};
/** Early cavalry and gunners replace slots, rather than adding bodies. Their
 * chapter-local strength keeps later chapters' original profiles untouched. */
export function bphSurvivalEnemyScale(waveId: BphWaveId, profileId: string): BphSurvivalChapter {
  if (waveId === "WaveChapter1" || waveId === "WaveChapter2") {
    if (profileId === "Monster3_Shadow") return { hp: .1, unitDamage: .4, castleDamage: .5 };
    if (profileId === "Monster6_Spider") return { hp: .55, unitDamage: .5, castleDamage: .6 };
    // Borrowed samurai: one body with twice a spear body's toughness and about .7 of a
    // spear file's total budget, so seats recycle while the mix shifts. Their wall damage
    // stays well under a spear file's: they are troop-killers, not the siege line (castle 1040).
    if (profileId === "Monster4_Bandit") return { hp: .24, unitDamage: .5, castleDamage: .35 };
  }
  // Chapter 3's spears are Overseers (hp 12); borrowed single bodies hold the same shares.
  if (waveId === "WaveChapter3") {
    if (profileId === "Monster4_Bandit") return { hp: .6, unitDamage: .5, castleDamage: .35 };
    if (profileId === "Monster6_Spider") return { hp: 1.87, unitDamage: .5, castleDamage: .35 };
  }
  return { hp: 1, unitDamage: 1, castleDamage: 1 };
}
export function bphSurvivalChapter(waveId: BphWaveId): BphSurvivalChapter | null {
  switch (waveId) {
    case "WaveChapter1": return { hp: 1, unitDamage: 1, castleDamage: 1 };
    case "WaveChapter2": return { hp: 1, unitDamage: 1, castleDamage: 1 };
    case "WaveChapter3": return { hp: 1, unitDamage: 1, castleDamage: 1 };
    case "WaveChapter4": return { hp: 1, unitDamage: 1, castleDamage: 1 };
    default: return null;
  }
}
