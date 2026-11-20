import type { BphGeneral } from "./bph-commanders";
import type { BphFxContext } from "./bph-contract";
import type { Point } from "./geometry";
import type { Effect, Enemy, Run, Squad, Unit } from "./rules";

/** Army levels count applicable purchased placements; manual tiers stay at 3/6. */
export const CHAOS_MAX_LEVEL = 20;
export const CHAOS_MILESTONES = [1, 5, 10, 20] as const;
/** Simulation-owned geometry and clocks shared with the display lane. */
export const CHAOS_RULES = {
  simulationHz: 30,
  manualWall: { knockbackBand: 44, knockbackPixels: 22 },
  fleet: { manualWidth: 48, passTicks: 36, passSeconds: 1.2, afterimageTicks: 72, pushPixels: 30 },
  trail: { hitTicks: 12, lifetimeTicks: 36, capacity: 6, targets: 4 },
  ring: { lifetimeTicks: 12, capacity: 4 },
  orbit: { periodTicks: 120, count: 4, radius: 12, cooldownTicks: 30, power: .12 },
  purification: { count: 3, radius: 40, power: .20 },
} as const;
export type ChaosMods =
  | { readonly general: "권율"; readonly arrows: number; readonly spread: number; readonly arrowRatio: number; readonly pierceEvery: number;
      readonly manualArrows: number; readonly manualRatio: number; readonly radiusBonus: number; readonly retargetRange: number }
  | { readonly general: "신립"; readonly moveRatio: number; readonly every: number; readonly width: number; readonly ratio: number; readonly length: number }
  | { readonly general: "송상현"; readonly pierce: number; readonly lineRatio: number; readonly pierceRatio: number; readonly pierceRange: number;
      readonly lineHalfWidth: number; readonly lineSeconds: number; readonly lineLengthBonus: number; readonly linePowerScale: number }
  | { readonly general: "황진"; readonly every: number; readonly radius: number; readonly ratio: number; readonly targets: number;
      readonly manualRadiusBonus: number; readonly stompPower: number }
  | { readonly general: "김시민"; readonly width: number; readonly reduction: number; readonly every: number; readonly power: number;
      readonly castleReduction: number; readonly shieldBonus: number; readonly pulseWidth: number }
  | { readonly general: "곽재우"; readonly every: number; readonly count: number; readonly lifetime: number;
      readonly power: number; readonly period: number; readonly reach: number; readonly cleaveRadius: number; readonly moveSpeed: number;
      readonly groupEvery: number; readonly groupPower: number }
  | { readonly general: "사명대사"; readonly every: number; readonly count: number; readonly radius: number; readonly healRatio: number;
      readonly lifetime: number; readonly healEvery: number; readonly manualHealBonus: number; readonly generalHealScale: number }
  | { readonly general: "이순신"; readonly every: number; readonly passes: number; readonly landPower: number; readonly shipPower: number; readonly width: number };

