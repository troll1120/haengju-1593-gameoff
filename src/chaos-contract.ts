import type { BphGeneral } from "./bph-commanders";
import type { BphFxContext } from "./bph-contract";
import type { Point } from "./geometry";
import type { Effect, Enemy, Run, Squad, Unit } from "./rules";
import { TUNABLES } from "./tunables";

/** Survival levels grow inside the run (chaos-growth.ts); manual tiers stay at 3/6. */
export const CHAOS_MAX_LEVEL = 20;
export const CHAOS_MILESTONES = [1, 5, 10, 15, 20] as const;
/** Simulation-owned geometry and clocks shared with the display lane. */
export const CHAOS_RULES = {
  simulationHz: 30,
  manualWall: { knockbackBand: 44, knockbackPixels: 22 },
  fleet: { manualWidth: 48, passTicks: 36, passSeconds: 1.2, afterimageTicks: 72, pushPixels: 30,
    // Share of the army's blows since the last sortie that the next sortie lands on land enemies, by chaosSkillBand; 0 leaves
    // the fleet at its own landPower. At Lv20 it rides the army as 신립's trails, 황진's pulses and 사명대사's bell do
    // (general-balance, 2026-11-18).
    armyRatio: [0, 0, 0, 0, 0, .2] },
  trail: { hitTicks: 12, lifetimeTicks: 36, capacity: 6, targets: 4 },
  ring: { lifetimeTicks: 12, capacity: 4 },
  orbit: { periodTicks: 120, count: 4, radius: 12, cooldownTicks: 30, power: .12 },
  purification: { count: 3, radius: 40, power: .20 },
  skills: {
    columns: 3, rows: 4, margin: 24, afterTicks: 15,
    // Half-size in px of the box around the general where a cast lands, by band (owner DM 1794930926.233179): Lv1 lands
    // close around him, each band widens it, Lv20 (and the legacy L0 column) keep today's whole field.
    area: [Infinity, 110, 170, 240, 330, Infinity],
    // power is a cast's damage budget split over its hits (see castChaosSkill's divisor). Per hit it is today's start
    // x [L0 1, Lv1 .5, Lv5 .75, Lv10 .9, Lv15 1.15, Lv20 1.5] (owner DM 1794930976.143139), before the +3%/level.
    // Six columns by chaosSkillBand: [L0, Lv1-4 small start, Lv5-9, Lv10-14, Lv15-19, Lv20]. Lv5-20 are the former
    // L1-4 / L5-9 / L10-19 / L20 values pushed one band later (general-growth/design.md 1.1-1.2).
    arrows: { waves: [0, 1, 3, 5, 8, 12], interval: 15, flight: 12, radiusScale: [.52, .30, .52, .52, .52, .52], arc: 90, power: [0, .33, 1.5, 3, 6.13, 12],
      arrowArea: 1200, visualDensity: [0, 1 / 6, 1 / 3, 1 / 2, 2 / 3, 1] },
    clones: { count: [1, 1, 2, 4, 6, 10], power: [.5, .5, 1.5, 3.6, 6.9, 15], push: 8 },
    thunder: { count: [3, 2, 4, 6, 9, 12], waves: [3, 2, 4, 5, 7, 10], interval: 18, flight: 9, radius: [70, 48, 70, 70, 70, 70], power: [5.4, 1.8, 5.4, 8.1, 14.49, 27] },
    stomps: { count: [0, 1, 2, 3, 5, 8], waves: [0, 1, 2, 3, 4, 6], interval: 18, flight: 9, radius: [72, 48, 72, 72, 72, 72], power: [0, .5, 1.5, 2.7, 4.6, 9] },
    militia: { count: [0, 1, 2, 3, 4, 6], waves: [0, 2, 3, 4, 6, 8], interval: 18, lifetime: [240, 150, 240, 240, 240, 240], attackEvery: 30,
      reach: 96, radius: 24, speed: 60, spacing: 20, power: [0, .63, 4.5, 10.8, 27.6, 72] },
    ships: { count: [0, 1, 2, 4, 6, 10], waves: [0, 1, 2, 3, 4, 6], interval: 24, travel: 36, width: 56,
      power: [0, .75, 4.5, 16.2, 41.4, 135], shipPower: 300, push: 30, edge: 24 },
    cannon: TUNABLES.wallBattery.rules,
    bell: { waves: [1, 1, 2, 3, 4, 6], interval: 24, expand: 24, radiusScale: [1, .70, 1.05, 1.1, 1.15, 1.25],
      power: [4, 2, 6, 10.8, 18.4, 36], stun: .3, passiveStun: 0, passiveEvery: [0, 16, 12, 8, 6, 3], passiveScale: .08 },
  },
} as const;
export function chaosSkillBand(level: number): 0 | 1 | 2 | 3 | 4 | 5 {
  return level >= 20 ? 5 : level >= 15 ? 4 : level >= 10 ? 3 : level >= 5 ? 2 : level > 0 ? 1 : 0;
}
export type ChaosSkillKind = "arrows" | "clones" | "thunder" | "stomps" | "militia" | "ships" | "cannon" | "bell";
/** Mutable simulation actors; the display only reads these records. */
export type ChaosSkillEvent = Point & {
  id: number; castId: number; squad: number; general: BphGeneral; level: number; kind: ChaosSkillKind;
  readonly trigger: "manual" | "army";
  wave: number; ordinal: number; from: Point; to: Point;
  startedTick: number; impactTick: number; untilTick: number; nextTick: number;
  radius: number; currentRadius: number; arcHeight: number; power: number; shipPower: number; push: number; stun: number;
  hits: number[]; resolved: boolean;
};
export type ChaosSkillState = { tick: number; remainder: number; events: ChaosSkillEvent[] };
export type ChaosMods =
  | { readonly general: "권율"; readonly arrows: number; readonly spread: number; readonly arrowRatio: number; readonly pierceEvery: number;
      readonly manualArrows: number; readonly manualRatio: number; readonly radiusBonus: number; readonly retargetRange: number }
  | { readonly general: "신립"; readonly moveRatio: number; readonly every: number; readonly width: number; readonly ratio: number; readonly length: number }
  | { readonly general: "송상현"; readonly pierce: number; readonly lineRatio: number; readonly pierceRatio: number; readonly pierceRange: number;
      readonly lineHalfWidth: number; readonly lineSeconds: number; readonly lineLengthBonus: number; readonly linePowerScale: number;
      /** Lv20 only: army attacks per ricochet off the struck enemy, and the share of that blow each of its hits lands. */
      readonly ricochetEvery?: number; readonly ricochetRatio?: number }
  | { readonly general: "황진"; readonly every: number; readonly radius: number; readonly ratio: number; readonly targets: number;
      readonly manualRadiusBonus: number; readonly stompPower: number }
  | { readonly general: "김시민"; readonly width: number; readonly reduction: number; readonly every: number; readonly power: number;
      readonly castleReduction: number; readonly shieldBonus: number; readonly pulseWidth: number;
      /** Lv20 only: share of the army's blows since the battery's last volley that each shell of the next one lands. */
      readonly armyRatio?: number }
  | { readonly general: "곽재우"; readonly every: number; readonly count: number; readonly lifetime: number;
      readonly power: number; readonly period: number; readonly reach: number; readonly cleaveRadius: number; readonly moveSpeed: number;
      readonly groupEvery: number; readonly groupPower: number;
      /** Lv20 only: army attacks per rally strike of the militiaman nearest the struck enemy, and the share of that blow it lands. */
      readonly rally?: number; readonly rallyRatio?: number }
  | { readonly general: "사명대사"; readonly every: number; readonly count: number; readonly radius: number; readonly healRatio: number;
      readonly lifetime: number; readonly healEvery: number; readonly manualHealBonus: number; readonly generalHealScale: number }
  | { readonly general: "이순신"; readonly every: number; readonly passes: number; readonly landPower: number; readonly shipPower: number; readonly width: number };

