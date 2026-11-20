// allow: SIZE_OK -- Existing combat state machine; BPH account and profile logic live in separate modules.
import { allyRoute, CENTER, clearGateMouth, contains, crosses, distance, edgePoint, fieldPoint, fortGates, fortRect, gapToRect, guardPoint, inGateMouth, nearestGate, onGateLine, HEIGHT, pushOut, route, routeDistance, sideOf, SIDES, TILE, wallPoint, weaponSlots, WIDTH } from "./geometry";
import { bphArms, bphProfileAttackReach, bphStats, bphUnitKill, BPH_SCALE, expireBphCrates, landBphArrivals, meleeContactLimit } from "./bph-combat";
import { tickBphBarracks } from "./bph-barracks";
import type { BphBattle, BphUnit } from "./bph-combat";
import { BPH_MONSTERS, BPH_PROFILES } from "./bph-data";
import { bphEnemyStats } from "./bph-enemy-effects";
import { bphSurvivalDamageMultiplier, bphSurvivalIntensity, bphSurvivalStep, bphSurvivalWon } from "./bph-survival";
import { bphEnemyMapping } from "./bph-waves";
import { spawnBphSurvival } from "./bph-survival-spawn";
import { BPH_JOIN_LIMIT, bphHireRoll, bphHireSlots, bphJoinCandidates } from "./bph-join";
import { BPH_GENERALS } from "./bph-commanders";
import { generalBasicAttackInterval, generalUpgradeMultiplier, generalUpgradeRank } from "./bph-general-upgrades";
import { bphFieldCommand } from "./bph-general-command";
import { discoverBphCodex } from "./bph-codex-rewards";
import { recordBphWitchDeath } from "./bph-witch-phase";
import { nextBphDamageReceipt } from "./bph-damage-receipts";
import { bphTouchDamage, tickBphSpells } from "./bph-spells";
import { castYisunsin } from "./skills-yisunsin";
import { noteHitHealth } from "./skill-holds";
import { BPH_BLIZZARD, bphChilledEnemies } from "./bph-tome-fields";
import { applyBphBuff, bphChance, bphFxContext, bphOriginalClasses, consumeBphCorpse, dispatchBphEffects } from "./bph-fx-dispatch";
import { bphKillCoinMultiplier, bphKillDropTier, BPH_GOLD_POUCH_COINS, BPH_KILL_DROP_AMOUNT, rollBphKillDrop } from "./bph-kill-drops";
import { bphGoldUpgradeEffects } from "./bph-upgrade-gold";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { martialResolvedAttack, martialTauntTarget, martialIceHit } from "./bph-native-martial";
import { BPH_ATTACK_RANGE_TO_PX, BPH_WORLD_TO_PX } from "./bph-contract";
import { recordBphProgress } from "./bph-upgrades";
import type { BphCast, BphUnitDamageRequest } from "./bph-effects-entry";
import type { BphClass, BphDamageRequest, BphFxContext } from "./bph-contract";
import { wallPosts } from "./geometry";
import { noteBlocked, noteStall, shunned, standFor, type Shun, type Stall } from "./ally-reach";
import { enemyBodyScale } from "./geometry";
import { moveEnemy, placeEnemyOutside } from "./enemy-wall";
import type { Direction, Point } from "./geometry";
import { buildings, cornerOpen, wallOpen } from "./fortification";
import { batter, recordLethalCastleHit, rememberCastleCast } from "./castle-damage";
import { bphReviveSeconds } from "./bph-castle-buildings";
import type { Fortification } from "./fortification";
import { BOSSES, bossRoster, matchup } from "./bosses";
import type { BossId, DamageClass } from "./bosses";
import { MINIBOSS, minibossCast, minibossDamage } from "./minibosses";
import type { MinibossSkill } from "./minibosses";
import type { MetaBonuses } from "./meta";
import { ARMY_KINDS, AWAKENINGS, COOLDOWNS, GENERAL_CLASS, GENERAL_HP, GENERAL_SKILLS, GENERALS, PARTY_LIMIT, SKILL_NAMES, SOLDIERS, STYLES } from "./roster";
import type { General, SoldierKind } from "./roster";
import { growthFor } from "./skill-growth";
import type { SkillMods } from "./skill-growth";
import type { ChaosState, ChaosSkillState } from "./chaos-contract";
import { castChaosSkill, replacementSkill } from "./chaos-skill-cast";
import { tickChaosSkills } from "./chaos-skill-tick";
import { CHAOS_RULES } from "./chaos-contract";
import { chaosAfterAttack, chaosAfterReturn, chaosDefense, chaosDirectKill, chaosDirectMultiplier, chaosGuard, chaosMovement, chaosState, clearChaos, tickChaos } from "./chaos";
import { chaosActive } from "./chaos-state";
import { advanceSurvivalGeneralLevel, chaosKillXp } from "./chaos-growth";
import { chaosArrow, chaosHandledPower, chaosVolley } from "./chaos-projectiles";
import { generalReach, reachLevel, sharedLevel } from "./general-reach";
import type { Reach } from "./general-reach";
import { recordDefensePressure } from "./defense-pressure";
import { RIVER_FIRST_AT, RIVER_EVERY, RIVER_SECONDS, riverBank, riverLane, SHIP_ART, TRANSPORT_TIERS, transportLoad, transportTier, transportView, VOLLEY_EVERY, VOLLEY_RANGE } from "./river";
import type { ShipArt } from "./river";
export { GENERAL_CLASS, GENERALS, PARTY_LIMIT, SKILL_NAMES, SOLDIERS, STYLES } from "./roster";
export type { General, SoldierKind, Style } from "./roster";
import { classCard, freshTactics, isClassKind, LEGEND_NAMES, rarityAt } from "./cards";
import type { ClassCardId, Tactic } from "./cards";
import { synergy } from "./synergy";
import { weatherDamage, weatherEnemySpeed } from "./weather";
import { holdDongnae, militiaAim, militiaAmbush, tickUniqueSkills, uniqueSkillSpeed } from "./skills-unique";
import type { UniqueSkill } from "./skills-unique";
export type { Direction } from "./geometry";
export const DURATION = 600;
export const ASSAULT_PERIOD = 25;
export const ASSAULT_WARNING = 3;
export const FINAL_BOSS_AT = 540;
export const BOSS_EVERY = 120;
export const SIEGE_EVERY = 210;
export const EVOLUTION_FROM = 300;
export const REINFORCE = 0;
export const SQUAD_SPEED = 140;
export const CHARGE_SPEED = 420;
export const SQUAD_MARGIN = 22;
export const GENERAL_TIMES = [20, 40];
export const ROULETTE_SECONDS = 1.2;
export const ROULETTE_TICKS = 32;
export const SIDE_NAMES: Record<Direction, string> = { 위: "위쪽", 좌: "왼쪽", 우: "오른쪽", 아래: "아래쪽" };
export const RECRUIT_COST = 60;
export const SOLDIER_NAMES: Record<SoldierKind, string> = { spearman: "창병", archer: "궁수", hwacha: "화차병", monk: "승병", ming_cavalry: "기병", panokseon: "판옥선" };
const ROTATION = ["yari", "teppo", "samurai", "cavalry", "guard"] as const;
export const UNLOCK_AT = [0, 35, 90, 150, 210];
/** A general keeps his struck enemy until it falls or gets this many pixels past his reach. */
export const LOCK_SLACK = 24;
/** Owner DMs 1794894265.835729 / 1794894507.597969: allies go for the nearest foe. The current target is kept
 *  only against a rival closer by no more than min(`pixels`, `margin` x its distance), or within `hold` seconds of being picked,
 *  so near-equal foes do not flip them back and forth. Survival only;
 *  the classic demo keeps its original targeting. */