const BANDS: Readonly<Record<BphGeneral, readonly [ChaosMods, ChaosMods, ChaosMods, ChaosMods]>> = {
  권율: [
    { general: "권율", arrows: 2, spread: 8, arrowRatio: .35, pierceEvery: 0, manualArrows: 2, manualRatio: .10, radiusBonus: 16, retargetRange: 240 },
    { general: "권율", arrows: 4, spread: 20, arrowRatio: .70, pierceEvery: 0, manualArrows: 4, manualRatio: .12, radiusBonus: 24, retargetRange: 300 },
    { general: "권율", arrows: 6, spread: 32, arrowRatio: 1.20, pierceEvery: 0, manualArrows: 8, manualRatio: .16, radiusBonus: 32, retargetRange: 360 },
    { general: "권율", arrows: 10, spread: 48, arrowRatio: 4.80, pierceEvery: 2, manualArrows: 16, manualRatio: .20, radiusBonus: 64, retargetRange: 480 },
  ],
  신립: [
    { general: "신립", moveRatio: .06, every: 12, width: 24, ratio: .35, length: 112 },
    { general: "신립", moveRatio: .12, every: 8, width: 36, ratio: .55, length: 144 },
    { general: "신립", moveRatio: .18, every: 6, width: 48, ratio: .80, length: 176 },
    { general: "신립", moveRatio: .24, every: 2, width: 80, ratio: 2.60, length: 256 },
  ],
  송상현: [
    { general: "송상현", pierce: 1, lineRatio: .10, pierceRatio: .40, pierceRange: 64, lineHalfWidth: 20, lineSeconds: 6, lineLengthBonus: 16, linePowerScale: 1.25 },
    { general: "송상현", pierce: 1, lineRatio: .20, pierceRatio: .50, pierceRange: 96, lineHalfWidth: 28, lineSeconds: 8, lineLengthBonus: 32, linePowerScale: 1.75 },
    { general: "송상현", pierce: 2, lineRatio: .35, pierceRatio: .65, pierceRange: 128, lineHalfWidth: 40, lineSeconds: 10, lineLengthBonus: 48, linePowerScale: 2.50 },
    { general: "송상현", pierce: 4, lineRatio: .60, pierceRatio: .90, pierceRange: 176, lineHalfWidth: 56, lineSeconds: 14, lineLengthBonus: 96, linePowerScale: 4 },
  ],
  황진: [
    { general: "황진", every: 12, radius: 48, ratio: .30, targets: 4, manualRadiusBonus: 16, stompPower: .6 },
    { general: "황진", every: 8, radius: 72, ratio: .50, targets: 6, manualRadiusBonus: 32, stompPower: 1 },
    { general: "황진", every: 6, radius: 96, ratio: .80, targets: 8, manualRadiusBonus: 60, stompPower: 1.6 },
    { general: "황진", every: 3, radius: 148, ratio: 1.40, targets: 12, manualRadiusBonus: 90, stompPower: 2.4 },
  ],
  김시민: [
    { general: "김시민", width: 24, reduction: .08, every: 60, power: .12, castleReduction: .04, shieldBonus: .3, pulseWidth: 12 },
    { general: "김시민", width: 40, reduction: .14, every: 45, power: .18, castleReduction: .10, shieldBonus: .6, pulseWidth: 20 },
    { general: "김시민", width: 72, reduction: .20, every: 30, power: .24, castleReduction: .20, shieldBonus: .6, pulseWidth: 28 },
    { general: "김시민", width: 96, reduction: .40, every: 24, power: .30, castleReduction: .55, shieldBonus: 4.2, pulseWidth: 36 },
  ],
  곽재우: [
    { general: "곽재우", every: 10, count: 2, lifetime: 240, power: .22, period: 45, reach: 96, cleaveRadius: 20, moveSpeed: 24, groupEvery: 90, groupPower: .33 },
    { general: "곽재우", every: 7, count: 4, lifetime: 420, power: .26, period: 36, reach: 120, cleaveRadius: 24, moveSpeed: 36, groupEvery: 90, groupPower: .39 },
    { general: "곽재우", every: 5, count: 8, lifetime: 600, power: .35, period: 30, reach: 144, cleaveRadius: 28, moveSpeed: 48, groupEvery: 75, groupPower: .525 },
    { general: "곽재우", every: 3, count: 12, lifetime: Infinity, power: .50, period: 30, reach: 176, cleaveRadius: 32, moveSpeed: 60, groupEvery: 60, groupPower: .75 },
  ],
  사명대사: [
    { general: "사명대사", every: 12, count: 2, radius: 32, healRatio: .0125, lifetime: 120, healEvery: 30, manualHealBonus: .03, generalHealScale: .25 },
    { general: "사명대사", every: 8, count: 3, radius: 48, healRatio: .025, lifetime: 150, healEvery: 30, manualHealBonus: .06, generalHealScale: .25 },
    { general: "사명대사", every: 6, count: 4, radius: 64, healRatio: .04, lifetime: 180, healEvery: 15, manualHealBonus: .12, generalHealScale: .25 },
    { general: "사명대사", every: 3, count: 6, radius: 96, healRatio: .08, lifetime: 240, healEvery: 15, manualHealBonus: .24, generalHealScale: .25 },
  ],
  이순신: [
    { general: "이순신", every: 450, passes: 1, landPower: 1.8, shipPower: 60, width: 56 },
    { general: "이순신", every: 300, passes: 1, landPower: 3.2, shipPower: 90, width: 64 },
    { general: "이순신", every: 210, passes: 2, landPower: 5.5, shipPower: 120, width: 72 },
    { general: "이순신", every: 120, passes: 3, landPower: 14, shipPower: 240, width: 96 },
  ],
};

/** Explicit entries 0..20. Zero is disabled, intermediate purchases keep their stat effect. */
function levels(general: BphGeneral): readonly (ChaosMods | null)[] {
  return Array.from({ length: 21 }, (_, level) =>
    level === 0 ? null : BANDS[general][level >= 20 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0]);
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
  defense?: { unitIncoming: number; unitPrevented: number; castleIncoming: number; castlePrevented: number };
  general: BphGeneral; level: number; mods: ChaosMods; tick: number; remainder: number;
  attacks: number; rangedAttacks: number; kills: number;
  trails: ChaosTrail[]; rings: ChaosRing[]; pools: ChaosPool[]; militia: ChaosMilitia[];
  fleet: ChaosFleetPass[]; orbitHits: Record<number, number>;
  pendingMilitia: { at: Point; dueTick: number }[];
  /** Collision-only overflow; starts immediately and never waits for a visual slot. */
  pendingTrails: ChaosTrail[];
  stomps: { at: Point; dueTick: number; radius: number; power: number }[];
  nextFleetTick: number; nextBeltTick: number; militiaGroup: number;
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
  levels: [0, 5, 10, 20],
  rangedDamageMultiplier: { 권율: [1, 1.70, 2.20, 7], 송상현: [1, 1.70, 2.65, 5.20] },
  directDamageMultiplier: { 신립: [1, 1.275, 1 + .8 * 4 / 6, 6.2], 황진: [1, 1.375, 1 + .8 * 8 / 6, 6.6] },
  beltDamagePerSecondPerTarget: [0, .12, .24, .375],
  militiaDamagePerSecondPerBody: [0, .26 / 1.2, .35, .625],
  poolMaxHpPerSecond: [0, .025, .08, .16],
  unitDamageReduction: [0, .14, .20, .40],
  castleDamageReduction: [0, .10, .20, .55],
  fleetLandDamagePerSecondPerTarget: [0, .32, 5.5 / 7, 3.5],
  fleetShipDamagePerSecond: [0, 9, 120 / 7, 60],
  clearRate: "Measure with the same enemy HP, composition and input sequence; no universal clear-rate multiplier.",
} as const;