const BANDS: Readonly<Record<BphGeneral, readonly [ChaosMods, ChaosMods, ChaosMods, ChaosMods, ChaosMods]>> = {
  권율: [
    // Row 0 is the Lv1-4 small start (design 1.2); rows 1-4 are the former four rows, one band later.
    { general: "권율", arrows: 1, spread: 4, arrowRatio: .20, pierceEvery: 0, manualArrows: 1, manualRatio: .10, radiusBonus: 8, retargetRange: 200 },
    { general: "권율", arrows: 2, spread: 8, arrowRatio: .35, pierceEvery: 0, manualArrows: 2, manualRatio: .10, radiusBonus: 16, retargetRange: 240 },
    { general: "권율", arrows: 4, spread: 20, arrowRatio: .70, pierceEvery: 0, manualArrows: 4, manualRatio: .12, radiusBonus: 24, retargetRange: 300 },
    { general: "권율", arrows: 6, spread: 32, arrowRatio: 1.20, pierceEvery: 0, manualArrows: 8, manualRatio: .16, radiusBonus: 32, retargetRange: 360 },
    { general: "권율", arrows: 10, spread: 48, arrowRatio: 9.60, pierceEvery: 2, manualArrows: 16, manualRatio: .20, radiusBonus: 64, retargetRange: 480 },
  ],
  신립: [
    { general: "신립", moveRatio: .03, every: 16, width: 16, ratio: .20, length: 80 },
    { general: "신립", moveRatio: .06, every: 12, width: 24, ratio: .35, length: 112 },
    { general: "신립", moveRatio: .12, every: 8, width: 36, ratio: .55, length: 144 },
    { general: "신립", moveRatio: .18, every: 6, width: 48, ratio: .80, length: 176 },
    { general: "신립", moveRatio: .24, every: 2, width: 80, ratio: 2.60, length: 256 },
  ],
  송상현: [
    { general: "송상현", pierce: 1, lineRatio: 0, pierceRatio: .25, pierceRange: 40, lineHalfWidth: 0, lineSeconds: 0, lineLengthBonus: 0, linePowerScale: 0 },
    { general: "송상현", pierce: 1, lineRatio: 0, pierceRatio: .40, pierceRange: 64, lineHalfWidth: 0, lineSeconds: 0, lineLengthBonus: 0, linePowerScale: 0 },
    { general: "송상현", pierce: 1, lineRatio: 0, pierceRatio: .50, pierceRange: 96, lineHalfWidth: 0, lineSeconds: 0, lineLengthBonus: 0, linePowerScale: 0 },
    { general: "송상현", pierce: 2, lineRatio: 0, pierceRatio: .65, pierceRange: 128, lineHalfWidth: 0, lineSeconds: 0, lineLengthBonus: 0, linePowerScale: 0 },
    { general: "송상현", pierce: 4, lineRatio: 0, pierceRatio: .90, pierceRange: 176, lineHalfWidth: 0, lineSeconds: 0, lineLengthBonus: 0, linePowerScale: 0,
      ricochetEvery: 5, ricochetRatio: .90 },
  ],
  황진: [
    { general: "황진", every: 16, radius: 32, ratio: .20, targets: 2, manualRadiusBonus: 16, stompPower: .4 },
    { general: "황진", every: 12, radius: 48, ratio: .30, targets: 4, manualRadiusBonus: 16, stompPower: .6 },
    { general: "황진", every: 8, radius: 72, ratio: .50, targets: 6, manualRadiusBonus: 32, stompPower: 1 },
    { general: "황진", every: 6, radius: 96, ratio: .80, targets: 8, manualRadiusBonus: 60, stompPower: 1.6 },
    { general: "황진", every: 3, radius: 148, ratio: 1.40, targets: 12, manualRadiusBonus: 90, stompPower: 2.4 },
  ],
  김시민: [
    { general: "김시민", width: 16, reduction: 0, every: 150, power: .08, castleReduction: 0, shieldBonus: 0, pulseWidth: 8 },
    { general: "김시민", width: 24, reduction: 0, every: 120, power: .12, castleReduction: 0, shieldBonus: 0, pulseWidth: 12 },
    { general: "김시민", width: 40, reduction: 0, every: 105, power: .18, castleReduction: 0, shieldBonus: 0, pulseWidth: 20 },
    { general: "김시민", width: 72, reduction: 0, every: 90, power: .24, castleReduction: 0, shieldBonus: 0, pulseWidth: 28 },
    { general: "김시민", width: 96, reduction: 0, every: 75, power: .30, castleReduction: 0, shieldBonus: 0, pulseWidth: 36, armyRatio: .25 },
  ],
  곽재우: [
    { general: "곽재우", every: 14, count: 1, lifetime: 150, power: .16, period: 45, reach: 72, cleaveRadius: 16, moveSpeed: 24, groupEvery: 90, groupPower: .33 },
    { general: "곽재우", every: 10, count: 2, lifetime: 240, power: .22, period: 45, reach: 96, cleaveRadius: 20, moveSpeed: 24, groupEvery: 90, groupPower: .33 },
    { general: "곽재우", every: 7, count: 4, lifetime: 420, power: .26, period: 36, reach: 120, cleaveRadius: 24, moveSpeed: 36, groupEvery: 90, groupPower: .39 },
    { general: "곽재우", every: 5, count: 8, lifetime: 600, power: .35, period: 30, reach: 144, cleaveRadius: 28, moveSpeed: 48, groupEvery: 75, groupPower: .525 },
    { general: "곽재우", every: 3, count: 12, lifetime: Infinity, power: .50, period: 30, reach: 176, cleaveRadius: 32, moveSpeed: 60, groupEvery: 60, groupPower: .75,
      rally: 6, rallyRatio: 2.5 },
  ],
  사명대사: [
    { general: "사명대사", every: 16, count: 1, radius: 24, healRatio: 0, lifetime: 90, healEvery: 30, manualHealBonus: 0, generalHealScale: 0 },
    { general: "사명대사", every: 12, count: 2, radius: 32, healRatio: 0, lifetime: 120, healEvery: 30, manualHealBonus: 0, generalHealScale: 0 },
    { general: "사명대사", every: 8, count: 3, radius: 48, healRatio: 0, lifetime: 150, healEvery: 30, manualHealBonus: 0, generalHealScale: 0 },
    { general: "사명대사", every: 6, count: 4, radius: 64, healRatio: 0, lifetime: 180, healEvery: 15, manualHealBonus: 0, generalHealScale: 0 },
    { general: "사명대사", every: 3, count: 6, radius: 96, healRatio: 0, lifetime: 240, healEvery: 15, manualHealBonus: 0, generalHealScale: 0 },
  ],
  이순신: [
    { general: "이순신", every: 600, passes: 1, landPower: 1.2, shipPower: 40, width: 40 },
    { general: "이순신", every: 450, passes: 1, landPower: 1.8, shipPower: 60, width: 56 },
    { general: "이순신", every: 300, passes: 1, landPower: 3.2, shipPower: 90, width: 64 },
    { general: "이순신", every: 210, passes: 2, landPower: 5.5, shipPower: 120, width: 72 },
    { general: "이순신", every: 120, passes: 3, landPower: 14, shipPower: 240, width: 96 },
  ],
};

