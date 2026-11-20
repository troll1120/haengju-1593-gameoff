import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import type { ChaosSkillEvent } from "../chaos-contract";
import { cannonOrigin } from "../chaos-skill-geometry";
import { chaosActive } from "../chaos-state";
import { fortRect, SIDES } from "../geometry";
import type { Direction, Point } from "../geometry";
import { PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import type { Run } from "../rules";
import type { ShowChannels } from "../skill-show";
import type { AmbientShow, FrameContext, SkillStage } from "../skill-stage";
import { TUNABLES } from "../tunables";
import { skillVfx } from "../skill-vfx";

/** 김시민's wall guns: the gun in a wall port and the standing battery of them. The barrage they fire is ../shows/iron-wall-show.
 *  This file keeps its old path so the shared ambient index needs no edit. */
export const CANNON_GENERAL = "김시민";

/** Display-only staging of the standing battery. Which ports stand, how many a side and when the next volley leaves are the
 *  rules': CHAOS_RULES.skills.cannon, run.chaos and the rules' own port geometry. These shares of the rules' passive period only
 *  say when a gun's fuse smoulders, burns and spits before that volley. */
export const WALL_BATTERY_SHOW = TUNABLES.wallBattery.show;

/** The stage's ground lies under the bodies and its trails over them; both lie under the enemy's red warnings. */
export type CannonLayer = "ground" | "trails";
export type CannonBrush = (x: number, y: number, wide: number, high: number) => void;
export type GunPart = "gun" | "flash";
export const GUN_LAYERS: Readonly<Record<GunPart, CannonLayer>> = { gun: "ground", flash: "trails" };
/** Names a part, its paint and its alpha, and takes back the brush that lays that part's boxes in field pixels. */
export type GunSink = (part: GunPart, paint: Paint, alpha: number) => CannonBrush;
/** A gun port on the fort's wall: the point a shell leaves from and the side of the wall it is on. */
export type WallPort = Point & { readonly side: Direction };
/** A gun's touch-hole and muzzle: cold, its fuse smouldering, burning or spitting before a volley, or just fired. */
export type GunHeat = "cold" | "smoulder" | "burn" | "spit" | "fired";

export const WAY_OUT: Readonly<Record<Direction, Point>> = { 위: { x: 0, y: -1 }, 아래: { x: 0, y: 1 }, 좌: { x: -1, y: 0 }, 우: { x: 1, y: 0 } };
/** How far out of the wall a gun's bore is, in pixels. */
const BORE = 5;
/** One box of a sprite on a wall port's own axes: from `near` to `far` pixels out of the wall, `across` wide about the port. */
type Box = readonly [part: GunPart, paint: Paint, alpha: number, near: number, far: number, across: number];
/** The port cut in the wall with the carriage in it, then the barrel from breech to bore. The barrel alone recoils. */
const MOUNT: readonly Box[] = [["gun", PALETTE.outline, .8, -10, 0, 12], ["gun", PALETTE.timber, 1, -9, -1, 10]];
const BARREL: readonly Box[] = [["gun", PALETTE.outline, 1, -8, BORE, 6], ["gun", PALETTE.steelDeep, 1, -7, 4, 4], ["gun", PALETTE.steelLight, 1, -7, 2, 2],
  ["gun", PALETTE.ochre, 1, -6, -4, 4], ["gun", PALETTE.brass, 1, 2, BORE, 6], ["gun", PALETTE.outline, 1, 4, BORE, 2]];
const HEAT: Readonly<Record<Exclude<GunHeat, "cold">, readonly Box[]>> = {
  smoulder: [["gun", PALETTE.ember, 1, -6, -4, 2]], burn: [["gun", PALETTE.flame, 1, -6, -4, 2]],
  spit: [["gun", PALETTE.cream, 1, -6, -4, 2], ["gun", PALETTE.flame, 1, -8, -6, 2]],
  fired: [["gun", PALETTE.flame, 1, 2, BORE, 6], ["gun", PALETTE.outline, 1, 4, BORE, 2]],
};
/** The muzzle flash in three steps from the bore outward: a core, a cross flare and a tip, shrinking. */
const blaze = (paints: readonly [Paint, Paint, Paint], alpha: number): readonly (readonly Box[])[] => [
  [["flash", paints[0], alpha, BORE, 17, 8], ["flash", paints[1], alpha * .9, 9, 13, 18], ["flash", paints[2], alpha * .9, 17, 24, 4]],
  [["flash", paints[1], alpha * .9, BORE, 14, 6], ["flash", paints[2], alpha * .8, 14, 19, 2], ["flash", paints[2], alpha * .6, 8, 10, 12]],
  [["flash", paints[2], alpha * .7, BORE, 11, 4], ["flash", PALETTE.ember, alpha * .5, 11, 14, 2]],
];
const BLAZE = { bright: blaze([PALETTE.white, PALETTE.cream, PALETTE.gold], 1), calm: blaze([PALETTE.gold, PALETTE.flame, PALETTE.ember], .7) } as const;

/** The mouth of the gun in a port: where its flash, its smoke and its sparks leave it. */
export function boreOf(port: WallPort): Point {
  return { x: port.x + WAY_OUT[port.side].x * BORE, y: port.y + WAY_OUT[port.side].y * BORE };
}

/** Lays wall guns on a sink. Not `bright` (flashes off), a muzzle flash runs dim and is never white. */
export class GunPainter {
  constructor(private readonly sink: GunSink, private readonly bright: boolean) {}

  /** A gun in its port: the port cut in the wall, the carriage and the barrel. `kick` is how far the barrel has recoiled into the wall, in pixels. */
  gun(port: WallPort, kick: number, heat: GunHeat): void {
    this.stamp(port, MOUNT);
    const out = WAY_OUT[port.side], barrel = kick ? { ...port, x: port.x - out.x * kick, y: port.y - out.y * kick } : port;
    this.stamp(barrel, BARREL);
    if (heat !== "cold") this.stamp(barrel, HEAT[heat]);
  }

  /** The muzzle flash at a share of its own life, from 0 to 1. */
  flash(port: WallPort, share: number): void {
    const steps = this.bright ? BLAZE.bright : BLAZE.calm;
    this.stamp(port, steps[Math.min(steps.length - 1, Math.floor(share * steps.length))]);
  }

  /** Lays a sprite's boxes on a wall port's own axes, so one sprite serves all four sides of the wall. */
  private stamp(port: WallPort, boxes: readonly Box[]): void {
    const x = Math.round(port.x), y = Math.round(port.y);
    for (const [part, paint, alpha, near, far, across] of boxes) {
      const brush = this.sink(part, paint, alpha), half = across / 2, deep = far - near;
      switch (port.side) {
        case "위": brush(x - half, y - far, across, deep); break;
        case "아래": brush(x - half, y + near, across, deep); break;
        case "좌": brush(x - far, y - half, deep, across); break;
        case "우": brush(x + near, y - half, deep, across); break;
        default: port.side satisfies never;
      }
    }
  }
}

export function stageSink<Part extends string>(stage: SkillStage, layers: Readonly<Record<Part, CannonLayer>>): (part: Part, paint: Paint, alpha: number) => CannonBrush {
  const brushes: Readonly<Record<CannonLayer, CannonBrush>> = {
    ground: (x, y, wide, high) => { stage.ground.fillRect(x, y, wide, high); },
    trails: (x, y, wide, high) => { stage.trails.fillRect(x, y, wide, high); },
  };
  return (part, paint, alpha) => {
    const layer = layers[part];
    stage[layer].fillStyle(paint, alpha);
    return brushes[layer];
  };
}

/** The rules' cannon shells, live and reserved, manual and passive alike. */
export function cannonShells(run: Readonly<Run>): readonly ChaosSkillEvent[] {
  return run.chaosSkills?.events.filter(event => event.kind === "cannon") ?? [];
}

export type BatteryPort = WallPort & { readonly firing: boolean };
export type BatteryPlan = {
  /** Every port the rules fire from at this army level, CHAOS_RULES.skills.cannon.count of them a side. A `firing` port has a
   *  live shell: its gun is the barrage's to draw, with its recoil. */
  readonly ports: readonly BatteryPort[];
  /** How far the rules' passive period has run toward the next volley, from 0 to 1. Absent while the battery is silent: its
   *  commander down, the run not in play, or motion off. */
  readonly fuse?: number;
  readonly heat: GunHeat;
};

const portKey = (port: Point): string => `${port.x},${port.y}`;

/** The ports the rules fire from, `count` a side: the rules' own origin for each gun aimed out of each side of the wall. */
export function batteryPorts(run: Readonly<Run>, count: number): WallPort[] {
  const wall = fortRect(run.fort), x = (wall.left + wall.right) / 2, y = (wall.top + wall.bottom) / 2;
  const beyond: Readonly<Record<Direction, Point>> = { 위: { x, y: wall.top - 1 }, 아래: { x, y: wall.bottom + 1 }, 좌: { x: wall.left - 1, y }, 우: { x: wall.right + 1, y } };
  return SIDES.flatMap(side => Array.from({ length: count }, (_, index) => ({ ...cannonOrigin(run, beyond[side], index, count), side })));
}

/** A gun's fuse by how near the rules' next volley is. Over the last stretch it spits on alternate ticks, and only with flashes on. */
function fuseHeat(fuse: number | undefined, spitting: boolean): GunHeat {
  const { smoulder, burn, spit } = WALL_BATTERY_SHOW;
  if (fuse === undefined || fuse < smoulder) return "cold";
  if (fuse < burn) return "smoulder";
  return fuse >= spit && spitting ? "spit" : "burn";
}

/** What the battery shows this frame, from the run alone. It stands for 김시민's army state only, so never at army level zero. */
export function planBattery(run: Readonly<Run>, channels: ShowChannels): BatteryPlan | undefined {
  const state = run.chaos, skills = run.chaosSkills;
  if (!state || state.general !== CANNON_GENERAL) return undefined;
  const { count, passiveEvery } = CHAOS_RULES.skills.cannon, band = chaosSkillBand(state.level), every = passiveEvery[band];
  const live = skills ? cannonShells(run).filter(shell => shell.startedTick <= skills.tick && skills.tick < shell.untilTick) : [];
  const firing = new Set(live.map(shell => portKey(shell.from)));
  const ports = batteryPorts(run, count[band]).map(port => ({ ...port, firing: firing.has(portKey(port)) }));
  const burning = channels.motion && every > 0 && run.phase === "playing" && chaosActive(run);
  const fuse = burning ? Math.max(0, Math.min(1, (state.tick - (state.nextBeltTick - every)) / every)) : undefined;
  return { ports, heat: fuseHeat(fuse, channels.flash && state.tick % 2 === 0), ...(fuse === undefined ? {} : { fuse }) };
}

export function paintBattery(plan: BatteryPlan, guns: GunPainter): void {
  for (const port of plan.ports) if (!port.firing) guns.gun(port, 0, plan.heat);
}

/** 김시민's standing wall battery, drawn every frame from run.chaos: a gun in every wall port the rules fire from at this army
 *  level, more of them a side as the level's band rises. Each gun's fuse smoulders, burns and spits as the rules' passive period
 *  runs out, and the rules' volley leaves as it does; the barrage draws the guns that fire. The guns lie on the ground layer,
 *  under the bodies and the enemy's red warnings. Motion off keeps them cold and still; a fallen commander's battery stands silent. */
class WallBatteryShow implements AmbientShow {
  readonly id = "wall-belt";
  readonly general = CANNON_GENERAL;

  update(stage: SkillStage, { run, channels }: FrameContext): void {
    const plan = planBattery(run, channels);
    const look = skillVfx(run, run.squads.find(squad => squad.general === this.general));
    const sink = stageSink(stage, GUN_LAYERS);
    if (plan) paintBattery(plan, new GunPainter((part, paint, alpha) => sink(part, paint, alpha * look.alpha), channels.flash && look.heavy));
  }

  /** The battery is drawn from the run each frame and holds nothing. */
  clear(): void {}
}

export const ambient: AmbientShow | undefined = new WallBatteryShow();