export const TARGET_LOCK = { margin: .12, pixels: 8, hold: .3 } as const;
export function keepsTarget(held: number, nearest: number, lockUntil: number | undefined, time: number): boolean {
  return time < (lockUntil ?? 0) || held - nearest <= Math.min(TARGET_LOCK.pixels, held * TARGET_LOCK.margin);
}
export const GENERAL_GROWTH = { maxTier: 3, hp: .15, basic: .12, skill: .15, radius: .12 } as const;
export const growthTier = (level: number): number => level >= 10 ? 3 : level >= 5 ? 2 : 1;
const GATE_GAP = 40, RETREAT_SPEED = 150, MELEE = 18, SOLDIER_SPEED = 170, INTERRUPTING_STUN = .5;
/** Original Hero guard field (sharedassets1.assets:3594): movementSpeedVariance. */
const GUARD = { speedVariance: .08 } as const;
/** The fastest a soldier may walk relative to its class speed after movementSpeedVariance. */
export const ALLY_MAX_PACE = 1 + GUARD.speedVariance;
/** Ground allies keep centres this far apart: the 20 px median opaque ally body plus a 2 px gap, so bodies never overlap. */
export const ALLY_SPACING = 22;
/** Separation never pushes a soldier closer than this to the walls (the gate's exit apron). */
const WALL_APRON = 24;
/** Stable per-unit value in [0, 1) that never draws from the run RNG. */
function unitNoise(id: number, salt: number): number {
  let h = Math.imul(id ^ Math.imul(salt, 0x9e3779b9), 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 2 ** 32;
}
export const BALANCE = {
  enemyHp: 70, toughness: [[0, 10], [120, 3.3], [200, 3.5], [320, 8.06], [400, 11.05], [480, 14.95], [560, 19.5]], eliteHp: 20, bossHp: 280, finalHp: 360,
  enemySpeed: 24, fastSpeed: 2, fastShare: .18, opening: 8, spawnBase: 6.5, spawnSpan: 40, crowdPower: 2, focusShare: .7, fieldFloor: .1,
  bite: 12, biteSpan: 300, wallBlow: 2.4, waveBlow: 7, wallBlowSpan: 60, eliteBlow: 4, bossBlow: 12, finalBlow: 20, lateLadderShare: .10, lateLadderBlow: 13,
  strike: 60, growth: .25, critical: .12, arrowPower: 1.8, rocketPower: 2, burnPower: .5,
  executionFrom: 5, executionChance: .025,
  generalHp: GENERAL_HP, hpGrowth: .12, downSeconds: 30, reviveSafe: 2, downTempo: .6,
  wall: 400, base: 350, openingBossPower: .05, openingBossHp: .17, bossPowerStep: .1, bossHpStep: .06, bossKeepBlow: .25, firstElite: 15, eliteEvery: 30, fieldBase: 100, fieldSpan: 2.5, fieldCap: 200, calmField: 8, calmUntil: 5, openField: 30, rampAt: 20, rampRate: .4, eventRefill: .5, breachAggro: 26, keepBlow: 8, breachPull: 250, breachSpread: 140,
  drillCost: 400, drillPrices: [400, 1200], drillMax: 2, drillPower: 0, drillGuard: 0, drillTempo: 0, lateHp: 1.3, coin: { boss: 60, elite: 15, foe: 1 }, soldierDown: 8, fallHurt: .35, retreatAt: .3, returnAt: .6, dodgeBelow: .5,
  regenAfter: 4, regen: .03, garrisonRegen: .02, supportRegen: 3, guardianTempo: 1.2, guardianGap: 28, supportGap: 42, wallReach: 34, retreatRegen: .06, guardGap: 64, guardRadius: 95, weaponRange: 130, stay: 8, cover: 22,
  cooldown: COOLDOWNS, firstSkill: 3, volleyRadius: 80, volleyPower: 5, shieldSeconds: 6,
  chargeReach: 230, chargeWidth: 28, chargePower: 4, chargeStun: 1.4, frenzySeconds: 8,
  passiveXp: .6, killXp: .05, routPace: 380, routSeconds: 2.6, riftRadius: 150,
};
export type Pattern = "gunner" | "cavalry" | "siege" | "ninja" | "decree";
export type Skill = Pattern | "slam" | "ram" | "salvo" | "fire" | "ladder" | "shield" | "spear-thrust" | "spin-slash";
export type CardId = ClassCardId | "arrow" | "hwacha" | "quiver" | "powder" | "fire" | "curse" | "rift" | "gold40" | `recruit-${SoldierKind}` | `awaken-${General}` | `hero-${General}` | `promote-${General}`;
export const ENEMY_KINDS = ["yari", "teppo", "samurai", "ukita", "cavalry", "guard", "ship"] as const;
export type EnemyKind = typeof ENEMY_KINDS[number];
/** One fighter on the field. A squad's general is the unit with index -1, its soldiers are 0 and up. */
export type Unit = { id: number; kind: SoldierKind | "general"; tier: number; hp: number; maxHp: number; x: number; y: number; clock: number; strikeAt: number; aim: number; downUntil: number; perch?: number; emerging?: boolean; quarry?: number; bph?: BphUnit; basicAttack?: "arrow" | "melee"; gunAt?: number; combo?: { amount: number; critical: boolean };
  /** Until this time the fighter keeps its current target (TARGET_LOCK.hold). */
  lockUntil?: number;
  /** Survival foot soldiers keep one outward destination between fights. */
  march?: Point;
  /** Assigned at birth for idle posts, never a combat boundary; only excess survivors switch after losses. */
  flank?: "left" | "right";
  /** Survival: the out-of-reach shooter this melee soldier is charging (RETALIATE); cleared when it dies or leaves the leash. */
  revenge?: number; stall?: Stall; shun?: Shun[] };
export type Lane = { toX: number; toY: number; homeX: number; homeY: number; back: boolean; until: number; dealt: number; stunBonus?: number };
export type Squad = Unit & {
  /** Automatic special attack owns its preparation, target and cadence; the body and manual skill keep their own clocks. */
  specialAttack?: Pick<Unit, "clock" | "strikeAt" | "aim" | "combo">;
  id: number; general: General; post: Direction; homeX: number; homeY: number; targetX: number; targetY: number; state: "guard" | "retreat" | "down" | "charge";
  soldiers: Unit[]; skillClock: number; usedAt: number; awakened: number; frenzyUntil: number; hurtAt: number; safeUntil: number; downs: number; lane: Lane | null; trampled: number[];
  /** Survival: set once he has fought or reached his post since his last deployment; with no enemy left on his side he then
   *  stands where he is instead of walking back to his post. */
  stay?: boolean;
};
export type Enemy = {
  infantryRewardShare?: number;
  commanderEscort?: true;
  goldPouch?: true;
  /** A pouch that reached the wall still looks the same but can no longer pay out. */
  goldPouchSpent?: true;
  /** The defence half is retained within half a body's width of the centre line. */
  defenseSide?: "left" | "right";
  /** A castle attacker remains a defense target while fighting nearby interceptors. */
  castleThreat?: boolean;
  /** Survival walker blocked from its chosen ally (owner DM 1795149685.021769), and the allies it gives up on for now. */
  stall?: Stall; shun?: Shun[];
  /** Where this enemy left the fort route, and how far the engagement may pull it. */
  pursuit?: { readonly origin: Point; readonly limit: number; returning?: true };
  bphProfileId?: string;
  miniboss?: MinibossSkill;
  id: number; kind: EnemyKind; direction: Direction; x: number; y: number; hp: number; maxHp: number; speed: number;
  elite: boolean; boss: boolean; pattern?: Pattern; wave?: boolean; breach?: Direction; goalX: number; goalY: number;
  bossArt?: BossId; enraged?: boolean; shielded?: boolean; appearedAt?: number; pulled?: Direction;
  shipArt?: ShipArt; expiresAt?: number; cargo?: Enemy[]; sailing?: boolean; ladder?: boolean;
  /** Passenger only: the transport tier that carried him, kept after landing (kill drop chance). */
  aboard?: ShipArt;
  /** Transport only: passengers it waits for before sailing, and hull HP added per passenger HP. */
  berth?: number; hull?: number;
  clock: number; strikeAt: number; prey: [number, number] | null; stun: number; burn: number; burnClock: number; skillClock: number; casting: number; casts: number;
};
export type Telegraph = {
  id: number; owner: number; skill: Skill; shape: "circle" | "lane"; x: number; y: number; fromX: number; fromY: number; radius: number;
  startedAt: number; at: number; damage: number; wallDamage: number;
};
export type Source = number | "weapon" | "skill";
export type Shot = {
  procDepth?: number; sourceAttackId?: number;
  chaosDamage?: boolean;
  nativeDamage?: number;
  retargetRange?: number; chaosPierceRange?: number;
  chaosPierce?: number; chaosPierceDamage?: number;
  fanAngle?: number; fanDistance?: number;
  unitIndex?: number;
  attack?: DamageClass;
  bounces?: number; bounceRange?: number; hitIds?: number[];
  /** A rocket that homes on its own enemy and strikes only that one (권율's volley), instead of bursting where it lands. */
  single?: boolean;
  /** A naval shell's launch point and the top of its lob, for the picture only; the rules fly it straight. */
  lob?: { x: number; y: number; height: number };
  id: number; kind: "arrow" | "rocket" | "bullet" | "shell"; x: number; y: number; toX: number; toY: number; speed: number; target: number;
  prey: [number, number] | null; damage: number; critical: boolean; by: Source; splash: number; pierce: number; from: number; stun?: number; tier?: number; flaming?: boolean; naval?: boolean; source?: Striker;
};
export type Striker = SoldierKind | "general";
export type Effect = {
  mechanism?: "special";
  miniboss?: MinibossSkill;
  kind: "windup" | "swing" | "shot" | "hit" | "kill" | "blast" | "total" | "lunge" | "hurt" | "block" | "down" | "rise" | "deploy" | "retreat"
    | "skill" | "interrupt" | "telegraph" | "land" | "stun" | "wall" | "event" | "merge" | "join" | "prize" | "evolution" | "rift" | "assault"
    | "wave" | "expand" | "rout" | "chest" | "coin" | "upgrade" | "boss-enter" | "rage" | "ladder" | "fall" | "devastate"
    /** A tap-strike volley leaving the castle for (x, y); value is its radius, label "fire" for fire arrows. */
    | "strike";
  x: number; y: number; value: number; target?: number; critical?: boolean; fromX?: number; fromY?: number; label?: string;
  side?: Direction; minor?: boolean; hostile?: boolean; by?: Striker; squad?: number; index?: number; shape?: "circle" | "lane"; count?: number;
  projectile?: Pick<Shot, "kind" | "source" | "by">;
  /** Max-HP fraction offered by this heal, including awakening; HP caps still apply. */
  actualHealRatio?: number;
};
export type Chest = { id: number; x: number; y: number };
export type WeaponId = "arrow" | "hwacha";
export type Bonus = "gold" | "recruit" | "weapon" | "awaken" | "jackpot";
export const PRIZE_TIERS: Record<Bonus, number> = { gold: 0, recruit: 1, weapon: 2, awaken: 2, jackpot: 3 };
export type Roulette = { remaining: number; options: Bonus[]; soldier: SoldierKind; evolution: WeaponId | null; card?: ClassCardId };
export type Aim = { x: number; y: number; toX: number; toY: number; count: number; weight: number; urgent: boolean };
export const ATTACK_INTERVALS = { basic: 1.2, fast: .15, salvo: 2.4, rapid: 1.2 };
/** Wind-up of every warned enemy skill stays between 0.8 and 1.2 seconds. */
export const CASTS: Record<Skill, { shape: "circle" | "lane"; radius: number; windup: number; power: number; wall: number; reach: number; length: number }> = {
  "spear-thrust": { shape: "lane", radius: 14, windup: .8, power: 2.2, wall: 24, reach: 104, length: 110 },
  "spin-slash": { shape: "circle", radius: 54, windup: .9, power: 2.5, wall: 30, reach: 54, length: 0 },
  slam: { shape: "circle", radius: 36, windup: .9, power: 11, wall: 0, reach: 80, length: 0 },
  ram: { shape: "circle", radius: 30, windup: 1, power: 6, wall: 45, reach: 0, length: 0 },
  gunner: { shape: "lane", radius: 22, windup: 1.1, power: 16, wall: 40, reach: 190, length: 200 },
  cavalry: { shape: "lane", radius: 20, windup: 1, power: 17, wall: 0, reach: 230, length: 210 },
  siege: { shape: "circle", radius: 62, windup: 1.2, power: 28, wall: 110, reach: 180, length: 0 },
  ninja: { shape: "circle", radius: 44, windup: .8, power: 16, wall: 0, reach: 1000, length: 0 },
  decree: { shape: "circle", radius: 78, windup: 1.2, power: 18, wall: 60, reach: 170, length: 0 },
  salvo: { shape: "lane", radius: 26, windup: 1, power: 16, wall: 50, reach: 220, length: 230 },
  fire: { shape: "circle", radius: 56, windup: 1.2, power: 20, wall: 0, reach: 1000, length: 0 },
  ladder: { shape: "circle", radius: 32, windup: 1.1, power: 18, wall: 80, reach: 1000, length: 0 },
  shield: { shape: "circle", radius: 64, windup: 1, power: 16, wall: 0, reach: 1000, length: 0 },
};
type Arms = { reach: number; every: number; windup: number; power: number; cleave: number; span: number; knock: number; stun: number; shot: "" | "arrow" | "rocket" };
export const ARMS: Record<Unit["kind"], Arms> = {
  general: { reach: 46, every: 1.2, windup: .22, power: 2.65, cleave: 5, span: 42, knock: 12, stun: 0, shot: "" },
  spearman: { reach: 40, every: 1.4, windup: .22, power: .52, cleave: 2, span: 18, knock: 8, stun: 0, shot: "" },
  monk: { reach: 38, every: 1.9, windup: .3, power: .98, cleave: 3, span: 24, knock: 10, stun: .6, shot: "" },
  ming_cavalry: { reach: 44, every: 1.5, windup: .2, power: .7, cleave: 2, span: 22, knock: 14, stun: 0, shot: "" },
  archer: { reach: 160, every: 1.4, windup: .2, power: .75, cleave: 1, span: 0, knock: 4, stun: 0, shot: "arrow" },
  hwacha: { reach: 150, every: 3, windup: .32, power: .56, cleave: 3, span: 26, knock: 6, stun: 0, shot: "rocket" },
  panokseon: { reach: 150, every: 2.4, windup: .2, power: 2, cleave: 1, span: 26, knock: 0, stun: 0, shot: "rocket" },
};
/** The four blade/staff generals' automatic specials each keep their drawn weapon and distinct pattern.
 *  combo: 황진, two quick cuts on one enemy. lunge: 신립, dashes through the target and cuts the line behind it.
 *  sweep: 김시민, a wide cut over the half circle in front. spin: 사명대사, the staff swung all round him.
 *  How far each pattern reaches and how many it strikes grow with the general's level (GENERAL_REACH). 이순신 stays the strongest. */
export type GeneralStrike = "combo" | "lunge" | "sweep" | "spin";
export const GENERAL_STRIKE: Partial<Record<General, GeneralStrike>> = { 황진: "combo", 신립: "lunge", 김시민: "sweep", 사명대사: "spin" };
export const STRIKE_ARMS: Record<GeneralStrike, Arms> = {
  combo: { ...ARMS.general, power: 1.2, cleave: 1, span: 0, knock: 6 },
  lunge: { ...ARMS.general, reach: 80, every: 1.4, power: 2.2, cleave: 4, span: 12, knock: 18 },
  sweep: { ...ARMS.general, every: 1.3, power: 1.8, cleave: 6, span: 50, knock: 16 },
  spin: { ...ARMS.general, every: 1.5, power: 1.4, cleave: 8, span: 46, knock: 10, stun: .25 },
};
/** 황진's second cut lands this long after the first; 신립 ends his dash this far past the target. */
export const STRIKE_TIMING = { comboGap: .14, lungePast: 16 } as const;
export const GENERAL_ATTACK_TIMING = { basicEvery: .5, basicWindup: .12, basicPower: .225, firstSpecial: .9 } as const;
/** Every panokseon's deck cannon (owner DM 1794903782): on top of the ship's own attack or special, it shells a transport on the
 *  water first, else the land enemy nearest the castle. Modest on purpose, final numbers at the merge: one shell every 3 s for
 *  6 damage (half a 포획 판옥선 hook, near one early raider) with an 18 px splash; 210 px reaches from the lane over the shore to
 *  the castle's south half and the flanks, not its north side. `slots` hold the fleet off the castle's shore, left then right. */
export const NAVAL_GUN = { reach: 210, every: 3, power: 6, splash: 18, speed: 180, arc: 36, slots: [-56, 56, -112, 112, -168, 168] } as const;
const SOLDIER_HP: Record<SoldierKind, number> = { spearman: 300, monk: 240, archer: 80, hwacha: 70, ming_cavalry: 260, panokseon: 500 };
const SCOUT: Record<EnemyKind | "elite" | "siege", { aggro: number; hunt: number }> = {
  yari: { aggro: 60, hunt: 0 }, teppo: { aggro: 110, hunt: 150 }, samurai: { aggro: 60, hunt: 110 },
  cavalry: { aggro: 40, hunt: 600 }, ukita: { aggro: 40, hunt: 150 }, elite: { aggro: 60, hunt: 130 }, siege: { aggro: 24, hunt: 0 },
  guard: { aggro: 70, hunt: 100 }, ship: { aggro: 0, hunt: 0 },
};
/** Owner 2026-11-19 (castle 1035): an enemy fights any of our troops within `sight` px before it touches a wall. */
const ENEMY_PURSUIT = { aggro: 1.5, leash: 2, sight: 100 } as const;
const onBattlefield = ({ x, y }: Point): boolean => x > 0 && x < WIDTH && y > 0 && y < HEIGHT;
// The review counts 40px itself as edge band. Ground combat starts at the first whole pixel beyond it.
const SKIRMISH_INSET = 41;
const groundCombatBottom = (): number => Math.min(HEIGHT - SKIRMISH_INSET, riverBank() - 8);
const groundCombatPoint = ({ x, y }: Point): Point => ({
  x: clamp(x, SKIRMISH_INSET, WIDTH - SKIRMISH_INSET),
  y: clamp(y, SKIRMISH_INSET, groundCombatBottom()),
});
function enemyInCombatField(run: Run, enemy: Enemy): boolean {
  if (!run.bph?.survival || enemy.kind === "ship") return onBattlefield(enemy);
  return enemy.x >= SKIRMISH_INSET && enemy.x <= WIDTH - SKIRMISH_INSET &&
    enemy.y >= SKIRMISH_INSET && enemy.y <= groundCombatBottom();
}
export function levelSeconds(level: number): number { return level <= 2 ? [9, 16][level - 1] : 20 + level; }
export type Metrics = {
  quietSegments: number; maxQuietSeconds: number; lastEffectAt: number; quietOpen: boolean;
  selectionIntervals: number[]; eventTimes: number[]; eventLabels: string[]; maxEventGap: number;
  merges: number; chests: number; effects: number;
  density: { time: number; count: number; wall: number; directions: Record<Direction, number> }[];
  minuteKills: number[]; levelTimes: number[]; generalTimes: number[]; evolutionTimes: number[];
  waveWarnings: number[]; waves: number[]; enemyChanges: { time: number; kind: EnemyKind }[];
  weaponShots: { arrow: number; hwacha: number }; assaultShifts: number; minWallRatio: number; finalDefeatedAt: number | null;
  damage: { squads: number[]; weapon: number; skill: number }; bonuses: Record<Bonus, number>; cards: CardId[];
  skills: number[]; skillTimes: { time: number; squad: number }[]; downs: { time: number; squad: number }[]; soldierDowns: number;
  telegraphs: number; landed: number; generalsStruck: number; blockedCasts: number; interrupts: number; taken: number[]; blocked: number;
  redeploys: number; retreats: number;
  bosses: { art: BossId | null; final: boolean; appeared: number; fallen: number | null; phase2: number | null; dealt: number }[];
  bossDamage: number;
  naval: { launched: number; landed: number; sunk: number; passengersLanded: number; passengersSunk: number };
  classDamage: Record<SoldierKind | "general" | "weapon" | "skill", number>; firstBreach: number | null;
};
export type Run = Fortification & {
  chaosSkills?: ChaosSkillState;
  chaos?: ChaosState;
  uniqueSkills?: UniqueSkill[];
  bph?: BphBattle;
  seed: number; rng: number; phase: "playing" | "choice" | "general" | "won" | "lost"; time: number; endless: boolean; meta: MetaBonuses;
  weather: "맑음" | "비" | "서풍"; commander: General; wall: number; maxWall: number; fort: number; score: number; gold: number; coinRemainder: number; earned: number; recruitsBought: number; drill: Record<SoldierKind, number>; kills: number;
  level: number; xp: number; nextXp: number; queued: number; roster: readonly General[]; arrow: number; hwacha: number; multiplier: number; curses: number;
  evolved: boolean; rift: boolean; quiver: boolean; powder: boolean; fire: boolean;
  tactics: Record<SoldierKind, Tactic>;
  arrowClock: number; hwachaClock: number; riftClock: number; commandClock: number; spawnBudget: number; nextId: number;
  enemies: Enemy[]; squads: Squad[]; shots: Shot[]; telegraphs: Telegraph[]; echoes: { at: number; squad: number; growth?: SkillMods }[];
  shieldUntil: number; shieldBy: number; reflect: boolean; offers: CardId[]; generalOffers: General[];
  awakeningOfferMisses?: number;
  lastChoice: number; nextElite: number; nextBoss: number; bossOrder: Pattern[]; bossRoster: BossId[]; assaultOrder: Direction[]; assaultWarned: number;
  lossCause: "boss" | "army" | "deadline" | null;
  bossSpawned: boolean; bossWarned: boolean; finalDefeated: boolean; chests: Chest[]; roulette: Roulette | null;
  evolutions: WeaponId[]; lastEvolution: number; nextWave: number; warnedWave: boolean; waveUntil: number; enemyMinute: number; nextRiverWave: number;
  rout: { x: number; y: number; at: number } | null; metrics: Metrics;
};
function random(run: Run): number {
  run.rng = (run.rng + 0x6d2b79f5) >>> 0;
  let value = Math.imul(run.rng ^ run.rng >>> 15, run.rng | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
function segmentGap(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / length, 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function soldierHp(kind: SoldierKind, tier: number, level: number): number {
  return Math.round(SOLDIER_HP[kind] * 3 ** (tier - 1) * (1 + BALANCE.hpGrowth * (level - 1)));
}
export function soldier(kind: SoldierKind, tier = 1, at: Point = CENTER, level = 1): Unit {
  const maxHp = soldierHp(kind, tier, level);
  return { id: 0, kind, tier, hp: maxHp, maxHp, x: at.x, y: at.y, clock: 0, strikeAt: 0, aim: 0, downUntil: 0, emerging: contains(fortRect(0), at) };
}
export const units = (squad: Squad): Unit[] => [squad, ...squad.soldiers];
export const fit = (unit: Unit, time: number) => unit.hp > 0 && unit.downUntil <= time;
export const fielded = (squad: Squad) => squad.state === "guard" || squad.state === "retreat";
/** Charging changes movement and attacks, never native enemy targeting or damage eligibility. */
export function strength(squad: Squad): number { return squad.soldiers.reduce((sum, unit) => sum + 3 ** (unit.tier - 1), 0); }
export function generalHp(general: General, level: number, tier = 1): number { return Math.round(BALANCE.generalHp[general] * (1 + BALANCE.hpGrowth * (level - 1)) * (1 + GENERAL_GROWTH.hp * (tier - 1))); }
function metaGeneralHp(run: Run, general: General, tier: number): number {
  const level = run.bph?.survival ? sharedLevel(run) ?? run.level : run.level;
  return generalHp(general, level, tier) * (run.meta.heroHp ?? 1) * (run.meta.generalMastery?.includes(general) ? 1.2 : 1)
    * generalUpgradeMultiplier(run.meta.generalUpgrades, general, "health")
    * (run.bph ? BPH_SCALE.generalHp : 1);
}
export function might(run: Run): number { return (run.bph ? 1 : BALANCE.strike) * (1 + (run.level - 1) * BALANCE.growth) * (run.meta.power ?? 1); }
export function unitAt(run: Run, [squad, index]: [number, number]): Unit | undefined {
  const owner = run.squads[squad];
  return !owner ? undefined : index < 0 ? owner : owner.soldiers[index];
}
export function covers(mark: Telegraph, p: Point): boolean {
  return mark.shape === "circle" ? distance(mark, p) < mark.radius : segmentGap(p, { x: mark.fromX, y: mark.fromY }, mark) < mark.radius;
}
function muster(run: Run, general: General, at: Point, kinds: SoldierKind[]): Squad {
  const tier = run.meta.generalAwaken?.includes(general) ? 2 : 1;
  const maxHp = metaGeneralHp(run, general, tier);
  const squad: Squad = { id: run.squads.length, general, kind: "general", tier, hp: maxHp, maxHp, x: at.x, y: at.y, clock: 0, strikeAt: 0, aim: 0, downUntil: 0,
    post: "아래", homeX: at.x, homeY: at.y, targetX: at.x, targetY: at.y, state: "guard", soldiers: kinds.map(kind => soldier(kind, 1, at, run.level)),
    skillClock: BALANCE.firstSkill, usedAt: -100, awakened: tier - 1, frenzyUntil: 0, hurtAt: -100, safeUntil: 0, downs: 0, lane: null, trampled: [] };
  run.squads.push(squad);
  for (const unit of squad.soldiers) unit.id = run.nextId++;
  run.metrics.damage.squads[squad.id] = 0;
  run.metrics.skills[squad.id] = 0;
  run.metrics.taken[squad.id] = 0;
  return squad;
}
/** Barracks upgrades bought with merit; demo runs, tests and bots play without them. */
export const NO_META: MetaBonuses = { wallHp: 1, startTroops: 0, skillCharge: 1, goldGain: 1 };
/** `roster` is the generals the player has unlocked; only they can join through level-up cards. */
export function createRun(seed: number, commander: General = "권율", meta: MetaBonuses = NO_META, roster: readonly General[] = GENERALS): Run {
  const wall = Math.round(BALANCE.wall * meta.wallHp * (meta.wallStart ?? 1));
  const run: Run = {
    seed, rng: seed >>> 0 || 1, phase: "playing", time: 0, endless: false, meta, weather: "맑음", commander,
    wall, maxWall: wall, walls: { 위: wall / 4, 좌: wall / 4, 우: wall / 4, 아래: wall / 4 }, base: BALANCE.base * meta.wallHp, maxBase: BALANCE.base * meta.wallHp,
    palisades: { 위: { hp: 0, until: 0 }, 좌: { hp: 0, until: 0 }, 우: { hp: 0, until: 0 }, 아래: { hp: 0, until: 0 } }, palisadesBought: 0,
    fort: 0, score: 0, gold: meta.startGold ?? 0, coinRemainder: 0, earned: 0, recruitsBought: 0, drill: { spearman: 0, archer: 0, hwacha: 0, monk: 0, ming_cavalry: 0, panokseon: 0 }, kills: 0, level: 1, xp: 0, nextXp: levelSeconds(1), queued: 0, roster, arrow: meta.startArrow ?? 0, hwacha: meta.startHwacha ?? 0,
    multiplier: 1, curses: 0, evolved: false, rift: false, quiver: false, powder: false, fire: meta.startFire ?? false, tactics: freshTactics(),
    arrowClock: 0, hwachaClock: 0, riftClock: 0, commandClock: 0, spawnBudget: 0, nextId: 1,
    enemies: [], squads: [], shots: [], telegraphs: [], echoes: [], shieldUntil: 0, shieldBy: 0, reflect: false, offers: [], generalOffers: [],
    lastChoice: 0, nextElite: BALANCE.firstElite, nextBoss: BOSS_EVERY, bossOrder: ["gunner", "cavalry", "siege", "ninja"], bossRoster: [], assaultOrder: ["위"], assaultWarned: 0, lossCause: null,
    bossSpawned: false, bossWarned: false, finalDefeated: false, chests: [], roulette: null,
    evolutions: [], lastEvolution: -1000, nextWave: SIEGE_EVERY, warnedWave: false, waveUntil: 0, enemyMinute: 0, nextRiverWave: RIVER_FIRST_AT, rout: null,
    metrics: { quietSegments: 0, maxQuietSeconds: 0, lastEffectAt: 0, quietOpen: false,
      selectionIntervals: [], eventTimes: [], eventLabels: [], maxEventGap: 0, merges: 0, chests: 0, effects: 0, density: [],
      minuteKills: [], levelTimes: [], generalTimes: [], evolutionTimes: [], waveWarnings: [], waves: [], enemyChanges: [],
      weaponShots: { arrow: 0, hwacha: 0 }, assaultShifts: 0, minWallRatio: 1, finalDefeatedAt: null,
      damage: { squads: [0, 0, 0], weapon: 0, skill: 0 }, bonuses: { gold: 0, recruit: 0, weapon: 0, awaken: 0, jackpot: 0 }, cards: [],
      skills: [0, 0, 0], skillTimes: [], downs: [], soldierDowns: 0, telegraphs: 0, landed: 0, generalsStruck: 0, blockedCasts: 0, interrupts: 0,
      taken: [0, 0, 0], blocked: 0, redeploys: 0, retreats: 0, bosses: [], bossDamage: 0,
      naval: { launched: 0, landed: 0, sunk: 0, passengersLanded: 0, passengersSunk: 0 },
      classDamage: { archer: 0, spearman: 0, monk: 0, hwacha: 0, ming_cavalry: 0, panokseon: 0, general: 0, weapon: 0, skill: 0 }, firstBreach: null },
  };
  muster(run, commander, guardPoint(0, "아래", GATE_GAP), Array.from({ length: 1 + meta.startTroops }, () => GENERAL_CLASS[commander]));
  for (const kind of meta.startLegends ?? []) run.tactics[kind].storm = true;
  for (let i = 0; i < (meta.navalStart ?? 0); i++) recruit(run, "panokseon");
  if (meta.navalTurtle) run.drill.panokseon = 2;
  run.weather = (["맑음", "비", "서풍"] as const)[Math.floor(random(run) * 3)];
  run.bossRoster = bossRoster(() => random(run), GENERAL_CLASS[commander] === "archer" ? "arrow" : GENERAL_CLASS[commander] === "hwacha" ? "artillery" : "melee");
  run.bossOrder = run.bossRoster.slice(0, 4).map(id => BOSSES[id].pattern);
  for (let i = 1; i < 60; i++) {
    const options = SIDES.filter(side => side !== run.assaultOrder[i - 1] && (i < 59 || side !== run.assaultOrder[0]));
    run.assaultOrder.push(options[Math.floor(random(run) * options.length)]);
  }
  // Start with an approaching army already in sight; no empty opening walk.
  for (let i = 0; i < BALANCE.opening; i++) spawn(run, false, false, undefined, false, undefined, .55 + random(run) * .35);
  return run;
}
export function assaultSide(run: Run, time = run.time): Direction {
  return run.assaultOrder[Math.floor(time / ASSAULT_PERIOD) % run.assaultOrder.length];
}
export function directionWeights(run: Run): number[] {
  if (run.waveUntil > run.time) return [.25, .25, .25, .25];
  const focus = assaultSide(run);
  return SIDES.map(side => side === focus ? BALANCE.focusShare : (1 - BALANCE.focusShare) / 3);
}
export function toughness(time: number): number {
  const curve = BALANCE.toughness, last = curve.length - 1;
  let leg = 0;
  while (leg < last - 1 && time >= curve[leg + 1][0]) leg++;
  const [from, low] = curve[leg], [until, high] = curve[leg + 1];
  return (low + (high - low) * (time - from) / (until - from)) * (time >= 320 ? BALANCE.lateHp : 1);
}
/** A calm field until calmUntil, a climb to openField by rampAt, then a fast climb that joins the long curve (fieldBase + time / fieldSpan). */
export function targetDensity(run: Run): number {
  const long = BALANCE.fieldBase + Math.floor(run.time / BALANCE.fieldSpan);
  const warming = clamp((run.time - BALANCE.calmUntil) / (BALANCE.rampAt - BALANCE.calmUntil), 0, 1);
  const opening = Math.floor(BALANCE.calmField + (BALANCE.openField - BALANCE.calmField) * warming)
    + Math.floor(Math.max(0, run.time - BALANCE.rampAt) * BALANCE.rampRate);
  return Math.min(BALANCE.fieldCap, long, opening);
}
export function spawnRate(run: Run): number {
  const crowd = enemyCount(run) / targetDensity(run);
  const event = run.waveUntil > run.time || run.enemies.some(enemy => enemy.boss) ? BALANCE.eventRefill : 1;
  return (BALANCE.spawnBase + Math.min(run.time, DURATION) / BALANCE.spawnSpan) * Math.max(0, 1 - crowd ** BALANCE.crowdPower) * event;
}
function retarget(run: Run, enemy: Enemy): void {
  delete enemy.pulled;
  const inner = fortRect(run.fort);
  const aim = { x: inner.left + random(run) * (inner.right - inner.left), y: inner.top + random(run) * (inner.bottom - inner.top) };
  const margin = (enemy.boss || enemy.elite ? 22 : 12) + random(run) * 26;
  const goal = enemy.ladder ? wallPoint(fortRect(run.fort, 12), enemy) : wallPoint(fortRect(run.fort, margin), enemy, aim);
  enemy.goalX = goal.x; enemy.goalY = goal.y;
}
function draft(run: Run): EnemyKind {
  const unlocked = ROTATION.slice(0, UNLOCK_AT.filter(at => run.time >= at).length);
  return random(run) < .5 ? unlocked[unlocked.length - 1] : unlocked[Math.floor(random(run) * unlocked.length)];
}
export function ladderHp(time: number): number {
  const points = [[150, 1], [210, 3], [300, 8], [420, 20], [510, 36], [600, 55]];
  if (time >= 600) return 55;
  const i = Math.max(0, points.findIndex((point, index) => index < points.length - 1 && time < points[index + 1][0]));
  const [a, low] = points[i], [b, high] = points[i + 1];
  return low + (high - low) * clamp((time - a) / (b - a), 0, 1);
}
export function spawn(run: Run, elite = false, boss = false, pattern?: Pattern, final = false, side?: Direction, march = 0, wave = false): Enemy {
  const roll = random(run), weights = directionWeights(run);
  let pick = 0, sum = weights[0];
  while (pick < 3 && roll >= sum) sum += weights[++pick];
  const chosen = side ?? (elite || boss || final ? assaultSide(run) : SIDES[pick]);
  const direction = chosen === "아래" && (elite || boss || final) ? (random(run) < .5 ? "좌" : "우") : chosen;
  const drafted: EnemyKind = final ? "ukita" : pattern === "cavalry" ? "cavalry" : boss || elite ? "samurai" : draft(run);
  const kind = wave ? "samurai" : drafted;
  const ladder = !elite && !boss && !final && (wave || (run.time >= 150 && random(run) < (run.time >= 540 ? BALANCE.lateLadderShare : Math.min(.04, (run.time - 150) / 450 * .04))));
  const hp = BALANCE.enemyHp * toughness(run.time) * (1 + run.curses * .12)
    * (final ? BALANCE.finalHp : boss ? BALANCE.bossHp * (BALANCE.openingBossHp + Math.max(0, Math.round(run.time / BOSS_EVERY) - 1) * BALANCE.bossHpStep) : elite ? BALANCE.eliteHp : ladder ? 1.6 * (wave ? 1 : ladderHp(run.time)) : kind === "samurai" ? 1.6 : kind === "yari" ? 1 : .8);
  const speed = BALANCE.enemySpeed * (1 + run.time / 1200)
    * (final ? .55 : boss ? .6 : elite ? .75 : (.9 + random(run) * .25) * (kind === "cavalry" ? BALANCE.fastSpeed : kind === "yari" ? 1 : .88));
  const start = edgePoint(direction, .06 + random(run) * .88);
  const enemy: Enemy = { id: run.nextId++, kind, direction, x: start.x, y: start.y, hp, maxHp: hp, speed, elite, boss, pattern, wave, ladder, goalX: start.x, goalY: start.y,
    clock: 0, strikeAt: 0, prey: null, stun: 0, burn: 0, burnClock: 0, skillClock: 2.5, casting: 0, casts: 0 };
  if (kind === "guard" && !elite && !boss && !ladder) { enemy.shielded = true; enemy.speed *= .7; }
  retarget(run, enemy);
  const progress = boss || final ? .32 : march;
  const x = start.x + (enemy.goalX - start.x) * progress, y = start.y + (enemy.goalY - start.y) * progress;
  placeEnemyOutside(run, enemy, { x: boss || final ? clamp(x, 48, WIDTH - 48) : x,
    y: Math.min(boss || final ? clamp(y, 88, HEIGHT - 56) : y, riverBank() - 8) }, start);
  run.enemies.push(enemy);
  if (enemy.direction === "아래" && !elite && !boss && !final) {
    if (march <= 0) {
      run.enemies.pop();
      const carrier = run.enemies.find(boat => boat.cargo && boat.cargo.length < (boat.berth ?? 5) && !boat.sailing && boat.wave === wave && boat.hp > 0);
      if (carrier?.cargo) {
        const hull = carrier.hull ?? .5;
        carrier.cargo.push(enemy); enemy.aboard = carrier.shipArt; carrier.hp += enemy.hp * hull; carrier.maxHp += enemy.maxHp * hull;
        if (carrier.cargo.length >= (carrier.berth ?? 5)) carrier.sailing = true;
      } else {
        const tier = transportTier(run.time, run.enemies.some(foe => foe.boss && foe.hp > 0)), load = transportLoad(tier, run.time);
        // Survival splits every ordinary slot into `density.count` bodies; a boat still carries the same slots.
        const berth = load.capacity * (run.bph?.survival ? BPH_SURVIVAL_TABLE.density.count : 1);
        run.enemies.push({ ...enemy, id: run.nextId++, kind: "ship", shipArt: tier, cargo: [enemy], berth, hull: load.hull,
          x: clamp(enemy.x, 32, WIDTH - 32), y: HEIGHT + 4, hp: enemy.hp * load.hull, maxHp: enemy.maxHp * load.hull, speed: TRANSPORT_TIERS[tier].speed, shielded: false });
        enemy.aboard = tier;
        run.metrics.naval.launched++;
      }
    }
  }
  if (!run.bph) dispatchBphEffects(run, { kind: "enemy-spawn", enemy });
  return enemy;
}
/** A transport replaces its passengers in the field count, never adds an extra fighter. */
export function enemyCount(run: Run): number {
  return run.enemies.reduce((sum, enemy) => sum + (enemy.cargo ? enemy.cargo.length : 1), 0);
}
function recordEvent(run: Run, effects: Effect[], label: string, minor = false, hostile = false): void {
  run.metrics.eventTimes.push(run.time); run.metrics.eventLabels.push(label);
  effects.push({ kind: "event", x: CENTER.x, y: CENTER.y, value: 0, label, minor, hostile });
}
const castCooldown = (enemy: Enemy): number => enemy.miniboss ? MINIBOSS.cooldown : enemy.kind === "ukita" ? 4.5 : enemy.boss ? 6 : 5;
function cancel(run: Run, enemy: Enemy, effects: Effect[]): void {
  run.telegraphs = run.telegraphs.filter(mark => mark.id !== enemy.casting);
  enemy.casting = 0; enemy.skillClock = castCooldown(enemy); run.metrics.interrupts++;
  effects.push({ kind: "interrupt", x: enemy.x, y: enemy.y, value: 0, target: enemy.id });
}
function damage(run: Run, enemy: Enemy, amount: number, effects: Effect[], by: Source, critical = false, minor = false, attack: DamageClass = by === "skill" ? "skill" : "melee", index = -1, naval = false, origin?: Striker, fromEffect = false, spellId?: string, fire = false, attackerPosition?: Point, cast?: BphCast, procDepth = 0, attackId = cast?.attackId, projectile?: Effect["projectile"]): number {
  if (enemy.hp <= 0) return 0;
  const chaosEffect = spellId?.startsWith("chaos:") === true;
  const armyEffect = chaosEffect && !spellId?.startsWith("chaos:manual:");
  const direct = (!fromEffect && typeof by === "number" && attack !== "skill" && procDepth === 0)
    || attackId !== undefined;
  const sourceUnit = typeof by === "number" ? unitAt(run, [by, index]) ?? null : null;
  // BPH also renders chongtong as a hwacha body; classify by its actual class, not its sprite.
  const hwacha = origin === "hwacha" && (!sourceUnit?.bph || BPH_PROFILES[sourceUnit.bph.profileId].classId === "hwacha");
  amount = weatherDamage(run.weather, amount, fire || spellId === "Spell_Fireball" || spellId === "Spell_DragonsCall" || (!spellId && hwacha));
  const armyMultiplier = direct ? chaosDirectMultiplier(run, enemy) : 1;
  if (direct) amount *= armyMultiplier;
  const hit = { amount, prevented: false, critical: critical && !armyEffect };
  const provenance = { ...(spellId ? { spellId } : {}), ...(cast ? { cast } : {}) };
  if (!fromEffect) dispatchBphEffects(run, { kind: "before-enemy-damage", enemy, source: sourceUnit, hit, ...provenance });
  else {
    // Effect-sourced hits never see the generic proc event; reach the native
    // frozen-armor interceptions directly so its four ice hits apply to them too.
    const iceContext = run.bph ? bphFxContext(run) : undefined;
    if (iceContext) martialIceHit(iceContext, { kind: "before-enemy-damage",
      enemy, source: sourceUnit, hit, ...provenance });
  }
  if (hit.prevented) {
    dispatchBphEffects(run, { kind: "damage-dealt", side: "enemy", target: enemy, source: sourceUnit,
      attempted: amount, blocked: amount, dealt: 0, overkill: 0, critical: hit.critical, ...provenance });
    return 0;
  }
  if (enemy.kind === "ship" && !naval) return 0;
  if (enemy.shielded && (attack !== "skill" || armyEffect)) {
    effects.push({ kind: "block", x: enemy.x, y: enemy.y, value: 0, target: enemy.id });
    dispatchBphEffects(run, { kind: "damage-dealt", side: "enemy", target: enemy, source: sourceUnit,
      attempted: amount, blocked: amount, dealt: 0, overkill: 0, critical: hit.critical, ...provenance });
    return 0;
  }
  if (enemy.shielded) { enemy.shielded = false; effects.push({ kind: "interrupt", x: enemy.x, y: enemy.y, value: 1, target: enemy.id }); }
  const decisive = critical && !armyEffect && run.level >= BALANCE.executionFrom && !enemy.boss && !enemy.elite && random(run) < BALANCE.executionChance;
  const ordinary = hit.amount * (attack === "skill" && !armyEffect ? run.meta.skillPower ?? 1 : 1) * (enemy.bossArt ? matchup(enemy.bossArt, attack, enemy.kind === "ukita") : 1);
  const dealt = decisive ? Math.max(enemy.hp, ordinary) : ordinary;
  const previousHp = enemy.hp;
  enemy.hp -= dealt;
  dispatchBphEffects(run, { kind: "damage-dealt", side: "enemy", target: enemy, source: sourceUnit,
    ...(run.bph && dealt > 0 ? { receiptId: nextBphDamageReceipt(run) } : {}),
    attempted: amount, blocked: Math.max(0, amount - dealt), dealt: Math.min(previousHp, dealt),
    overkill: Math.max(0, dealt - previousHp), critical: hit.critical, ...provenance,
    ...(armyMultiplier > 1 ? { armyContribution: Math.max(0, Math.min(previousHp, dealt) - Math.min(previousHp, dealt / armyMultiplier)) } : {}) });
  if (typeof by === "number") run.metrics.damage.squads[by] += dealt; else run.metrics.damage[by] += dealt;
  const source = typeof by === "number" ? origin ?? (naval ? "panokseon" : index < 0 ? "general" : run.squads[by].soldiers[index]?.kind ?? "general") : by;
  run.metrics.classDamage[source] += dealt;
  const attacker = attackerPosition ?? sourceUnit ?? (typeof by === "number" ? run.squads[by] : undefined) ?? CENTER;
  const picture: Effect = { kind: "hit", x: enemy.x, y: enemy.y, value: Math.max(1, Math.round(dealt)), target: enemy.id,
    critical: hit.critical, minor, fromX: attacker.x, fromY: attacker.y,
    ...(projectile ? { projectile: { kind: projectile.kind, source: projectile.source, by: projectile.by } } : {}),
    ...(typeof by === "number" && run.squads[by] ? { squad: run.squads[by].id } : {}) };
  noteHitHealth(picture, enemy, dealt);
  effects.push(picture);
  if (decisive) effects.push({ kind: "devastate", x: enemy.x, y: enemy.y, value: 3, target: enemy.id, critical: true });
  // matchup() applies resistance; the attack pose supplies recoil without moving a fighter through a wall.
  if (enemy.hp > 0) { if (!chaosEffect && !enemy.boss && !enemy.ladder) enemy.stun = Math.max(enemy.stun, .08); return dealt; }
  // A boss group shares its appearance time; each member is its own commander record.
  const bossRecord = run.metrics.bosses.find(record => record.appeared === enemy.appearedAt
    && record.fallen === null && (!enemy.bossArt || record.art === enemy.bossArt));
  const phasedDeath = recordBphWitchDeath(run, enemy);
  if (bossRecord && !phasedDeath) bossRecord.fallen = run.time;
  if (run.bph && typeof by === "number" && index >= 0) {
    const killer = run.squads[by]?.soldiers[index];
    if (killer) bphUnitKill(run, killer, effects);
  }
  fell(run, enemy, effects);
  // General XP: a general's own body or skill (the squad itself as the source, never a soldier), plus any boss kill.
  if (run.chaos) chaosKillXp(run, enemy, typeof by === "number" && index < 0 ? run.squads[by] : undefined);
  if (direct && sourceUnit) chaosDirectKill(run, enemy, effects);
  dispatchBphEffects(run, { kind: "unitKilled", side: "enemy", unit: enemy, source: sourceUnit,
    critical: hit.critical, position: { x: enemy.x, y: enemy.y }, origin: fromEffect ? "effect" : "attack", ...provenance });
  dispatchBphEffects(run, { kind: "enemy-killed", enemy, killer: sourceUnit, ...provenance });
  if (enemy.casting) cancel(run, enemy, effects);
  if (enemy.kind === "ukita") {
    run.finalDefeated = true; run.metrics.finalDefeatedAt = run.time;
    if (!run.endless) run.rout = { x: enemy.x, y: enemy.y, at: run.time };
    recordEvent(run, effects, "총대장 격파!");
    effects.push({ kind: "rout", x: enemy.x, y: enemy.y, value: BALANCE.routPace });
  } else if (!run.bph && (enemy.elite || enemy.boss)) {
    const drop = fieldPoint(run.fort, enemy, 14);
    run.chests.push({ id: run.nextId++, x: drop.x, y: drop.y });
    effects.push({ kind: "chest", x: drop.x, y: drop.y, value: 0 });
  }
  return dealt;
}
function fell(run: Run, enemy: Enemy, effects: Effect[], earned = true): void {
  if (enemy.cargo) {
    run.metrics.naval.sunk++; run.metrics.naval.passengersSunk += enemy.cargo.length;
    effects.push({ kind: "kill", x: enemy.x, y: enemy.y, value: 0, target: enemy.id });
    for (const passenger of enemy.cargo) fell(run, passenger, effects, earned);
    enemy.cargo = [];
    return;
  }
  run.kills++;
  const rewardMultiplier = enemy.miniboss ? MINIBOSS.reward : 1;
  const drop = run.bph && earned ? rollBphKillDrop(run, enemy) : { coins: earned, mastery: earned };
  const dropAmount = run.bph ? BPH_KILL_DROP_AMOUNT[bphKillDropTier(enemy)] : 1;
  // Ten regular bodies now occupy the budget of one former spawn.
  // Coins retain fractional carry at the wallet, and medals settle at run end.
  const rewardShare = run.bph?.survival && !enemy.boss && !enemy.miniboss && enemy.kind !== "ukita"
    ? (enemy.infantryRewardShare ?? 1) / BPH_SURVIVAL_TABLE.density.count : 1;
  if (run.bph) {
    run.bph.save.totalKills++;
    if (drop.mastery && run.bph.survival) run.bph.killMedals = (run.bph.killMedals ?? 0) + 1;
    if (enemy.bphProfileId) {
      const monster = BPH_MONSTERS[enemy.bphProfileId];
      if (drop.mastery && !run.bph.survival) run.bph.pendingMastery += monster.mastery * dropAmount * rewardShare * rewardMultiplier;
      run.xp += monster.mastery * rewardMultiplier;
      recordBphProgress(run.bph.save, { kind: "enemy-killed", enemyId: enemy.bphProfileId, count: 1 });
      if (!run.bph.save.discovered.includes(enemy.bphProfileId)) run.bph.save.discovered.push(enemy.bphProfileId);
    }
  }
  if (earned && run.level > 2) run.xp += BALANCE.killXp * (enemy.boss ? 30 : enemy.elite ? 12 : 1) * rewardMultiplier;
  const minute = Math.floor(run.time / 60);
  run.metrics.minuteKills[minute] = (run.metrics.minuteKills[minute] ?? 0) + 1;
  run.score += Math.round((enemy.boss ? 1000 : enemy.elite ? 200 : 12) * run.multiplier * rewardMultiplier);
  effects.push({ kind: "kill", x: enemy.x, y: enemy.y, value: enemy.boss ? 2 : enemy.elite ? 1 : 0, target: enemy.id });
  const pouch = earned && run.bph?.survival && enemy.goldPouch && !enemy.goldPouchSpent;
  if (!pouch && !drop.coins) return;
  const plain = run.bph ? Math.max(BALANCE.coin.foe, enemy.bphProfileId ? BPH_MONSTERS[enemy.bphProfileId].coins : 0)
    : enemy.boss ? BALANCE.coin.boss : enemy.elite ? BALANCE.coin.elite : BALANCE.coin.foe;
  const coinAmount = run.bph ? bphKillCoinMultiplier(run, enemy) : 1;
  // A successful draw pays its full share. A carrier can additionally drop its intact pouch.
  const floor = enemy.infantryRewardShare === undefined ? 1
    : (enemy.infantryRewardShare <= 1 / 3 ? BPH_SURVIVAL_TABLE.crowdedInfantryDropFloorPerFile
      : BPH_SURVIVAL_TABLE.infantryDropFloorPerFile) * enemy.infantryRewardShare;
  const killGold = Math.max(floor, plain * coinAmount * rewardShare * rewardMultiplier);
  const reward = (pouch ? BPH_GOLD_POUCH_COINS : 0) + (drop.coins ? killGold : 0);
  if (!reward) return;
  const upgrade = run.bph?.survival ? bphGoldUpgradeEffects(run.bph.upgrades).goldGainMultiplier : 1;
  const total = reward * run.meta.goldGain * upgrade + run.coinRemainder;
  const coins = Math.floor(total + 1e-9);
  run.coinRemainder = total - coins;
  run.gold += coins; run.earned += coins;
  dispatchBphEffects(run, { kind: "coins-gained", amount: coins });
  effects.push({ kind: "coin", x: enemy.x, y: enemy.y, value: coins, minor: !pouch && plain === BALANCE.coin.foe });
}
function knock(run: Run, enemy: Enemy, from: Point, pixels: number): void {
  const gap = distance(from, enemy);
  // Owner DM 1794897318.658999: a survival boss is never knocked back by hits, skills or charges.
  if (enemy.hp <= 0 || gap < .01 || enemy.boss && run.bph) return;
  const push = pixels * (enemy.boss || enemy.ladder ? .25 : enemy.elite ? .5 : 1);
  const displaced = { x: clamp(enemy.x + (enemy.x - from.x) / gap * push, -14, WIDTH + 14), y: clamp(enemy.y + (enemy.y - from.y) / gap * push, -14, HEIGHT + 14) };
  const ground = enemy.kind !== "ship", exterior = ground && !enemy.breach;
  const at = { x: displaced.x, y: ground ? Math.min(displaced.y, riverBank() - 8) : enemy.y };
  moveEnemy(run, enemy, ground && run.bph?.survival && enemyInCombatField(run, enemy) ? groundCombatPoint(at) : at);
  // Apply the knockback clearance only after the physical sweep resolves any crossing.
  if (exterior && !enemy.breach && !contains(fortRect(run.fort), enemy)) {
    const clearance = fortRect(run.fort, 8);
    if (contains(clearance, enemy)) {
      const clear = pushOut(clearance, enemy);
      moveEnemy(run, enemy, { x: clear.x, y: Math.min(clear.y, riverBank() - 8) });
    }
  }
}
export function stagger(run: Run, enemy: Enemy, seconds: number, effects: Effect[]): void {
  if (enemy.hp <= 0) return;
  const held = seconds * (enemy.boss || enemy.ladder ? .5 : 1);
  enemy.stun = Math.max(enemy.stun, held); enemy.strikeAt = 0;
  if (seconds < INTERRUPTING_STUN) return;
  effects.push({ kind: "stun", x: enemy.x, y: enemy.y, value: held, target: enemy.id });
  if (enemy.casting) cancel(run, enemy, effects);
}
function hurt(run: Run, squad: Squad, index: number, amount: number, effects: Effect[], from?: Enemy, fire = false, provenance?: Pick<BphUnitDamageRequest, "spellId" | "cast">): void {
  const unit = index < 0 ? squad : squad.soldiers[index];
  if (!unit || (index < 0 && !fielded(squad)) || !fit(unit, run.time)) return;
  if (run.bph && from && index >= 0) provoke(run, unit, from);
  amount = weatherDamage(run.weather, amount, fire);
  if (index < 0 && run.bph?.survival && from) amount *= BPH_SURVIVAL_TABLE.generalIncoming;
  const hit = { amount, prevented: false };
  dispatchBphEffects(run, { kind: "before-unit-damage", unit, source: from ?? null, hit, ...provenance });
  if (hit.prevented) {
    dispatchBphEffects(run, { kind: "damage-dealt", side: "ally", target: unit, source: from ?? null,
      attempted: amount, blocked: amount, dealt: 0, overkill: 0, critical: false, ...provenance });
    return;
  }
  if (index < 0 && run.time < squad.safeUntil) return;
  const defense = chaosDefense(run);
  if (defense) defense.unitIncoming += hit.amount;
  if (run.shieldUntil > run.time) {
    if (defense) defense.unitPrevented += hit.amount;
    recordDefensePressure(run, "unit", hit.amount, hit.amount);
    run.metrics.blocked += amount;
    effects.push({ kind: "block", x: unit.x, y: unit.y, value: Math.round(amount), squad: squad.id, index });
    if (run.reflect && from) damage(run, from, amount * 3, effects, run.shieldBy, false, true, "skill");
    return;
  }
  const armor = unit.kind === "spearman" ? .55 : unit.kind === "monk" ? .6 : 1;
  const profileStats = bphStats(unit, run);
  if (profileStats && random(run) < profileStats.blockChance) {
    recordDefensePressure(run, "unit", hit.amount, 0);
    effects.push({ kind: "block", x: unit.x, y: unit.y, value: hit.amount, squad: squad.id, index });
    dispatchBphEffects(run, { kind: "damage-dealt", side: "ally", target: unit, source: from ?? null,
      attempted: amount, blocked: amount, dealt: 0, overkill: 0, critical: false, ...provenance });
    return;
  }
  const kind = index < 0 ? GENERAL_CLASS[squad.general] : unit.kind as SoldierKind;
  const protection = index < 0 ? 1 : synergy(run, kind).guard * (run.tactics[kind].guard && kind === "spearman" ? 1.8 : 1);
  const rawTaken = profileStats ? hit.amount * Math.max(0, 1 - profileStats.damageReduction)
    : hit.amount * armor / protection / (index < 0 ? 1 : 1 + BALANCE.drillGuard * run.drill[unit.kind as SoldierKind]) * (index < 0 ? 1 : run.meta.classGuard?.[kind] ?? 1);
  const guard = chaosGuard(run, unit), taken = rawTaken * guard;
  if (defense) defense.unitPrevented += hit.amount * (1 - guard);
  recordDefensePressure(run, "unit", hit.amount, hit.amount * (1 - guard));
  const previousHp = unit.hp;
  unit.hp -= taken; if (index < 0) squad.hurtAt = run.time; run.metrics.taken[squad.id] += taken;
  dispatchBphEffects(run, { kind: "damage-dealt", side: "ally", target: unit, source: from ?? null,
    attempted: amount, blocked: Math.max(0, amount - taken), dealt: Math.min(previousHp, taken),
    overkill: Math.max(0, taken - previousHp), critical: false, ...provenance });
  effects.push({ kind: "hurt", x: unit.x, y: unit.y, value: Math.round(taken), squad: squad.id, index, target: from?.id });
  if (unit.hp > 0) return;
  unit.hp = 0; unit.strikeAt = 0;
  if (index < 0 && squad.specialAttack) { squad.specialAttack.strikeAt = 0; squad.specialAttack.combo = undefined; }
  dispatchBphEffects(run, { kind: "unitKilled", side: "ally", unit, source: from ?? null,
    critical: false, position: { x: unit.x, y: unit.y }, origin: "attack" });
  dispatchBphEffects(run, { kind: "unit-death", unit, killer: from ?? null });
  if (index >= 0) {
    unit.downUntil = unit.bph ? Infinity : run.time + BALANCE.soldierDown; run.metrics.soldierDowns++;
    effects.push({ kind: "down", x: unit.x, y: unit.y, value: 0, squad: squad.id, index });
    return;
  }
  const lying = downSeconds(run);
  squad.state = "down"; squad.downUntil = run.time + lying; squad.downs++; squad.lane = null;
  run.metrics.downs.push({ time: run.time, squad: squad.id });
  effects.push({ kind: "down", x: squad.x, y: squad.y, value: lying, squad: squad.id, index: -1, label: "부상!" });
}
/** A survival run's temple decides whether and how soon a fallen general rises; every other run keeps the classic 30 s. */
export const downSeconds = (run: Run): number => run.bph ? bphReviveSeconds(run.bph.upgrades) : BALANCE.downSeconds;
export const fewest = (run: Run) => run.squads.reduce((best, squad) => strength(squad) < strength(best) ? squad : best);
export const classCount = (run: Run, kind: SoldierKind): number => run.squads.reduce((sum, squad) => sum + squad.soldiers.filter(unit => unit.kind === kind).length, 0);
export const troopCount = (run: Run): number => run.squads.reduce((sum, squad) => sum + squad.soldiers.length, 0);
export const troopCap = (run: Run): number => run.meta.caps?.troops ?? 48;
export const canRecruit = (run: Run, kind: SoldierKind): boolean => classCount(run, kind) < (kind === "panokseon" ? 2 : 12)
  && (kind !== "panokseon" || !run.meta.caps || run.meta.caps.naval)
  && troopCount(run) < troopCap(run);
export const canTrainClassCard = (run: Run, kind: SoldierKind): boolean =>
  run.drill[kind] < Math.min(BALANCE.drillMax, growthTier(run.level) - 1);
function raiseClass(run: Run, kind: SoldierKind): Effect[] {
  run.drill[kind]++;
  if (run.drill[kind] === 2) run.tactics[kind].epic = true;
  if (kind === "panokseon" && classCount(run, kind) === 1) recruit(run, kind);
  return [{ kind: "upgrade", x: CENTER.x, y: CENTER.y, value: run.drill[kind] + 1, by: kind }];
}
export function upgradeCost(run: Run, kind: SoldierKind): number | null {
  const level = run.drill[kind];
  if (level >= (run.meta.caps?.drill ?? BALANCE.drillMax) || !run.squads.some(squad => squad.soldiers.some(unit => unit.kind === kind))) return null;
  return BALANCE.drillPrices[level];
}
export function upgradeClass(run: Run, kind: SoldierKind): Effect[] {
  const cost = upgradeCost(run, kind);
  if (!["playing", "choice"].includes(run.phase) || cost === null || run.gold < cost) return [];
  run.gold -= cost;
  return raiseClass(run, kind);
}
export function recruit(run: Run, kind: SoldierKind, recipient = fewest(run).id): Effect[] {
  if (!canRecruit(run, kind)) return [];
  const squad = run.squads[recipient];
  const unit = soldier(kind, 1, kind === "panokseon" ? { x: 32, y: riverLane() } : CENTER, run.level);
  unit.id = run.nextId++;
  assignMarchFlank(run, unit);
  squad.soldiers.push(unit);
  return [{ kind: "merge", x: CENTER.x, y: CENTER.y, value: 0, squad: squad.id }];
}
export function buyRecruit(run: Run, kind: SoldierKind): Effect[] {
  const cost = recruitCost(run);
  if (!["playing", "choice"].includes(run.phase) || run.gold < cost || !canRecruit(run, kind) || run.meta.caps?.drill === 0) return [];
  run.gold -= cost; run.recruitsBought++;
  return recruit(run, kind);
}
export const recruitCost = (run: Run): number => RECRUIT_COST + run.recruitsBought * 8;
function enlist(run: Run, general: General): Effect[] {
  if (run.squads.length >= (run.meta.caps?.party ?? PARTY_LIMIT) || !run.roster.includes(general) || run.squads.some(squad => squad.general === general)
    || !canRecruit(run, GENERAL_CLASS[general])) return [];
  const id = run.squads.length;
  const squad = muster(run, general, guardPoint(run.fort, "아래", GATE_GAP, id === 1 ? -44 : 44), [GENERAL_CLASS[general]]);
  const load = pressure(run);
  squad.post = SIDES.filter(side => !run.squads.some(mate => mate !== squad && mate.post === side)).sort((a, b) => load[b] - load[a])[0];
  if (squad.state !== "down") squad.skillClock = 0;
  run.metrics.generalTimes.push(run.time);
  recordEvent(run, [], `${general} 합류`);
  return [{ kind: "join", x: squad.x, y: squad.y, value: 1, squad: id, label: `${general} 합류` }];
}
/** A legacy general hand waiting for an answer. Survival hires use the paid slots. */
export function generalHandOpen(run: Run): boolean {
  return run.generalOffers.length > 0 && (run.phase === "general" || Boolean(run.bph) && run.phase === "playing");
}
export function chooseGeneral(run: Run, general: General): Effect[] {
  if (!generalHandOpen(run) || !run.generalOffers.includes(general)) throw new Error("합류할 수 없는 장수입니다.");
  run.generalOffers = []; run.phase = "playing";
  return run.bph ? enlistBph(run, general) : enlist(run, general);
}
export function hireBphGeneral(run: Run, index: number): Effect[] {
  const battle = run.bph, slot = bphHireSlots(run)[index];
  if (!battle || slot?.status !== "available") return [];
  const pool = bphJoinCandidates(run);
  const general = pool[Math.floor(bphHireRoll(run.seed, index) * pool.length)];
  const effects = enlistBph(run, general);
  if (!effects.length) return effects;
  run.gold -= slot.price;
  (battle.hiredGenerals ??= {})[index] = general;
  return effects;
}
/** A survival general enters alone through the south gate, without a class soldier or troop cap. */
function enlistBph(run: Run, general: General): Effect[] {
  const battle = run.bph, known = BPH_GENERALS.find(name => name === general);
  if (!battle || !known || run.squads.length >= BPH_JOIN_LIMIT || !battle.save.unlockedGenerals.includes(known)
    || run.squads.some(squad => squad.general === known)) return [];
  const id = run.squads.length;
  const squad = muster(run, known, { x: CENTER.x + (id === 1 ? -14 : 14), y: fortRect(run.fort, -32).bottom - 1 }, []);
  const load = pressure(run);
  squad.post = SIDES.filter(side => !run.squads.some(mate => mate !== squad && mate.post === side)).sort((a, b) => load[b] - load[a])[0];
  if (squad.state !== "down") squad.skillClock = 0;
  run.metrics.generalTimes.push(run.time);
  discoverBphCodex(battle.save, `general:${known}`);
  recordEvent(run, [], `${known} 합류`);
  return [{ kind: "join", x: squad.x, y: squad.y, value: 1, squad: id, label: `${known} 합류` }];
}
/** The reel and the final draw consume the same candidates, including ownership and star gates. */
export function cardPools(run: Run): CardId[][] {
  const weapons: CardId[] = [], tricks: CardId[] = [];
  if (run.arrow < (run.meta.caps?.weapon ?? 3) && (run.meta.caps?.arrow ?? true)) weapons.push("arrow");
  if (run.hwacha < (run.meta.caps?.weapon ?? 3) && (run.meta.caps?.hwacha ?? true)) weapons.push("hwacha");
  if (run.arrow > 0 && !run.quiver) tricks.push("quiver");
  if (run.hwacha > 0 && !run.powder) tricks.push("powder");
  if (run.hwacha > 0 && !run.fire) tricks.push("fire");
  const awakenings = run.squads.filter(squad => squad.tier < Math.min(run.meta.caps?.hero ?? 3, growthTier(run.level))).map(squad => `awaken-${squad.general}` as CardId);
  const recruits: CardId[] = [];
  for (const kind of ARMY_KINDS) {
    if (kind === "panokseon" && run.meta.caps && !run.meta.caps.naval) continue;
    if (!classCount(run, kind)) { if (canRecruit(run, kind)) recruits.push(`recruit-${kind}`); }
    else {
      // Rule 18: ownership changes the reward into an upgrade, never removes its class from the draw.
      if (canTrainClassCard(run, kind) || canRecruit(run, kind)) recruits.push(`upgrade-${kind}`);
      if (run.drill[kind] === 2 && run.time >= 240 && run.time - run.lastEvolution >= 60)
        for (const mode of ["storm", "guard"] as const) if (!run.tactics[kind][mode] && (run.meta.caps?.tactics ?? 3) >= (mode === "storm" ? 2 : 3)) recruits.push(`legend-${kind}-${mode}`);
    }
  }
  const heroes = run.squads.length >= (run.meta.caps?.party ?? PARTY_LIMIT) ? [] : run.roster.filter(general =>
    !run.squads.some(squad => squad.general === general) && canRecruit(run, GENERAL_CLASS[general])).map(general => `hero-${general}` as CardId);
  const tactics: CardId[] = [...weapons, ...tricks];
  if (!run.rift && run.time - run.lastEvolution >= 60 && (run.meta.caps?.tactics ?? 3) >= 3) tactics.push("rift");
  const generals = [...(run.level >= 2 ? heroes : []), ...awakenings];
  return [generals.length ? generals : tactics, recruits, tactics];
}
function cardTarget(card: CardId): string {
  const army = classCard(card);
  return army ? `class:${army.kind}` : card.startsWith("hero-") ? `hero:${card.slice(5)}` : card.startsWith("awaken-") ? `hero:${card.slice(7)}` : card;
}
function slotCandidates(run: Run, slot: number, earlier: readonly CardId[]) {
  const pools = cardPools(run), used = new Set(earlier.map(cardTarget));
  return {
    primary: pools[slot].filter(card => !used.has(cardTarget(card))),
    fallback: pools.flat().filter(card => !used.has(cardTarget(card))),
  };
}
export function reelCards(run: Run, slot: number, earlier: readonly CardId[] = run.offers.slice(0, slot)): CardId[] {
  const { primary, fallback } = slotCandidates(run, slot, earlier);
  const ordinary = primary.some(card => card !== "rift" && !card.startsWith("legend-"));
  return ordinary ? primary : [...primary, ...fallback];
}
export const AWAKENING_OFFER_MISS_LIMIT = 8;
export function drawCards(run: Run): CardId[] {
  const pools = cardPools(run), offers: CardId[] = [];
  const legend = rarityAt(run.time, random(run)) === "legend", future = random(run) < .01;
  const eligible = (card: CardId) => card === "rift" ? future : !card.startsWith("legend-") || legend;
  for (let slot = 0; slot < pools.length; slot++) {
    const { primary, fallback } = slotCandidates(run, slot, offers);
    let candidates = primary.filter(eligible);
    if (slot === 2 && future && fallback.includes("rift")) candidates = ["rift"];
    if (!candidates.length) candidates = fallback.filter(eligible);
    if (!candidates.length) break;
    const targets = [...new Set(candidates.map(cardTarget))], target = targets[Math.floor(random(run) * targets.length)];
    const variants = candidates.filter(card => cardTarget(card) === target);
    const card = variants.length === 1 ? variants[0] : variants[Math.floor(random(run) * variants.length)];
    offers.push(card);
  }
  if (!offers.length && run.meta.caps?.drill) offers.push("gold40");
  const misses = run.awakeningOfferMisses ?? 0;
  if (misses >= AWAKENING_OFFER_MISS_LIMIT && !offers.some(card => card.startsWith("awaken-"))) {
    const awakenings = pools.flat().filter(card => card.startsWith("awaken-"));
    if (awakenings.length) offers[0] = awakenings[Math.floor(random(run) * awakenings.length)];
  }
  if (offers.length) {
    if (offers.some(card => card.startsWith("awaken-"))) delete run.awakeningOfferMisses;
    else run.awakeningOfferMisses = Math.min(AWAKENING_OFFER_MISS_LIMIT, misses + 1);
  }
  return offers;
}
function applyArmyCard(run: Run, card: CardId): Effect[] {
  const effects: Effect[] = [];
  const army = classCard(card);
  if (army && card.startsWith("upgrade-")) {
    if (canTrainClassCard(run, army.kind)) return raiseClass(run, army.kind);
    for (let i = 0; i < (run.meta.caps?.recruitCount ?? 2); i++) effects.push(...recruit(run, army.kind));
    return effects;
  }
  if (army && army.rarity !== "common") {
    if (army.rarity === "rare") {
      const squad = fewest(run);
      for (let i = 0; i < 3; i++) effects.push(...recruit(run, army.kind, squad.id));
    } else {
      if (army.rarity === "epic") run.tactics[army.kind].epic = true;
      if (army.rarity === "legend" && army.mode) {
        run.tactics[army.kind][army.mode] = true; run.lastEvolution = run.time;
      }
      effects.push({ kind: "evolution", x: CENTER.x, y: CENTER.y, value: army.rarity === "legend" ? 2 : 1, by: army.kind });
    }
  }
  return effects;
}
export function choose(run: Run, card: CardId): Effect[] {
  if (run.phase !== "choice" || !run.offers.includes(card)) throw new Error("선택할 수 없는 카드입니다.");
  const effects: Effect[] = applyArmyCard(run, card);
  if (card.startsWith("hero-")) effects.push(...enlist(run, card.slice(5) as General));
  else if (card.startsWith("promote-")) {
    const general = card.slice(8) as General, squad = run.squads.find(squad => squad.general === general);
    if (!squad || squad.tier >= GENERAL_GROWTH.maxTier) throw new Error("강화할 수 없는 장수입니다.");
    const before = squad.maxHp;
    squad.tier++;
    squad.maxHp = metaGeneralHp(run, general, squad.tier);
    if (squad.hp > 0) squad.hp += squad.maxHp - before;
    effects.push(...recruit(run, GENERAL_CLASS[general], squad.id));
    effects.push({ kind: "join", x: squad.x, y: squad.y, value: squad.tier, squad: squad.id });
  } else if (card.startsWith("recruit-")) {
    const kind = card.slice(8) as SoldierKind, squad = fewest(run);
    effects.push(...recruit(run, kind, squad.id));
    if (kind !== "panokseon") for (let i = 1; i < (run.meta.caps?.recruitCount ?? 2); i++) effects.push(...recruit(run, kind, squad.id));
  } else if (card.startsWith("awaken-")) {
    const squad = run.squads.find(s => s.general === card.slice(7))!;
    const before = squad.maxHp;
    squad.tier = Math.min(3, squad.tier + 1);
    squad.maxHp = metaGeneralHp(run, squad.general, squad.tier);
    if (squad.hp > 0) squad.hp += squad.maxHp - before;
    effects.push({ kind: "join", x: squad.x, y: squad.y, value: 2, squad: squad.id, label: cardText(run, card).name });
    squad.awakened = squad.tier - 1;
    if (squad.state !== "down") squad.skillClock = 0;
  }
  if (card === "arrow") run.arrow++;
  if (card === "hwacha") run.hwacha++;
  if (card === "quiver") run.quiver = true;
  if (card === "powder") run.powder = true;
  if (card === "fire") run.fire = true;
  if (card === "curse") { run.multiplier *= 2; run.curses++; }
  if (card === "rift") { run.rift = true; run.multiplier *= 4; }
  if (card === "gold40") { run.gold += 40; run.earned += 40; }
  run.metrics.cards.push(card);
  // Levels gained while these cards waited are dealt right away, one hand per level.
  if (run.queued > 0) { run.queued--; run.offers = drawCards(run); if (!run.offers.length) { run.phase = "playing"; run.gold += 40; run.earned += 40; } }
  else { run.offers = []; run.phase = "playing"; }
  return effects;
}
export function cardText(run: Run, card: CardId): { name: string; line: string; pips?: number } {
  const army = classCard(card);
  if (army && card.startsWith("upgrade-")) return { name: SOLDIER_NAMES[army.kind], line: canTrainClassCard(run, army.kind) ? "병과 강화" : "보유 병과 증원",
    pips: Math.min(3, run.drill[army.kind] + (canTrainClassCard(run, army.kind) ? 2 : 1)) };
  if (army && army.rarity !== "common") return {
    name: army.mode ? LEGEND_NAMES[army.kind][army.mode] : SOLDIER_NAMES[army.kind],
    line: army.rarity === "rare" ? "병사 셋 합류" : army.rarity === "epic" ? "병과 공격 진화" : "병과 전설 진화",
    pips: army.rarity === "rare" ? 3 : army.rarity === "epic" ? 2 : 3,
  };
  if (card.startsWith("hero-")) {
    return { name: card.slice(5), line: "장군 합류", pips: 1 };
  }
  if (card.startsWith("promote-")) return { name: card.slice(8), line: "장군 강화", pips: (run.squads.find(squad => squad.general === card.slice(8))?.tier ?? 1) + 1 };
  if (card.startsWith("recruit-")) {
    const kind = card.slice(8) as SoldierKind;
    return { name: SOLDIER_NAMES[kind], line: { spearman: "앞줄 · 튼튼함", archer: "뒷줄 · 멀리 쏨", hwacha: "뒷줄 · 폭발", monk: "앞줄 · 기절시킴", ming_cavalry: "앞줄 · 돌파", panokseon: "뱃길 · 함포" }[kind], pips: 1 };
  }
  if (card.startsWith("awaken-")) {
    const general = card.slice(7) as General;
    return { name: general, line: "스킬 강화", pips: (run.squads.find(squad => squad.general === general)?.tier ?? 1) + 1 };
  }
  return ({
    arrow: { name: "궁병", line: "성벽 화살 +1발", pips: run.arrow + 1 },
    hwacha: { name: "화차", line: "성벽 로켓 +1발", pips: run.hwacha + 1 },
    quiver: { name: "관통 화살", line: "꿰뚫음 · 진화 재료" },
    powder: { name: "큰 화약", line: "큰 폭발 · 진화 재료" },
    fire: { name: "화공", line: "폭발이 적을 불태움" },
    curse: { name: "배수진", line: "적 강화 · 점수 두 배" },
    rift: { name: "시간 균열", line: "미래포 · 점수 네 배" },
    gold40: { name: "군자금", line: "골드 40" },
  } as Record<string, { name: string; line: string; pips?: number }>)[card];
}
export function autoCard(run: Run): CardId {
  const has = (card: CardId) => run.offers.includes(card);
  const hero = run.offers.find(card => card.startsWith("hero-") && !run.squads.some(squad => squad.general === card.slice(5)));
  if (hero) return hero;
  const tactic = run.offers.find(card => card.startsWith("legend-"));
  if (tactic) return tactic;
  if (has("rift")) return "rift";
  const awakening = run.offers.find(card => card.startsWith("awaken-"));
  if (awakening) return awakening;
  if (run.hwacha >= 3 && has("powder")) return "powder";
  if (run.arrow >= 3 && has("quiver")) return "quiver";
  for (const card of (run.arrow <= run.hwacha ? ["arrow", "hwacha"] : ["hwacha", "arrow"]) as CardId[]) if (has(card)) return card;
  const training = run.offers.find(card => card.startsWith("upgrade-"));
  if (training) return training;
  for (const card of ["powder", "quiver", "fire"] as CardId[]) if (has(card)) return card;
  return run.offers.find(card => card.startsWith("promote-")) ?? run.offers.find(card => card.startsWith("recruit-")) ?? run.offers[0];
}
function openChest(run: Run, effects: Effect[]): void {
  const chest = run.chests.shift()!;
  const evolution: WeaponId | null = run.time < EVOLUTION_FROM || run.meta.caps?.evolution === false ? null
    : run.hwacha === 3 && run.powder && !run.evolutions.includes("hwacha") ? "hwacha"
    : run.arrow === 3 && run.quiver && !run.evolutions.includes("arrow") ? "arrow" : null;
  const counts = SOLDIERS.map(kind => run.squads.reduce((sum, squad) => sum + squad.soldiers.filter(unit => unit.kind === kind).length, 0));
  const common = SOLDIERS.filter((_, order) => counts[order] === Math.max(...counts));
  const upgradable = cardPools(run)[2].some(card => ["arrow", "hwacha", "quiver", "powder"].includes(card)), wakeable = run.squads.some(squad => squad.tier < Math.min(run.meta.caps?.hero ?? 3, growthTier(run.level)));
  const options: Bonus[] = ["gold", "recruit", "gold", upgradable ? "weapon" : "recruit", "recruit", "gold", wakeable ? "awaken" : "gold", "jackpot"];
  const first = Math.floor(random(run) * options.length);
  run.roulette = { remaining: evolution ? 1 : ROULETTE_SECONDS, options: [...options.slice(first), ...options.slice(0, first)],
    soldier: common[Math.floor(random(run) * common.length)], evolution };
  if (!evolution && run.time >= 240 && run.drill[run.roulette.soldier] === 2 && isClassKind(run.roulette.soldier)) {
    const kind = run.roulette.soldier, rarity = rarityAt(run.time, random(run));
    if (rarity === "legend" && run.time - run.lastEvolution >= 60) {
      const mode = (["storm", "guard"] as const).find(mode => !run.tactics[kind][mode]);
      if (mode && (run.meta.caps?.tactics ?? 3) >= (mode === "storm" ? 2 : 3)) run.roulette.card = `legend-${kind}-${mode}`;
    }
  }
  effects.push({ kind: "chest", x: chest.x, y: chest.y, value: 1 });
}
export function rouletteIndex(reward: Roulette): number {
  const elapsed = clamp(ROULETTE_SECONDS - reward.remaining, 0, ROULETTE_SECONDS);
  const tick = elapsed < .8 ? Math.floor(elapsed / .8 * 29) : elapsed < .92 ? 29 : elapsed < 1.06 ? 30 : elapsed < 1.2 ? 31 : ROULETTE_TICKS;
  return tick % reward.options.length;
}
export function bonusText(bonus: Bonus, kind: SoldierKind): string {
  return bonus === "jackpot" ? "대박 · 골드와 병사!" : bonus === "recruit" ? `${SOLDIER_NAMES[kind]} 2명` : bonus === "weapon" ? "무기 강화" : bonus === "awaken" ? "장수 각성" : "골드 주머니";
}
function settle(run: Run): Effect[] {
  if (!run.roulette) return [];
  const reward = run.roulette, bonus = reward.options[rouletteIndex({ ...reward, remaining: 0 })], all = bonus === "jackpot", effects: Effect[] = [];
  run.roulette = null; run.metrics.chests++;
  if (reward.evolution) {
    run.evolutions.push(reward.evolution); run.evolved = true; run.lastEvolution = run.time; run.metrics.evolutionTimes.push(run.time);
    effects.push({ kind: "evolution", x: CENTER.x, y: CENTER.y, value: 2, label: reward.evolution === "hwacha" ? "진화 · 신기전 화차" : "진화 · 연노궁" });
    return effects;
  }
  run.metrics.bonuses[bonus]++;
  if (reward.card) {
    effects.push(...applyArmyCard(run, reward.card));
    run.metrics.cards.push(reward.card);
    return effects;
  }
  if (bonus === "recruit" || all) { const squad = fewest(run); for (let i = 0; i < (run.meta.caps?.recruitCount ?? 2); i++) effects.push(...recruit(run, reward.soldier, squad.id)); }
  const purse = Math.round((40 + Math.floor(run.time / 60) * 20) * (all ? 3 : 1) * run.meta.goldGain);
  if (bonus === "gold" || all) { run.gold += purse; run.earned += purse; effects.push({ kind: "coin", x: CENTER.x, y: CENTER.y, value: purse }); }
  if (bonus === "weapon") {
    const eligible = cardPools(run)[2].filter(card => ["arrow", "hwacha", "quiver", "powder"].includes(card));
    const card = eligible[0];
    if (card === "arrow") run.arrow++; else if (card === "hwacha") run.hwacha++;
    else if (card === "quiver") run.quiver = true; else if (card === "powder") run.powder = true;
    else { run.gold += purse; run.earned += purse; }
  }
  if (bonus === "awaken") {
    const ready = run.squads.filter(squad => squad.tier < Math.min(run.meta.caps?.hero ?? 3, growthTier(run.level))), squad = ready[Math.floor(random(run) * ready.length)];
    if (squad) {
      const before = squad.maxHp;
      squad.tier++; squad.awakened = squad.tier - 1;
      if (squad.state !== "down") squad.skillClock = 0;
      squad.maxHp = metaGeneralHp(run, squad.general, squad.tier);
      if (squad.hp > 0) squad.hp += squad.maxHp - before;
    } else { run.gold += purse; run.earned += purse; }
  }
  effects.push({ kind: "prize", x: CENTER.x, y: CENTER.y, value: PRIZE_TIERS[bonus], label: bonusText(bonus, reward.soldier) });
  return effects;
}
function volleyAim(run: Run): Aim | null {
  const radius = BALANCE.volleyRadius, cells = new Map<number, Enemy[]>();
  const key = (x: number, y: number) => (Math.floor(x / radius) + 4) * 64 + Math.floor(y / radius) + 4;
  for (const enemy of run.enemies) if (enemy.hp > 0 && enemy.kind !== "ship" && enemyInCombatField(run, enemy)) {
    const cell = key(enemy.x, enemy.y), list = cells.get(cell);
    if (list) list.push(enemy); else cells.set(cell, [enemy]);
  }
  let best: Aim | null = null;
  for (const centre of run.enemies) {
    if (centre.hp <= 0 || !enemyInCombatField(run, centre)) continue;
    let weight = 0, count = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const other of cells.get(key(centre.x + dx * radius, centre.y + dy * radius)) ?? []) if (distance(other, centre) < radius) {
        count++; weight += other.boss ? 6 : other.elite ? 3 : 1;
      }
    if (!best || weight > best.weight) best = { x: centre.x, y: centre.y, toX: centre.x, toY: centre.y, count, weight, urgent: false };
  }
  return best;
}
/** Survival castles open a gate in every wall; the classic demo keeps the single south gate. */
const gatesOf = (run: Run) => fortGates(!!run.bph);
function blocksCharge(run: Run, from: Point, to: Point): boolean {
  const wall = fortRect(run.fort, 6);
  const gate = (p: Point) => gatesOf(run).some(side => onGateLine(run.fort, side, p));
  if (contains(wall, to) && !contains(fortRect(run.fort, -32), to) && !gate(to)) return true;
  if (!crosses(wall, from, to) || (contains(wall, from) && contains(wall, to))) return false;
  const entry = contains(wall, from) ? wallPoint(wall, to, from) : wallPoint(wall, from, to);
  const exit = contains(wall, to) ? entry : wallPoint(wall, to, from);
  return !gate(entry) || !gate(exit);
}
function chargeTier(run: Run, squad: Squad): number {
  const level = sharedLevel(run) ?? 0;
  return Math.max(squad.tier, growthFor(squad.general, run).tier, level >= 6 ? 3 : level >= 3 ? 2 : 1);
}
export function chargeRadius(run: Run, squad: Squad): number {
  const tier = squad.general === "신립" ? chargeTier(run, squad) : squad.tier;
  const mastery = squad.general === "신립" ? run.bph?.generalMastery?.radiusBonus ?? 0 : 0;
  return BALANCE.chargeWidth * (1 + GENERAL_GROWTH.radius * (tier - 1)) * (1 + mastery);
}
function chargeAim(run: Run, squad: Squad, distanceBonus: number): Aim {
  const block = fortRect(run.fort, 6), rank = (e: Enemy) => (e.casting ? 100 : 0) + (e.kind === "ukita" ? 40 : e.boss ? 30 : e.elite ? 20 : e.ladder ? 15 : 0);
  const clear = run.enemies.filter(e => e.hp > 0 && distance(e, squad) < BALANCE.chargeReach * 1.3 && !blocksCharge(run, squad, e))
    .sort((a, b) => rank(b) - rank(a) || distance(b, squad) - distance(a, squad)).slice(0, 10);
  let best: Aim | null = null;
  for (const target of clear) {
    const gap = Math.max(1, distance(target, squad)), reach = Math.min(BALANCE.chargeReach + distanceBonus, gap + 26 + distanceBonus);
    const desired = { x: squad.x + (target.x - squad.x) / gap * reach, y: squad.y + (target.y - squad.y) / gap * reach };
    const end = contains(block, desired) && !blocksCharge(run, squad, desired) ? desired : fieldPoint(run.fort, desired, SQUAD_MARGIN);
    const count = run.enemies.filter(e => e.hp > 0 && segmentGap(e, squad, end) < BALANCE.chargeWidth).length, weight = rank(target) * 100 + count;
    if (!best || weight > best.weight) best = { x: target.x, y: target.y, toX: end.x, toY: end.y, count, weight, urgent: target.casting > 0 };
  }
  if (best) return best;
  const out = fieldPoint(run.fort, guardPoint(run.fort, squad.post, 150 + distanceBonus), SQUAD_MARGIN);
  return { x: out.x, y: out.y, toX: out.x, toY: out.y, count: 0, weight: 0, urgent: false };
}
export function skillAim(run: Run, id: number): Aim | null {
  const squad = run.squads[id];
  if (!squad) return null;
  const spec = GENERAL_SKILLS[squad.general];
  switch (spec.kind) {
    case "volley": case "bombard": case "hold": return volleyAim(run);
    case "ambush": return militiaAim(run);
    case "charge": return chargeAim(run, squad, squad.general === "신립" ? (chargeTier(run, squad) - 1) * 24 : 0);
    case "sweep": {
      const count = run.enemies.filter(enemy => enemy.hp > 0 && distance(enemy, squad) < spec.radius).length;
      return { x: squad.x, y: squad.y, toX: squad.x, toY: squad.y, count, weight: count, urgent: false };
    }
    case "heal": case "shield":
      return { x: CENTER.x, y: CENTER.y, toX: CENTER.x, toY: CENTER.y, count: run.telegraphs.length, weight: run.telegraphs.length, urgent: run.telegraphs.length > 0 };
  }
}
function volley(run: Run, squad: Squad, aim: Point, effects: Effect[], growth?: SkillMods): void {
  const spec = GENERAL_SKILLS[squad.general];
  if (spec.kind !== "volley") return;
  const amount = spec.power * might(run) * (squad.general === "권율" ? 1 : 1 + squad.awakened * .25) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1));
  const skillPower = generalUpgradeMultiplier(run.meta.generalUpgrades, squad.general, "skill");
  const army = run.chaos?.mods.general === "권율" ? run.chaos.mods : undefined;
  const radius = spec.radius * (1 + GENERAL_GROWTH.radius * (squad.tier - 1)) + (growth?.radiusBonus ?? 0) + (army?.radiusBonus ?? 0);
  effects.push({ kind: "skill", x: aim.x, y: aim.y, fromX: squad.x, fromY: squad.y, value: radius, squad: squad.id, label: SKILL_NAMES[squad.general] });
  let total = 0;
  for (const enemy of run.enemies) if (enemy.hp > 0 && distance(enemy, aim) < radius) {
    total += damage(run, enemy, amount * skillPower, effects, "skill", false, true, "skill", -1, false, undefined, false, undefined, spec.burn > 0 || run.fire, squad);
    knock(run, enemy, aim, 10);
    enemy.burn = Math.max(enemy.burn, spec.burn, run.fire ? 3 : 0);
  }
  const arrowCount = (growth?.arrowCountBonus ?? 0) + (army?.manualArrows ?? 0);
  const targets = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship"
    && distance(enemy, aim) < (army?.retargetRange ?? radius));
  if (army) targets.sort((a, b) => distance(a, aim) - distance(b, aim) || a.id - b.id);
  for (let arrow = 0; arrow < arrowCount && targets.length; arrow++) {
    const target = targets[arrow % targets.length];
    run.shots.push({ id: run.nextId++, kind: "arrow", x: squad.x + (arrow - (arrowCount - 1) / 2) * 6, y: squad.y,
      toX: target.x, toY: target.y, speed: 340, target: target.id, prey: null,
      damage: amount * (army?.manualRatio ?? .05) * skillPower, critical: false, by: "skill", attack: "skill",
      splash: 0, pierce: 0, from: squad.id, tier: 1, flaming: spec.burn > 0 || run.fire,
      ...(army ? { retargetRange: army.retargetRange, hitIds: [] } : {}) });
  }
  if (total > 0) effects.push({ kind: "total", x: aim.x, y: aim.y - 30, value: Math.round(total), critical: true });
}
/** Read-only heal contract, also usable by VFX for legacy/N0 effects. */
export function actualManualHealRatio(run: Run, squad: Squad): number {
  if (squad.general === "사명대사") return 0;
  const spec = GENERAL_SKILLS[squad.general];
  if (spec.kind !== "heal") return 0;
  const { mods } = growthFor(squad.general, run), army = run.chaos?.mods;
  return spec.ratio + squad.awakened * .1 + mods.healRatioBonus
    + (army?.general === "사명대사" ? army.manualHealBonus : 0);
}
export function useSkill(run: Run, id: number): Effect[] {
  const squad = run.squads[id];
  if (!["playing", "choice"].includes(run.phase) || !squad || !fielded(squad) || squad.skillClock > 0) return [];
  const { mods } = growthFor(squad.general, run);
  chaosState(run);
  const army = run.chaos?.mods;
  if (replacementSkill(run, squad)) {
    const effects: Effect[] = [];
    castChaosSkill(run, squad, effects);
    squad.skillClock = BALANCE.cooldown[squad.general] * (squad.awakened >= 2
      && squad.general !== "김시민" && squad.general !== "곽재우" && squad.general !== "이순신" ? .5 : 1);
    squad.usedAt = run.time; run.metrics.skills[id]++;
    run.metrics.skillTimes.push({ time: run.time, squad: id });
    dispatchBphEffects(run, { kind: "skill-used", squad });
    return effects;
  }
  if (run.bph && squad.general === "이순신") {
    const effects: Effect[] = [];
    castYisunsin(run, squad, effects, {
      damage: (enemy, amount) => { damage(run, enemy, amount, effects, id, false, false, "skill", -1, true); },
      knock: (enemy, from, pixels) => knock(run, enemy, from, pixels),
    }, mods);
    squad.skillClock = BALANCE.cooldown[squad.general]; squad.usedAt = run.time;
    run.metrics.skills[id]++; run.metrics.skillTimes.push({ time: run.time, squad: id });
    return effects;
  }
  const effects: Effect[] = [], aim = skillAim(run, id);
  if (!aim) return [];
  for (const enemy of run.enemies) if (enemy.shielded && distance(enemy, squad) < 200) {
    enemy.shielded = false; effects.push({ kind: "interrupt", x: enemy.x, y: enemy.y, value: 1, target: enemy.id });
  }
  const spec = GENERAL_SKILLS[squad.general];
  const skillPower = generalUpgradeMultiplier(run.meta.generalUpgrades, squad.general, "skill");
  switch (spec.kind) {
    case "hold": effects.push(...holdDongnae({ run, squad, aim }, {
      ...mods, ...(army?.general === "송상현" ? {
        lineLengthBonus: mods.lineLengthBonus + army.lineLengthBonus,
        lineHalfWidth: army.lineHalfWidth, lineSeconds: army.lineSeconds, linePowerScale: army.linePowerScale,
      } : {}),
    })); break;
    case "ambush": effects.push(...militiaAmbush({ run, squad, aim }, mods)); break;
    case "volley":
      volley(run, squad, aim, effects, mods);
      if (squad.general === "권율" && squad.awakened >= 1)
        run.echoes.push({ at: run.time + .5, squad: id, ...(mods.arrowCountBonus ? { growth: mods } : {}) });
      break;
    case "shield": {
      run.shieldUntil = run.time + BALANCE.shieldSeconds + (squad.awakened >= 2 ? 3 : 0) + mods.shieldSecondsBonus
        + (army?.general === "김시민" ? army.shieldBonus : 0); run.shieldBy = id; run.reflect = squad.awakened >= 1;
      if (army?.general === "김시민")
        run.shieldUntil = Math.min(run.shieldUntil, run.time + BALANCE.cooldown[squad.general] / run.meta.skillCharge - .6);
      const wall = fortRect(run.fort);
      for (const enemy of run.enemies) if (gapToRect(wall, enemy) < CHAOS_RULES.manualWall.knockbackBand)
        knock(run, enemy, CENTER, CHAOS_RULES.manualWall.knockbackPixels);
      effects.push({ kind: "skill", x: CENTER.x, y: CENTER.y, value: run.shieldUntil - run.time, squad: id, label: SKILL_NAMES[squad.general] });
      break;
    }
    case "charge":
      squad.state = "charge"; squad.trampled = [];
      if (!run.bph) squad.strikeAt = 0;
      squad.lane = { toX: aim.toX, toY: aim.toY, homeX: squad.x, homeY: squad.y, back: spec.returns || squad.awakened >= 2, until: run.time + 1.2, dealt: 0,
        ...(mods.chargeStunBonus ? { stunBonus: mods.chargeStunBonus } : {}) };
      effects.push({ kind: "skill", x: aim.toX, y: aim.toY, fromX: squad.x, fromY: squad.y, value: chargeRadius(run, squad), squad: id, label: SKILL_NAMES[squad.general] });
      break;
    case "sweep": {
      const reach = spec.radius * (1 + GENERAL_GROWTH.radius * (squad.tier - 1)) + mods.radiusBonus
        + (army?.general === "황진" ? army.manualRadiusBonus : 0);
      for (const enemy of run.enemies) if (enemy.hp > 0 && distance(enemy, squad) < reach) {
        damage(run, enemy, spec.power * might(run) * (1 + squad.awakened * .25) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1)) * skillPower, effects, "skill", false, true, "skill", -1, false, undefined, false, undefined, false, squad);
        knock(run, enemy, squad, 30); stagger(run, enemy, spec.stun, effects);
      }
      effects.push({ kind: "skill", x: squad.x, y: squad.y, value: reach, squad: id, label: SKILL_NAMES[squad.general] });
      break;
    }
    case "heal": {
      const actualHealRatio = actualManualHealRatio(run, squad);
      for (const mate of run.squads) for (const unit of units(mate)) if (fit(unit, run.time))
        unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * actualHealRatio);
      effects.push({ kind: "skill", x: squad.x, y: squad.y, value: spec.ratio + mods.healRatioBonus
        + (army?.general === "사명대사" ? army.manualHealBonus : 0), squad: id, label: SKILL_NAMES[squad.general],
        ...(army ? { actualHealRatio } : {}) });
      break;
    }
    case "bombard": {
      const reach = spec.radius * (1 + GENERAL_GROWTH.radius * (squad.tier - 1));
      for (const enemy of run.enemies) if (enemy.hp > 0 && distance(enemy, aim) < reach) {
        damage(run, enemy, spec.power * might(run) * (1 + squad.awakened * .25) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1)) * skillPower, effects, "skill", false, true, "skill", -1, false, undefined, false, undefined, true, squad);
        knock(run, enemy, aim, 20);
      }
      effects.push({ kind: "blast", x: aim.x, y: aim.y, value: reach / 26 },
        { kind: "skill", x: aim.x, y: aim.y, value: reach, squad: id, label: SKILL_NAMES[squad.general] });
      break;
    }
  }
  squad.skillClock = BALANCE.cooldown[squad.general] * (squad.awakened >= 2 && spec.kind !== "shield" && squad.general !== "곽재우" ? .5 : 1);
  squad.usedAt = run.time; run.metrics.skills[id]++; run.metrics.skillTimes.push({ time: run.time, squad: id });
  dispatchBphEffects(run, { kind: "skill-used", squad });
  castChaosSkill(run, squad, effects);
  return effects;
}
export function enterEndless(run: Run): void {
  if (run.phase !== "won" && !(run.phase === "playing" && run.time === 0 && run.meta.endless)) throw new Error("왕도에서 무한 모드를 해금해야 합니다.");
  run.endless = true; run.phase = "playing"; run.rout = null;
  run.bossSpawned = run.bossWarned = true;
  run.nextElite = run.time + BALANCE.eliteEvery; run.nextBoss = run.time + BOSS_EVERY; run.nextWave = run.time + SIEGE_EVERY; run.warnedWave = false;
}
export function pressure(run: Run): Record<Direction, number> {
  const wall = fortRect(run.fort), totals = { 위: 0, 좌: 0, 우: 0, 아래: 0 };
  for (const enemy of run.enemies) if (enemy.hp > 0)
    totals[sideOf(wall, enemy)] += (enemy.kind === "ukita" ? 60 : enemy.boss ? 14 : enemy.elite ? 5 : 1) * (gapToRect(wall, enemy) < 120 ? 1.5 : 1);
  if (run.waveUntil <= run.time) totals[assaultSide(run, run.time + ASSAULT_WARNING)] += 6;
  return totals;
}
function engagement(run: Run, squad: Squad): Enemy | undefined {
  const radius = STYLES[squad.general] === "hunter" ? 170 : 120, home = { x: squad.homeX, y: squad.homeY }, wall = fortRect(run.fort);
  const reachable = (enemy: Enemy) => enemy.hp > 0 && enemy.kind !== "ship" && enemyInCombatField(run, enemy)
    && (!run.bph || gapToRect(wall, enemy) <= RETALIATE.leash) && distance(enemy, home) <= radius;
  const held = lockOf(run, squad), kept = held && reachable(held) ? held : undefined;
  if (!run.bph) return kept ?? run.enemies.filter(enemy => reachable(enemy) && distance(enemy, squad) <= 90).sort((a, b) => distance(a, squad) - distance(b, squad))[0];
  // Rank by the walk to a point his blade can land from, not by straight-line distance (owner F0CK17U6FN3: a gunner on
  // the wall face was nearest, but the only point on the approach line sat 47 px off against a 46 px blade).
  const cost = (enemy: Enemy) => distance(enemy, squad) < ARMS.general.reach ? 0
    : shunned(squad, enemy, run.time) ? Infinity : walkCost(run, squad, enemy);
  const ranked = run.enemies.filter(enemy => reachable(enemy) && distance(enemy, squad) <= 90)
    .map(enemy => ({ enemy, cost: cost(enemy) })).filter(entry => entry.cost < Infinity)
    .sort((a, b) => a.cost - b.cost || distance(a.enemy, squad) - distance(b.enemy, squad));
  const best = ranked[0]?.enemy, keptCost = kept ? cost(kept) : Infinity;
  if (!kept || keptCost === Infinity) return best;
  if (!best || best === kept) return kept;
  if (ranked[0].cost === 0 && distance(kept, squad) >= ARMS.general.reach + TARGET_LOCK.pixels) return best;
  return keepsTarget(distance(kept, squad), distance(best, squad), squad.lockUntil, run.time) ? kept : best;
}
const insideWall = (run: Run, enemy: Enemy) => !!enemy.breach && contains(fortRect(run.fort), enemy);
function walkCost(run: Run, squad: Squad, enemy: Enemy): number {
  if (insideWall(run, enemy)) return distance(enemy, squad);
  return standFor(run.fort, squad, enemy, { stop: ARMS.general.reach * .6, strike: ARMS.general.reach, margin: SQUAD_MARGIN })?.cost ?? Infinity;
}
function contact(run: Run, squad: Squad, enemy: Enemy): Point {
  const gap = Math.max(1, distance(enemy, squad)), keep = ARMS.general.reach * .6;
  if (gap <= keep) return { x: squad.x, y: squad.y };
  const at = { x: enemy.x + (squad.x - enemy.x) / gap * keep, y: enemy.y + (squad.y - enemy.y) / gap * keep };
  if (insideWall(run, enemy)) return at;
  const stand = run.bph ? standFor(run.fort, squad, enemy, { stop: keep, strike: ARMS.general.reach, margin: SQUAD_MARGIN }) : undefined;
  return stand?.stand ?? fieldPoint(run.fort, at, SQUAD_MARGIN);
}
/** Survival only: from here on, an empty side makes him hold his spot (see Squad.stay). */
function holdHere(run: Run, squad: Squad): void { if (run.bph) squad.stay = true; }
function station(run: Run, squad: Squad, mates: Squad[]): Point {
  const wall = fortRect(run.fort), along = squad.post === "위" || squad.post === "아래";
  const intruder = run.enemies.filter(enemy => enemy.hp > 0 && enemy.breach && contains(wall, enemy)).sort((a, b) => distance(a, CENTER) - distance(b, CENTER))[0];
  if (intruder) return contact(run, squad, engagement(run, squad) ?? intruder);
  const middle = along ? CENTER.x : (wall.top + wall.bottom) / 2, half = (along ? wall.right - wall.left : wall.bottom - wall.top) / 2;
  const near = run.enemies.filter(e => e.hp > 0 && enemyInCombatField(run, e) && sideOf(wall, e) === squad.post).sort((a, b) => gapToRect(wall, a) - gapToRect(wall, b)).slice(0, 8);
  const chief = near.find(e => e.boss || e.elite);
  const mean = chief ? along ? chief.x : chief.y : near.length ? near.reduce((sum, e) => sum + (along ? e.x : e.y), 0) / near.length : middle;
  const shift = clamp(mean - middle, -half, half) + (mates.indexOf(squad) - (mates.length - 1) / 2) * 58;
  const style = STYLES[squad.general], reach = style === "guardian" ? BALANCE.guardianGap : style === "frontline" ? BALANCE.supportGap : BALANCE.guardGap;
  let post = guardPoint(run.fort, squad.post, squad.state === "retreat" ? SQUAD_MARGIN : reach, shift + (along ? 0 : middle - CENTER.y));
  // Survival (owner DM 1794892449.075779): with no enemy left on his side after a fight he holds his spot rather than walking
  // back, and his reach is measured from it. The classic demo keeps its return-to-post contract.
  if (squad.state === "guard" && distance(squad, post) < 2) holdHere(run, squad);
  const holding = Boolean(squad.stay) && !near.length;
  if (!holding) { squad.homeX = post.x; squad.homeY = post.y; }
  const warned = run.telegraphs.find(mark => covers(mark, squad)), danger = squad.hp < squad.maxHp * BALANCE.dodgeBelow ? warned : undefined;
  if (warned && !danger) return { x: squad.x, y: squad.y };
  if (danger) {
    const axis = danger.shape === "circle" ? danger : (() => {
      const dx = danger.x - danger.fromX, dy = danger.y - danger.fromY, length = dx * dx + dy * dy || 1;
      const t = clamp(((squad.x - danger.fromX) * dx + (squad.y - danger.fromY) * dy) / length, 0, 1);
      return { x: danger.fromX + t * dx, y: danger.fromY + t * dy };
    })();
    const gap = distance(axis, squad), away = gap > 1 ? { x: (squad.x - axis.x) / gap, y: (squad.y - axis.y) / gap } : along ? { x: 1, y: 0 } : { x: 0, y: 1 };
    post = { x: axis.x + away.x * (danger.radius + 20), y: axis.y + away.y * (danger.radius + 20) };
  }
  const radius = style === "hunter" ? 170 : 120, home = { x: squad.homeX, y: squad.homeY };
  const reachable = (enemy: Enemy) => enemy.hp > 0 && enemy.kind !== "ship" && enemyInCombatField(run, enemy)
    && (!run.bph || gapToRect(wall, enemy) <= RETALIATE.leash) && distance(enemy, home) <= radius;
  const locked = !danger && squad.state === "guard" ? engagement(run, squad) : undefined;
  if (locked) { holdHere(run, squad); return contact(run, squad, locked); }
  const pack = style === "hunter" && !danger && squad.state === "guard" ? volleyAim(run) : null;
  const volley = pack && distance(pack, post) <= radius;
  if (volley) { holdHere(run, squad); const gap = Math.max(1, distance(pack, squad)); post = { x: pack.x + (squad.x - pack.x) / gap * 30, y: pack.y + (squad.y - pack.y) / gap * 30 }; }
  const quarry = danger || squad.state !== "guard" || style !== "hunter" ? undefined
    : run.enemies.filter(enemy => reachable(enemy) && (enemy.boss || enemy.elite)).sort((a, b) => distance(a, squad) - distance(b, squad))[0];
  if (quarry) {
    holdHere(run, squad);
    const gap = Math.max(1, distance(quarry, squad));
    post = { x: quarry.x + (squad.x - quarry.x) / gap * 26, y: quarry.y + (squad.y - quarry.y) / gap * 26 };
  } else if (holding && !volley && !danger && squad.state === "guard") {
    squad.homeX = squad.x; squad.homeY = squad.y;
    return { x: squad.x, y: squad.y };
  }
  return fieldPoint(run.fort, post, SQUAD_MARGIN);
}
function command(run: Run, effects: Effect[]): void {
  const load = pressure(run);
  const free = run.squads.length >= PARTY_LIMIT ? [] : run.squads.filter(squad => squad.state === "guard" && !lockOf(run, squad));
  const reserved = new Set(run.squads.filter(squad => fielded(squad) && !free.includes(squad)).map(squad => squad.post));
  const available = SIDES.filter(side => !reserved.has(side)), held = new Set(free.map(squad => squad.post)), wanted: Direction[] = [];
  for (let i = 0; i < free.length; i++) {
    const score = (side: Direction) => load[side] + (held.has(side) ? BALANCE.stay : 0);
    const side = available.sort((a, b) => score(b) - score(a))[0];
    wanted.push(side); available.splice(available.indexOf(side), 1); held.delete(side);
  }
  const moving: Squad[] = [];
  for (const squad of free) { const at = wanted.indexOf(squad.post); if (at >= 0) wanted.splice(at, 1); else moving.push(squad); }
  for (const squad of moving) {
    const side = wanted.sort((a, b) => distance(squad, guardPoint(run.fort, a, BALANCE.guardGap)) - distance(squad, guardPoint(run.fort, b, BALANCE.guardGap)))[0];
    wanted.splice(wanted.indexOf(side), 1); squad.post = side; delete squad.stay; run.metrics.redeploys++;
    const goal = guardPoint(run.fort, side, BALANCE.guardGap);
    effects.push({ kind: "deploy", x: goal.x, y: goal.y, fromX: squad.x, fromY: squad.y, value: 0, squad: squad.id, side });
  }
  // Before the party is full, an absent general yields his side to an active defender.
  if (run.squads.length < PARTY_LIMIT) {
    const assigned = new Set(run.squads.filter(fielded).map(squad => squad.post));
    for (const squad of run.squads.filter(squad => !fielded(squad))) {
      if (assigned.has(squad.post)) squad.post = SIDES.filter(side => !assigned.has(side))[0];
      assigned.add(squad.post);
    }
  }
  for (const squad of run.squads) if (fielded(squad)) {
    const post = station(run, squad, run.squads.filter(mate => fielded(mate) && mate.post === squad.post));
    squad.targetX = post.x; squad.targetY = Math.min(post.y, riverBank() - 8);
  }
}
function ride(run: Run, squad: Squad, dt: number, effects: Effect[]): void {
  const lane = squad.lane!, gap = Math.hypot(lane.toX - squad.x, lane.toY - squad.y), step = CHARGE_SPEED * dt;
  const desired = gap > step ? { x: squad.x + (lane.toX - squad.x) / gap * step, y: squad.y + (lane.toY - squad.y) / gap * step } : { x: lane.toX, y: lane.toY };
  const at = blocksCharge(run, squad, desired) ? squad : desired;
  squad.x = at.x; squad.y = Math.min(at.y, riverBank() - 8);
  const radius = chargeRadius(run, squad);
  for (const enemy of run.enemies) if (enemy.hp > 0 && distance(enemy, squad) < radius && !squad.trampled.includes(enemy.id)) {
    squad.trampled.push(enemy.id);
    lane.dealt += damage(run, enemy, BALANCE.chargePower * might(run) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1))
      * generalUpgradeMultiplier(run.meta.generalUpgrades, squad.general, "skill"), effects, squad.id, false, true, "skill");
    knock(run, enemy, squad, 14); stagger(run, enemy, BALANCE.chargeStun + (lane.stunBonus ?? 0), effects);
  }
  if (gap > step && run.time < lane.until) return;
  dispatchBphEffects(run, { kind: "dash-end", unit: squad,
    from: { x: lane.homeX, y: lane.homeY }, to: { x: squad.x, y: squad.y }, returning: lane.back });
  if (lane.back) { squad.lane = { ...lane, toX: lane.homeX, toY: lane.homeY, homeX: squad.x, homeY: squad.y, back: false, until: run.time + 1.2 }; squad.trampled = []; return; }
  if (squad.general === "신립") chaosAfterReturn(run, {
    from: { x: lane.homeX, y: lane.homeY }, to: squad,
    power: might(run) * ARMS.general.power * (1 + GENERAL_GROWTH.basic * (squad.tier - 1))
      * (run.meta.heroBasic ?? 1) * (run.meta.generalMastery?.includes(squad.general) ? 1.2 : 1)
      * generalUpgradeMultiplier(run.meta.generalUpgrades, squad.general, "attack"),
  }, effects);
  if (lane.dealt > 0) effects.push({ kind: "total", x: squad.x, y: squad.y - 24, value: Math.round(lane.dealt), critical: true });
  squad.lane = null; squad.state = "guard"; squad.hurtAt = run.time;
  if (squad.awakened >= 1) squad.frenzyUntil = run.time + BALANCE.frenzySeconds;
}
function tend(run: Run, dt: number, effects: Effect[]): void {
  const movement = chaosMovement(run);
  const block = fortRect(run.fort, SQUAD_MARGIN), inner = fortRect(run.fort, 8), walk = fortRect(run.fort, 10), wall = fortRect(run.fort);
  const intruder = run.enemies.filter(enemy => enemy.hp > 0 && enemy.breach && contains(wall, enemy)).sort((a, b) => distance(a, CENTER) - distance(b, CENTER))[0];
  const posts = wallPosts(run.fort), garrison = run.squads.flatMap(squad => squad.soldiers), march = SOLDIER_SPEED * dt;
  const mending = run.squads.some(squad => STYLES[squad.general] === "frontline" && fielded(squad)) ? BALANCE.supportRegen : 1;
  const standing = posts.map(post => wallOpen(run, sideOf(inner, post)));
  for (const squad of run.squads) if (run.bph?.survival && run.chaos) {
    const maxHp = metaGeneralHp(run, squad.general, squad.tier);
    if (maxHp !== squad.maxHp) {
      squad.hp *= maxHp / squad.maxHp;
      squad.maxHp = maxHp;
    }
  }
  for (const squad of run.squads) squad.soldiers.forEach((unit, index) => {
    if (unit.perch === undefined || standing[unit.perch]) return;
    effects.push({ kind: "fall", x: unit.x, y: unit.y, value: 0, squad: squad.id, index });
    delete unit.perch;
    hurt(run, squad, index, unit.maxHp * BALANCE.fallHurt, effects);
  });
  const occupied = new Set(garrison.filter(unit => unit.kind === "archer" || unit.kind === "hwacha").map(unit => unit.perch).filter(perch => perch !== undefined));
  const wallSlots = posts.map((_, i) => i).filter(i => standing[i]);
  const perchLoads = new Map<number, number>();
  const rangedCount = garrison.filter(unit => (unit.kind === "archer" || unit.kind === "hwacha") && unit.hp > 0).length;
  const overflow = !!run.bph && rangedCount > wallSlots.length;
  if (overflow) for (const unit of garrison) {
    if (unit.perch !== undefined && unit.hp > 0) perchLoads.set(unit.perch, (perchLoads.get(unit.perch) ?? 0) + 1);
  }
  const overflowGuards = overflow ? guardRing(run, garrison.filter(unit => footFighter(unit) && unit.hp > 0)) : undefined;
  const claims = new Map<number, number>();
  for (const unit of garrison) if (unit.quarry !== undefined) claims.set(unit.quarry, (claims.get(unit.quarry) ?? 0) + 1);
  const fleet = garrison.filter(unit => unit.kind === "panokseon");
  if (run.bph) {
    // A fallen fighter releases its post before anyone can fill it. Revival is a fresh allocation,
    // so an older id cannot evict a survivor or force that survivor to change sides.
    for (const unit of garrison) if (unit.hp <= 0) { delete unit.march; delete unit.flank; }
    balanceMarchSides(run, garrison.filter(unit => footFighter(unit) && (unit.hp > 0 || unit.downUntil <= run.time)));
  }
  const groundFoes = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && !contains(inner, enemy));
  if (run.bph) for (const enemy of groundFoes) {
    if (!enemy.defenseSide) enemy.defenseSide = enemy.x < CENTER.x ? "left" : "right";
    if (enemy.x < CENTER.x - ALLY_SPACING / 2) enemy.defenseSide = "left";
    else if (enemy.x > CENTER.x + ALLY_SPACING / 2) enemy.defenseSide = "right";
  }
  // Castle pressure outranks a distant skirmish. Fill only the existing melee contact
  // ring, nearest walkers first, rather than calling every soldier off the other walls.
  const threats = run.bph ? run.enemies.filter(enemy => {
    if (enemy.hp <= 0 || enemy.kind === "ship" || enemy.cargo) return false;
    if (gapToRect(wall, enemy) > RETALIATE.leash) { enemy.castleThreat = false; return false; }
    if (!enemyInCombatField(run, enemy)) return false;
    if (enemy.breach && contains(wall, enemy) || !enemy.breach
      && gapToRect(wall, { x: enemy.goalX, y: enemy.goalY }) <= 1
      && distance(enemy, { x: enemy.goalX, y: enemy.goalY }) <= (enemy.kind === "teppo" ? 72 : 11)) enemy.castleThreat = true;
    return enemy.castleThreat;
  })
    .sort((a, b) => Number(!!b.breach) - Number(!!a.breach) || a.id - b.id) : [];
  const defenders = new Map<Unit, Enemy>();
  for (const enemy of threats) {
    const available = garrison.filter(unit => footFighter(unit) && fit(unit, run.time) && !defenders.has(unit));
    const path = (unit: Unit) => {
      if (!contains(inner, enemy)) return routeDistance(walk, unit, enemy);
      if (contains(fortRect(run.fort, -TILE), unit)) return distance(unit, enemy);
      const door = guardPoint(run.fort, nearestGate(run.fort, unit, enemy, gatesOf(run)), 10);
      return routeDistance(walk, unit, door) + distance(door, enemy);
    };
    available.sort((a, b) => path(a) - path(b) || a.id - b.id);
    const reach = Math.min(...available.map(unit => contactReach(run, unit)));
    const ring = Math.max(1, Math.floor(2 * Math.PI * Math.max(reach, ALLY_SPACING) / ALLY_SPACING));
    for (const unit of available.slice(0, ring)) defenders.set(unit, enemy);
  }
  for (const unit of garrison) {
    const rawStats = bphStats(unit, run);
    if (rawStats && rawStats.hp !== unit.maxHp) {
      const share = unit.hp / unit.maxHp;
      unit.maxHp = rawStats.hp; unit.hp = share * unit.maxHp;
    }
    if (unit.kind === "panokseon") {
      if (unit.hp <= 0 && unit.downUntil <= run.time) { unit.hp = unit.maxHp; unit.x = 24; }
      if (!fit(unit, run.time)) continue;
      // Holds station off the castle's shore as a gun platform instead of patrolling the whole river.
      const slots = NAVAL_GUN.slots, slot = fleet.indexOf(unit);
      const post = clamp(CENTER.x + slots[slot % slots.length], 24, WIDTH - 24), step = 30 * dt * movement;
      unit.x = Math.abs(post - unit.x) <= step ? post : unit.x + Math.sign(post - unit.x) * step; unit.y = riverLane();
      continue;
    }
    if (unit.hp <= 0 && unit.downUntil <= run.time) unit.hp = unit.maxHp / 2;
    if (unit.hp <= 0) continue;
    if (unit.hp > 0 && !unit.bph) unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * (unit.kind === "monk" ? .06 : BALANCE.garrisonRegen) * mending * dt);
    // From here to the stride this unit's stat inputs stay fixed: its hp/maxHp writes are above, and the code below only
    // writes quarry, lockUntil, emerging, claims and finally x/y. One unit-stats dispatch serves ring, reach and stride.
    let liveStats: ReturnType<typeof bphStats> | undefined;
    const statsNow = () => liveStats === undefined ? liveStats = bphStats(unit, run) : liveStats;
    const ranged = unit.kind === "archer" || unit.kind === "hwacha";
    let goal: Point;
    if (ranged) {
      if (unit.perch === undefined) {
        const free = wallSlots.filter(i => !occupied.has(i));
        const loads = SIDES.map(side => [...occupied].filter(i => sideOf(inner, posts[i!]) === side).length);
        const weighted = free.map(i => ({ i, score: random(run) - .08 * loads[SIDES.indexOf(sideOf(inner, posts[i]))] })).sort((a, b) => b.score - a.score);
        unit.perch = weighted[0]?.i;
        if (unit.perch === undefined && run.bph) {
          // A full wall shares its least crowded surviving post instead of sending the next ranged unit to the keep.
          unit.perch = wallSlots.reduce<number | undefined>((best, i) => {
            if (best === undefined) return i;
            const load = (perchLoads.get(i) ?? 0) - (perchLoads.get(best) ?? 0);
            return load < 0 || load === 0 && distance(unit, posts[i]) < distance(unit, posts[best]) ? i : best;
          }, undefined);
        }
        if (unit.perch !== undefined) {
          occupied.add(unit.perch);
          if (overflow) perchLoads.set(unit.perch, (perchLoads.get(unit.perch) ?? 0) + 1);
        }
      }
      goal = unit.perch !== undefined ? posts[unit.perch] : run.bph
        ? allyRoute(run.fort, unit, wallPoint(fortRect(run.fort, WALL_APRON), unit), 10, gatesOf(run)) : CENTER;
    } else {
      if (unit.emerging && !contains(run.bph ? fortRect(run.fort, 24) : inner, unit)) unit.emerging = false;
      // A fallen or displaced melee soldier walks back out through the gate.
      // Projecting an interior position onto the wall teleported it by a whole courtyard.
      const assigned = defenders.get(unit);
      const defense = assigned && !(run.bph && shunned(unit, assigned, run.time)) ? assigned : undefined;
      const insideDefense = !!defense && contains(inner, defense);
      if (insideDefense) unit.emerging = false;
      else if (!unit.emerging && contains(wall, unit)) unit.emerging = true;
      const home = overflowGuards?.get(unit) ?? (run.bph && unit.march ? unit.march : wallPoint(fortRect(run.fort, 26), unit));
      if (unit.quarry !== undefined) claims.set(unit.quarry, (claims.get(unit.quarry) ?? 1) - 1);
      const stats = statsNow(), reach = contactReach(run, unit, stats);
      const attackReach = unit.bph && stats ? bphProfileAttackReach(unit.bph.profileId, stats.range) : reach;
      // Flanks choose idle posts only. Combat keeps the nearest/held foe or retaliation on either side.
      // Use the fort boundary, so moving together cannot extend the pursuit leash.
      // A foe on the wall face (inside the 8 px band) still counts when a legal point within his blade exists.
      const facing = run.bph ? run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && !enemy.breach && contains(inner, enemy)
        && !!standFor(run.fort, unit, enemy, { stop: reach, strike: meleeContactLimit(attackReach) + .5, margin: 12 })) : [];
      const eligible = run.bph ? [...groundFoes, ...facing].filter(enemy =>
        // Another defender's threat stays off limits from afar, but a spare soldier within 110 px joins it rather than idling.
        (!threats.includes(enemy) || enemy === defense || !defense && distance(enemy, unit) <= 110) && enemyInCombatField(run, enemy)
        && gapToRect(wall, enemy) <= RETALIATE.leash)
        : run.enemies.filter(enemy => enemy.hp > 0 && onBattlefield(enemy) && !contains(inner, enemy) && gapToRect(wall, enemy) <= 130);
      // The nearest enemy still draws a soldier until its contact ring is full (one spacing per body); then the
      // next nearest does. A distance penalty per claim spread the fire so thin that chapter 4 fell early.
      // Nothing between here and the contact point below changes what unit stats read, so one reach serves both.
      const ring = Math.max(1, Math.floor(2 * Math.PI * Math.max(reach, ALLY_SPACING) / ALLY_SPACING));
      const candidates = eligible.filter(enemy => (claims.get(enemy.id) ?? 0) < ring);
      // A foe he stood idle against is passed over until it is inside the blade again (see noteStall).
      const passOver = (enemy: Enemy) => run.bph && distance(enemy, unit) >= reach && shunned(unit, enemy, run.time);
      const current = eligible.find(enemy => enemy.id === unit.quarry && !passOver(enemy));
      const avenged = unit.revenge === undefined ? undefined
        : eligible.find(enemy => enemy.id === unit.revenge && !passOver(enemy));
      if (!avenged) delete unit.revenge;
      // Every ring full: still take the nearest foe rather than idling at the wall (gates in every survival wall).
      const fresh = candidates.filter(enemy => !passOver(enemy)), open = eligible.filter(enemy => !passOver(enemy));
      const pool = fresh.length ? fresh : open.length ? open : eligible;
      const nearest = lowest(pool.filter(enemy => distance(enemy, unit) <= 110), enemy => distance(enemy, unit))
        ?? lowest(pool, enemy => routeDistance(walk, unit, enemy));
      const heldGap = current ? distance(current, unit) : Infinity;
      const nearestGap = nearest ? distance(nearest, unit) : Infinity;
      // A near-equal foe on the other side of a contact fight must not reverse the soldier every hold.
      // Keep ordinary nearest-target selection outside this small reversal band.
      // A soldier shot from out of reach charges the shooter first (RETALIATE); otherwise the nearest-foe hold applies.
      // A foe already inside the blade beats a held one he cannot reach yet; the hold only damps near-equal choices.
      const yields = run.bph && nearestGap < reach && heldGap >= reach + TARGET_LOCK.pixels;
      const target = defense ?? avenged ?? (current && !yields && (!run.bph || !nearest
        || heldGap <= reach + TARGET_LOCK.pixels && nearestGap <= reach + TARGET_LOCK.pixels
          && heldGap - nearestGap <= TARGET_LOCK.pixels
          && (current.x - unit.x) * (nearest.x - unit.x) + (current.y - unit.y) * (nearest.y - unit.y) < 0
        || keepsTarget(heldGap, nearestGap, unit.lockUntil, run.time)) ? current : nearest);
      if (run.bph && target && target.id !== unit.quarry) unit.lockUntil = run.time + TARGET_LOCK.hold;
      unit.quarry = target?.id;
      if (run.bph) noteStall(unit, target, !!target && distance(target, unit) >= reach && unit.clock <= 0 && unit.strikeAt === 0, run.time);
      if (target) claims.set(target.id, (claims.get(target.id) ?? 0) + 1);
      const gap = target ? Math.max(1, distance(target, unit)) : 1;
      // Stop at the weapon's contact distance. The old universal 24 px goal
      // moved already-attacking fighters away to satisfy a projected wall goal.
      // Defense contact also accommodates weapons with an exclusive range.
      const stop = defense ? Math.max(0, reach - .01) : reach;
      const aim = target && gap > stop ? { x: target.x + (unit.x - target.x) / gap * stop, y: target.y + (unit.y - target.y) / gap * stop } : unit;
      const contact = insideDefense ? aim : target && gap > stop ? fieldPoint(run.fort, aim, 12) : unit;
      // A contact point pushed out of the wall margin can land farther from the enemy than the soldier; it holds instead.
      // In survival he first looks for another legal point within his blade (round the wall corner) before holding.
      const around = () => run.bph && !insideDefense && target
        ? standFor(run.fort, unit, target, { stop, strike: meleeContactLimit(attackReach) + .5, margin: 12 })?.stand : undefined;
      const stand = target ? distance(contact, target) > gap || distance(contact, target) >= meleeContactLimit(attackReach) ? around() ?? (distance(contact, target) > gap ? unit : contact) : contact : home;
      // Keep recruits' exit clear, but don't push an attainable contact point out of weapon range.
      const apron = run.bph ? clearGateMouth(run.fort, stand, gatesOf(run), WALL_APRON) : stand;
      const post = target && distance(stand, target) < meleeContactLimit(attackReach)
        && distance(apron, target) >= meleeContactLimit(attackReach) ? stand : apron;
      goal = unit.emerging ? allyRoute(run.fort, unit, guardPoint(run.fort, nearestGate(run.fort, unit, post, gatesOf(run)), 24), 10, gatesOf(run))
        : unit.strikeAt > 0 && !(run.bph && inGateMouth(run.fort, unit, gatesOf(run), WALL_APRON)) ? unit : allyRoute(run.fort, unit, post, 10, gatesOf(run));
    }
    goal = { x: goal.x, y: Math.min(goal.y, riverBank() - 8) };
    const pace = 1 + GUARD.speedVariance * (2 * unitNoise(unit.id, 2) - 1);
    const stride = (unit.bph ? (statsNow()?.moveSpeed ?? 0) * BPH_SCALE.movement * dt : march) * movement * pace;
    const gap = distance(unit, goal), step = gap > stride ? stride / gap : 1;
    unit.x += (goal.x - unit.x) * step; unit.y += (goal.y - unit.y) * step;
  }
  for (const squad of run.squads) {
    if (squad.state === "down") {
      if (run.time < squad.downUntil) {
        // A general who will not rise (no temple) stays where he fell instead of walking to a temple that is not there.
        if (squad.downUntil === Infinity) continue;
        const goal = allyRoute(run.fort, squad, buildings().infirmary, SQUAD_MARGIN, gatesOf(run));
        const gap = distance(squad, goal), step = Math.min(gap, RETREAT_SPEED * dt);
        if (gap > 0) { squad.x += (goal.x - squad.x) / gap * step; squad.y += (goal.y - squad.y) / gap * step; }
        continue;
      }
      const out = guardPoint(run.fort, nearestGate(run.fort, squad, { x: squad.homeX, y: squad.homeY }, gatesOf(run), SQUAD_MARGIN), GATE_GAP);
      squad.state = "guard"; squad.hp = squad.maxHp * .6; squad.hurtAt = run.time; squad.safeUntil = run.time + BALANCE.reviveSafe;
      squad.x = squad.targetX = out.x; squad.y = squad.targetY = out.y;
      effects.push({ kind: "rise", x: squad.x, y: squad.y, value: BALANCE.reviveSafe, squad: squad.id });
    }
    const rest = run.time - squad.hurtAt, healing = squad.state === "retreat" && rest > 1.5 ? BALANCE.retreatRegen : rest > BALANCE.regenAfter ? BALANCE.regen : 0;
    if (healing && squad.hp > 0) squad.hp = Math.min(squad.maxHp, squad.hp + squad.maxHp * healing * dt);
    if (squad.hp > 0 && garrison.some(unit => unit.kind === "monk" && fit(unit, run.time) && distance(unit, squad) < 70))
      squad.hp = Math.min(squad.maxHp, squad.hp + squad.maxHp * .025 * dt);
    if (squad.state === "charge") ride(run, squad, dt, effects);
    else {
      // Deployment stays on its quarter-second cadence, but nearby combat cannot
      // wait for the next deployment decision while a stale home goal pulls away.
      if (squad.state === "guard" && !run.telegraphs.some(mark => covers(mark, squad))) {
        const enemy = engagement(run, squad) ?? intruder;
        if (run.bph) noteStall(squad, enemy, !!enemy && distance(enemy, squad) >= ARMS.general.reach && squad.clock <= 0 && squad.strikeAt === 0, run.time);
        if (enemy) {
          const at = contact(run, squad, enemy);
          holdHere(run, squad);
          squad.targetX = at.x; squad.targetY = Math.min(at.y, riverBank() - 8);
        }
      }
      if (squad.state === "guard" && squad.strikeAt > 0) continue;
      const target = { x: squad.targetX, y: squad.targetY }, at = squad;
      const next = allyRoute(run.fort, squad, target, SQUAD_MARGIN, gatesOf(run)), gap = distance(at, next);
      const pace = SQUAD_SPEED * (squad.general === "곽재우" ? 1.2 : 1) * dt * movement, step = gap > pace ? pace / gap : 1;
      squad.x = at.x + (next.x - at.x) * step; squad.y = at.y + (next.y - at.y) * step;
    }
  }
}
function blow(run: Run, enemy: Enemy): number {
  if (enemy.bphProfileId) {
    const context = bphFxContext(run);
    const amount = context ? bphEnemyStats(context, { profileId: enemy.bphProfileId }).damage
      : BPH_MONSTERS[enemy.bphProfileId].damage;
    const strong = run.bph?.survival ? enemy.boss ? "boss" : enemy.miniboss ? "miniboss" : enemy.elite ? "elite" : null : null;
    if (strong) return BPH_MONSTERS.Monster1_Caveling.damage * bphSurvivalIntensity(run.time).unitDamage * BPH_SURVIVAL_TABLE.strongHit[strong];
    const multiplier = bphSurvivalDamageMultiplier(run, enemy, "unit");
    return amount * multiplier * minibossDamage(enemy);
  }
  return BALANCE.bite * (1 + run.time / BALANCE.biteSpan) * (1 + run.curses * .12)
    * (enemy.kind === "ukita" ? 8 : enemy.boss ? 6 : enemy.elite ? 3.5 : enemy.kind === "samurai" ? 1.7 : enemy.kind === "cavalry" ? 1.3 : 1) * bossPower(enemy);
}
/** Encounter strength is fixed on arrival, rather than jumping twentyfold at 4:00. */
function bossPower(enemy: Enemy): number {
  return enemy.boss && enemy.appearedAt !== undefined ? Math.min(1, BALANCE.openingBossPower
    + Math.max(0, enemy.appearedAt / BOSS_EVERY - 1) * BALANCE.bossPowerStep) : 1;
}
function invisible(run: Run, unit: Unit): boolean {
  return run.bph?.fx.statuses.some(status => status.targetId === unit.id &&
    status.id === "Invisibility" && status.until > run.time) ?? false;
}
function cast(run: Run, enemy: Enemy, effects: Effect[], breachedFort: boolean): boolean {
  const mini = enemy.miniboss, miniMelee = mini && mini !== "salvo";
  const wall = fortRect(run.fort), generals = run.squads.filter(squad =>
    fielded(squad) && !invisible(run, squad) && (!miniMelee || squad.perch === undefined));
  const near = [...generals].sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
  const identity = enemy.bossArt ? BOSSES[enemy.bossArt] : undefined;
  let skill: Skill = mini ?? (identity ? enemy.enraged && enemy.casts % 2 === 0 ? identity.second : identity.pattern
    : enemy.kind === "ship" ? "siege" : enemy.kind === "ukita" ? (enemy.casts % 2 ? "salvo" : "decree") : enemy.boss && enemy.pattern ? enemy.pattern : "slam");
  const victim = skill === "ninja" ? [...generals].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
    : near && distance(near, enemy) < CASTS[skill].reach ? near : undefined;
  if (breachedFort && (!victim || skill === "fire" || skill === "ladder" || skill === "ninja")) return false;
  const special = skill === "fire" || skill === "ladder" || skill === "shield" && !mini || enemy.kind === "ship";
  if (!victim && !special && gapToRect(wall, enemy) >= (mini ? MINIBOSS.wallReach : 46)) { enemy.skillClock = .4; return false; }
  if (!mini && !victim && !special && skill !== "siege") skill = "ram";
  const spec = CASTS[skill];
  let at: Point;
  if (skill === "fire") at = buildings().base;
  else if (skill === "ladder") at = guardPoint(run.fort, enemy.direction, 0);
  else if (skill === "shield" || skill === "spin-slash") at = enemy;
  else if (skill === "ninja" && victim) {
    const beside = fieldPoint(run.fort, { x: victim.x + (victim.x < CENTER.x ? -44 : 44), y: victim.y - 26 }, 14);
    placeEnemyOutside(run, enemy, beside, enemy); retarget(run, enemy);
    at = { x: victim.x, y: victim.y };
  } else if (skill === "ram" || !victim && !mini) at = wallPoint(wall, enemy);
  else if (spec.shape === "lane") {
    const aim = victim ?? wallPoint(wall, enemy), gap = Math.max(1, distance(aim, enemy));
    at = { x: enemy.x + (aim.x - enemy.x) / gap * spec.length, y: enemy.y + (aim.y - enemy.y) / gap * spec.length };
  } else at = victim ?? wallPoint(wall, enemy);
  const miniCast = mini ? minibossCast(mini) : undefined;
  const power = miniCast?.power ?? spec.power, wallPower = miniCast?.wall ?? spec.wall;
  const mark: Telegraph = { id: run.nextId++, owner: enemy.id, skill, shape: spec.shape, x: at.x, y: at.y, fromX: enemy.x, fromY: enemy.y, radius: spec.radius,
    startedAt: run.time, at: run.time + spec.windup,
    damage: Math.max(blow(run, { ...enemy, kind: "yari", boss: false, elite: false }) * power, identity && victim ? victim.maxHp * .7 : 0)
      * (enemy.kind === "ship" ? .08 : 1) * (enemy.enraged ? 1.5 : 1)
      * (run.bph?.survival && (enemy.boss || enemy.elite) ? BPH_SURVIVAL_TABLE.commander.skill : bossPower(enemy)),
    wallDamage: wallPower * (enemy.kind === "ship" ? .025 : 1)
      * (mini ? MINIBOSS.wallSkillScale * minibossDamage(enemy) * bphSurvivalDamageMultiplier(run, enemy, "castle")
        : run.bph?.survival && (enemy.boss || enemy.elite)
        ? BPH_SURVIVAL_TABLE.commander.skill * bphSurvivalDamageMultiplier(run, enemy, "castle")
        : (1 + run.time / BALANCE.wallBlowSpan) * bossPower(enemy)) };
  rememberCastleCast(mark, enemy);
  run.telegraphs.push(mark); enemy.casting = mark.id; enemy.casts++; enemy.strikeAt = 0; run.metrics.telegraphs++;
  effects.push({ kind: "telegraph", x: mark.x, y: mark.y, value: mark.radius, target: enemy.id, label: skill, shape: mark.shape, fromX: mark.fromX, fromY: mark.fromY });
  return true;
}
function land(run: Run, mark: Telegraph, effects: Effect[]): void {
  const owner = run.enemies.find(enemy => enemy.id === mark.owner && enemy.hp > 0), wall = fortRect(run.fort), shielded = run.shieldUntil > run.time;
  const breachedFort = SIDES.some(side => run.walls[side] <= 0);
  if (owner) { owner.casting = 0; owner.skillClock = castCooldown(owner); }
  run.metrics.landed++;
  effects.push({ kind: "land", x: mark.x, y: mark.y, value: mark.radius, label: mark.skill, shape: mark.shape, fromX: mark.fromX, fromY: mark.fromY, minor: shielded,
    ...(owner?.miniboss ? { miniboss: owner.miniboss } : {}) });
  if (mark.skill === "shield" && owner) owner.shielded = true;
  if (mark.skill === "fire" && !shielded && !breachedFort) {
    const scorch = weatherDamage(run.weather, run.maxBase * .1, true);
    const beforeHp = run.base;
    run.base = Math.max(0, run.base - scorch); run.metrics.bossDamage += scorch;
    recordLethalCastleHit(run, { beforeHp, attacker: owner ?? null, attackKind: "fire", cast: mark });
    const record = run.metrics.bosses.find(item => item.appeared === owner?.appearedAt);
    if (record) record.dealt += scorch;
    if (run.base <= 0) run.lossCause = "boss";
  }
  if (mark.skill === "ladder" && owner) {
    for (let i = 0; i < 6; i++) {
      if (run.bph?.survival) {
        const intensity = bphSurvivalIntensity(run.time), profileId = "Monster1_Raider";
        (run.bph.survival.reinforcements ??= []).push({ ...bphEnemyMapping(profileId), profileId,
          at: run.time, boss: false, final: false, ladder: true, side: owner.direction, march: .85,
          hp: intensity.hp, unitDamage: intensity.unitDamage, castleDamage: intensity.castleDamage });
      } else {
        const reinforcement = spawn(run, false, false, undefined, false, owner.direction, .85);
        reinforcement.wave = true; reinforcement.ladder = true;
      }
    }
    effects.push({ kind: "ladder", x: mark.x, y: mark.y, value: 6, side: owner.direction });
  }
  let caught = false, general = false;
  for (const squad of run.squads) units(squad).forEach((unit, order) => {
    if (owner?.miniboss && owner.miniboss !== "salvo" && unit.perch !== undefined) return;
    if (!fit(unit, run.time) || (order === 0 && !fielded(squad)) || !covers(mark, unit)) return;
    caught = true; general ||= order === 0;
    hurt(run, squad, order - 1, mark.damage * (order === 0 ? 1 : .5), effects, owner, mark.skill === "fire");
  });
  const start = { x: mark.fromX, y: mark.fromY };
  if (!breachedFort && mark.wallDamage > 0 && (mark.shape === "circle" ? gapToRect(wall, mark) < mark.radius : crosses(wall, start, mark) || gapToRect(wall, mark) < mark.radius)) {
    caught = true; batter(run, effects, { at: wallPoint(wall, mark.shape === "circle" ? mark : start),
      amount: mark.wallDamage, attacker: mark.owner, attackKind: mark.skill === "salvo" || mark.skill === "gunner" ? "projectile" : "wall", cast: mark });
  }
  if (shielded && caught) run.metrics.blockedCasts++;
  if (!shielded && general) run.metrics.generalsStruck++;
  if (mark.skill === "cavalry" && owner && !breachedFort) {
    const at = fieldPoint(run.fort, owner.miniboss && crosses(wall, start, mark) ? wallPoint(wall, start) : mark, 14);
    moveEnemy(run, owner, run.bph?.survival ? groundCombatPoint(at) : at); retarget(run, owner);
  }
}
function raid(run: Run, dt: number, effects: Effect[]): void {
  const wall = fortRect(run.fort), keepOut = fortRect(run.fort, 8), court = fortRect(run.fort, -TILE);
  const movementDt = dt * weatherEnemySpeed(run.weather);
  const chilled = run.bph ? bphChilledEnemies(run) : undefined;
  const pace = (enemy: Enemy): number => chilled?.has(enemy.id) ? 1 - BPH_BLIZZARD.slow : 1;
  const marks: { squad: Squad; index: number; unit: Unit }[] = [];
  for (const squad of run.squads) {
    if (fielded(squad) && fit(squad, run.time) && !invisible(run, squad)) marks.push({ squad, index: -1, unit: squad });
    squad.soldiers.forEach((unit, index) => { if (fit(unit, run.time) && !invisible(run, unit)) marks.push({ squad, index, unit }); });
  }
  const approach = (enemy: Enemy, goal: Point, stop: number) => {
    const direct = enemy.breach || enemy.pulled && goal === CENTER;
    // Owner DM 1794894371.056399: while the route bends round the fort, the straight-line stop distance does not apply;
    // it held walkers pressed against the wall a few pixels short of a target on its far side.
    const start = pushOut(keepOut, enemy);
    const reachable = !direct && contains(keepOut, goal) ? wallPoint(keepOut, start, goal) : goal;
    const next = direct ? reachable : route(keepOut, start, reachable), gap = distance(enemy, next);
    const approach = run.bph?.survival && !enemy.boss && gapToRect(wall, enemy) > BPH_SURVIVAL_TABLE.approach.outside
      ? BPH_SURVIVAL_TABLE.approach.speed : 1;
    const left = next === reachable || !run.bph ? distance(enemy, goal) - stop : Infinity, step = Math.min(Math.max(0, left), enemy.speed * movementDt * uniqueSkillSpeed(run, enemy) * pace(enemy) * approach);
    if (gap > 0) {
      const share = Math.min(gap, step) / gap;
      const at = { x: enemy.x + (next.x - enemy.x) * share, y: enemy.y + (next.y - enemy.y) * share };
      moveEnemy(run, enemy, run.bph?.survival && enemyInCombatField(run, enemy) ? groundCombatPoint(at) : at);
    }
    spendPouchAtWall(enemy);
  };
  const spendPouchAtWall = (enemy: Enemy) => {
    if (enemy.goldPouch && !enemy.goldPouchSpent && gapToRect(wall, enemy) <= enemyBodyRadius(enemy))
      enemy.goldPouchSpent = true;
  };
  const footOf = (enemy: Enemy, victim: Unit, ranged: boolean): Point =>
    !run.bph || ranged || enemy.breach || victim.perch === undefined ? victim : pushOut(keepOut, victim);
  const siegeGoal = (enemy: Enemy): Point => {
    if (enemy.breach) return CENTER;
    const goal = { x: enemy.goalX, y: enemy.goalY };
    if (enemy.pulled && distance(enemy, goal) <= 2) {
      enemy.goalX = CENTER.x; enemy.goalY = CENTER.y;
    }
    return enemy.pulled && enemy.goalX === CENTER.x && enemy.goalY === CENTER.y ? CENTER : goal;
  };
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0) continue;
    const gaps = SIDES.filter(side => run.walls[side] <= 0);
    if (enemy.cargo) {
      if (!enemy.sailing && enemy.cargo.length < (enemy.berth ?? 5)) continue;
      enemy.y -= enemy.speed * movementDt;
      const volley = enemy.shipArt === "atakebune" ? TRANSPORT_TIERS.atakebune.volley : 0;
        if (volley && onBattlefield(enemy) && (enemy.skillClock -= movementDt) <= 0) {
        enemy.skillClock += VOLLEY_EVERY;
        const deck = transportView(enemy);
        const victim = marks.filter(mark => distance(deck, mark.unit) <= VOLLEY_RANGE)
          .sort((a, b) => distance(deck, a.unit) - distance(deck, b.unit))[0];
        if (victim) {
          effects.push({ kind: "shot", x: victim.unit.x, y: victim.unit.y, fromX: deck.x, fromY: deck.y, value: 0, hostile: true, target: enemy.id });
          hurt(run, victim.squad, victim.index, run.bph?.survival ? BPH_SURVIVAL_TABLE.transportVolley : volley, effects, enemy);
        }
      }
      if (enemy.y <= riverBank()) {
        const cargo = enemy.cargo;
        run.metrics.naval.landed++; run.metrics.naval.passengersLanded += cargo.length;
        enemy.cargo = []; enemy.hp = 0;
        for (const [index, passenger] of cargo.entries()) {
          const spot = landingSpot({ x: enemy.x, y: riverBank() - 8 }, index, cargo.length);
          placeEnemyOutside(run, passenger, spot, { x: enemy.x, y: riverBank() }); retarget(run, passenger);
          run.enemies.push(passenger);
        }
        effects.push({ kind: "land", x: enemy.x, y: riverBank(), value: cargo.length, hostile: true });
      }
      continue;
    }
    if (enemy.kind === "ship") {
      if (run.time >= (enemy.expiresAt ?? Infinity)) { enemy.hp = 0; if (enemy.casting) cancel(run, enemy, effects); continue; }
      enemy.y = riverLane();
      if (!enemy.casting && enemy.stun <= 0) {
        const sign = Math.floor((run.time - (enemy.appearedAt ?? 0)) / 8) % 2 ? -1 : 1;
        enemy.x = clamp(enemy.x + sign * enemy.speed * movementDt, 36, WIDTH - 36);
      }
    }
    if (enemy.kind !== "ship" && gaps.length && !enemy.breach && (!enemy.pulled || run.walls[enemy.pulled] > 0)) {
      const start = pushOut(keepOut, enemy);
      const path = (side: Direction) => routeDistance(keepOut, start, guardPoint(run.fort, side, 10));
      const side = gaps.reduce((best, gap) => path(gap) < path(best) ? gap : best);
      const target = guardPoint(run.fort, side, 10), along = clamp((random(run) - .5) * BALANCE.breachSpread, -16, 16);
      enemy.pulled = side; enemy.goalX = target.x + (side === "위" || side === "아래" ? along : 0); enemy.goalY = target.y + (side === "좌" || side === "우" ? along : 0);
    }
    if (enemy.boss && enemy.bossArt && !enemy.enraged && enemy.hp <= enemy.maxHp * .5) {
      enemy.enraged = true; enemy.speed *= 1.25; enemy.skillClock = 0; enemy.casts = 0;
      const record = run.metrics.bosses.find(item => item.appeared === enemy.appearedAt);
      if (record) record.phase2 = run.time;
      effects.push({ kind: "rage", x: enemy.x, y: enemy.y, value: 1, target: enemy.id });
    }
    spendPouchAtWall(enemy);
    if (enemy.burn > 0) {
      enemy.burn -= dt;
      if ((enemy.burnClock -= dt) <= 0) { enemy.burnClock = .5; damage(run, enemy, BALANCE.burnPower * might(run), effects, "weapon", false, true, "artillery", -1, false, undefined, false, undefined, true); }
      if (enemy.hp <= 0) continue;
    }
    if (enemy.stun > 0) { enemy.stun -= dt; continue; }
    if (enemy.casting) continue;
    if (enemy.kind === "ship") {
      if ((enemy.skillClock -= dt) <= 0) {
        enemy.skillClock += 2.4;
        const boats = marks.filter(mark => mark.unit.kind === "panokseon");
        const victim = boats.sort((a, b) => distance(enemy, a.unit) - distance(enemy, b.unit))[0];
        const target = victim?.unit ?? guardPoint(run.fort, "아래", 0);
        effects.push({ kind: "shot", x: target.x, y: target.y, fromX: enemy.x, fromY: enemy.y, value: 1, hostile: true });
        if (victim) {
          hurt(run, victim.squad, victim.index, 18, effects, enemy);
          if (victim.unit.hp <= 0) victim.unit.downUntil = run.time + 20;
        } else if (!gaps.length) batter(run, effects, { at: target, amount: run.maxWall * .25 * .4 / (RIVER_SECONDS / 2.4) / 2,
          attacker: enemy.id, attackKind: "projectile" });
      }
      continue;
    }
    if (!enemyInCombatField(run, enemy)) {
      enemy.prey = null; enemy.strikeAt = 0;
      if (enemy.pursuit) enemy.pursuit.returning = true;
      // Reach the visible field even if the siege route's stop distance would leave us outside.
      const goal = siegeGoal(enemy);
      const entry = run.bph?.survival ? groundCombatPoint(goal)
        : onBattlefield(goal) ? goal : { x: clamp(enemy.x, 1, WIDTH - 1), y: clamp(enemy.y, 1, HEIGHT - 1) };
      approach(enemy, entry, 0);
      continue;
    }
    const ranged = enemy.kind === "teppo" && !enemy.elite && !enemy.boss && !enemy.ladder;
    const reachOf = (unit: Unit) => ranged ? 115
      : MELEE + (enemy.boss ? 8 : 0) + (unit.perch !== undefined ? 14 + BALANCE.wallReach : 8);
    const heldUnit = enemy.prey && unitAt(run, enemy.prey);
    // Owner DM 1795145756.429339 (the keep was never attacked): a survival breacher stays on its straight path to the
    // keep. It keeps no pursuit record, whose `returning` state would walk it past an ally standing in its way.
    const committed = !!run.bph && !!enemy.breach;
    if (committed) delete enemy.pursuit;
    const pursuit = enemy.pursuit;
    const blockHalf = ALLY_SPACING / 2 + enemyBodyRadius(enemy);
    const blocksKeep = (unit: Unit) => crosses({ left: unit.x - blockHalf, top: unit.y - blockHalf, right: unit.x + blockHalf, bottom: unit.y + blockHalf }, enemy, CENTER);
    if (pursuit && !pursuit.returning && (!heldUnit || !fit(heldUnit, run.time) || invisible(run, heldUnit)
      || !onBattlefield(heldUnit) || distance(enemy, pursuit.origin) > pursuit.limit || distance(heldUnit, pursuit.origin) > pursuit.limit)) {
      pursuit.returning = true;
      enemy.prey = null; enemy.strikeAt = 0;
    } else if (heldUnit && invisible(run, heldUnit)) { enemy.prey = null; enemy.strikeAt = 0; }
    if (enemy.strikeAt > 0) {
      if (run.time < enemy.strikeAt) continue;
      enemy.strikeAt = 0;
      const victim = enemy.prey && unitAt(run, enemy.prey);
      if (!enemy.prey || !victim || !fit(victim, run.time)) continue;
      if (ranged) {
        run.shots.push({ id: run.nextId++, kind: "bullet", x: enemy.x, y: enemy.y, toX: victim.x, toY: victim.y, speed: 380, target: 0, prey: enemy.prey,
          damage: blow(run, enemy), critical: false, by: "weapon", splash: 0, pierce: 0, from: enemy.id });
        effects.push({ kind: "shot", x: victim.x, y: victim.y, fromX: enemy.x, fromY: enemy.y, value: 0, hostile: true, target: enemy.id });
      } else if (distance(enemy, footOf(enemy, victim, ranged)) <= reachOf(victim) - (!run.bph && enemy.boss ? 8 : 0)) hurt(run, run.squads[enemy.prey[0]], enemy.prey[1], blow(run, enemy), effects, enemy);
      continue;
    }
    enemy.clock -= dt * (enemy.ladder ? 1 : pace(enemy)); enemy.skillClock -= dt;
    const returning = pursuit?.returning === true;
    const readyCast = !returning && !enemy.ladder && (enemy.elite || enemy.boss || enemy.miniboss) && enemy.skillClock <= 0;
    if (!gaps.length && readyCast && cast(run, enemy, effects, false)) continue;
    const scout = enemy.kind === "cavalry" ? SCOUT.cavalry : enemy.elite || enemy.boss ? SCOUT.elite : SCOUT[enemy.kind];
    const aggro = enemy.breach && !enemy.boss ? Math.min(scout.aggro, BALANCE.breachAggro) : scout.aggro, hunt = enemy.boss ? 1000 : enemy.breach ? 0 : scout.hunt;
    let victim: Unit | null = null, nearest = Infinity;
    enemy.prey = null;
    const ranks = !run.bph && enemy.boss && marks.some(mark => mark.index < 0) ? marks.filter(mark => mark.index < 0) : marks;
    // A melee walker outside the fort cannot reach a fighter standing in the courtyard (not on the wall), so it does not pick one.
    const outside = !!run.bph && !enemy.breach && !ranged && !contains(wall, enemy);
    const eligible = enemy.miniboss && !ranged ? ranks.filter(mark => mark.unit.perch === undefined) : ranks;
    const targets = !outside ? eligible : eligible.filter(mark => mark.unit.perch !== undefined || !contains(court, mark.unit));
    const canIntercept = !returning && (!enemy.ladder || gaps.length > 0);
    for (const mark of canIntercept ? targets : []) {
      const gap = distance(enemy, mark.unit);
      if (!onBattlefield(mark.unit) || gap >= nearest) continue;
      // An ally this walker was bodily blocked from is skipped unless it can already be struck from here.
      if (run.bph && gap > reachOf(mark.unit) && shunned(enemy, mark.unit, run.time)) continue;
      // A breacher turns only on an ally it can already strike (the reach check below) or one whose body bars its path.
      // A breached gunner's 115 px covers most of the court, so with the keep itself in range only a body in the way turns it.
      const acquires = committed ? blocksKeep(mark.unit) || gap <= reachOf(mark.unit) && !(ranged && distance(enemy, CENTER) <= reachOf(mark.unit))
        : run.bph ? (pursuit && mark.unit === heldUnit
          || gap <= Math.max(ENEMY_PURSUIT.sight, reachOf(mark.unit) * ENEMY_PURSUIT.aggro + ALLY_SPACING / 2))
        && (!pursuit || distance(mark.unit, pursuit.origin) <= pursuit.limit)
        : gap < aggro || mark.index < 0 && gap < hunt;
      if (acquires) { nearest = gap; victim = mark.unit; enemy.prey = [mark.squad.id, mark.index]; }
    }
    // Native Warlord passive taunt aura (Spell_HammerTaunt radius 1): overrides
    // ordinary target selection with the closest aura, roster-stable on ties.
    const tauntContext = run.bph && canIntercept ? bphFxContext(run) : undefined;
    const taunt = tauntContext ? martialTauntTarget(tauntContext, enemy) : null;
    if (taunt && onBattlefield(taunt.unit) && !invisible(run, taunt.unit)
      && (!pursuit || distance(taunt.unit, pursuit.origin) <= pursuit.limit)) {
      victim = taunt.unit; nearest = taunt.distance; enemy.prey = taunt.prey;
    }
    if (victim) {
      if (gaps.length && readyCast && cast(run, enemy, effects, true)) continue;
      const reach = reachOf(victim);
      if (run.bph && !committed) enemy.pursuit ??= { origin: { x: enemy.x, y: enemy.y },
        limit: (reach * ENEMY_PURSUIT.aggro + ALLY_SPACING / 2) * ENEMY_PURSUIT.leash };
      // A melee walker outside strikes a wall-top fighter from the foot of the wall, and walks round the fort to one on its far side.
      const aim = footOf(enemy, victim, ranged), gap = aim === victim ? nearest : distance(enemy, aim);
      if (gap > reach || outside && crosses(court, enemy, aim)) {
        if (run.bph && !taunt) noteBlocked(enemy, victim, enemy.clock <= 0, run.time);
        approach(enemy, aim, reach - 2); continue;
      }
      if (run.bph) delete enemy.stall;
      if (enemy.clock > 0) continue;
      enemy.clock = enemy.bphProfileId ? 1 / BPH_MONSTERS[enemy.bphProfileId].attackSpeed
        : ranged ? 1.8 : enemy.boss ? 1.6 : 1.2;
      enemy.strikeAt = run.time + (ranged ? .35 : .3);
      effects.push({ kind: "lunge", x: victim.x, y: victim.y, value: enemy.strikeAt - run.time, target: enemy.id, minor: ranged });
      continue;
    }
    const breached = !!enemy.breach;
    const goal = siegeGoal(enemy), stand = enemy.pulled && !breached ? 2 : !breached && ranged ? 70 : 9;
    // Owner 1795159408.929199 (a crowd round the keep never struck it): 20 px bodies ring the centre at 10 px, past the 9 px
    // stand, so a survival breacher strikes once its body touches the keep building instead.
    const atKeep = !!run.bph && breached && gapToRect(keepFoot(), enemy) <= enemyBodyRadius(enemy) + 2;
    if (pursuit) {
      // Rejoin the castle approach before allowing another detour; otherwise the same ally can
      // immediately pick up the enemy again and turn consecutive short chases into an unlimited one.
      // Back on the approach: look for troops again on the next step before striking the wall.
      if (distance(enemy, goal) <= Math.max(stand, distance(pursuit.origin, goal) - pursuit.limit / 2)) { delete enemy.pursuit; continue; }
      pursuit.returning = true;
    }
    if (!atKeep && distance(enemy, goal) > stand) { approach(enemy, goal, stand - 1); continue; }
    if (gaps.length && !breached) continue;
    if (enemy.clock > 0) continue;
    const struck = enemy.breach ? guardPoint(run.fort, enemy.breach, 0) : wallPoint(wall, enemy);
    if (enemy.ladder) {
      enemy.clock = 2;
      if (run.bph?.survival && enemy.bphProfileId) {
        const context = bphFxContext(run);
        const amount = (context ? bphEnemyStats(context, { profileId: enemy.bphProfileId }).towerDamage
          : BPH_MONSTERS[enemy.bphProfileId].towerDamage) * bphSurvivalDamageMultiplier(run, enemy, "castle");
        batter(run, effects, { at: struck, amount, attacker: enemy.id, reached: breached, attackKind: "ladder" });
      } else if (run.shieldUntil > run.time) {
        run.metrics.blocked += breached ? (run.time >= 540 ? BALANCE.lateLadderBlow : 15) : 10;
        effects.push({ kind: "block", x: enemy.x, y: enemy.y, value: 0 });
      } else if (breached) {
        const amount = run.time >= 540 ? BALANCE.lateLadderBlow : 15;
        const beforeHp = run.base;
        run.base = Math.max(0, run.base - amount);
        recordLethalCastleHit(run, { beforeHp, attacker: enemy, attackKind: "ladder" });
        if (run.base <= 0) run.lossCause = "army";
      } else batter(run, effects, { at: struck, amount: 10, attacker: enemy.id, attackKind: "ladder" });
      continue;
    }
    if (enemy.goldPouch) enemy.goldPouchSpent = true;
    enemy.clock = enemy.bphProfileId ? 1 / BPH_MONSTERS[enemy.bphProfileId].attackSpeed : ranged ? 1.8 : 2;
    if (ranged) effects.push({ kind: "shot", x: struck.x, y: struck.y, fromX: enemy.x, fromY: enemy.y, value: 0, hostile: true, target: enemy.id, minor: true });
    const opening = bossPower(enemy);
    const context = bphFxContext(run);
    let wallDamage = enemy.bphProfileId ? context
      ? bphEnemyStats(context, { profileId: enemy.bphProfileId }).towerDamage
      : BPH_MONSTERS[enemy.bphProfileId].towerDamage
      : (enemy.kind === "ukita" ? BALANCE.finalBlow : enemy.boss ? BALANCE.bossBlow * opening : enemy.elite ? BALANCE.eliteBlow : BALANCE.wallBlow * (enemy.wave ? BALANCE.waveBlow : 1)) * (1 + run.time / BALANCE.wallBlowSpan);
    if (enemy.bphProfileId) {
      const multiplier = bphSurvivalDamageMultiplier(run, enemy, "castle");
      wallDamage *= multiplier * minibossDamage(enemy);
    }
    batter(run, effects, { at: struck, amount: wallDamage, attacker: enemy.id, reached: !!enemy.breach,
      attackKind: ranged ? "projectile" : "wall" });
  }
}
/** The enemy a general is locked on: alive and still inside his reach plus the hysteresis slack. */
function lockOf(run: Run, squad: Squad): Enemy | undefined {
  return run.enemies.find(enemy => enemy.id === squad.aim && enemy.hp > 0 && enemyInCombatField(run, enemy) && distance(enemy, squad) < ARMS.general.reach + LOCK_SLACK);
}
/** Ground footprint of the 48 px keep building, drawn upward from its foot at buildings().base; read per call, as the field size can change. */
const keepFoot = () => ({ left: CENTER.x - 20, right: CENTER.x + 20, top: CENTER.y - 12, bottom: buildings().base.y - 2 });
/** Enemy foot soldiers keep centres one 20 px body apart: a crowd still packs shoulder to shoulder (c323) but never stacks (owner DM 1794909693.966399). */
export const ENEMY_SPACING = 20;
const enemyBodyRadius = (enemy: Enemy): number => ENEMY_SPACING / 2 * enemyBodyScale(enemy);
const enemyHitPadding = (enemy: Enemy): number => enemyBodyRadius(enemy) - ENEMY_SPACING / 2;
/** A boatload steps ashore on an arc this far inland of the landing point, LANDING_GAP apart, instead of onto one spot. */
const LANDING_ARC = 40, LANDING_GAP = 24;
export function landingSpot(at: Point, index: number, count: number): Point {
  const step = 2 * Math.asin(Math.min(1, LANDING_GAP / (2 * LANDING_ARC)));
  const angle = Math.PI / 2 + (index - (count - 1) / 2) * step;
  return { x: clamp(at.x + Math.cos(angle) * LANDING_ARC, 12, WIDTH - 12), y: at.y - Math.sin(angle) * LANDING_ARC };
}
/** UnitSeparation2D for the enemy side: overlapping foot soldiers are pushed apart on their centre line, two passes a step. */
function separateEnemies(run: Run): void {
  const bottom = riverBank() - 8;
  const bodies = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && !enemy.cargo && !enemy.boss);
  const shift = (enemy: Enemy, dx: number, dy: number) => {
    const next = { x: clamp(enemy.x + dx, Math.min(12, enemy.x), Math.max(WIDTH - 12, enemy.x)), y: Math.min(enemy.y + dy, Math.max(bottom, enemy.y)) };
    moveEnemy(run, enemy, run.bph?.survival && enemyInCombatField(run, enemy) ? groundCombatPoint(next) : next);
  };
  const cellSize = bodies.reduce((size, enemy) => Math.max(size, enemyBodyRadius(enemy) * 2), ENEMY_SPACING);
  const cellOf = (value: number) => Math.floor(value / cellSize) + 1024;
  for (let pass = 0; pass < 2; pass++) {
    const grid = new Map<number, number[]>();
    bodies.forEach((body, index) => {
      const key = cellOf(body.x) * 4096 + cellOf(body.y);
      const cell = grid.get(key);
      if (cell) cell.push(index); else grid.set(key, [index]);
    });
    bodies.forEach((body, i) => {
      const cx = cellOf(body.x), cy = cellOf(body.y);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (const j of grid.get((cx + ox) * 4096 + cy + oy) ?? []) {
        if (j <= i) continue;
        const other = bodies[j], dx = body.x - other.x, dy = body.y - other.y, gap = Math.hypot(dx, dy);
        const spacing = enemyBodyRadius(body) + enemyBodyRadius(other);
        if (gap >= spacing) continue;
        // Coincident bodies (a fresh boatload, one goal) split on a stable per-pair bearing.
        const angle = unitNoise(body.id, other.id) * 2 * Math.PI;
        const ux = gap < 1 ? Math.cos(angle) : dx / gap, uy = gap < 1 ? Math.sin(angle) : dy / gap, share = (spacing - gap) / 2;
        shift(body, ux * share, uy * share);
        shift(other, -ux * share, -uy * share);
      }
    });
  }
}
/** The playable area ground soldiers are kept inside. */
export const inFieldPadding = (p: Point): boolean => p.x >= 18 && p.x <= WIDTH - 18 && p.y >= 26 && p.y <= Math.min(HEIGHT - 18, riverBank() - 8);
/** Melee contact stops per class: attacker half-width + weapon + target half-width, so sprites visibly touch (owner DM 1794922680). */
const MELEE_STOP: Partial<Record<BphClass, number>> = { spearman: 24, militia: 26, monk: 26, joseon_cavalry: 27 };
/** The distance at which a ground soldier stops walking and fights. */
export function contactReach(run: Run, unit: Unit, stats = bphStats(unit, run)): number {
  if (!stats || !unit.bph) return ARMS[unit.kind].reach;
  const profile = BPH_PROFILES[unit.bph.profileId];
  const reach = bphProfileAttackReach(profile.id, stats.range);
  const stop = profile.attackType === 0 && reach <= 40 ? MELEE_STOP[profile.classId] : undefined;
  return stop === undefined ? reach : Math.min(reach, stop);
}
/** Survival idle ground soldiers (owner DM 1794922167.245489): loose rows of posts outside all four walls instead of the wall point
 *  nearest each soldier, which lined a whole fight's worth of soldiers up single file along one wall. `pitch` leaves a gap over
 *  ALLY_SPACING so separation never chains them; each side's posts lean up to `leash` toward that side's nearest enemy. */