/** Explicit entries 0..20. Zero is disabled; levels between band edges keep the band's row. */
function levels(general: BphGeneral): readonly (ChaosMods | null)[] {
  return Array.from({ length: 21 }, (_, level) => level === 0 ? null : BANDS[general][chaosSkillBand(level) - 1]);
}
export const CHAOS_LEVELS: Readonly<Record<BphGeneral, readonly (ChaosMods | null)[]>> = {
  권율: levels("권율"), 신립: levels("신립"), 송상현: levels("송상현"), 황진: levels("황진"),
  김시민: levels("김시민"), 곽재우: levels("곽재우"), 사명대사: levels("사명대사"), 이순신: levels("이순신"),
};

export type ChaosTrail = {
  id: number; from: Point; to: Point; startedTick: number; untilTick: number;
  width: number; power: number; source: number; hits: number[];
};
export type ChaosRing = Point & { id: number; radius: number; startedTick: number; untilTick: number };
export type ChaosPool = Point & {
  id: number; radius: number; startedTick: number; untilTick: number; nextTick: number; healRatio: number;
};
export type ChaosMilitia = Point & {
  id: number; startedTick: number; untilTick: number; nextTick: number;
  aimX: number; aimY: number; struckTick: number;
};
export type ChaosFleetPass = {
  width?: number;
  id: number; lane: number; dueTick: number; untilTick: number;
  landIds: number[]; shipIds: number[]; landPower: number; shipPower: number; push: number; resolved: boolean;
};
/** Mutable, per-run simulation state. Never allocated for level zero or legacy runs. */
export type ChaosState = {
  /** The sandbox operator selected a fixed level for this run. */
  manualLevel?: true;
  defense?: { unitIncoming: number; unitPrevented: number; castleIncoming: number; castlePrevented: number };
  general: BphGeneral; level: number; mods: ChaosMods; tick: number; remainder: number;
  /** In-run general XP (chaos-growth.ts); level is derived from it. hitXp: skill-hit XP granted per castId, capped. */
  xp: number; hitXp: Record<number, number>;
  /** Feeding: purchases inside the current supply window (window = floor(time / supplySeconds)). */
  feedWindow: number; feeds: number;
  attacks: number; rangedAttacks: number; kills: number;
  trails: ChaosTrail[]; rings: ChaosRing[]; pools: ChaosPool[]; militia: ChaosMilitia[];
  fleet: ChaosFleetPass[]; orbitHits: Record<number, number>;
  pendingMilitia: { at: Point; dueTick: number }[];
  /** Collision-only overflow; starts immediately and never waits for a visual slot. */
  pendingTrails: ChaosTrail[];
  stomps: { at: Point; dueTick: number; radius: number; power: number }[];
  nextFleetTick: number; nextBeltTick: number; militiaGroup: number;
  /** Lv20 김시민 and 이순신 only: the army's attack amounts since the battery's last volley or the fleet's last sortie. Absent
   *  until the first such blow, so every other run keeps its state shape. */
  blows?: number;
};
export type ChaosContext = {
  readonly run: Run; readonly state: ChaosState; readonly squad: Squad;
  readonly effects: Effect[];
  readonly combat: Pick<BphFxContext, "applyDamage" | "heal"> & {
    knock(enemy: Enemy, from: Point, pixels: number): void;
  };
};
export type ChaosAttack = {
  readonly unit: Unit; readonly target: Point; readonly amount: number;
};

