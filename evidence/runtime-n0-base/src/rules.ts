// allow: SIZE_OK -- Existing combat state machine; BPH account and profile logic live in separate modules.
import { allyRoute, CENTER, contains, crosses, distance, edgePoint, fieldPoint, fortRect, gapToRect, guardPoint, HEIGHT, pushOut, route, routeDistance, sideOf, SIDES, wallPoint, weaponSlots, WIDTH } from "./geometry";
import { bphArms, bphStats, bphUnitKill, BPH_SCALE } from "./bph-combat";
import type { BphBattle, BphUnit } from "./bph-combat";
import { BPH_MONSTERS, BPH_PROFILES } from "./bph-data";
import { bphEnemyStats } from "./bph-enemy-effects";
import { bphSurvivalDamageMultiplier, bphSurvivalStep, bphSurvivalWon } from "./bph-survival";
import { spawnBphSurvival } from "./bph-survival-spawn";
import { recordBphWitchDeath } from "./bph-witch-phase";
import { nextBphDamageReceipt } from "./bph-damage-receipts";
import { bphTouchDamage, tickBphSpells } from "./bph-spells";
import { castYisunsin } from "./skills-yisunsin";
import { applyBphBuff, bphChance, bphFxContext, bphOriginalClasses, consumeBphCorpse, dispatchBphEffects } from "./bph-fx-dispatch";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { recordBphProgress } from "./bph-upgrades";
import type { BphCast, BphUnitDamageRequest } from "./bph-effects-entry";
import type { BphDamageRequest, BphFxContext } from "./bph-contract";
import { wallPosts } from "./geometry";
import type { Direction, Point } from "./geometry";
import { buildings, cornerOpen, strikeFort, wallOpen } from "./fortification";
import type { Fortification } from "./fortification";
import { BOSSES, bossRoster, matchup } from "./bosses";
import type { BossId, DamageClass } from "./bosses";
import type { MetaBonuses } from "./meta";
import { ARMY_KINDS, AWAKENINGS, COOLDOWNS, GENERAL_CLASS, GENERAL_HP, GENERAL_SKILLS, GENERALS, PARTY_LIMIT, SKILL_NAMES, SOLDIERS, STYLES } from "./roster";
import type { General, SoldierKind } from "./roster";
import { growthFor } from "./skill-growth";
import type { SkillMods } from "./skill-growth";
import type { ChaosState } from "./chaos-contract";
import { CHAOS_RULES } from "./chaos-contract";
import { chaosAfterAttack, chaosAfterCast, chaosAfterReturn, chaosCastleGuard, chaosDefense, chaosDirectKill, chaosDirectMultiplier, chaosGuard, chaosMovement, chaosState, clearChaos, tickChaos } from "./chaos";
import { chaosArrow, chaosHandledPower, chaosVolley } from "./chaos-projectiles";
import { recordDefensePressure } from "./defense-pressure";
import { RIVER_FIRST_AT, RIVER_EVERY, RIVER_SECONDS, riverBank, riverLane, SHIP_ART } from "./river";
import type { ShipArt } from "./river";
export { GENERAL_CLASS, GENERALS, PARTY_LIMIT, SKILL_NAMES, SOLDIERS, STYLES } from "./roster";
export type { General, SoldierKind, Style } from "./roster";
import { classCard, freshTactics, isClassKind, LEGEND_NAMES, rarityAt } from "./cards";
import type { ClassCardId, Tactic } from "./cards";
import { synergy } from "./synergy";
import { weatherDamage, weatherEnemySpeed } from "./weather";
import { holdDongnae, militiaAim, militiaAmbush, militiaLure, tickUniqueSkills, uniqueSkillSpeed } from "./skills-unique";
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
export const GENERAL_GROWTH = { maxTier: 3, hp: .15, basic: .12, skill: .15, radius: .12 } as const;
export const growthTier = (level: number): number => level >= 10 ? 3 : level >= 5 ? 2 : 1;
const GATE_GAP = 40, RETREAT_SPEED = 150, MELEE = 18, SOLDIER_SPEED = 170, INTERRUPTING_STUN = .5;
export const BALANCE = {
  enemyHp: 70, toughness: [[0, 3.4], [120, 3.3], [200, 3.5], [320, 8.06], [400, 11.05], [480, 14.95], [560, 19.5]], eliteHp: 20, bossHp: 280, finalHp: 360,
  enemySpeed: 24, fastSpeed: 2, fastShare: .18, opening: 8, spawnBase: 6.5, spawnSpan: 40, crowdPower: 2, focusShare: .7, fieldFloor: .1,
  bite: 12, biteSpan: 300, wallBlow: 2.4, waveBlow: 7, wallBlowSpan: 60, eliteBlow: 4, bossBlow: 12, finalBlow: 20, lateLadderShare: .10, lateLadderBlow: 13,
  strike: 60, growth: .25, critical: .12, arrowPower: 1.8, rocketPower: 2, burnPower: .5,
  executionFrom: 5, executionChance: .025,
  generalHp: GENERAL_HP, hpGrowth: .12, downSeconds: 30, reviveSafe: 2, downTempo: .6,
  wall: 400, base: 350, openingBossPower: .05, openingBossHp: .17, bossPowerStep: .1, bossHpStep: .06, bossKeepBlow: .25, firstElite: 40, eliteEvery: 30, fieldBase: 100, fieldSpan: 2.5, fieldCap: 200, calmField: 8, calmUntil: 20, openField: 30, rampAt: 40, rampRate: .4, eventRefill: .5, breachAggro: 26, keepBlow: 8, breachPull: 250, breachSpread: 140,
  drillCost: 400, drillPrices: [400, 1200], drillMax: 2, drillPower: 0, drillGuard: 0, drillTempo: 0, lateHp: 1.3, coin: { boss: 60, elite: 15, foe: 1 }, soldierDown: 8, fallHurt: .35, retreatAt: .3, returnAt: .6, dodgeBelow: .5,
  regenAfter: 4, regen: .03, garrisonRegen: .02, supportRegen: 3, guardianTempo: 1.2, guardianGap: 28, supportGap: 42, wallReach: 34, retreatRegen: .06, guardGap: 64, guardRadius: 95, weaponRange: 130, stay: 8, cover: 22,
  cooldown: COOLDOWNS, firstSkill: 3, volleyRadius: 80, volleyPower: 5, shieldSeconds: 6,
  chargeReach: 230, chargeWidth: 28, chargePower: 4, chargeStun: 1.4, frenzySeconds: 8,
  passiveXp: .6, killXp: .05, routPace: 380, routSeconds: 2.6, riftRadius: 150,
};
export type Pattern = "gunner" | "cavalry" | "siege" | "ninja" | "decree";
export type Skill = Pattern | "slam" | "ram" | "salvo" | "fire" | "ladder" | "shield";
export type CardId = ClassCardId | "arrow" | "hwacha" | "quiver" | "powder" | "fire" | "curse" | "rift" | "gold40" | `recruit-${SoldierKind}` | `awaken-${General}` | `hero-${General}` | `promote-${General}`;
export const ENEMY_KINDS = ["yari", "teppo", "samurai", "ukita", "cavalry", "guard", "ship"] as const;
export type EnemyKind = typeof ENEMY_KINDS[number];
/** One fighter on the field. A squad's general is the unit with index -1, its soldiers are 0 and up. */
export type Unit = { id: number; kind: SoldierKind | "general"; tier: number; hp: number; maxHp: number; x: number; y: number; clock: number; strikeAt: number; aim: number; downUntil: number; perch?: number; emerging?: boolean; quarry?: number; bph?: BphUnit };
export type Lane = { toX: number; toY: number; homeX: number; homeY: number; back: boolean; until: number; dealt: number; stunBonus?: number };
export type Squad = Unit & {
  id: number; general: General; post: Direction; homeX: number; homeY: number; targetX: number; targetY: number; state: "guard" | "retreat" | "down" | "charge";
  soldiers: Unit[]; skillClock: number; usedAt: number; awakened: number; frenzyUntil: number; hurtAt: number; safeUntil: number; downs: number; lane: Lane | null; trampled: number[];
};
export type Enemy = {
  bphProfileId?: string;
  id: number; kind: EnemyKind; direction: Direction; x: number; y: number; hp: number; maxHp: number; speed: number;
  elite: boolean; boss: boolean; pattern?: Pattern; wave?: boolean; breach?: Direction; goalX: number; goalY: number;
  bossArt?: BossId; enraged?: boolean; shielded?: boolean; appearedAt?: number; pulled?: boolean;
  shipArt?: ShipArt; expiresAt?: number; cargo?: Enemy[]; sailing?: boolean; ladder?: boolean;
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
  id: number; kind: "arrow" | "rocket" | "bullet"; x: number; y: number; toX: number; toY: number; speed: number; target: number;
  prey: [number, number] | null; damage: number; critical: boolean; by: Source; splash: number; pierce: number; from: number; stun?: number; tier?: number; flaming?: boolean; naval?: boolean; source?: Striker;
};
export type Striker = SoldierKind | "general";
export type Effect = {
  kind: "windup" | "swing" | "shot" | "hit" | "kill" | "blast" | "total" | "lunge" | "hurt" | "block" | "down" | "rise" | "deploy" | "retreat"
    | "skill" | "interrupt" | "telegraph" | "land" | "stun" | "wall" | "event" | "merge" | "join" | "prize" | "evolution" | "rift" | "assault"
    | "wave" | "expand" | "rout" | "chest" | "coin" | "upgrade" | "boss-enter" | "rage" | "ladder" | "fall" | "devastate";
  x: number; y: number; value: number; target?: number; critical?: boolean; fromX?: number; fromY?: number; label?: string;
  side?: Direction; minor?: boolean; hostile?: boolean; by?: Striker; squad?: number; index?: number; shape?: "circle" | "lane"; count?: number;
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
const SOLDIER_HP: Record<SoldierKind, number> = { spearman: 300, monk: 240, archer: 80, hwacha: 70, ming_cavalry: 260, panokseon: 500 };
const SCOUT: Record<EnemyKind | "elite" | "siege", { aggro: number; hunt: number }> = {
  yari: { aggro: 60, hunt: 0 }, teppo: { aggro: 110, hunt: 150 }, samurai: { aggro: 60, hunt: 110 },
  cavalry: { aggro: 40, hunt: 600 }, ukita: { aggro: 40, hunt: 150 }, elite: { aggro: 60, hunt: 130 }, siege: { aggro: 24, hunt: 0 },
  guard: { aggro: 70, hunt: 100 }, ship: { aggro: 0, hunt: 0 },
};
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
export function strength(squad: Squad): number { return squad.soldiers.reduce((sum, unit) => sum + 3 ** (unit.tier - 1), 0); }
export function generalHp(general: General, level: number, tier = 1): number { return Math.round(BALANCE.generalHp[general] * (1 + BALANCE.hpGrowth * (level - 1)) * (1 + GENERAL_GROWTH.hp * (tier - 1))); }
function metaGeneralHp(run: Run, general: General, tier: number): number {
  return generalHp(general, run.level, tier) * (run.meta.heroHp ?? 1) * (run.meta.generalMastery?.includes(general) ? 1.2 : 1)
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
function spawn(run: Run, elite = false, boss = false, pattern?: Pattern, final = false, side?: Direction, march = 0, wave = false): Enemy {
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
  enemy.x += (enemy.goalX - enemy.x) * progress; enemy.y += (enemy.goalY - enemy.y) * progress;
  if (boss || final) { enemy.x = clamp(enemy.x, 48, WIDTH - 48); enemy.y = clamp(enemy.y, 88, HEIGHT - 56); }
  run.enemies.push(enemy);
  if (enemy.direction === "아래" && !elite && !boss && !final) {
    if (march > 0) enemy.y = Math.min(enemy.y, riverBank() - 8);
    else {
      run.enemies.pop();
      const carrier = run.enemies.find(boat => boat.cargo && boat.cargo.length < 5 && !boat.sailing && boat.wave === wave && boat.hp > 0);
      if (carrier?.cargo) {
        carrier.cargo.push(enemy); carrier.hp += enemy.hp / 2; carrier.maxHp += enemy.maxHp / 2;
        if (carrier.cargo.length === 5) carrier.sailing = true;
      } else {
        run.enemies.push({ ...enemy, id: run.nextId++, kind: "ship", shipArt: "kobaya", cargo: [enemy],
          x: clamp(enemy.x, 32, WIDTH - 32), y: HEIGHT + 4, hp: enemy.hp / 2, maxHp: enemy.maxHp / 2, speed: 40, shielded: false });
        run.metrics.naval.launched++;
      }
    }
  } else enemy.y = Math.min(enemy.y, riverBank() - 8);
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
function cancel(run: Run, enemy: Enemy, effects: Effect[]): void {
  run.telegraphs = run.telegraphs.filter(mark => mark.id !== enemy.casting);
  enemy.casting = 0; enemy.skillClock = enemy.kind === "ukita" ? 4.5 : enemy.boss ? 6 : 5; run.metrics.interrupts++;
  effects.push({ kind: "interrupt", x: enemy.x, y: enemy.y, value: 0, target: enemy.id });
}
function damage(run: Run, enemy: Enemy, amount: number, effects: Effect[], by: Source, critical = false, minor = false, attack: DamageClass = by === "skill" ? "skill" : "melee", index = -1, naval = false, origin?: Striker, fromEffect = false, spellId?: string, fire = false, attackerPosition?: Point, cast?: BphCast, procDepth = 0, attackId = cast?.attackId): number {
  if (enemy.hp <= 0) return 0;
  const armyEffect = spellId?.startsWith("chaos:") === true;
  const direct = (!fromEffect && typeof by === "number" && attack !== "skill" && procDepth === 0)
    || attackId !== undefined;
  const sourceUnit = typeof by === "number" ? unitAt(run, [by, index]) ?? null : null;
  // BPH also renders chongtong as a hwacha body; classify by its actual class, not its sprite.
  const hwacha = origin === "hwacha" && (!sourceUnit?.bph || BPH_PROFILES[sourceUnit.bph.profileId].classId === "hwacha");
  amount = weatherDamage(run.weather, amount, fire || spellId === "Spell_Fireball" || (!spellId && hwacha));
  const armyMultiplier = direct ? chaosDirectMultiplier(run, enemy) : 1;
  if (direct) amount *= armyMultiplier;
  const hit = { amount, prevented: false, critical: critical && !armyEffect };
  const provenance = { ...(spellId ? { spellId } : {}), ...(cast ? { cast } : {}) };
  if (!fromEffect) dispatchBphEffects(run, { kind: "before-enemy-damage", enemy, source: sourceUnit, hit, ...provenance });
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
  effects.push({ kind: "hit", x: enemy.x, y: enemy.y, value: Math.max(1, Math.round(dealt)), target: enemy.id,
    critical: hit.critical, minor, fromX: attacker.x, fromY: attacker.y });
  if (decisive) effects.push({ kind: "devastate", x: enemy.x, y: enemy.y, value: 3, target: enemy.id, critical: true });
  // matchup() applies resistance; the attack pose supplies recoil without moving a fighter through a wall.
  if (enemy.hp > 0) { if (!armyEffect && !enemy.boss && !enemy.ladder) enemy.stun = Math.max(enemy.stun, .08); return dealt; }
  const bossRecord = run.metrics.bosses.find(record => record.appeared === enemy.appearedAt);
  const phasedDeath = recordBphWitchDeath(run, enemy);
  if (bossRecord && !phasedDeath) bossRecord.fallen = run.time;
  if (run.bph && typeof by === "number" && index >= 0) {
    const killer = run.squads[by]?.soldiers[index];
    if (killer) bphUnitKill(run, killer, effects);
  }
  fell(run, enemy, effects);
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
  if (run.bph) {
    run.bph.save.totalKills++;
    if (enemy.bphProfileId) {
      const monster = BPH_MONSTERS[enemy.bphProfileId];
      run.bph.pendingMastery += monster.mastery; run.xp += monster.mastery;
      recordBphProgress(run.bph.save, { kind: "enemy-killed", enemyId: enemy.bphProfileId, count: 1 });
      if (!run.bph.save.discovered.includes(enemy.bphProfileId)) run.bph.save.discovered.push(enemy.bphProfileId);
    }
  }
  if (earned && run.level > 2) run.xp += BALANCE.killXp * (enemy.boss ? 30 : enemy.elite ? 12 : 1);
  const minute = Math.floor(run.time / 60);
  run.metrics.minuteKills[minute] = (run.metrics.minuteKills[minute] ?? 0) + 1;
  run.score += Math.round((enemy.boss ? 1000 : enemy.elite ? 200 : 12) * run.multiplier);
  effects.push({ kind: "kill", x: enemy.x, y: enemy.y, value: enemy.boss ? 2 : enemy.elite ? 1 : 0, target: enemy.id });
  if (!earned) return;
  const plain = run.bph ? Math.max(BALANCE.coin.foe, enemy.bphProfileId ? BPH_MONSTERS[enemy.bphProfileId].coins : 0)
    : enemy.boss ? BALANCE.coin.boss : enemy.elite ? BALANCE.coin.elite : BALANCE.coin.foe;
  const total = plain * run.meta.goldGain + run.coinRemainder;
  const coins = Math.floor(total + 1e-9);
  run.coinRemainder = total - coins;
  run.gold += coins; run.earned += coins;
  dispatchBphEffects(run, { kind: "coins-gained", amount: coins });
  effects.push({ kind: "coin", x: enemy.x, y: enemy.y, value: coins, minor: plain === BALANCE.coin.foe });
}
function knock(run: Run, enemy: Enemy, from: Point, pixels: number): void {
  const gap = distance(from, enemy);
  if (enemy.hp <= 0 || gap < .01) return;
  const push = pixels * (enemy.boss || enemy.ladder ? .25 : enemy.elite ? .5 : 1);
  const displaced = { x: clamp(enemy.x + (enemy.x - from.x) / gap * push, -14, WIDTH + 14), y: clamp(enemy.y + (enemy.y - from.y) / gap * push, -14, HEIGHT + 14) };
  const at = enemy.breach ? displaced : pushOut(fortRect(run.fort, 8), displaced);
  enemy.x = at.x; enemy.y = enemy.kind === "ship" ? enemy.y : Math.min(at.y, riverBank() - 8);
}
export function stagger(run: Run, enemy: Enemy, seconds: number, effects: Effect[]): void {
  if (enemy.hp <= 0) return;
  const held = seconds * (enemy.boss || enemy.ladder ? .5 : 1);
  enemy.stun = Math.max(enemy.stun, held); enemy.strikeAt = 0;
  if (seconds < INTERRUPTING_STUN) return;
  effects.push({ kind: "stun", x: enemy.x, y: enemy.y, value: held, target: enemy.id });
  if (enemy.casting) cancel(run, enemy, effects);
}
function batter(run: Run, at: Point, amount: number, effects: Effect[], attacker?: number, reached = false): void {
  const defense = chaosDefense(run);
  if (defense) defense.castleIncoming += amount;
  if (run.shieldUntil > run.time) {
    if (defense) defense.castlePrevented += amount;
    recordDefensePressure(run, "castle", amount, amount);
    run.metrics.blocked += amount; effects.push({ kind: "block", x: at.x, y: at.y, value: Math.round(amount) }); return;
  }
  const guard = chaosCastleGuard(run);
  recordDefensePressure(run, "castle", amount, amount * (1 - guard));
  if (guard !== 1) {
    if (defense) defense.castlePrevented += amount * (1 - guard);
    amount *= guard;
  }
  const source = run.enemies.find(enemy => enemy.id === attacker) ?? null;
  const shield = bphFxContext(run)?.state.castleShield;
  let remaining = amount;
  if (shield && shield.hp > 0) {
    const absorbed = Math.min(shield.hp, remaining);
    shield.hp -= absorbed; remaining -= absorbed; run.metrics.blocked += absorbed;
    effects.push({ kind: "block", x: at.x, y: at.y, value: absorbed });
    if (shield.hp === 0) dispatchBphEffects(run, { kind: "shieldBroken", attacker: source,
      position: { x: at.x, y: at.y }, absorbed });
  }
  if (remaining <= 0) return;
  const beforeHp = run.base;
  const boss = run.enemies.find(enemy => enemy.id === attacker && enemy.boss);
  strikeFort(run, at, remaining, run.bph ? 1
    : boss ? BALANCE.bossKeepBlow * (run.time >= 480 ? 4 : 1) : reached ? BALANCE.keepBlow : 1);
  if (run.base < beforeHp) dispatchBphEffects(run, { kind: "towerAttacked", attacker: source,
    position: { x: CENTER.x, y: CENTER.y }, amount: remaining, hpLost: beforeHp - run.base });
  if (run.metrics.firstBreach === null && SIDES.some(side => run.walls[side] <= 0)) run.metrics.firstBreach = run.time;
  if (boss) {
    run.metrics.bossDamage += amount;
    const record = run.metrics.bosses.find(item => item.appeared === boss.appearedAt);
    if (record) record.dealt += amount;
  }
  if (run.base <= 0) run.lossCause = boss ? "boss" : "army";
  effects.push({ kind: "wall", x: reached ? CENTER.x : at.x, y: reached ? CENTER.y : at.y, value: amount, target: attacker });
}
function hurt(run: Run, squad: Squad, index: number, amount: number, effects: Effect[], from?: Enemy, fire = false, provenance?: Pick<BphUnitDamageRequest, "spellId" | "cast">): void {
  const unit = index < 0 ? squad : squad.soldiers[index];
  if (!unit || (index < 0 && !fielded(squad)) || !fit(unit, run.time)) return;
  amount = weatherDamage(run.weather, amount, fire);
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
    : hit.amount * (squad.general === "김시민" ? .6 : 1) * armor / protection / (index < 0 ? 1 : 1 + BALANCE.drillGuard * run.drill[unit.kind as SoldierKind]) * (index < 0 ? 1 : run.meta.classGuard?.[kind] ?? 1);
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
  dispatchBphEffects(run, { kind: "unitKilled", side: "ally", unit, source: from ?? null,
    critical: false, position: { x: unit.x, y: unit.y }, origin: "attack" });
  dispatchBphEffects(run, { kind: "unit-death", unit, killer: from ?? null });
  if (index >= 0) {
    unit.downUntil = unit.bph ? Infinity : run.time + BALANCE.soldierDown; run.metrics.soldierDowns++;
    effects.push({ kind: "down", x: unit.x, y: unit.y, value: 0, squad: squad.id, index });
    return;
  }
  squad.state = "down"; squad.downUntil = run.time + BALANCE.downSeconds; squad.downs++; squad.lane = null;
  run.metrics.downs.push({ time: run.time, squad: squad.id });
  effects.push({ kind: "down", x: squad.x, y: squad.y, value: BALANCE.downSeconds, squad: squad.id, index: -1, label: "부상!" });
}
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
  squad.skillClock = 0; run.metrics.generalTimes.push(run.time);
  recordEvent(run, [], `${general} 합류`);
  return [{ kind: "join", x: squad.x, y: squad.y, value: 1, squad: id, label: `${general} 합류` }];
}
export function chooseGeneral(run: Run, general: General): Effect[] {
  if (run.phase !== "general" || !run.generalOffers.includes(general)) throw new Error("합류할 수 없는 장수입니다.");
  run.generalOffers = []; run.phase = "playing";
  return enlist(run, general);
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
  return offers.length || !run.meta.caps?.drill ? offers : ["gold40"];
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
    squad.awakened = squad.tier - 1; squad.skillClock = 0;
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
      squad.tier++; squad.awakened = squad.tier - 1; squad.skillClock = 0;
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
  for (const enemy of run.enemies) if (enemy.hp > 0 && enemy.kind !== "ship") {
    const cell = key(enemy.x, enemy.y), list = cells.get(cell);
    if (list) list.push(enemy); else cells.set(cell, [enemy]);
  }
  let best: Aim | null = null;
  for (const centre of run.enemies) {
    if (centre.hp <= 0) continue;
    let weight = 0, count = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const other of cells.get(key(centre.x + dx * radius, centre.y + dy * radius)) ?? []) if (distance(other, centre) < radius) {
        count++; weight += other.boss ? 6 : other.elite ? 3 : 1;
      }
    if (!best || weight > best.weight) best = { x: centre.x, y: centre.y, toX: centre.x, toY: centre.y, count, weight, urgent: false };
  }
  return best;
}
function blocksCharge(run: Run, from: Point, to: Point): boolean {
  const wall = fortRect(run.fort, 6);
  const gate = (p: Point) => Math.abs(p.x - CENTER.x) < 16 && p.y >= fortRect(run.fort, -32).bottom;
  if (contains(wall, to) && !contains(fortRect(run.fort, -32), to) && !gate(to)) return true;
  if (!crosses(wall, from, to) || (contains(wall, from) && contains(wall, to))) return false;
  const entry = contains(wall, from) ? wallPoint(wall, to, from) : wallPoint(wall, from, to);
  const exit = contains(wall, to) ? entry : wallPoint(wall, to, from);
  return !gate(entry) || !gate(exit);
}
function chargeAim(run: Run, squad: Squad, distanceBonus = 0): Aim {
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
export function skillAim(run: Run, id: number, distanceBonus = 0): Aim | null {
  const squad = run.squads[id];
  if (!squad) return null;
  const spec = GENERAL_SKILLS[squad.general];
  switch (spec.kind) {
    case "volley": case "bombard": case "hold": return volleyAim(run);
    case "ambush": return militiaAim(run);
    case "charge": return chargeAim(run, squad, distanceBonus);
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
  const army = run.chaos?.mods.general === "권율" ? run.chaos.mods : undefined;
  const radius = spec.radius * (1 + GENERAL_GROWTH.radius * (squad.tier - 1)) + (growth?.radiusBonus ?? 0) + (army?.radiusBonus ?? 0);
  effects.push({ kind: "skill", x: aim.x, y: aim.y, fromX: squad.x, fromY: squad.y, value: radius, squad: squad.id, label: SKILL_NAMES[squad.general] });
  let total = 0;
  for (const enemy of run.enemies) if (enemy.hp > 0 && distance(enemy, aim) < radius) {
    total += damage(run, enemy, amount, effects, "skill", false, true, "skill", -1, false, undefined, false, undefined, spec.burn > 0 || run.fire, squad);
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
      damage: amount * (army?.manualRatio ?? .05), critical: false, by: "skill", attack: "skill",
      splash: 0, pierce: 0, from: squad.id, tier: 1, flaming: spec.burn > 0 || run.fire,
      ...(army ? { retargetRange: army.retargetRange, hitIds: [] } : {}) });
  }
  if (total > 0) effects.push({ kind: "total", x: aim.x, y: aim.y - 30, value: Math.round(total), critical: true });
}
/** Read-only heal contract, also usable by VFX for legacy/N0 effects. */
export function actualManualHealRatio(run: Run, squad: Squad): number {
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
  if (run.bph && squad.general === "이순신") {
    const effects: Effect[] = [];
    castYisunsin(run, squad, effects, {
      damage: (enemy, amount) => { damage(run, enemy, amount, effects, id, false, false, "skill", -1, true); },
      knock: (enemy, from, pixels) => knock(run, enemy, from, pixels),
    }, mods);
    squad.skillClock = BALANCE.cooldown[squad.general]; squad.usedAt = run.time;
    run.metrics.skills[id]++; run.metrics.skillTimes.push({ time: run.time, squad: id });
    chaosAfterCast(run, squad, effects);
    return effects;
  }
  const effects: Effect[] = [], aim = skillAim(run, id, mods.chargeDistanceBonus);
  if (!aim) return [];
  for (const enemy of run.enemies) if (enemy.shielded && distance(enemy, squad) < 200) {
    enemy.shielded = false; effects.push({ kind: "interrupt", x: enemy.x, y: enemy.y, value: 1, target: enemy.id });
  }
  const spec = GENERAL_SKILLS[squad.general];
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
      squad.state = "charge"; squad.strikeAt = 0; squad.trampled = [];
      squad.lane = { toX: aim.toX, toY: aim.toY, homeX: squad.x, homeY: squad.y, back: spec.returns || squad.awakened >= 2, until: run.time + 1.2, dealt: 0,
        ...(mods.chargeStunBonus ? { stunBonus: mods.chargeStunBonus } : {}) };
      effects.push({ kind: "skill", x: aim.toX, y: aim.toY, fromX: squad.x, fromY: squad.y, value: BALANCE.chargeWidth * (1 + GENERAL_GROWTH.radius * (squad.tier - 1)), squad: id, label: SKILL_NAMES[squad.general] });
      break;
    case "sweep": {
      const reach = spec.radius * (1 + GENERAL_GROWTH.radius * (squad.tier - 1)) + mods.radiusBonus
        + (army?.general === "황진" ? army.manualRadiusBonus : 0);
      for (const enemy of run.enemies) if (enemy.hp > 0 && distance(enemy, squad) < reach) {
        damage(run, enemy, spec.power * might(run) * (1 + squad.awakened * .25) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1)), effects, "skill", false, true, "skill", -1, false, undefined, false, undefined, false, squad);
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
        damage(run, enemy, spec.power * might(run) * (1 + squad.awakened * .25) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1)), effects, "skill", false, true, "skill", -1, false, undefined, false, undefined, true, squad);
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
  chaosAfterCast(run, squad, effects);
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
  const radius = STYLES[squad.general] === "hunter" ? 170 : 120, home = { x: squad.homeX, y: squad.homeY };
  const reachable = (enemy: Enemy) => enemy.hp > 0 && enemy.kind !== "ship" && distance(enemy, home) <= radius;
  const held = lockOf(run, squad);
  return (held && reachable(held) ? held : undefined) ?? run.enemies.filter(enemy => reachable(enemy) && distance(enemy, squad) <= 90)
    .sort((a, b) => distance(a, squad) - distance(b, squad))[0];
}
function contact(run: Run, squad: Squad, enemy: Enemy): Point {
  const gap = Math.max(1, distance(enemy, squad)), keep = ARMS.general.reach * .6;
  if (gap <= keep) return { x: squad.x, y: squad.y };
  const at = { x: enemy.x + (squad.x - enemy.x) / gap * keep, y: enemy.y + (squad.y - enemy.y) / gap * keep };
  return enemy.breach && contains(fortRect(run.fort), enemy) ? at : fieldPoint(run.fort, at, SQUAD_MARGIN);
}
function station(run: Run, squad: Squad, mates: Squad[]): Point {
  const wall = fortRect(run.fort), along = squad.post === "위" || squad.post === "아래";
  const intruder = run.enemies.filter(enemy => enemy.hp > 0 && enemy.breach && contains(wall, enemy)).sort((a, b) => distance(a, CENTER) - distance(b, CENTER))[0];
  if (intruder) return contact(run, squad, engagement(run, squad) ?? intruder);
  const middle = along ? CENTER.x : (wall.top + wall.bottom) / 2, half = (along ? wall.right - wall.left : wall.bottom - wall.top) / 2;
  const near = run.enemies.filter(e => e.hp > 0 && sideOf(wall, e) === squad.post).sort((a, b) => gapToRect(wall, a) - gapToRect(wall, b)).slice(0, 8);
  const chief = near.find(e => e.boss || e.elite);
  const mean = chief ? along ? chief.x : chief.y : near.length ? near.reduce((sum, e) => sum + (along ? e.x : e.y), 0) / near.length : middle;
  const shift = clamp(mean - middle, -half, half) + (mates.indexOf(squad) - (mates.length - 1) / 2) * 58;
  const style = STYLES[squad.general], reach = style === "guardian" ? BALANCE.guardianGap : style === "frontline" ? BALANCE.supportGap : BALANCE.guardGap;
  let post = guardPoint(run.fort, squad.post, squad.state === "retreat" ? SQUAD_MARGIN : reach, shift + (along ? 0 : middle - CENTER.y));
  squad.homeX = post.x; squad.homeY = post.y;
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
  const reachable = (enemy: Enemy) => enemy.hp > 0 && enemy.kind !== "ship" && distance(enemy, home) <= radius;
  const locked = !danger && squad.state === "guard" ? engagement(run, squad) : undefined;
  if (locked) return contact(run, squad, locked);
  const pack = style === "hunter" && !danger && squad.state === "guard" ? volleyAim(run) : null;
  if (pack && distance(pack, post) <= radius) { const gap = Math.max(1, distance(pack, squad)); post = { x: pack.x + (squad.x - pack.x) / gap * 30, y: pack.y + (squad.y - pack.y) / gap * 30 }; }
  const quarry = danger || squad.state !== "guard" || style !== "hunter" ? undefined
    : run.enemies.filter(enemy => reachable(enemy) && (enemy.boss || enemy.elite)).sort((a, b) => distance(a, squad) - distance(b, squad))[0];
  if (quarry) {
    const gap = Math.max(1, distance(quarry, squad));
    post = { x: quarry.x + (squad.x - quarry.x) / gap * 26, y: quarry.y + (squad.y - quarry.y) / gap * 26 };
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
    wanted.splice(wanted.indexOf(side), 1); squad.post = side; run.metrics.redeploys++;
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
  for (const enemy of run.enemies) if (enemy.hp > 0 && distance(enemy, squad) < BALANCE.chargeWidth * (1 + GENERAL_GROWTH.radius * (squad.tier - 1)) && !squad.trampled.includes(enemy.id)) {
    squad.trampled.push(enemy.id);
    lane.dealt += damage(run, enemy, BALANCE.chargePower * might(run) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1)), effects, squad.id, false, true, "skill");
    knock(run, enemy, squad, 14); stagger(run, enemy, BALANCE.chargeStun + (lane.stunBonus ?? 0), effects);
  }
  if (gap > step && run.time < lane.until) return;
  dispatchBphEffects(run, { kind: "dash-end", unit: squad,
    from: { x: lane.homeX, y: lane.homeY }, to: { x: squad.x, y: squad.y }, returning: lane.back });
  if (lane.back) { squad.lane = { ...lane, toX: lane.homeX, toY: lane.homeY, homeX: squad.x, homeY: squad.y, back: false, until: run.time + 1.2 }; squad.trampled = []; return; }
  if (squad.general === "신립") chaosAfterReturn(run, {
    from: { x: lane.homeX, y: lane.homeY }, to: squad,
    power: might(run) * ARMS.general.power * (1 + GENERAL_GROWTH.basic * (squad.tier - 1))
      * (run.meta.heroBasic ?? 1) * (run.meta.generalMastery?.includes(squad.general) ? 1.2 : 1),
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
  for (const squad of run.squads) squad.soldiers.forEach((unit, index) => {
    if (unit.perch === undefined || standing[unit.perch]) return;
    effects.push({ kind: "fall", x: unit.x, y: unit.y, value: 0, squad: squad.id, index });
    delete unit.perch;
    hurt(run, squad, index, unit.maxHp * BALANCE.fallHurt, effects);
  });
  const occupied = new Set(garrison.filter(unit => unit.kind === "archer" || unit.kind === "hwacha").map(unit => unit.perch).filter(perch => perch !== undefined));
  for (const unit of garrison) {
    const rawStats = bphStats(unit, run);
    if (rawStats && rawStats.hp !== unit.maxHp) {
      const share = unit.hp / unit.maxHp;
      unit.maxHp = rawStats.hp; unit.hp = share * unit.maxHp;
    }
    if (unit.kind === "panokseon") {
      if (unit.hp <= 0 && unit.downUntil <= run.time) { unit.hp = unit.maxHp; unit.x = 24; }
      if (!fit(unit, run.time)) continue;
      const sign = Math.floor(run.time / ((WIDTH - 48) / 30)) % 2 ? -1 : 1;
      unit.x = clamp(unit.x + sign * 30 * dt * movement, 24, WIDTH - 24); unit.y = riverLane();
      continue;
    }
    if (unit.hp <= 0 && unit.downUntil <= run.time) unit.hp = unit.maxHp / 2;
    if (unit.hp <= 0) continue;
    if (unit.hp > 0 && !unit.bph) unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * (unit.kind === "monk" ? .06 : BALANCE.garrisonRegen) * mending * dt);
    const ranged = unit.kind === "archer" || unit.kind === "hwacha";
    let goal: Point;
    if (ranged) {
      if (unit.perch === undefined) {
        const free = posts.map((_, i) => i).filter(i => standing[i] && !occupied.has(i));
        const loads = SIDES.map(side => [...occupied].filter(i => sideOf(inner, posts[i!]) === side).length);
        const weighted = free.map(i => ({ i, score: random(run) - .08 * loads[SIDES.indexOf(sideOf(inner, posts[i]))] })).sort((a, b) => b.score - a.score);
        if (weighted.length) { unit.perch = weighted[0].i; occupied.add(unit.perch); }
      }
      goal = unit.perch === undefined ? CENTER : posts[unit.perch];
    } else {
      const gate = guardPoint(run.fort, "아래", 24);
      if (unit.emerging && !contains(run.bph ? fortRect(run.fort, 24) : inner, unit)) unit.emerging = false;
      // A fallen or displaced melee soldier walks back out through the gate.
      // Projecting an interior position onto the wall teleported it by a whole courtyard.
      if (!unit.emerging && contains(wall, unit)) unit.emerging = true;
      const candidates = run.enemies.filter(enemy => enemy.hp > 0 && !contains(inner, enemy) && gapToRect(wall, enemy) <= 130);
      const target = candidates.find(enemy => enemy.id === unit.quarry)
        ?? candidates.filter(enemy => distance(enemy, unit) <= 110).sort((a, b) => distance(a, unit) - distance(b, unit))[0]
        ?? candidates.sort((a, b) => routeDistance(walk, unit, a) - routeDistance(walk, unit, b))[0];
      unit.quarry = target?.id;
      const gap = target ? Math.max(1, distance(target, unit)) : 1;
      // Stop at the weapon's contact distance. The old universal 24 px goal
      // moved already-attacking fighters away to satisfy a projected wall goal.
      const reach = bphArms(unit, run)?.reach ?? ARMS[unit.kind].reach;
      const post = target ? gap <= reach ? unit : fieldPoint(run.fort, { x: target.x + (unit.x - target.x) / gap * reach, y: target.y + (unit.y - target.y) / gap * reach }, 12)
        : wallPoint(fortRect(run.fort, 26), unit);
      goal = unit.emerging ? allyRoute(run.fort, unit, gate) : unit.strikeAt > 0 ? unit : allyRoute(run.fort, unit, post);
    }
    goal = { x: goal.x, y: Math.min(goal.y, riverBank() - 8) };
    const stride = (unit.bph ? (bphStats(unit, run)?.moveSpeed ?? 0) * BPH_SCALE.movement * dt : march) * movement;
    const gap = distance(unit, goal), step = gap > stride ? stride / gap : 1;
    unit.x += (goal.x - unit.x) * step; unit.y += (goal.y - unit.y) * step;
  }
  for (const squad of run.squads) {
    if (squad.state === "down") {
      if (run.time < squad.downUntil) {
        const goal = allyRoute(run.fort, squad, buildings().infirmary, SQUAD_MARGIN);
        const gap = distance(squad, goal), step = Math.min(gap, RETREAT_SPEED * dt);
        if (gap > 0) { squad.x += (goal.x - squad.x) / gap * step; squad.y += (goal.y - squad.y) / gap * step; }
        continue;
      }
      const out = guardPoint(run.fort, "아래", GATE_GAP);
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
        if (enemy) {
          const at = contact(run, squad, enemy);
          squad.targetX = at.x; squad.targetY = Math.min(at.y, riverBank() - 8);
        }
      }
      if (squad.state === "guard" && squad.strikeAt > 0) continue;
      const target = { x: squad.targetX, y: squad.targetY }, at = squad;
      const next = allyRoute(run.fort, squad, target, SQUAD_MARGIN), gap = distance(at, next);
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
    const multiplier = bphSurvivalDamageMultiplier(run, enemy, "unit");
    return multiplier === 1 ? amount : amount * multiplier;
  }
  return BALANCE.bite * (1 + run.time / BALANCE.biteSpan) * (1 + run.curses * .12)
    * (enemy.kind === "ukita" ? 8 : enemy.boss ? 6 : enemy.elite ? 3.5 : enemy.kind === "samurai" ? 1.7 : enemy.kind === "cavalry" ? 1.3 : 1) * bossPower(enemy);
}
/** Encounter strength is fixed on arrival, rather than jumping twentyfold at 4:00. */
function bossPower(enemy: Enemy): number {
  return enemy.boss && enemy.appearedAt !== undefined ? Math.min(1, BALANCE.openingBossPower
    + Math.max(0, enemy.appearedAt / BOSS_EVERY - 1) * BALANCE.bossPowerStep) : 1;
}
function cast(run: Run, enemy: Enemy, effects: Effect[]): boolean {
  const wall = fortRect(run.fort), generals = run.squads.filter(fielded);
  const near = [...generals].sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
  const identity = enemy.bossArt ? BOSSES[enemy.bossArt] : undefined;
  let skill: Skill = identity ? enemy.enraged && enemy.casts % 2 === 0 ? identity.second : identity.pattern
    : enemy.kind === "ship" ? "siege" : enemy.kind === "ukita" ? (enemy.casts % 2 ? "salvo" : "decree") : enemy.boss && enemy.pattern ? enemy.pattern : "slam";
  const victim = skill === "ninja" ? [...generals].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
    : near && distance(near, enemy) < CASTS[skill].reach ? near : undefined;
  const special = skill === "fire" || skill === "ladder" || skill === "shield" || enemy.kind === "ship";
  if (!victim && !special && gapToRect(wall, enemy) >= 46) { enemy.skillClock = .4; return false; }
  if (!victim && !special && skill !== "siege") skill = "ram";
  const spec = CASTS[skill];
  let at: Point;
  if (skill === "fire") at = buildings().base;
  else if (skill === "ladder") at = guardPoint(run.fort, enemy.direction, 0);
  else if (skill === "shield") at = enemy;
  else if (skill === "ninja" && victim) {
    const beside = fieldPoint(run.fort, { x: victim.x + (victim.x < CENTER.x ? -44 : 44), y: victim.y - 26 }, 14);
    enemy.x = beside.x; enemy.y = beside.y; retarget(run, enemy);
    at = { x: victim.x, y: victim.y };
  } else if (skill === "ram" || !victim) at = wallPoint(wall, enemy);
  else if (spec.shape === "lane") {
    const gap = Math.max(1, distance(victim, enemy));
    at = { x: enemy.x + (victim.x - enemy.x) / gap * spec.length, y: enemy.y + (victim.y - enemy.y) / gap * spec.length };
  } else at = { x: victim.x, y: victim.y };
  const mark: Telegraph = { id: run.nextId++, owner: enemy.id, skill, shape: spec.shape, x: at.x, y: at.y, fromX: enemy.x, fromY: enemy.y, radius: spec.radius,
    startedAt: run.time, at: run.time + spec.windup,
    damage: Math.max(blow(run, { ...enemy, kind: "yari", boss: false, elite: false }) * spec.power, identity && victim ? victim.maxHp * .7 : 0)
      * (enemy.kind === "ship" ? .08 : 1) * (enemy.enraged ? 1.5 : 1) * bossPower(enemy),
    wallDamage: spec.wall * (1 + run.time / BALANCE.wallBlowSpan)
      * (enemy.kind === "ship" ? .025 : 1) * bossPower(enemy) };
  run.telegraphs.push(mark); enemy.casting = mark.id; enemy.casts++; enemy.strikeAt = 0; run.metrics.telegraphs++;
  effects.push({ kind: "telegraph", x: mark.x, y: mark.y, value: mark.radius, target: enemy.id, label: skill, shape: mark.shape, fromX: mark.fromX, fromY: mark.fromY });
  return true;
}
function land(run: Run, mark: Telegraph, effects: Effect[]): void {
  const owner = run.enemies.find(enemy => enemy.id === mark.owner && enemy.hp > 0), wall = fortRect(run.fort), shielded = run.shieldUntil > run.time;
  if (owner) { owner.casting = 0; owner.skillClock = owner.kind === "ukita" ? 4.5 : owner.boss ? 6 : 5; }
  run.metrics.landed++;
  effects.push({ kind: "land", x: mark.x, y: mark.y, value: mark.radius, label: mark.skill, shape: mark.shape, fromX: mark.fromX, fromY: mark.fromY, minor: shielded });
  if (mark.skill === "shield" && owner) owner.shielded = true;
  if (mark.skill === "fire" && !shielded) {
    const scorch = weatherDamage(run.weather, run.maxBase * .1, true);
    run.base = Math.max(0, run.base - scorch); run.metrics.bossDamage += scorch;
    const record = run.metrics.bosses.find(item => item.appeared === owner?.appearedAt);
    if (record) record.dealt += scorch;
    if (run.base <= 0) run.lossCause = "boss";
  }
  if (mark.skill === "ladder" && owner) {
    for (let i = 0; i < 6; i++) { const reinforcement = spawn(run, false, false, undefined, false, owner.direction, .85); reinforcement.wave = true; reinforcement.ladder = true; }
    effects.push({ kind: "ladder", x: mark.x, y: mark.y, value: 6, side: owner.direction });
  }
  let caught = false, general = false;
  for (const squad of run.squads) units(squad).forEach((unit, order) => {
    if (!fit(unit, run.time) || (order === 0 && !fielded(squad)) || !covers(mark, unit)) return;
    caught = true; general ||= order === 0;
    hurt(run, squad, order - 1, mark.damage * (order === 0 ? 1 : .5), effects, owner, mark.skill === "fire");
  });
  const start = { x: mark.fromX, y: mark.fromY };
  if (mark.wallDamage > 0 && (mark.shape === "circle" ? gapToRect(wall, mark) < mark.radius : crosses(wall, start, mark) || gapToRect(wall, mark) < mark.radius)) {
    caught = true; batter(run, wallPoint(wall, mark.shape === "circle" ? mark : start), mark.wallDamage, effects, mark.owner);
  }
  if (shielded && caught) run.metrics.blockedCasts++;
  if (!shielded && general) run.metrics.generalsStruck++;
  if (mark.skill === "cavalry" && owner) { const at = fieldPoint(run.fort, mark, 14); owner.x = at.x; owner.y = at.y; retarget(run, owner); }
}
function raid(run: Run, dt: number, effects: Effect[]): void {
  const wall = fortRect(run.fort), keepOut = fortRect(run.fort, 8);
  const movementDt = dt * weatherEnemySpeed(run.weather);
  const marks: { squad: Squad; index: number; unit: Unit }[] = [];
  for (const squad of run.squads) {
    if (fielded(squad) && fit(squad, run.time)) marks.push({ squad, index: -1, unit: squad });
    squad.soldiers.forEach((unit, index) => { if (fit(unit, run.time)) marks.push({ squad, index, unit }); });
  }
  const approach = (enemy: Enemy, goal: Point, stop: number) => {
    const breached = !!enemy.breach;
    const next = breached ? goal : route(keepOut, pushOut(keepOut, enemy), goal), gap = distance(enemy, next), step = Math.min(Math.max(0, distance(enemy, goal) - stop), enemy.speed * movementDt * uniqueSkillSpeed(run, enemy));
    if (gap > 0) { enemy.x += (next.x - enemy.x) / gap * Math.min(gap, step); enemy.y += (next.y - enemy.y) / gap * Math.min(gap, step); }
  };
  const gaps = SIDES.filter(side => run.walls[side] <= 0);
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.cargo) {
      if (!enemy.sailing && enemy.cargo.length < 5) continue;
      enemy.y -= enemy.speed * movementDt;
      if (enemy.y <= riverBank()) {
        const cargo = enemy.cargo;
        run.metrics.naval.landed++; run.metrics.naval.passengersLanded += cargo.length;
        enemy.cargo = []; enemy.hp = 0;
        for (const [index, passenger] of cargo.entries()) {
          passenger.x = clamp(enemy.x + (index - (cargo.length - 1) / 2) * 12, 12, WIDTH - 12);
          passenger.y = riverBank() - 8; retarget(run, passenger);
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
    if (enemy.kind !== "ship" && gaps.length && !enemy.breach && !enemy.pulled && !enemy.boss && gapToRect(wall, enemy) < BALANCE.breachPull) {
      const side = gaps.reduce((best, gap) => distance(guardPoint(run.fort, gap, 0), enemy) < distance(guardPoint(run.fort, best, 0), enemy) ? gap : best);
      const target = guardPoint(run.fort, side, 10), along = (random(run) - .5) * BALANCE.breachSpread;
      enemy.pulled = true; enemy.goalX = target.x + (side === "위" || side === "아래" ? along : 0); enemy.goalY = target.y + (side === "좌" || side === "우" ? along : 0);
    }
    if (enemy.boss && enemy.bossArt && !enemy.enraged && enemy.hp <= enemy.maxHp * .5) {
      enemy.enraged = true; enemy.speed *= 1.25; enemy.skillClock = 0; enemy.casts = 0;
      const record = run.metrics.bosses.find(item => item.appeared === enemy.appearedAt);
      if (record) record.phase2 = run.time;
      effects.push({ kind: "rage", x: enemy.x, y: enemy.y, value: 1, target: enemy.id });
    }
    const approachSide = sideOf(wall, enemy);
    if (run.walls[approachSide] <= 0) enemy.breach ??= approachSide;
    else if (gaps.length && contains(wall, enemy)) enemy.breach ??= gaps[0];
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
        } else batter(run, target, run.maxWall * .25 * .4 / (RIVER_SECONDS / 2.4) / 2, effects, enemy.id);
      }
      continue;
    }
    if (enemy.ladder) {
      enemy.prey = null; enemy.strikeAt = 0; enemy.clock -= dt;
      const decoy = militiaLure(run, enemy);
      if (decoy) {
        if (distance(enemy, decoy) > 9) approach(enemy, decoy, 8);
        else if (enemy.clock <= 0) {
          enemy.clock = 2;
          effects.push({ kind: "lunge", x: decoy.x, y: decoy.y, value: .3, target: enemy.id });
        }
        continue;
      }
      const goal = enemy.breach ? CENTER : { x: enemy.goalX, y: enemy.goalY };
      if (distance(enemy, goal) > 9) { approach(enemy, goal, 8); continue; }
      if (enemy.clock > 0) continue;
      enemy.clock = 2;
      if (run.shieldUntil > run.time) {
        run.metrics.blocked += enemy.breach ? (run.time >= 540 ? BALANCE.lateLadderBlow : 15) : 10;
        effects.push({ kind: "block", x: enemy.x, y: enemy.y, value: 0 });
      } else {
        if (enemy.breach) {
          const amount = run.time >= 540 ? BALANCE.lateLadderBlow : 15;
          run.base = Math.max(0, run.base - amount);
        }
        else batter(run, wallPoint(wall, enemy), 10, effects, enemy.id);
        if (run.base <= 0) run.lossCause = "army";
      }
      continue;
    }
    const ranged = enemy.kind === "teppo" && !enemy.elite && !enemy.boss;
    if (enemy.strikeAt > 0) {
      if (run.time < enemy.strikeAt) continue;
      enemy.strikeAt = 0;
      const victim = enemy.prey && unitAt(run, enemy.prey);
      if (!enemy.prey || !victim || !fit(victim, run.time)) continue;
      if (ranged) {
        run.shots.push({ id: run.nextId++, kind: "bullet", x: enemy.x, y: enemy.y, toX: victim.x, toY: victim.y, speed: 380, target: 0, prey: enemy.prey,
          damage: blow(run, enemy), critical: false, by: "weapon", splash: 0, pierce: 0, from: enemy.id });
        effects.push({ kind: "shot", x: victim.x, y: victim.y, fromX: enemy.x, fromY: enemy.y, value: 0, hostile: true, target: enemy.id });
      } else if (distance(enemy, victim) < MELEE + 14 + (enemy.prey[1] >= 0 ? BALANCE.wallReach : 0)) hurt(run, run.squads[enemy.prey[0]], enemy.prey[1], blow(run, enemy), effects, enemy);
      continue;
    }
    enemy.clock -= dt; enemy.skillClock -= dt;
    if ((enemy.elite || enemy.boss) && enemy.skillClock <= 0 && cast(run, enemy, effects)) continue;
    const scout = enemy.kind === "cavalry" ? SCOUT.cavalry : enemy.elite || enemy.boss ? SCOUT.elite : SCOUT[enemy.kind];
    const aggro = enemy.breach && !enemy.boss ? Math.min(scout.aggro, BALANCE.breachAggro) : scout.aggro, hunt = enemy.boss ? 1000 : enemy.breach ? 0 : scout.hunt;
    let victim: Unit | null = null, nearest = Infinity;
    enemy.prey = null;
    const targets = enemy.boss && marks.some(mark => mark.index < 0) ? marks.filter(mark => mark.index < 0) : marks;
    for (const mark of targets) {
      const gap = distance(enemy, mark.unit);
      if (gap < nearest && (gap < aggro || (mark.index < 0 && gap < hunt))) { nearest = gap; victim = mark.unit; enemy.prey = [mark.squad.id, mark.index]; }
    }
    if (victim) {
      const reach = ranged ? 115 : MELEE + (enemy.boss ? 8 : 0) + ((enemy.prey?.[1] ?? -1) >= 0 ? BALANCE.wallReach : 0);
      if (nearest > reach) { approach(enemy, victim, reach - 2); continue; }
      if (enemy.clock > 0) continue;
      enemy.clock = enemy.bphProfileId ? 1 / BPH_MONSTERS[enemy.bphProfileId].attackSpeed
        : ranged ? 1.8 : enemy.boss ? 1.6 : 1.2;
      enemy.strikeAt = run.time + (ranged ? .35 : .3);
      effects.push({ kind: "lunge", x: victim.x, y: victim.y, value: enemy.strikeAt - run.time, target: enemy.id, minor: ranged });
      continue;
    }
    const breached = !!enemy.breach;
    const goal = breached ? CENTER : { x: enemy.goalX, y: enemy.goalY }, stand = ranged ? 70 : 9;
    if (distance(enemy, goal) > stand) { approach(enemy, goal, stand - 1); continue; }
    if (enemy.clock > 0) continue;
    enemy.clock = enemy.bphProfileId ? 1 / BPH_MONSTERS[enemy.bphProfileId].attackSpeed : ranged ? 1.8 : 2;
    const struck = enemy.breach ? guardPoint(run.fort, enemy.breach, 0) : wallPoint(wall, enemy);
    if (ranged) effects.push({ kind: "shot", x: struck.x, y: struck.y, fromX: enemy.x, fromY: enemy.y, value: 0, hostile: true, target: enemy.id, minor: true });
    const opening = bossPower(enemy);
    const context = bphFxContext(run);
    let wallDamage = enemy.bphProfileId ? context
      ? bphEnemyStats(context, { profileId: enemy.bphProfileId }).towerDamage
      : BPH_MONSTERS[enemy.bphProfileId].towerDamage
      : (enemy.kind === "ukita" ? BALANCE.finalBlow : enemy.boss ? BALANCE.bossBlow * opening : enemy.elite ? BALANCE.eliteBlow : BALANCE.wallBlow * (enemy.wave ? BALANCE.waveBlow : 1)) * (1 + run.time / BALANCE.wallBlowSpan);
    if (enemy.bphProfileId) {
      const multiplier = bphSurvivalDamageMultiplier(run, enemy, "castle");
      if (multiplier !== 1) wallDamage *= multiplier;
    }
    batter(run, struck, wallDamage, effects, enemy.id, !!enemy.breach);
  }
}
/** The enemy a general is locked on: alive and still inside his reach plus the hysteresis slack. */
function lockOf(run: Run, squad: Squad): Enemy | undefined {
  return run.enemies.find(enemy => enemy.id === squad.aim && enemy.hp > 0 && distance(enemy, squad) < ARMS.general.reach + LOCK_SLACK);
}
function pick(run: Run, unit: Unit, reach: number): Enemy | undefined {
  if (unit.kind === "panokseon") {
    const targets = run.enemies.filter(enemy => enemy.hp > 0 && distance(enemy, unit) < reach
      && (!unit.bph || enemy.kind === "ship"));
    return targets.sort((a, b) => Number(b.kind === "ship") - Number(a.kind === "ship") || distance(a, unit) - distance(b, unit))[0];
  }
  let best: Enemy | undefined, lowest = Infinity;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0 || enemy.kind === "ship") continue;
    const gap = distance(enemy, unit);
    if (gap >= reach) continue;
    const order = gap - (enemy.casting || enemy.boss || enemy.elite ? 200 : 0);
    if (order < lowest) { lowest = order; best = enemy; }
  }
  return best;
}
function burst(run: Run, at: Point, radius: number, amount: number, by: Source, effects: Effect[], critical: boolean, stun = 0, tier = 1, naval = false, origin?: Striker, unitIndex = -1, procDepth = 0): void {
  effects.push({ kind: "blast", x: at.x, y: at.y, value: radius / 26 * (1 + .35 * (tier - 1)) });
  let total = 0, struck = 0;
  for (const enemy of run.enemies) if (enemy.hp > 0 && distance(enemy, at) < radius) {
    total += damage(run, enemy, amount, effects, by, critical, true, "artillery", unitIndex, naval, origin, false, undefined, !naval, undefined, undefined, procDepth); struck++;
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
function fight(run: Run, squad: Squad, unit: Unit, index: number, dt: number, effects: Effect[]): void {
  if (!fit(unit, run.time)) return;
  const profile = unit.bph ? BPH_PROFILES[unit.bph.profileId] : null;
  const leader = index < 0;
  const leaderArms = run.bph && leader
    ? squad.general === "권율" || squad.general === "김시민" ? ARMS.hwacha
      : squad.general === "송상현" ? ARMS.archer : squad.general === "이순신" ? ARMS.panokseon : ARMS.general
    : ARMS[unit.kind];
  const profileArms = bphArms(unit, run), arms = profileArms ?? leaderArms;
  if (profile && profile.cooldown <= 0) return;
  const kind = leader ? GENERAL_CLASS[squad.general] : unit.kind as SoldierKind;
  const bonus = synergy(run, kind), tactic = run.tactics[kind];
  const reach = arms.reach + (profile ? 0 : leader || kind === "panokseon" ? 0 : BALANCE.wallReach + bonus.reach + (tactic.storm && kind === "monk" ? 80 : 0));
  if (unit.strikeAt === 0) {
    const tempo = profile ? (squad.frenzyUntil > run.time ? 2 : 1) : (squad.frenzyUntil > run.time ? 2 : 1) * (leader ? 1 : (squad.state === "down" ? BALANCE.downTempo : 1) * (run.squads.some(mate => STYLES[mate.general] === "guardian" && fielded(mate)) ? BALANCE.guardianTempo : 1)) * (leader ? 1 : 1 + BALANCE.drillTempo * run.drill[unit.kind as SoldierKind]);
    if ((unit.clock -= dt * tempo * (leader ? 1 : bonus.tempo)) > 0) return;
    const held = leader ? lockOf(run, squad) : run.enemies.find(enemy => enemy.id === unit.quarry && enemy.hp > 0);
    // Preserve pursuit hysteresis, but a stale distant lock cannot starve a fighter in contact.
    const nearby = pick(run, unit, reach);
    const contact = leader && held && distance(held, unit) >= reach && nearby && distance(nearby, unit) <= reach * .6;
    const target = contact ? nearby : held ?? nearby;
    if (!target) { unit.clock = 0; return; }
    unit.clock = arms.every - (kind === "panokseon" ? arms.windup * tempo * bonus.tempo : 0);
    unit.strikeAt = run.time + arms.windup; unit.aim = target.id;
    effects.push({ kind: "windup", x: target.x, y: target.y, value: arms.windup, squad: squad.id, index });
    return;
  }
  if (run.time < unit.strikeAt) return;
  unit.strikeAt = 0;
  const target = run.enemies.find(enemy => enemy.id === unit.aim && enemy.hp > 0 && distance(enemy, unit) < reach + (leader ? LOCK_SLACK : 16)) ?? pick(run, unit, reach + 16);
  if (leader && target) unit.aim = target.id;
  if (!target) return;
  const attackEvent = { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false };
  const handledBefore = { spells: run.bph?.fx.spells.length ?? 0, actors: run.bph?.fx.actors.length ?? 0 };
  dispatchBphEffects(run, { kind: "before-attack", unit, target, attack: attackEvent });
  if (attackEvent.handled) {
    const amount = chaosHandledPower(run, unit, handledBefore);
    if (amount !== null) {
      chaosAfterAttack(run, { unit, target, amount }, effects);
      chaosVolley(run, { squad, unit, index, target, amount, critical: false, reach });
    }
    return;
  }
  const critical = random(run) < (profileArms?.critChance ?? BALANCE.critical), by: Striker = leader ? "general" : unit.kind as SoldierKind;
  const power = leader && squad.general === "김시민" ? 3.87 : arms.power;
  const amount = profile ? arms.power * BPH_SCALE.damage * (critical ? profileArms?.critDamage ?? 1 : 1) * attackEvent.multiplier
    : attackEvent.multiplier * might(run) * power * (leader ? 1 + GENERAL_GROWTH.basic * (unit.tier - 1) : 3 ** (unit.tier - 1)) * (critical ? 2 : 1)
    * (leader ? (run.meta.heroBasic ?? 1) * (run.meta.generalMastery?.includes(squad.general) ? 1.2 : 1) : bonus.power * (run.meta.classDamage?.[kind] ?? 1) * (kind === "panokseon" ? run.meta.navalPower ?? 1 : 1) * (1 + BALANCE.drillPower * run.drill[kind]));
  if (arms.shot === "arrow") {
    const targets = tactic.storm ? [target, ...run.enemies.filter(enemy => enemy.hp > 0 && enemy.id !== target.id && distance(enemy, target) < 70).slice(0, 2)] : [target];
    const marks = [...targets, ...Array.from({ length: (leader ? 0 : run.meta.classExtra?.archer ?? 0) + attackEvent.extraProjectiles }, () => target)];
    for (const [ordinal, mark] of marks.entries()) {
      launch(run, "arrow", unit, mark, mark.id, amount, critical, squad.id, 0, unit.tier);
      const shot = run.shots.at(-1);
      if (shot) { shot.unitIndex = index; shot.pierce += tactic.epic ? 1 : 0;
        shot.bounces = attackEvent.bounces; shot.bounceRange = arms.reach; shot.hitIds = [];
        shot.stun = tactic.guard ? .65 : 0; shot.source = by; shot.flaming ||= Boolean(run.meta.archerFire);
        if (run.chaos && ordinal >= targets.length) shot.procDepth = 1;
        chaosArrow(run, shot); }
    }
  }
  else if (arms.shot === "rocket") for (let i = 0, count = (profile ? 1 : arms.cleave + (tactic.storm ? 2 : 0) + (run.meta.classExtra?.[kind] ?? 0)) + attackEvent.extraProjectiles; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 20, gap = Math.max(1, distance(target, unit));
    launch(run, "rocket", unit, { x: target.x - (target.y - unit.y) / gap * spread, y: target.y + (target.x - unit.x) / gap * spread }, 0, amount, critical, squad.id, arms.span * (run.powder ? 1.5 : 1) * (tactic.epic ? 1.35 : 1) * (tactic.guard ? 1.6 : 1), unit.tier);
    const shot = run.shots.at(-1);
    if (shot) { shot.unitIndex = index; shot.stun = tactic.guard ? .8 : 0; shot.naval = kind === "panokseon"; shot.source = by; if (kind === "hwacha") shot.splash *= run.meta.hwachaRadius ?? 1;
      if (run.chaos && i >= count - attackEvent.extraProjectiles) shot.procDepth = 1; }
  }
  if (arms.shot) { effects.push({ kind: "shot", x: target.x, y: target.y, fromX: unit.x, fromY: unit.y, value: 0, by, squad: squad.id, index });
    chaosAfterAttack(run, { unit, target, amount }, effects);
    chaosVolley(run, { squad, unit, index, target, amount, critical, reach });
    dispatchBphEffects(run, { kind: "after-attack", unit, target }); return; }
  effects.push({ kind: "swing", x: target.x, y: target.y, fromX: unit.x, fromY: unit.y, value: arms.span, by, squad: squad.id, index, critical });
  const span = arms.span + (!profile && !leader && tactic.storm ? 44 : 0);
  const cleave = arms.cleave + (!profile && !leader && tactic.epic ? 2 : 0) + (!profile && !leader && tactic.storm ? 6 : 0) + (profile || leader ? 0 : run.meta.classExtra?.[kind] ?? 0);
  if (!leader && tactic.storm && kind === "monk") effects.push({ kind: "blast", x: target.x, y: target.y, value: span / 26, by: kind });
  const struck = cleave > 1 ? run.enemies.filter(enemy => enemy.hp > 0 && distance(enemy, target) < span)
    .sort((a, b) => distance(a, target) - distance(b, target)).slice(0, cleave) : [target];
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
  chaosAfterAttack(run, { unit, target, amount }, effects);
  dispatchBphEffects(run, { kind: "after-attack", unit, target });
}
function threats(run: Run): Enemy[] {
  const wall = fortRect(run.fort);
  const guarded = (e: Enemy) => run.squads.some(s => fielded(s) && distance(e, s) < BALANCE.guardRadius);
  const remaining = (e: Enemy) => Math.hypot(e.goalX - e.x, e.goalY - e.y);
  return run.enemies.filter(e => e.hp > 0 && e.kind !== "ship" && gapToRect(wall, e) < BALANCE.weaponRange)
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
    if (shot.kind === "arrow" && shot.retargetRange && (!quarry || quarry.hp <= 0)) {
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
    else if (shot.kind === "rocket") burst(run, shot, shot.splash, shot.damage, shot.by, effects, shot.critical, shot.stun, shot.tier, shot.naval, shot.source, shot.unitIndex, shot.procDepth);
    else if (quarry) {
      damage(run, quarry, shot.damage, effects, shot.by, shot.critical, shot.chaosDamage ?? false, shot.attack ?? "arrow", shot.unitIndex ?? -1, false, shot.source, shot.chaosDamage ?? false, shot.chaosDamage ? "chaos:arrow" : undefined, shot.flaming, origin, undefined, shot.procDepth); knock(run, quarry, origin, 4);
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
        && Math.abs((e.x - quarry.x) * dy - (e.y - quarry.y) * dx) / length <= 8
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
      enemy.x = start.x; enemy.y = start.y; retarget(run, enemy);
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
  dispatchBphEffects(run, { kind: "step", dt });
  if (run.roulette && (run.roulette.remaining -= dt) <= 0) effects.push(...settle(run));
  if (!run.bph) run.xp += dt * (run.level <= 2 ? 1 : BALANCE.passiveXp);
  spawnBphSurvival(run, { dt, effects }, entry => spawn(run, false, entry.boss,
    entry.bossId ? BOSSES[entry.bossId].pattern : undefined));
  schedule(run, effects);
  for (const squad of run.squads) squad.skillClock = Math.max(0, squad.skillClock - dt * run.meta.skillCharge);
  run.riftClock = Math.max(0, run.riftClock - dt);
  run.arrowClock = Math.max(-.1, run.arrowClock - dt); run.hwachaClock = Math.max(-.1, run.hwachaClock - dt);
  if ((run.commandClock -= dt) <= 0) { run.commandClock = .25; command(run, effects); }
  tend(run, dt, effects);
  tickChaos(run, dt, effects);
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
    squad.soldiers.forEach((unit, index) => fight(run, squad, unit, index, dt, effects));
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
        const gate = guardPoint(run.fort, "아래", SQUAD_MARGIN + 1);
        squad.targetX = gate.x; squad.targetY = gate.y; squad.strikeAt = 0;
      }
      if (contains(wall, { x: squad.targetX, y: squad.targetY })) {
        const outside = pushOut(fortRect(run.fort, SQUAD_MARGIN), { x: squad.targetX, y: squad.targetY });
        squad.targetX = outside.x; squad.targetY = outside.y;
      }
    }
  }
  for (const enemy of run.enemies) if (enemy.boss) {
    enemy.x = clamp(enemy.x, 48, WIDTH - 48); enemy.y = clamp(enemy.y, 88, HEIGHT - 56);
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
  for (const enemy of run.enemies) if (enemy.kind !== "ship") enemy.y = Math.min(enemy.y, riverBank() - 8);
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
    const armyEffect = request.spellId?.startsWith("chaos:") === true;
    const rawDamage = damage(run, request.target, request.amount, output, squad?.id ?? "skill",
      request.critical ?? false, armyEffect, "skill", index, request.target.kind === "ship", source?.kind, true, request.spellId, false, armyEffect ? request.position : undefined, request.cast, 0, request.attackId ?? request.cast?.attackId);
    const dealt = Math.min(previousHp, rawDamage);
    if (request.spellId && !armyEffect && dealt > 0) dispatchBphEffects(run, { kind: "spellHit",
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