export const GUARD_RING = { gap: 26, row: 20, rows: 4, pitch: ALLY_SPACING * 1.25, gateLane: 16, leash: 24, rowCost: 30 } as const;
/** Posts for the given soldiers, balanced per gate side (nearest gate first) and kept stable: each takes its nearest free post. */
export function guardRing(run: Run, units: Unit[]): Map<Unit, Point> {
  const posts = new Map<Unit, Point>(), gates = gatesOf(run), wall = fortRect(run.fort);
  if (!units.length) return posts;
  const { gap, row: rowStep, rows, pitch, gateLane, leash, rowCost } = GUARD_RING;
  const spots = new Map<Direction, { at: Point; row: number }[]>(), drift = new Map<Direction, Point>();
  for (const side of gates) {
    const along = side === "위" || side === "아래", list: { at: Point; row: number }[] = [];
    for (let row = 0; row < rows; row++) {
      const rect = fortRect(run.fort, gap + row * rowStep), lane = along ? CENTER.x : CENTER.y;
      // Top and bottom rows own the corners; side rows stop half a pitch short of them.
      const low = along ? rect.left : rect.top + pitch / 2, high = along ? rect.right : rect.bottom - pitch / 2, middle = (low + high) / 2 + (row % 2 ? pitch / 2 : 0);
      for (let k = 0; middle - k * pitch >= low || middle + k * pitch <= high; k++) for (const value of k ? [middle - k * pitch, middle + k * pitch] : [middle]) {
        if (value < low || value > high || Math.abs(value - lane) < gateLane) continue;
        const at = along ? { x: value, y: side === "위" ? rect.top : rect.bottom } : { x: side === "좌" ? rect.left : rect.right, y: value };
        if (inFieldPadding(at)) list.push({ at, row });
      }
    }
    spots.set(side, list);
    const centre = guardPoint(run.fort, side, gap);
    const foe = lowest(run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && sideOf(wall, enemy) === side), enemy => gapToRect(wall, enemy));
    const reach = foe ? distance(foe, centre) : 0, pull = Math.min(leash, reach);
    drift.set(side, foe && reach > 1 ? { x: (foe.x - centre.x) / reach * pull, y: (foe.y - centre.y) / reach * pull } : { x: 0, y: 0 });
  }
  const door = (side: Direction) => guardPoint(run.fort, side, gap);
  const order = [...units].sort((a, b) => a.id - b.id);
  const prefs = new Map(order.map(unit => [unit, [...gates].sort((a, b) => distance(unit, door(a)) - distance(unit, door(b)))]));
  const cap = Math.ceil(units.length / gates.length), load = new Map<Direction, number>(gates.map(side => [side, 0])), sideFor = new Map<Unit, Direction>();
  const queue = [...order].sort((a, b) => distance(a, door(prefs.get(a)![0])) - distance(b, door(prefs.get(b)![0])) || a.id - b.id);
  for (const unit of queue) {
    const choice = prefs.get(unit)!, side = choice.find(s => load.get(s)! < Math.min(cap, spots.get(s)!.length)) ?? choice[0];
    sideFor.set(unit, side); load.set(side, load.get(side)! + 1);
  }
  const taken = new Set<{ at: Point; row: number }>();
  const rowFill = new Map(gates.map(side => [side, Array.from({ length: rows }, () => 0)]));
  for (const unit of order) {
    const side = sideFor.get(unit)!, free = spots.get(side)!.filter(spot => !taken.has(spot));
    // Least-taken row wins over the nearest post, so a side's soldiers never queue on one line.
    const fill = rowFill.get(side)!;
    let best: { at: Point; row: number } | undefined, low = Infinity;
    for (const spot of free) { const cost = fill[spot.row] * rowCost + distance(unit, spot.at); if (cost < low) { low = cost; best = spot; } }
    if (!best) continue;
    fill[best.row]++;
    taken.add(best);
    const lean = drift.get(side)!;
    posts.set(unit, fieldPoint(run.fort, { x: best.at.x + lean.x, y: best.at.y + lean.y }, gap));
  }
  return posts;
}
/** Survival (owner DM 1794922422.126439): a melee soldier shot from beyond its reach (`slack` past contact) charges the shooter,
 *  bringing up to `helpers` idle melee mates within `near`; nobody chases a shooter more than `leash` px off the wall. */