/** Analytical saturated-target bounds, NOT measured DPS. Shared with the wave lane.
 * Ratios exclude purchased stats, manual casts and downtime; see docs/chaos-growth.md. */
export const CHAOS_POWER_CURVE = {
  // The bounds were derived for the former L5-9 / L10-19 rows, which now sit at Lv10-14 / Lv15-19.
  levels: [0, 10, 15, 20],
  rangedDamageMultiplier: { 권율: [1, 1.70, 2.20, 13], 송상현: [1, 1.50, 2.30, 4.60] },
  directDamageMultiplier: { 신립: [1, 1.275, 1 + .8 * 4 / 6, 6.2], 황진: [1, 1.375, 1 + .8 * 8 / 6, 6.6] },
  beltDamagePerSecondPerTarget: [0, 0, 0, 0],
  militiaDamagePerSecondPerBody: [0, .26 / 1.2, .35, .625],
  poolMaxHpPerSecond: [0, 0, 0, 0],
  unitDamageReduction: [0, 0, 0, 0],
  castleDamageReduction: [0, 0, 0, 0],
  fleetLandDamagePerSecondPerTarget: [0, .32, 5.5 / 7, 3.5],
  fleetShipDamagePerSecond: [0, 9, 120 / 7, 60],
  clearRate: "Measure with the same enemy HP, composition and input sequence; no universal clear-rate multiplier.",
} as const;