export const RETALIATE = { slack: 16, helpers: 2, near: 64, leash: 200 } as const;
const footFighter = (unit: Unit) => unit.kind !== "panokseon" && unit.kind !== "archer" && unit.kind !== "hwacha" && unit.kind !== "general";
/** New infantry alternate left/right before spawn effects run; losses send the next recruit to the lighter side. */
export function assignMarchFlank(run: Run, unit: Unit): void {
  if (!run.bph || !footFighter(unit)) return;
  let left = 0, right = 0;
  for (const squad of run.squads) for (const mate of squad.soldiers) if (mate.hp > 0 && footFighter(mate)) {
    if (mate.flank === "left") left++;
    else if (mate.flank === "right") right++;
  }
  unit.flank = left <= right ? "left" : "right";
}
function balanceMarchSides(run: Run, units: Unit[]): void {
  const order = [...units].sort((a, b) => a.id - b.id);
  const sides: Record<"left" | "right", Unit[]> = { left: [], right: [] };
  for (const unit of order) if (unit.flank) sides[unit.flank].push(unit);
  for (const unit of order) if (!unit.flank) {
    // At the keep's exact centre, retain the previous nearest-gate tie order (left before right).
    unit.flank = sides.left.length === sides.right.length ? unit.x <= CENTER.x ? "left" : "right"
      : sides.left.length < sides.right.length ? "left" : "right";
    sides[unit.flank].push(unit);
    delete unit.march;
  }
  const heavy = sides.left.length > sides.right.length ? "left" : "right";
  const light = heavy === "left" ? "right" : "left";
  // Move only floor(difference / 2) survivors, preferring the shortest crossing.
  // Neither moving enemies nor a changing array order can reshuffle a balanced army.
  const excess = Math.floor((sides[heavy].length - sides[light].length) / 2);
  const transfers = [...sides[heavy]].sort((a, b) => Math.abs(a.x - CENTER.x) - Math.abs(b.x - CENTER.x) || a.id - b.id);
  for (const unit of transfers.slice(0, excess)) {
    unit.flank = light;
    delete unit.march;
  }
  const taken: Point[] = [];
  for (const unit of order) {
    // Downed fighters already released their posts; every surviving post stays put.
    if (unit.march) taken.push(unit.march);
  }
  const posts = order.some(unit => !unit.march) ? guardRing(run, order) : undefined;
  for (const unit of order) if (!unit.march) {
    const pitch = GUARD_RING.pitch, bottom = riverBank() - 8, low = 26 + pitch, high = bottom - pitch;
    const count = Math.max(1, Math.floor((high - low) / pitch) + 1);
    let post: Point | undefined;
    const departure = posts?.get(unit);
    if (departure) {
      const dx = departure.x - CENTER.x, dy = departure.y - CENTER.y;
      const scale = Math.min(dx ? ((dx < 0 ? 18 : WIDTH - 18) - CENTER.x) / dx : Infinity,
        dy ? ((dy < 0 ? 26 : bottom) - CENTER.y) / dy : Infinity);
      // Both halves finish on their own lateral edge. Opposing destinations on the
      // one-dimensional river bank can trap two walkers head-on with no room to pass.
      const projected = { x: unit.flank === "left" ? 18 : WIDTH - 18,
        y: clamp(CENTER.y + dy * scale, low, high) };
      if (!taken.some(at => distance(at, projected) < pitch)) post = projected;
    }
    const rows = Math.max(1, Math.ceil((WIDTH / 2 - 18) / pitch));
    let open: Point | undefined, clearance = -1;
    for (let row = 0; !post && row < rows; row++) {
      const x = unit.flank === "left" ? 18 + row * pitch : WIDTH - 18 - row * pitch;
      const spots = Array.from({ length: count }, (_, i) => ({ x, y: low + i * pitch }))
        .filter(at => !contains(fortRect(run.fort, WALL_APRON), at));
      for (const at of spots) {
        const gap = Math.min(...taken.map(other => distance(at, other)));
        if (gap > clearance) { open = at; clearance = gap; }
      }
      const free = spots.filter(at => !taken.some(other => distance(at, other) < pitch - .01));
      free.sort((a, b) => distance(a, unit) - distance(b, unit) || a.y - b.y);
      post = free[0];
    }
    // A saturated half uses its most open legal post instead of searching through the fort or opposite half.
    unit.march = post ?? open!;
    taken.push(unit.march);
  }
}
function provoke(run: Run, unit: Unit, from: Enemy): void {
  if (!footFighter(unit) || unit.perch !== undefined || from.kind === "ship" || from.hp <= 0) return;
  if (distance(from, unit) <= contactReach(run, unit) + RETALIATE.slack || gapToRect(fortRect(run.fort), from) > RETALIATE.leash) return;
  const garrison = run.squads.flatMap(squad => squad.soldiers), alive = (id?: number) => id !== undefined && run.enemies.some(enemy => enemy.id === id && enemy.hp > 0);
  if (!alive(unit.revenge)) unit.revenge = from.id;
  let chasing = garrison.filter(mate => mate.revenge === from.id).length;
  const mates = garrison.filter(mate => mate !== unit && footFighter(mate) && mate.hp > 0 && mate.perch === undefined
    && (mate.quarry === undefined || mate.quarry === from.id) && !alive(mate.revenge)
    && distance(mate, unit) <= RETALIATE.near).sort((a, b) => distance(a, unit) - distance(b, unit) || a.id - b.id);
  for (const mate of mates) { if (chasing >= 1 + RETALIATE.helpers) break; mate.revenge = from.id; chasing++; }
}
function lowest(enemies: Enemy[], score: (enemy: Enemy) => number): Enemy | undefined {
  let best: Enemy | undefined, low = Infinity;
  for (const enemy of enemies) { const value = score(enemy); if (value < low) { low = value; best = enemy; } }
  return best;
}
/** UnitSeparation2D: overlapping ground allies are pushed apart on their centre line; generals only push. */
function separateAllies(run: Run, garrison: Unit[], startedAt: ReadonlyMap<number, Point>): void {
  // The band is the stone plus allyRoute's 10 px walking margin, so a push never leaves a walker inside the margin.
  const wall = fortRect(run.fort, 10), court = fortRect(run.fort, -TILE), bottom = Math.min(HEIGHT - 18, riverBank() - 8);
  const stone = fortRect(run.fort), origins = new Map<Unit, Point>();
  const quarries = new Map<Unit, Point>(), reaches = new Map<Unit, number>();
  const reachOf = (unit: Unit) => {
    let reach = reaches.get(unit);
    if (reach === undefined) { reach = contactReach(run, unit); reaches.set(unit, reach); }
    return reach;
  };
  for (const unit of garrison) {
    const live = unit.quarry === undefined ? undefined : run.enemies.find(enemy => enemy.id === unit.quarry && enemy.hp > 0);
    const quarry = live && (startedAt.get(live.id) ?? live);
    // An enemy still beyond the field padding cannot be reached yet, so it does not pin a soldier against the edge.
    if (quarry && inFieldPadding(quarry) && distance(quarry, unit) <= 110) quarries.set(unit, quarry);
  }
  const zone = (p: Point) => contains(court, p) ? 0 : contains(wall, p) ? 1 : 2;
  // The gate passage is in the south wall only: the same x on the north wall is stone.
  const gateway = (p: Point) => zone(p) === 1 && Math.abs(p.x - CENTER.x) < 16 && p.y >= court.bottom;
  const bodies = garrison.filter(unit => unit.kind !== "panokseon" && unit.hp > 0 && unit.perch === undefined);
  const leaders = run.squads.filter(squad => squad.hp > 0 && squad.state !== "down" && squad.state !== "charge");
  const shift = (unit: Unit, dx: number, dy: number) => {
    // Wall-hugging soldiers separate too: the checks below still keep every push off the stone and its apron.
    // Inside the gate passage a soldier may only be pushed outward along it, never into the stone or back in.
    const passage = gateway(unit), next = { x: unit.x + (passage ? 0 : dx), y: unit.y + (passage ? Math.max(0, dy) : dy) };
    const origin = origins.get(unit) ?? { x: unit.x, y: unit.y }, quarry = quarries.get(unit);
    const held = !run.bph && quarry ? Math.max(distance(origin, quarry), reachOf(unit), ALLY_SPACING) : 0;
    if (!run.bph) {
      // The classic demo retains its contact-distance constraint.
      const project = () => {
        const after = quarry ? distance(next, quarry) : 0;
        if (quarry && after > held) { next.x = quarry.x + (next.x - quarry.x) * held / after; next.y = quarry.y + (next.y - quarry.y) * held / after; }
      };
      project();
      const wanted = Math.hypot(next.x - unit.x, next.y - unit.y) < Math.hypot(dx, dy) * .25 ? Math.hypot(dx, dy) : 0;
      if (quarry && wanted > 0 && !passage) {
        const rx = unit.x - quarry.x, ry = unit.y - quarry.y, r = Math.hypot(rx, ry);
        const turn = r < .01 ? 0 : Math.sign(rx * dy - ry * dx) || (unitNoise(unit.id, 5) < .5 ? -1 : 1);
        const angle = unitNoise(unit.id, 6) * 2 * Math.PI, tx = r < .01 ? Math.cos(angle) : -ry / r * turn, ty = r < .01 ? Math.sin(angle) : rx / r * turn;
        next.x = unit.x + tx * wanted; next.y = unit.y + ty * wanted;
        project();
      }
    }
    // A full contact ring must let the next rank wait behind it. Pinning every fighter
    // inside its weapon reach makes that packing impossible and turns pushes into an orbit.
    // One step's correction is at most one spacing, so separation never reads as a teleport.
    const moved = distance(origin, next);
    if (moved > ALLY_SPACING) { next.x = origin.x + (next.x - origin.x) * ALLY_SPACING / moved; next.y = origin.y + (next.y - origin.y) * ALLY_SPACING / moved; }
    // At the field edge the blocked axis is clamped so the free axis still separates the pair.
    next.x = clamp(next.x, Math.min(18, unit.x), Math.max(WIDTH - 18, unit.x));
    next.y = clamp(next.y, Math.min(26, unit.y), Math.max(bottom, unit.y));
    if (!run.bph && quarry && distance(next, quarry) > held + 1e-9) return;
    // Walls are crossed only through the gate: no push enters the courtyard or the stone band elsewhere.
    // Only a dash carries a soldier over the stone; aloft it may give way anywhere short of the courtyard.
    if (!passage && zone(unit) === 1 && contains(stone, unit)) { if (zone(next) !== 0) { origins.set(unit, origin); unit.x = next.x; unit.y = next.y; } return; }
    if ((zone(next) === 0) !== (zone(unit) === 0) && !gateway(next) && !passage) return;
    // Outside the passage a push never brings a soldier nearer the stone, nor within the 24 px apron the gate keeps clear;
    // a soldier fighting an enemy at the wall may use the apron down to the walking margin, or its ring would be one point.
    // A survival gate's mouth stays clear to the full apron even for a fighter, so the soldiers behind it can still walk out.
    // A distant pursuit quarry does not make a profile soldier a contact fighter.
    const apron = quarry && (!unit.bph || distance(quarry, unit) < reachOf(unit))
      && !(run.bph && inGateMouth(run.fort, next, fortGates(true), WALL_APRON)) ? 10 : WALL_APRON;
    // A soldier already outside is never pushed back up into the passage; it would walk out again next step.
    if (!passage && !(gateway(next) && zone(unit) !== 2) && zone(next) !== 0 && (contains(stone, next) || gapToRect(stone, next) < Math.min(gapToRect(stone, unit), apron))) return;
    origins.set(unit, origin);
    unit.x = next.x; unit.y = next.y;
  };
  let crowded = false;
  const part = (unit: Unit, other: Unit, movable: boolean) => {
    const dx = unit.x - other.x, dy = unit.y - other.y, gap = Math.hypot(dx, dy);
    if (gap >= ALLY_SPACING) return;
    // Survival edge ranks must finish separating; a half-pixel early exit leaves a
    // pinned pair slightly interpenetrating even after all walking has stopped.
    if (gap < ALLY_SPACING - (run.bph ? .01 : .5)) crowded = true;
    // Coincident bodies have no usable centre line (a fresh pile shares one x and would split on a single axis);
    // a stable per-pair bearing keeps the split two-dimensional and deterministic.
    const angle = unitNoise(unit.id, other.id) * 2 * Math.PI, lane = gateway(unit) || gateway(other);
    // A pair in the gate passage separates along the passage, the only axis it may move on.
    const ux = lane ? 0 : gap < 1 ? Math.cos(angle) : dx / gap;
    const uy = lane ? Math.abs(dy) > .01 ? Math.sign(dy) : angle < Math.PI ? 1 : -1 : gap < 1 ? Math.sin(angle) : dy / gap;
    const overlap = ALLY_SPACING - gap;
    // Two idle fighters can reach the same edge in reverse post order. A centre-line push then
    // cancels their walk forever; let the higher id pass on the field's open, inward side.
    if (run.bph && movable && footFighter(unit) && footFighter(other) && !unit.emerging && !other.emerging
      && unit.quarry === undefined && other.quarry === undefined && unit.flank === other.flank
      && unit.march && other.march && (unit.y - other.y) * (unit.march.y - other.march.y) < 0
      && unit.march.x === (unit.flank === "left" ? 18 : WIDTH - 18) && other.march.x === unit.march.x
      && Math.abs(unit.x - unit.march.x) < ALLY_SPACING && Math.abs(other.x - other.march.x) < ALLY_SPACING) {
      const yielding = unit.id > other.id ? unit : other;
      shift(yielding, yielding.flank === "left" ? overlap : -overlap, 0);
    }
    // Preserve the contact-ring order, and use it for infantry crossing a centre-line fight.
    // Idle recruits, gate traffic and non-infantry pairs retain the symmetric push.
    const centerFight = footFighter(unit) && footFighter(other) && unit.quarry !== undefined && other.quarry !== undefined
      && [quarries.get(unit), quarries.get(other)].some(target => target && Math.abs(target.x - CENTER.x) <= ALLY_SPACING / 2);
    const ordered = !!run.bph && movable && (unit.quarry !== undefined && unit.quarry === other.quarry || centerFight);
    const share = !movable ? 1 : ordered ? unit.id < other.id ? 0 : 1 : .5;
    shift(unit, ux * overlap * share, uy * overlap * share);
    if (movable) shift(other, -ux * overlap * (1 - share), -uy * overlap * (1 - share));
  };
  // shift() keeps every body within ALLY_SPACING of its starting point on each axis for the whole call, so a pair
  // whose starting points are 3 spacings apart on an axis can never touch: part() would return at once for it.
  // Pairs outside that bound cannot contribute a push.
  const near = 3 * ALLY_SPACING + 1, cellOf = (value: number) => Math.floor(value / near);
  const grid = new Map<number, number[]>();
  bodies.forEach((body, index) => {
    const key = cellOf(body.x) * 65536 + cellOf(body.y), cell = grid.get(key);
    if (cell) cell.push(index); else grid.set(key, [index]);
  });
  const partners = bodies.map((body, i) => {
    const list: number[] = [], cx = cellOf(body.x), cy = cellOf(body.y);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (const j of grid.get((cx + ox) * 65536 + cy + oy) ?? [])
      if (j > i && Math.abs(bodies[j].x - body.x) <= near && Math.abs(bodies[j].y - body.y) <= near) list.push(j);
    return list.sort((a, b) => a - b);
  });
  // A pile that walked onto one waypoint needs several relaxation passes, most of all in the one-axis gate passage.
  for (let pass = 0; pass < 16 && (pass === 0 || crowded); pass++) {
    crowded = false;
    for (let i = 0; i < bodies.length; i++) {
      for (const leader of leaders) part(bodies[i], leader, false);
      for (const j of partners[i]) part(bodies[i], bodies[j], true);
    }
  }
  // A pair the walls, reach and step bound squeezed back onto one spot tries the other bearings, so no two bodies end coincident.
  for (let i = 0; i < bodies.length; i++) for (const j of partners[i]) {
    for (let turn = 0; turn < 8 && distance(bodies[i], bodies[j]) < 1; turn++) {
      const angle = unitNoise(bodies[i].id, bodies[j].id) * 2 * Math.PI + turn * Math.PI / 4;
      shift(bodies[i], Math.cos(angle) * ALLY_SPACING / 2, Math.sin(angle) * ALLY_SPACING / 2);
      if (distance(bodies[i], bodies[j]) < 1) shift(bodies[j], -Math.cos(angle) * ALLY_SPACING / 2, -Math.sin(angle) * ALLY_SPACING / 2);
    }
  }
}
function pick(run: Run, unit: Unit, reach: number): Enemy | undefined {
  if (unit.kind === "panokseon") {
    const targets = run.enemies.filter(enemy => enemy.hp > 0 && enemyInCombatField(run, enemy) && distance(enemy, unit) < reach
      && (!unit.bph || enemy.kind === "ship"));
    return targets.sort((a, b) => Number(b.kind === "ship") - Number(a.kind === "ship") || distance(a, unit) - distance(b, unit))[0];
  }
  let best: Enemy | undefined, lowest = Infinity;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0 || enemy.kind === "ship" || !enemyInCombatField(run, enemy)) continue;
    const gap = distance(enemy, unit);
    if (gap >= reach) continue;
    const order = gap - (enemy.casting || enemy.boss || enemy.elite ? 200 : 0);
    if (order < lowest) { lowest = order; best = enemy; }
  }
  return best;
}
function burst(run: Run, at: Point, radius: number, amount: number, by: Source, effects: Effect[], critical: boolean, stun = 0, tier = 1, naval = false, origin?: Striker, unitIndex = -1, procDepth = 0, projectile?: Effect["projectile"]): void {
  effects.push({ kind: "blast", x: at.x, y: at.y, value: radius / 26 * (1 + .35 * (tier - 1)) });
  let total = 0, struck = 0;
  for (const enemy of run.enemies) if (enemy.hp > 0 && distance(enemy, at) < radius + enemyHitPadding(enemy)) {
    total += damage(run, enemy, amount, effects, by, critical, true, "artillery", unitIndex, naval, origin, false, undefined, !naval, undefined, undefined, procDepth, undefined, projectile); struck++;
    knock(run, enemy, at, 6);
    if (stun && !enemy.ladder) stagger(run, enemy, stun, effects);
    if (run.fire) enemy.burn = 3;
  }
  if (struck) effects.push({ kind: "total", x: at.x, y: at.y, value: Math.round(total), critical, count: struck });
}
function launch(run: Run, kind: "arrow" | "rocket", from: Point, to: Point, target: number, amount: number, critical: boolean, by: Source, splash = 0, rank = 1): void {
  const tier = Math.min(3, Math.max(growthTier(run.level), rank, by === "weapon" ? kind === "arrow" ? run.arrow : run.hwacha : 1));
  run.shots.push({ id: run.nextId++, kind, x: from.x, y: from.y, toX: to.x, toY: to.y, speed: kind === "rocket" ? 260 : 340, target, prey: null,
    tier, flaming: kind === "arrow" && (tier >= 3 || run.fire), damage: amount, critical, by, splash, pierce: kind === "arrow" && run.quiver ? 1 : 0, from: 0 });
}
function fight(run: Run, squad: Squad, unit: Unit, index: number, dt: number, effects: Effect[], special = false): void {
  if (!fit(unit, run.time)) return;
  const profile = unit.bph ? BPH_PROFILES[unit.bph.profileId] : null;
  const leader = index < 0;
  const timer = special ? squad.specialAttack ??= { clock: GENERAL_ATTACK_TIMING.firstSpecial, strikeAt: 0, aim: 0 } : unit;
  const personalBow = run.bph && leader && !profile && (squad.general === "이순신" || squad.general === "곽재우");
  const attackHooks = !run.bph || !leader || special;
  const strike = special ? GENERAL_STRIKE[squad.general] : undefined;
  const own = special ? generalReach(squad.general, reachLevel(run)) : undefined;
  const basicBlade = run.bph && leader
    ? { ...ARMS.general, every: GENERAL_ATTACK_TIMING.basicEvery, windup: GENERAL_ATTACK_TIMING.basicWindup,
        power: ARMS.general.power * GENERAL_ATTACK_TIMING.basicPower, cleave: 1, span: 0, knock: 4 } : ARMS.general;
  const basicArms = run.bph && leader && (personalBow || squad.general === "송상현")
    ? { ...ARMS.archer, every: GENERAL_ATTACK_TIMING.basicEvery, windup: GENERAL_ATTACK_TIMING.basicWindup,
        power: (squad.general === "이순신" ? ARMS.panokseon.power : squad.general === "송상현" ? ARMS.archer.power : ARMS.general.power)
          * GENERAL_ATTACK_TIMING.basicPower } : basicBlade;
  const leaderArms = run.bph && leader && !special ? basicArms : run.bph && leader
    // 이순신's bow keeps the panokseon's blow but draws on the general's cadence, so at bow range he still outdamages 곽재우 (owner: "이순신이 게임내에서 제일이여야돼").
    ? personalBow ? { ...ARMS.archer, power: squad.general === "이순신" ? ARMS.panokseon.power : ARMS.general.power,
        every: ARMS.general.every, ...(own?.shape === "arrows" ? { reach: own.length } : {}) }
      // 김시민 has no personal rocket (owner DM 1794926634.203539): his identity is the wall battery; his body keeps the default blade.
      : squad.general === "권율" ? own ? { ...ARMS.hwacha, reach: own.length, cleave: own.targets } : ARMS.hwacha
      : squad.general === "송상현" ? ARMS.archer : squad.general === "이순신" ? ARMS.panokseon : strike ? STRIKE_ARMS[strike] : ARMS.general
    : ARMS[unit.kind];
  const profileArms = bphArms(unit, run);
  let arms = profileArms ?? leaderArms;
  if (profile && profile.cooldown <= 0) return;
  const kind = leader ? GENERAL_CLASS[squad.general] : unit.kind as SoldierKind;
  const bonus = synergy(run, kind), tactic = run.tactics[kind];
  const reach = profile?.attackType === 0 ? meleeContactLimit(arms.reach)
    : arms.reach + (profile || leader || kind === "panokseon" ? 0 : BALANCE.wallReach + bonus.reach + (tactic.storm && kind === "monk" ? 80 : 0));
  const basicRank = run.bph && leader && !special ? generalUpgradeRank(run.meta.generalUpgrades, squad.general, "attackSpeed") : 0;
  if (timer.strikeAt === 0) {
    const tempo = profile ? (squad.frenzyUntil > run.time ? 2 : 1) : (squad.frenzyUntil > run.time ? 2 : 1) * (leader ? 1 : (squad.state === "down" ? BALANCE.downTempo : 1) * (run.squads.some(mate => STYLES[mate.general] === "guardian" && fielded(mate)) ? BALANCE.guardianTempo : 1)) * (leader ? 1 : 1 + BALANCE.drillTempo * run.drill[unit.kind as SoldierKind]);
    if ((timer.clock -= dt * (basicRank > 0 ? 1 : tempo * (leader ? 1 : bonus.tempo))) > 0) return;
    const held = special ? run.enemies.find(enemy => enemy.id === timer.aim && enemy.hp > 0 && distance(enemy, unit) < reach)
      : leader ? lockOf(run, squad) : run.enemies.find(enemy => enemy.id === unit.quarry && enemy.hp > 0);
    // Profile troops may pursue distant quarries, but only a reachable one can consume their ready attack.
    const nearby = pick(run, unit, reach);
    const contact = leader && held && distance(held, unit) >= reach && nearby && distance(nearby, unit) <= reach * .6;
    const keep = held && (!profile || distance(held, unit) < reach)
      && (!run.bph || !leader || !nearby || keepsTarget(distance(held, unit), distance(nearby, unit), squad.lockUntil, run.time));
    const target = profile ? keep ? held : nearby : contact ? nearby : keep ? held : nearby ?? held;
    if (!target) { timer.clock = 0; return; }
    if (personalBow) {
      if (squad.general === "이순신" && distance(target, unit) <= ARMS.general.reach) arms = special ? ARMS.general : basicBlade;
      if (!special) unit.basicAttack = arms.shot === "arrow" ? "arrow" : "melee";
    }
    const legacyCooldown = arms.every - (kind === "panokseon" ? arms.windup * tempo * bonus.tempo : 0);
    // Rank the full legacy cycle at this tempo, then remove the windup already timed by strikeAt.
    timer.clock = basicRank > 0 ? generalBasicAttackInterval(arms.windup + legacyCooldown / tempo, basicRank) - arms.windup
      : legacyCooldown;
    if (!special && run.bph && leader && unit.aim !== target.id) squad.lockUntil = run.time + TARGET_LOCK.hold;
    timer.strikeAt = run.time + arms.windup; timer.aim = target.id; timer.combo = undefined;
    if (leader) holdHere(run, squad);
    effects.push({ kind: "windup", x: target.x, y: target.y, value: arms.windup, squad: squad.id, index });
    return;
  }
  if (run.time < timer.strikeAt) return;
  timer.strikeAt = 0;
  const strikeSlack = leader ? LOCK_SLACK : arms.shot ? 16 : 0;
  if (timer.combo) {
    // 황진's second cut: the same enemy, no second attack event, so on-attack effects still fire once per attack.
    const { amount, critical } = timer.combo; timer.combo = undefined;
    const mark = run.enemies.find(enemy => enemy.id === timer.aim && enemy.hp > 0 && distance(enemy, unit) < reach + strikeSlack);
    if (!mark) return;
    effects.push({ kind: "swing", x: mark.x, y: mark.y, fromX: unit.x, fromY: unit.y, value: 0, by: "general", squad: squad.id, index, critical, label: "combo" });
    damage(run, mark, amount, effects, squad.id, critical, false, "melee", index);
    knock(run, mark, unit, arms.knock);
    if (own) reachLine(run, { squad, unit, index, target: mark, amount, critical, reach: own, attack: "melee", effects });
    return;
  }
  const target = run.enemies.find(enemy => enemy.id === timer.aim && enemy.hp > 0 && distance(enemy, unit) < reach + strikeSlack) ?? pick(run, unit, reach + strikeSlack);
  if (leader && target) timer.aim = target.id;
  if (!target) return;
  if (personalBow) {
    if (squad.general === "이순신" && distance(target, unit) <= ARMS.general.reach) arms = special ? ARMS.general : basicBlade;
    if (!special) unit.basicAttack = arms.shot === "arrow" ? "arrow" : "melee";
  }
  const attackEvent = { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false };
  const handledBefore = { spells: run.bph?.fx.spells.length ?? 0, actors: run.bph?.fx.actors.length ?? 0 };
  if (attackHooks) dispatchBphEffects(run, { kind: "before-attack", unit, target, attack: attackEvent });
  if (attackEvent.handled) {
    const amount = chaosHandledPower(run, unit, handledBefore);
    if (amount !== null) {
      chaosAfterAttack(run, { unit, target, amount }, effects);
      chaosVolley(run, { squad, unit, index, target, amount, critical: false, reach });
    }
    if ((run.bph?.fx.spells.length ?? 0) > handledBefore.spells ||
      (run.bph?.fx.actors.length ?? 0) > handledBefore.actors)
      dispatchBphEffects(run, { kind: "after-attack", unit, target });
    return;
  }
  const critical = random(run) < (profileArms?.critChance ?? BALANCE.critical), by: Striker = leader ? "general" : unit.kind as SoldierKind;
  const amount = profile ? arms.power * BPH_SCALE.damage * (critical ? profileArms?.critDamage ?? 1 : 1) * attackEvent.multiplier
    : attackEvent.multiplier * might(run) * arms.power * (leader ? 1 + GENERAL_GROWTH.basic * (unit.tier - 1) : 3 ** (unit.tier - 1)) * (critical ? 2 : 1)
    * (leader ? (run.meta.heroBasic ?? 1) * (run.meta.generalMastery?.includes(squad.general) ? 1.2 : 1)
      * generalUpgradeMultiplier(run.meta.generalUpgrades, squad.general, "attack")
      * (run.bph?.survival ? BPH_SURVIVAL_TABLE.generalBasic
        * (1 + BPH_SURVIVAL_TABLE.generalBasicGrowth * (Math.max(0, reachLevel(run) - 1) + 4 * Math.min(1, Math.max(0, (10 - reachLevel(run)) / 5)))) : 1)
      : bonus.power * (run.meta.classDamage?.[kind] ?? 1) * (kind === "panokseon" ? run.meta.navalPower ?? 1 : 1) * (1 + BALANCE.drillPower * run.drill[kind]));
  // Native martial families (Shotgun fan, Rider piercer, Duelist leap, Barbarian
  // cone, fisher melee) replace the damage/shot branch with their own actors;
  // attack accounting and after-attack effects still run once.
  const martialCtx = run.bph && attackHooks ? bphFxContext(run) : undefined;
  if (martialCtx && martialResolvedAttack(martialCtx, { unit, target, amount, critical,
      extraProjectiles: attackEvent.extraProjectiles, bounces: attackEvent.bounces,
      ...(run.chaos && chaosActive(run) ? { attackId: run.chaos.attacks + 1 } : {}) })) {
    // The native cone applies damage here without going through the ordinary melee release below.
    if (profile?.id === "Hero1_Barbarian") effects.push({ kind: "swing", x: target.x, y: target.y,
      fromX: unit.x, fromY: unit.y, value: arms.span, by, squad: squad.id, index, critical, target: target.id });
    chaosAfterAttack(run, { unit, target, amount }, effects);
    if (arms.shot) chaosVolley(run, { squad, unit, index, target, amount, critical, reach });
    dispatchBphEffects(run, { kind: "after-attack", unit, target });
    return;
  }
  if (arms.shot === "arrow") {
    const targets = tactic.storm ? [target, ...run.enemies.filter(enemy => enemy.hp > 0 && enemy.id !== target.id && distance(enemy, target) < 70).slice(0, 2)]
      : own?.shape === "arrows" ? arrowFan(run, unit, target, own, reach + strikeSlack) : [target];
    const marks = [...targets, ...Array.from({ length: (leader ? 0 : run.meta.classExtra?.archer ?? 0) + attackEvent.extraProjectiles }, () => target)];
    for (const [ordinal, mark] of marks.entries()) {
      launch(run, "arrow", personalBow ? { x: unit.x, y: unit.y - 6 } : unit, mark, mark.id, amount, critical, squad.id, 0, unit.tier);
      const shot = run.shots.at(-1);
      if (shot) { shot.unitIndex = index; shot.pierce += tactic.epic ? 1 : 0;
        shot.bounces = attackEvent.bounces; shot.bounceRange = arms.reach; shot.hitIds = [];
        shot.stun = tactic.guard ? .65 : 0; shot.source = by; shot.flaming ||= Boolean(run.meta.archerFire);
        if (run.chaos && ordinal >= targets.length) shot.procDepth = 1;
        if (special || !leader) chaosArrow(run, shot); }
    }
  }
  else if (arms.shot === "rocket") {
  const count = (profile ? 1 : arms.cleave + (tactic.storm ? 2 : 0) + (run.meta.classExtra?.[kind] ?? 0)) + attackEvent.extraProjectiles;
  // 권율's volley (owner DM 1794962815): each rocket flies at a different enemy, the struck one first, then the nearest others
  // in reach; with fewer enemies than rockets the leftovers go round again, so a lone enemy or boss still takes the whole volley.
  const volley = leader && !profile && squad.general === "권율";
  const marks = volley ? [target, ...run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && enemy.id !== target.id && distance(enemy, unit) < reach + strikeSlack)
    .sort((a, b) => distance(a, unit) - distance(b, unit) || a.id - b.id).slice(0, count - 1)] : [];
  for (let i = 0; i < count; i++) {
    const mark = marks[i % Math.max(1, marks.length)];
    if (volley && mark) launch(run, "rocket", unit, mark, mark.id, amount, critical, squad.id, 0, unit.tier);
    else {
    const spread = (i - (count - 1) / 2) * 20, gap = Math.max(1, distance(target, unit));
    launch(run, "rocket", unit, { x: target.x - (target.y - unit.y) / gap * spread, y: target.y + (target.x - unit.x) / gap * spread }, 0, amount, critical, squad.id, arms.span * (run.powder ? 1.5 : 1) * (tactic.epic ? 1.35 : 1) * (tactic.guard ? 1.6 : 1), unit.tier);
    }
    const shot = run.shots.at(-1);
    if (shot && volley) { shot.single = true; shot.retargetRange = 60; shot.hitIds = []; }
    if (shot) { shot.unitIndex = index; shot.stun = tactic.guard ? .8 : 0; shot.naval = kind === "panokseon"; shot.source = by; if (kind === "hwacha") shot.splash *= run.meta.hwachaRadius ?? 1;
      if (run.chaos && i >= count - attackEvent.extraProjectiles) shot.procDepth = 1; }
  }
  }
  const lance = own?.shape === "lance";
  const cavalryTarget = kind === "ming_cavalry" ? { target: target.id } : {};
  if (arms.shot) { effects.push({ kind: "shot", x: target.x, y: target.y, fromX: unit.x, fromY: unit.y, value: 0, by, squad: squad.id, index, ...cavalryTarget, ...(lance ? { label: "lance" } : {}) });
    if (lance && own) reachLine(run, { squad, unit, index, target, amount, critical, reach: own, attack: "arrow", effects });
    if (attackHooks) {
      chaosAfterAttack(run, { unit, target, amount }, effects);
      chaosVolley(run, { squad, unit, index, target, amount, critical, reach });
      dispatchBphEffects(run, { kind: "after-attack", unit, target });
    }
    return; }
  effects.push({ kind: "swing", x: target.x, y: target.y, fromX: unit.x, fromY: unit.y, value: arms.span, by, squad: squad.id, index, critical, ...cavalryTarget, ...(strike ? { label: strike } : lance ? { label: "lance" } : {}) });
  const span = arms.span + (!profile && !leader && tactic.storm ? 44 : 0);
  const cleave = arms.cleave + (!profile && !leader && tactic.epic ? 2 : 0) + (!profile && !leader && tactic.storm ? 6 : 0) + (profile || leader ? 0 : run.meta.classExtra?.[kind] ?? 0);
  if (!leader && tactic.storm && kind === "monk") effects.push({ kind: "blast", x: target.x, y: target.y, value: span / 26, by: kind });
  const struck = strike && own ? strikeMarks(run, strike, unit, target, own) : cleave > 1 ? run.enemies.filter(enemy => enemy.hp > 0
    && (!profile || distance(enemy, unit) < reach + strikeSlack) && distance(enemy, target) < span)
    .sort((a, b) => distance(a, target) - distance(b, target)).slice(0, cleave) : [target];
  if (strike === "lunge" && !target.ladder) {
    // 신립 closes the distance: he ends the dash just past the enemy he struck.
    const gap = Math.max(1, distance(target, unit)), travel = Math.min(arms.reach, gap + STRIKE_TIMING.lungePast);
    unit.x += (target.x - unit.x) / gap * travel; unit.y += (target.y - unit.y) / gap * travel;
  }
  let total = 0;
  for (const enemy of struck) {
    total += damage(run, enemy, amount, effects, squad.id, critical, struck.length > 1, "melee", index);
    knock(run, enemy, unit, arms.knock * (!leader && tactic.guard && kind === "spearman" ? 2 : 1));
    const stun = arms.stun + (!leader && tactic.epic && kind === "monk" ? .3 : 0) + (!leader && tactic.guard && kind === "spearman" ? .6 : 0);
    if (stun && !enemy.ladder) stagger(run, enemy, stun, effects);
  }
  if (!leader && tactic.guard && kind === "monk") for (const mate of run.squads) for (const ally of units(mate))
    if (fit(ally, run.time) && distance(unit, ally) < 90) ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * .04);
  if (struck.length > 1) effects.push({ kind: "total", x: target.x, y: target.y, value: Math.round(total), critical, count: struck.length });
  if (run.bph && leader && !special && target.hp <= 0) {
    squad.targetX = squad.x; squad.targetY = squad.y;
  }
  if ((strike === "combo" || lance) && own) reachLine(run, { squad, unit, index, target, amount, critical, reach: own, attack: "melee", effects });
  if (strike === "combo") {
    timer.combo = { amount, critical }; timer.strikeAt = run.time + STRIKE_TIMING.comboGap;
    effects.push({ kind: "windup", x: target.x, y: target.y, value: STRIKE_TIMING.comboGap, squad: squad.id, index });
  }
  if (attackHooks) {
    chaosAfterAttack(run, { unit, target, amount }, effects);
    dispatchBphEffects(run, { kind: "after-attack", unit, target });
  }
}
/** Who a blade/staff general's special strikes: always the target, then the nearest others his pattern covers. */
function strikeMarks(run: Run, strike: GeneralStrike, unit: Unit, target: Enemy, reach: Reach): Enemy[] {
  if (strike === "combo") return [target];
  if (strike === "lunge") return [target, ...lineMarks(run, unit, target, reach.length, reach.width)].slice(0, reach.targets);
  const gap = Math.max(1, distance(target, unit)), ux = (target.x - unit.x) / gap, uy = (target.y - unit.y) / gap, fan = Math.cos(reach.width * Math.PI / 180);
  const covered = run.enemies.filter(enemy => {
    if (enemy.hp <= 0 || enemy.kind === "ship" || enemy.id === target.id) return false;
    const dx = enemy.x - unit.x, dy = enemy.y - unit.y, far = Math.hypot(dx, dy);
    return far < reach.length && (strike === "spin" || dx * ux + dy * uy >= far * fan);
  }).sort((a, b) => distance(a, unit) - distance(b, unit) || a.id - b.id);
  return [target, ...covered].slice(0, reach.targets);
}
/** The other enemies on the line from the general through the target and `past` px beyond it, within `half` px of it, nearest first. */
function lineMarks(run: Run, unit: Unit, target: Enemy, past: number, half: number): Enemy[] {
  const gap = Math.max(1, distance(target, unit)), ux = (target.x - unit.x) / gap, uy = (target.y - unit.y) / gap;
  return run.enemies.filter(enemy => {
    if (enemy.hp <= 0 || enemy.kind === "ship" || enemy.id === target.id) return false;
    const dx = enemy.x - unit.x, dy = enemy.y - unit.y, along = dx * ux + dy * uy;
    return along > 0 && along < gap + past && Math.abs(dx * uy - dy * ux) < half;
  }).sort((a, b) => distance(a, unit) - distance(b, unit) || a.id - b.id);
}
/** 황진's slash streak (each cut, the struck enemy spared) and 이순신's lance (the struck enemy too) run down the line past the target. */
function reachLine(run: Run, hit: { squad: Squad; unit: Unit; index: number; target: Enemy; amount: number; critical: boolean; reach: Reach; attack: "melee" | "arrow"; effects: Effect[] }): void {
  const { reach, target } = hit, beyond = lineMarks(run, hit.unit, target, reach.length, reach.width);
  const marks = reach.shape === "lance" ? [target, ...beyond].slice(0, reach.targets) : beyond.slice(0, reach.targets);
  for (const enemy of marks) {
    damage(run, enemy, hit.amount * reach.ratio, hit.effects, hit.squad.id, hit.critical, true, hit.attack, hit.index);
    // The struck enemy already took the blow's own push.
    if (enemy !== target) knock(run, enemy, hit.unit, 6);
  }
}
/** 곽재우's arrows: the struck enemy, then one arrow each at the nearest others inside his fan; no enemy takes two. */
function arrowFan(run: Run, unit: Unit, target: Enemy, reach: Reach, range: number): Enemy[] {
  const aim = Math.atan2(target.y - unit.y, target.x - unit.x), half = reach.width * Math.PI / 180;
  return [target, ...run.enemies.filter(enemy => {
    if (enemy.hp <= 0 || enemy.kind === "ship" || enemy.id === target.id || distance(enemy, unit) >= range) return false;
    const turn = Math.atan2(enemy.y - unit.y, enemy.x - unit.x) - aim;
    return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) <= half;
  }).sort((a, b) => distance(a, unit) - distance(b, unit) || a.id - b.id)].slice(0, reach.targets);
}
function threats(run: Run): Enemy[] {
  const wall = fortRect(run.fort);
  const guarded = (e: Enemy) => run.squads.some(s => fielded(s) && distance(e, s) < BALANCE.guardRadius);
  const remaining = (e: Enemy) => Math.hypot(e.goalX - e.x, e.goalY - e.y);
  return run.enemies.filter(e => e.hp > 0 && e.kind !== "ship" && enemyInCombatField(run, e) && gapToRect(wall, e) < BALANCE.weaponRange)
    .map(e => ({ e, guarded: guarded(e), remaining: remaining(e) }))
    .sort((a, b) => Number(b.e.boss) - Number(a.e.boss) || Number(a.guarded) - Number(b.guarded) || a.remaining - b.remaining || a.e.id - b.e.id)
    .map(entry => entry.e);
}
function bombard(run: Run, effects: Effect[]): void {
  const slots = weaponSlots(run.fort).filter(slot => cornerOpen(run, slot));
  if (run.arrowClock <= 0) {
    const fast = run.evolutions.includes("arrow"), marks = threats(run);
    run.arrowClock += fast ? ATTACK_INTERVALS.fast : ATTACK_INTERVALS.basic;
    let turn = 0;
    for (const slot of slots) if (slot.kind === "arrow") for (let i = 0; i < (fast ? 1 : run.arrow) && marks.length; i++) {
      const target = marks[turn++ % marks.length], critical = random(run) < BALANCE.critical, from = { x: slot.x, y: slot.y - 16 };
      run.metrics.weaponShots.arrow++;
      launch(run, "arrow", from, target, target.id, might(run) * BALANCE.arrowPower * (critical ? 2 : 1), critical, "weapon");
      effects.push({ kind: "shot", x: target.x, y: target.y, fromX: from.x, fromY: from.y, value: 0 });
    }
  }
  if (run.hwachaClock <= 0) {
    const evolved = run.evolutions.includes("hwacha"), marks = threats(run), centers: Enemy[] = [];
    run.hwachaClock += evolved ? ATTACK_INTERVALS.rapid : ATTACK_INTERVALS.salvo;
    const wanted = slots.filter(slot => slot.kind === "hwacha").length * run.hwacha;
    for (const candidate of marks) {
      if (centers.length === wanted) break;
      if (centers.every(center => distance(center, candidate) > 40)) centers.push(candidate);
    }
    centers.forEach((target, turn) => {
      const slot = slots.filter(s => s.kind === "hwacha")[turn % (wanted / run.hwacha)], from = { x: slot.x, y: slot.y - 16 };
      run.metrics.weaponShots.hwacha++;
      launch(run, "rocket", from, target, 0, might(run) * BALANCE.rocketPower, false, "weapon", 26 * (run.powder ? 1.5 : 1) * (evolved ? 1.4 : 1));
      effects.push({ kind: "shot", x: target.x, y: target.y, fromX: from.x, fromY: from.y, value: 1 });
    });
  }
}
/** A transport is shot where it is drawn (its side-on approach), everything else where it stands. */
const seenAt = (enemy: Enemy): Point => enemy.cargo ? transportView(enemy) : enemy;
/** The deck cannon's mark: a laden transport still on the water, the one nearest landing first; else the land enemy nearest the castle. */
function navalMark(run: Run, ship: Unit): Enemy | undefined {
  const transport = run.enemies.filter(enemy => enemy.hp > 0 && onBattlefield(enemy) && (enemy.cargo?.length ?? 0) > 0 && distance(seenAt(enemy), ship) <= NAVAL_GUN.reach)
    .sort((a, b) => a.y - b.y || a.id - b.id)[0];
  if (transport) return transport;
  const wall = fortRect(run.fort), shore = riverBank();
  return run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && enemyInCombatField(run, enemy) && enemy.y <= shore && distance(enemy, ship) <= NAVAL_GUN.reach)
    .sort((a, b) => gapToRect(wall, a) - gapToRect(wall, b) || a.id - b.id)[0];
}
/** Every panokseon's deck cannon uses a separate reload clock from its profile attack. */
function navalGun(run: Run, squad: Squad, ship: Unit, index: number, effects: Effect[]): void {
  if (!fit(ship, run.time)) return;
  const every = NAVAL_GUN.every / (1 + (ship.bph ? bphFieldCommand(run, "panokseon")?.attackSpeed ?? 0 : 0));
  const slot = run.squads.flatMap(mate => mate.soldiers).filter(unit => unit.kind === "panokseon").indexOf(ship);
  ship.gunAt ??= run.time + every * (.5 + .25 * slot);
  if (run.time < ship.gunAt) return;
  const mark = navalMark(run, ship);
  if (!mark) return;
  ship.gunAt = run.time + every;
  const amount = (run.bph ? NAVAL_GUN.power : ARMS.panokseon.power * might(run)) * (run.meta.navalPower ?? 1), seen = seenAt(mark);
  run.shots.push({ id: run.nextId++, kind: "shell", x: ship.x, y: ship.y, toX: mark.x, toY: mark.y, speed: NAVAL_GUN.speed,
    target: mark.cargo ? mark.id : 0, prey: null, damage: amount, critical: false, by: squad.id, splash: NAVAL_GUN.splash, pierce: 0, from: 0,
    naval: true, source: "panokseon", unitIndex: index, lob: { x: ship.x, y: ship.y, height: NAVAL_GUN.arc } });
  effects.push({ kind: "shot", x: seen.x, y: seen.y, fromX: ship.x, fromY: ship.y, value: 1, by: "panokseon", squad: squad.id, index });
}
/** A shell striking a transport hits the hull where it is drawn; any other shell bursts where it falls. */
function shellLands(run: Run, shot: Shot, quarry: Enemy | undefined, effects: Effect[]): void {
  if (quarry?.cargo) {
    const at = transportView(quarry);
    effects.push({ kind: "blast", x: at.x, y: at.y, value: shot.splash / 26, by: "panokseon" });
    damage(run, quarry, shot.damage, effects, shot.by, false, false, "artillery", shot.unitIndex ?? -1, true, "panokseon", false, undefined, false, undefined, undefined, 0, undefined, shot);
    return;
  }
  const first = effects.length;
  burst(run, shot, shot.splash, shot.damage, shot.by, effects, false, 0, 1, true, "panokseon", shot.unitIndex, 0, shot);
  const blast = effects[first];
  if (blast?.kind === "blast") blast.by = "panokseon";
}
function fly(run: Run, dt: number, effects: Effect[]): void {
  const alive = new Map<number, Enemy>();
  for (const enemy of run.enemies) if (enemy.hp > 0) alive.set(enemy.id, enemy);
  for (const shot of run.shots) {
    if (shot.fanDistance && shot.fanAngle !== undefined) {
      const step = Math.min(shot.fanDistance, shot.speed * dt);
      shot.x += Math.cos(shot.fanAngle) * step; shot.y += Math.sin(shot.fanAngle) * step;
      shot.fanDistance -= step;
      continue;
    }
    let quarry = shot.target ? alive.get(shot.target) : undefined;
    const unit = shot.prey ? unitAt(run, shot.prey) : undefined;
    if ((shot.kind === "arrow" || shot.single) && shot.retargetRange && (!quarry || quarry.hp <= 0)) {
      const range = shot.retargetRange;
      quarry = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship"
        && !shot.hitIds?.includes(enemy.id) && distance(enemy, shot) <= range)
        .sort((a, b) => distance(a, shot) - distance(b, shot) || a.id - b.id)[0];
      if (quarry) shot.target = quarry.id;
    }
    if (quarry) { shot.toX = quarry.x; shot.toY = quarry.y; } else if (unit) { shot.toX = unit.x; shot.toY = unit.y; }
    const gap = Math.hypot(shot.toX - shot.x, shot.toY - shot.y), step = shot.speed * dt, origin = { x: shot.x, y: shot.y };
    if (gap > step) { shot.x += (shot.toX - shot.x) / gap * step; shot.y += (shot.toY - shot.y) / gap * step; continue; }
    shot.x = shot.toX; shot.y = shot.toY; shot.speed = 0;
    if (shot.kind === "bullet") { if (shot.prey) hurt(run, run.squads[shot.prey[0]], shot.prey[1], shot.damage, effects, alive.get(shot.from)); }
    else if (shot.kind === "shell") shellLands(run, shot, quarry, effects);
    else if (shot.kind === "rocket" && shot.single) {
      effects.push({ kind: "blast", x: shot.x, y: shot.y, value: .6 * (1 + .35 * ((shot.tier ?? 1) - 1)) });
      if (quarry) {
        const dealt = damage(run, quarry, shot.damage, effects, shot.by, shot.critical, true, "artillery", shot.unitIndex ?? -1, false, shot.source, false, undefined, true, undefined, undefined, shot.procDepth, undefined, shot);
        knock(run, quarry, shot, 6);
        if (shot.stun && !quarry.ladder) stagger(run, quarry, shot.stun, effects);
        if (run.fire) quarry.burn = 3;
        effects.push({ kind: "total", x: shot.x, y: shot.y, value: Math.round(dealt), critical: shot.critical, count: 1 });
      }
    }
    else if (shot.kind === "rocket") burst(run, shot, shot.splash, shot.damage, shot.by, effects, shot.critical, shot.stun, shot.tier, shot.naval, shot.source, shot.unitIndex, shot.procDepth, shot);
    else if (quarry) {
      damage(run, quarry, shot.damage, effects, shot.by, shot.critical, shot.chaosDamage ?? false, shot.attack ?? "arrow", shot.unitIndex ?? -1, false, shot.source, shot.chaosDamage ?? false, shot.chaosDamage ? "chaos:arrow" : undefined, shot.flaming, origin, undefined, shot.procDepth, undefined, shot); knock(run, quarry, origin, 4);
      if (shot.flaming && run.meta.archerFire && shot.source === "archer") quarry.burn = Math.max(quarry.burn, 3);
      if (shot.stun && !quarry.ladder) stagger(run, quarry, shot.stun, effects);
      if (!run.bph) {
        const next = shot.pierce > 0 ? run.enemies.filter(e => e.hp > 0 && e.id !== quarry.id
          && distance(e, quarry) < 46).sort((a, b) => distance(a, quarry) - distance(b, quarry))[0] : undefined;
        if (next) { shot.pierce--; shot.target = next.id; shot.speed = 340; }
        continue;
      }
      const visited = shot.hitIds ??= [];
      visited.push(quarry.id);
      const dx = quarry.x - origin.x, dy = quarry.y - origin.y, length = Math.max(.001, Math.hypot(dx, dy));
      const candidates = run.enemies.filter(e => e.hp > 0 && e.kind !== "ship" && !visited.includes(e.id));
      const straight = shot.pierce > 0 || (shot.chaosPierce ?? 0) > 0 ? candidates.filter(e =>
        (e.x - quarry.x) * dx + (e.y - quarry.y) * dy > 0
        && Math.abs((e.x - quarry.x) * dy - (e.y - quarry.y) * dx) / length <= 8 + enemyHitPadding(e)
        && distance(e, quarry) < 46).sort((a, b) => distance(a, quarry) - distance(b, quarry))[0] : undefined;
      const nativePiercing = shot.pierce > 0 ? straight : undefined;
      const armyPiercing = !nativePiercing && (shot.chaosPierce ?? 0) > 0
        ? straight ?? candidates.filter(enemy => distance(enemy, quarry) <= (shot.chaosPierceRange ?? 0))
          .sort((a, b) => distance(a, quarry) - distance(b, quarry) || a.id - b.id)[0] : undefined;
      const piercing = nativePiercing ?? armyPiercing;
      const bouncing = !piercing && (shot.bounces ?? 0) > 0 ? candidates
        .filter(e => distance(e, quarry) <= (shot.bounceRange ?? BPH_WORLD_TO_PX))
        .sort((a, b) => distance(a, quarry) - distance(b, quarry))[0] : undefined;
      const next = piercing ?? bouncing;
      if (next) {
        if (piercing) {
          if (nativePiercing) shot.pierce--;
          else {
            shot.chaosPierce = (shot.chaosPierce ?? 0) - 1;
            shot.damage = shot.chaosPierceDamage ?? shot.damage;
            shot.chaosDamage = true;
          }
        } else {
          shot.bounces = (shot.bounces ?? 0) - 1;
        }
        if (!armyPiercing && shot.nativeDamage !== undefined) {
          shot.damage = shot.nativeDamage;
          shot.chaosDamage = false;
        }
        if (run.chaos) shot.procDepth = (shot.procDepth ?? 0) + 1;
        shot.target = next.id; shot.toX = next.x; shot.toY = next.y; shot.speed = 340;
      }
    }
  }
  run.shots = run.shots.filter(shot => shot.speed > 0);
}
function schedule(run: Run, effects: Effect[]): void {
  if (run.bph) return;
  const minute = Math.floor(run.time / 60);
  if (minute !== run.enemyMinute) {
    run.enemyMinute = minute;
    const kind = ROTATION[minute % ROTATION.length];
    run.metrics.enemyChanges.push({ time: run.time, kind });
    recordEvent(run, effects, `적 교대 · ${{ yari: "창병", teppo: "조총병", samurai: "무사", cavalry: "기병", guard: "호위병" }[kind]}`, true);
  }
  const shift = Math.floor((run.time + ASSAULT_WARNING) / ASSAULT_PERIOD);
  if (shift > run.assaultWarned) {
    run.assaultWarned = shift; run.metrics.assaultShifts++;
    const side = run.assaultOrder[shift % run.assaultOrder.length], from = guardPoint(2, side, 400);
    effects.push({ kind: "assault", x: clamp(from.x, 0, WIDTH), y: clamp(from.y, 0, HEIGHT), value: ASSAULT_WARNING, side });
  }
  if (!run.warnedWave && (run.endless || run.nextWave <= SIEGE_EVERY * 2) && run.time >= run.nextWave - 10) {
    run.warnedWave = true; run.metrics.waveWarnings.push(run.time);
    recordEvent(run, effects, "10초 뒤 사방 포위", false, true);
  }
  if (run.fort < 2 && run.time >= (run.fort + 1) * SIEGE_EVERY) {
    run.fort++;
    recordEvent(run, effects, "포위");
    effects.push({ kind: "expand", x: CENTER.x, y: CENTER.y, value: run.fort });
  }
  if (run.time >= run.nextRiverWave && !run.rout) {
    SHIP_ART.forEach((shipArt, index) => {
      const ship = spawn(run, false, false, undefined, false, "좌");
      ship.direction = "아래";
      ship.kind = "ship"; ship.shipArt = shipArt; ship.shielded = false;
      ship.hp = ship.maxHp = BALANCE.enemyHp * toughness(run.time) * 3;
      ship.x = WIDTH * (index ? .7 : .3); ship.y = riverLane(); ship.speed = 12;
      ship.appearedAt = run.time; ship.expiresAt = run.time + RIVER_SECONDS; ship.skillClock = 3 + index;
      ship.goalX = ship.x; ship.goalY = fortRect(run.fort).bottom;
    });
    run.nextRiverWave += RIVER_EVERY;
    recordEvent(run, effects, "강변 함대", false, true);
    effects.push({ kind: "wave", x: CENTER.x, y: riverLane(), value: 1 });
  }
  if ((run.endless || run.nextWave <= SIEGE_EVERY * 2) && run.time >= run.nextWave) {
    run.waveUntil = run.time + 25; run.metrics.waves.push(run.time);
    for (let i = 0, count = Math.min(48, 220 - enemyCount(run)); i < count; i++) {
      const enemy = spawn(run, false, false, undefined, false, SIDES[i % 4], 0, true);
      enemy.wave = true; enemy.kind = "samurai"; enemy.shielded = false; enemy.hp = enemy.maxHp = BALANCE.enemyHp * toughness(run.time) * 1.6 * (1 + run.curses * .12);
      enemy.speed = BALANCE.enemySpeed * (1 + run.time / 1200);
      const start = edgePoint(enemy.direction, (Math.floor(i / 4) + .5) / 12);
      placeEnemyOutside(run, enemy, start, start); retarget(run, enemy);
    }
    for (const boat of run.enemies) if (boat.cargo && boat.wave) boat.sailing = true;
    recordEvent(run, effects, "사방 포위!", false, true);
    effects.push({ kind: "wave", x: CENTER.x, y: CENTER.y, value: 2 });
    run.nextWave += SIEGE_EVERY; run.warnedWave = false;
  }
  if (run.waveUntil > 0 && run.time >= run.waveUntil) {
    run.waveUntil = 0;
    const gate = guardPoint(run.fort, "아래", 26);
    run.chests.push({ id: run.nextId++, x: gate.x, y: gate.y });
    recordEvent(run, effects, "포위 돌파!");
  }
  if (run.time >= run.nextElite && !run.rout) { spawn(run, true); recordEvent(run, effects, "정예 출현", true, true); run.nextElite += BALANCE.eliteEvery; }
  if (run.time >= run.nextBoss && (run.nextBoss <= BOSS_EVERY * 4 || run.endless)) {
    const pattern = run.bossOrder[(Math.round(run.nextBoss / BOSS_EVERY) - 1) % 4];
    const boss = spawn(run, false, true, pattern), art = run.bossRoster[(Math.round(run.nextBoss / BOSS_EVERY) - 1) % 4];
    boss.bossArt = art; boss.appearedAt = run.time;
    run.metrics.bosses.push({ art, final: false, appeared: run.time, fallen: null, phase2: null, dealt: 0 });
    effects.push({ kind: "boss-enter", x: boss.x, y: boss.y, value: 2, target: boss.id });
    recordEvent(run, effects, "중간 보스", false, true);
    run.nextBoss += BOSS_EVERY;
  }
  if (run.time >= FINAL_BOSS_AT - 10 && !run.bossWarned && !run.bossSpawned) {
    run.bossWarned = true;
    const side = assaultSide(run, FINAL_BOSS_AT), from = guardPoint(2, side, 400), label = `10초 뒤 ${SIDE_NAMES[side]} 총대장`;
    recordEvent(run, effects, label, false, true);
    effects.push({ kind: "assault", x: clamp(from.x, 0, WIDTH), y: clamp(from.y, 0, HEIGHT), value: 10, side, label });
  }
  if (run.time >= FINAL_BOSS_AT && !run.bossSpawned) {
    const art = run.bossRoster[4], boss = spawn(run, false, true, BOSSES[art].pattern, true);
    boss.bossArt = art; boss.appearedAt = run.time; run.bossSpawned = true;
    run.metrics.bosses.push({ art, final: true, appeared: run.time, fallen: null, phase2: null, dealt: 0 });
    effects.push({ kind: "boss-enter", x: boss.x, y: boss.y, value: 3, target: boss.id });
    for (let i = 0, count = Math.min(35, 220 - enemyCount(run)); i < count; i++) spawn(run, false, false, undefined, false, assaultSide(run));
    recordEvent(run, effects, "총대장!", false, true);
  }
}
function updateMetrics(run: Run, effects: Effect[]): void {
  const quiet = run.time - run.metrics.lastEffectAt;
  run.metrics.maxQuietSeconds = Math.max(run.metrics.maxQuietSeconds, quiet);
  if (effects.some(e => e.kind !== "event")) {
    run.metrics.lastEffectAt = run.time; run.metrics.quietOpen = false;
  } else if (quiet > 3 && !run.metrics.quietOpen) { run.metrics.quietSegments++; run.metrics.quietOpen = true; }
  run.metrics.effects += effects.length;
  run.metrics.maxEventGap = Math.max(run.metrics.maxEventGap, run.time - (run.metrics.eventTimes.at(-1) ?? 0));
  run.metrics.minWallRatio = Math.min(run.metrics.minWallRatio, run.wall / run.maxWall);
  if (run.time >= run.metrics.density.length * 10) {
    const directions = { 위: 0, 좌: 0, 우: 0, 아래: 0 };
    for (const e of run.enemies) directions[e.direction]++;
    run.metrics.density.push({ time: run.time, count: run.enemies.length, wall: Math.round(run.wall), directions });
  }
}
export function advance(run: Run, elapsed: number): Effect[] {
  if (run.phase !== "playing" && run.phase !== "choice") return [];
  if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 0.1) throw new Error("전투 시간 간격 범위를 벗어났습니다.");
  const dt = bphSurvivalStep(run, elapsed);
  const effects: Effect[] = [];
  chaosState(run);
  run.time += dt;
  advanceSurvivalGeneralLevel(run);
  // Separation judges engagement against where each enemy stood when this step began.
  const startedAt = new Map(run.enemies.map(enemy => [enemy.id, { x: enemy.x, y: enemy.y }]));
  dispatchBphEffects(run, { kind: "step", dt });
  landBphArrivals(run);
  expireBphCrates(run);
  tickBphBarracks(run);
  if (run.roulette && (run.roulette.remaining -= dt) <= 0) effects.push(...settle(run));
  if (!run.bph) run.xp += dt * (run.level <= 2 ? 1 : BALANCE.passiveXp);
  spawnBphSurvival(run, { dt, effects }, entry => spawn(run, entry.elite ?? false, entry.boss,
    entry.bossId ? BOSSES[entry.bossId].pattern : undefined, false, entry.side ?? (entry.rush ? "위" : undefined),
    entry.march ?? 0));
  schedule(run, effects);
  for (const squad of run.squads) if (squad.state !== "down")
    squad.skillClock = Math.max(0, squad.skillClock - dt * run.meta.skillCharge);
  run.riftClock = Math.max(0, run.riftClock - dt);
  run.arrowClock = Math.max(-.1, run.arrowClock - dt); run.hwachaClock = Math.max(-.1, run.hwachaClock - dt);
  if ((run.commandClock -= dt) <= 0) { run.commandClock = .25; command(run, effects); }
  tend(run, dt, effects);
  tickChaos(run, dt, effects);
  tickChaosSkills(run, dt, effects);
  tickUniqueSkills(run, effects, (enemy, amount, from) => {
    damage(run, enemy, amount, effects, "skill", false, true, "skill", -1, false, undefined, false, undefined, false, from);
  });
  raid(run, dt, effects);
  for (const mark of [...run.telegraphs]) if (run.time >= mark.at) land(run, mark, effects);
  run.telegraphs = run.telegraphs.filter(mark => mark.at > run.time);
  // Echo knockback belongs to combat, after fighters choose and walk their route.
  for (const echo of run.echoes) if (run.time >= echo.at) {
    const aim = volleyAim(run); if (aim) volley(run, run.squads[echo.squad], aim, effects, echo.growth);
  }
  run.echoes = run.echoes.filter(echo => echo.at > run.time);
  for (const squad of run.squads) {
    if (fielded(squad)) fight(run, squad, squad, -1, dt, effects);
    if (run.bph && fielded(squad) && generalReach(squad.general, reachLevel(run))) {
      const specialEffects: Effect[] = [];
      fight(run, squad, squad, -1, dt, specialEffects, true);
      effects.push(...specialEffects.map(effect => ({ ...effect, mechanism: "special" as const })));
    }
    squad.soldiers.forEach((unit, index) => fight(run, squad, unit, index, dt, effects));
    squad.soldiers.forEach((unit, index) => { if (unit.kind === "panokseon") navalGun(run, squad, unit, index, effects); });
  }
  if (run.enemies.length) bombard(run, effects);
  fly(run, dt, effects);
  tickBphSpells(run, dt);
  if (run.rift && run.riftClock <= 0) {
    run.riftClock = 3; effects.push({ kind: "rift", x: CENTER.x, y: CENTER.y, value: 2 });
    for (const enemy of run.enemies) if (run.squads.some(s => fielded(s) && distance(s, enemy) < BALANCE.riftRadius)) damage(run, enemy, might(run) * 4, effects, "skill", false, true);
  }
  if (run.rout) {
    const reach = (run.time - run.rout.at) * BALANCE.routPace;
    for (const enemy of run.enemies) if (enemy.hp > 0 && distance(enemy, run.rout) < reach) { enemy.hp = 0; fell(run, enemy, effects, false); }
    run.telegraphs = [];
  }
  run.enemies = run.enemies.filter(e => e.hp > 0);
  // Interior defense is permitted only while a live intruder remains. A cached
  // station (including a telegraph hold) must not keep a defender inside afterwards.
  const wall = fortRect(run.fort);
  if (!run.enemies.some(enemy => enemy.breach && contains(wall, enemy))) {
    for (const squad of run.squads) if (squad.state === "guard") {
      if (contains(wall, squad)) {
        const gate = guardPoint(run.fort, nearestGate(run.fort, squad, { x: squad.homeX, y: squad.homeY }, gatesOf(run), SQUAD_MARGIN), SQUAD_MARGIN + 1);
        squad.targetX = gate.x; squad.targetY = gate.y; squad.strikeAt = 0;
        if (squad.specialAttack) { squad.specialAttack.strikeAt = 0; squad.specialAttack.combo = undefined; }
      }
      if (contains(wall, { x: squad.targetX, y: squad.targetY })) {
        const outside = pushOut(fortRect(run.fort, SQUAD_MARGIN), { x: squad.targetX, y: squad.targetY });
        squad.targetX = outside.x; squad.targetY = outside.y;
      }
    }
  }
  for (const enemy of run.enemies) if (enemy.boss) {
    moveEnemy(run, enemy, { x: clamp(enemy.x, 48, WIDTH - 48), y: clamp(enemy.y, 88, HEIGHT - 56) });
  }
  if (!run.bph) run.spawnBudget = Math.min(8, run.spawnBudget + spawnRate(run) * dt);
  for (const density = targetDensity(run), floor = Math.floor(density * BALANCE.fieldFloor);
    !run.bph && !run.rout && enemyCount(run) < density && (run.spawnBudget >= 1 || enemyCount(run) < floor);) {
    spawn(run); run.spawnBudget = Math.max(0, run.spawnBudget - 1);
  }
  // The land/water boundary applies to every movement source, including charge and knockback.
  for (const squad of run.squads) for (const unit of units(squad)) {
    if (unit.kind !== "panokseon") unit.y = Math.min(unit.y, riverBank() - 8);
  }
  // Last, after every walk, dash, knock and bank clamp of this step.
  separateAllies(run, run.squads.flatMap(squad => squad.soldiers), startedAt);
  separateEnemies(run);
  for (const enemy of run.enemies) if (enemy.kind !== "ship" && enemy.y > riverBank() - 8)
    moveEnemy(run, enemy, { x: enemy.x, y: riverBank() - 8 });
  if (run.metrics.firstBreach === null && SIDES.some(side => run.walls[side] <= 0)) run.metrics.firstBreach = run.time;
  if (run.base <= 0) run.phase = "lost";
  else if (run.bph && bphSurvivalWon(run)) run.phase = "won";
  else if (!run.bph && !run.endless && (run.time >= DURATION || (run.rout && run.time - run.rout.at >= BALANCE.routSeconds))) {
    run.time = Math.min(run.time, DURATION); run.phase = run.finalDefeated ? "won" : "lost";
    if (run.phase === "lost") run.lossCause = "deadline";
    if (run.phase === "won") run.score += Math.round(run.wall * run.multiplier);
  }
  else if (!run.bph && !run.rout && run.phase === "playing" && run.chests.length && !run.roulette) openChest(run, effects);
  else if (!run.bph && !run.rout && run.xp >= run.nextXp) {
    run.metrics.selectionIntervals.push(run.time - run.lastChoice); run.lastChoice = run.time; run.metrics.levelTimes.push(run.time);
    run.xp = run.level <= 2 ? 0 : Math.min(run.xp - run.nextXp, levelSeconds(run.level + 1) / 2);
    run.level++; run.nextXp = levelSeconds(run.level);
    for (const squad of run.squads) for (const unit of units(squad)) {
      const grown = unit.kind === "general" ? metaGeneralHp(run, squad.general, unit.tier) : soldierHp(unit.kind, unit.tier, run.level);
      if (unit.hp > 0) unit.hp += grown - unit.maxHp;
      unit.maxHp = grown;
    }
    // An unanswered hand never blocks growth: the new level waits in the queue.
    if (run.offers.length) run.queued++;
    else { run.offers = drawCards(run); run.phase = run.offers.length ? "choice" : "playing"; if (!run.offers.length) { run.gold += 40; run.earned += 40; } }
  }
  updateMetrics(run, effects);
  if (run.phase === "won" || run.phase === "lost") {
    clearChaos(run);
    dispatchBphEffects(run, { kind: "run-ended", won: run.phase === "won" });
  }
  if (run.bph) effects.push(...run.bph.fxEvents.splice(0));
  return effects;
}

/** The three effect lanes can use native combat without importing private functions. */
export function bphEffectCombat(run: Run, output: Effect[]): Pick<BphFxContext, "random" | "chance" | "emit" | "damage" | "applyDamage" | "applyUnitDamage" | "emitEvent" | "heal" | "applyBuff" | "beginConsume" | "endConsume" | "originalClasses"> & {
  knock(enemy: Enemy, from: Point, pixels: number): void;
} {
  const applyDamage = (request: BphDamageRequest): number => {
    const source = request.source;
    const squad = source ? run.squads.find(s => s === source || s.soldiers.includes(source)) : undefined;
    const index = squad && source ? squad.soldiers.indexOf(source) : -1;
    const previousHp = Math.max(0, request.target.hp);
    const chaosEffect = request.spellId?.startsWith("chaos:") === true;
    const armyEffect = chaosEffect && !request.spellId?.startsWith("chaos:manual:");
    const rawDamage = damage(run, request.target, request.amount, output, squad?.id ?? "skill",
      request.critical ?? false, armyEffect, "skill", index, request.target.kind === "ship", source?.kind, true, request.spellId, false, chaosEffect ? request.position : undefined, request.cast, 0, request.attackId ?? request.cast?.attackId);
    const dealt = Math.min(previousHp, rawDamage);
    if (request.spellId && !chaosEffect && dealt > 0) dispatchBphEffects(run, { kind: "spellHit",
      spellId: request.spellId, source: source ?? null, target: request.target,
      position: request.position ?? { x: request.target.x, y: request.target.y }, amount: dealt,
      ...(request.cast ? { cast: request.cast } : {}) });
    return dealt;
  };
  return {
    knock: (enemy, from, pixels) => knock(run, enemy, from, pixels),
    random: () => random(run),
    chance: base => bphChance(base, bphFxContext(run)?.effects ?? []),
    emit: effect => { output.push(effect); },
    damage: (enemy, amount, source) => { applyDamage({ target: enemy, amount, source }); },
    applyDamage,
    applyUnitDamage: request => {
      const squad = run.squads.find(owner => owner === request.target || owner.soldiers.includes(request.target));
      if (squad) hurt(run, squad, squad.soldiers.indexOf(request.target), request.amount, output, request.source, false,
        { spellId: request.spellId, cast: request.cast });
    },
    emitEvent: event => dispatchBphEffects(run, event),
    applyBuff: request => applyBphBuff(run, request),
    beginConsume: (source, target) => consumeBphCorpse(run, { source, target, phase: "start" }),
    endConsume: (source, target) => consumeBphCorpse(run, { source, target, phase: "end" }),
    originalClasses: unit => bphOriginalClasses(run, unit),
    heal: (unit, amount, source) => {
      if (unit.hp <= 0) return;
      const previousHp = unit.hp;
      unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, amount));
      const actualHpRestored = unit.hp - previousHp;
      if (actualHpRestored > 0) dispatchBphEffects(run, { kind: "unit-healed",
        targetId: unit.id, sourceId: source?.id ?? null, actualHpRestored });
    },
  };
}

export function hitBphEnemy(run: Run, id: number): Effect[] {
  if (!run.bph || run.phase !== "playing") return [];
  const enemy = run.enemies.find(item => item.id === id);
  if (!enemy || enemy.kind === "ship") return [];
  const effects: Effect[] = [];
  damage(run, enemy, bphTouchDamage(run), effects, "skill");
  return effects;
}
