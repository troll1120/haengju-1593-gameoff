import type Phaser from "phaser";
import { CHAOS_RULES } from "../chaos-contract";
import type { ChaosFleetPass, ChaosMods, ChaosSkillEvent, ChaosSkillState, ChaosState } from "../chaos-contract";
import { HEIGHT, WIDTH } from "../geometry";
import type { Point, Rect } from "../geometry";
import { LAYER, PALETTE, rangeCells } from "../presentation";
import type { Paint } from "../presentation";
import { SHIP_FRAME, SHIP_POSES } from "../river";
import type { Run } from "../rules";
import { scatter } from "../skill-show";
import type { ShowChannels } from "../skill-show";
import type { AmbientShow, FrameContext, SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";

/** The side row of the ship sheet faces right. Measured on the sheet: the row's first cell, the bow tip, the keel line through the
 *  middle of the hull, the stern's last pixel, how far the hull reaches above and below the keel, and the dragon's mouth from the bow.
 *  The ghost is the white hit sheet the scene bakes at boot; the canvas renderer draws no tints. */
const SHIP = { key: "geobukseon", ghost: "geobukseon-white", side: 28, bow: 53, keel: 47, stern: 3, rise: 16, mouth: { x: -2, y: -9 }, frameMs: 70 } as const;
/** Ground cells as every reach mark draws them, and the finer cells of fire and foam lines. */
const CELL = 4, DOT = 2;
/** Display-only shaping. Every size, count and clock of a pass is read from run.chaos and CHAOS_RULES while it is drawn. */
const MARK = { fill: .12, tide: .16, chevron: .5, chevronGap: 40, chevronArm: 3, chevronPace: 60 } as const;
const IMPACT = { flashMs: 100, flash: .3, rippleMs: 260, ripple: .55, rippleWidth: 8, sweep: 16, splash: 5, struck: 12 } as const;
/** The water around the hull, set for the ship at twice its sheet size and scaled with it; the wake's foam lines dash 8 px in 12. */
const CHURN = { swell: 16, glow: 40, wake: 96, streak: 84, beatMs: 100, alpha: .8, dash: 8, every: 12 } as const;
const FIRE = { length: 46, spread: .2, drop: .26, beatMs: 45, surge: [0, 6, 10, 4], bands: [.88, .74, .5, .3] } as const;
/** Motes per second of a crossing and the pull on them; the afterimage's ghost ships and the foam streaks per row drifting on. */
const RATE = { spray: 90, embers: 40 } as const, PULL = { spray: 520, embers: -40 } as const;
const AFTER = { echo: .3, foam: .35, streaks: 3, drift: 24, shortest: 8, longest: 24 } as const;
const SPRAY_INSET = 4;
/** Display-only shaping of a booked ship's ground. Its lane rises over `riseMs` at the launch. Its water is laid in steps so a whole
 *  fleet stays cheap: churned wake astern in steps this long and foam ahead of the bow in steps this deep (at the sheet's size), each
 *  narrower by `taper` and paler, the wake's foam at `foam` of its step. */
const WASH = { riseMs: 90, wake: 16, wakeAlpha: [.55, .38, .22], swell: 4, swellAlpha: [.9, .75, .6], taper: 4, foam: .7 } as const;

const WATER = [PALETTE.white, PALETTE.silverLight, PALETTE.ally, PALETTE.teal] as const;
const FLAME = [PALETTE.white, PALETTE.cream, PALETTE.gold, PALETTE.flame, PALETTE.ember] as const;
const EMBERS = [PALETTE.gold, PALETTE.flame, PALETTE.ember] as const;
/** Between the ground marks and the danger marks: the ships and their afterimages sail under every red telegraph and every body. */
const SHIP_DEPTH = LAYER.dusk + (LAYER.ground - LAYER.dusk) / 2, ECHO_DEPTH = LAYER.dusk + (LAYER.ground - LAYER.dusk) / 4;
const snap = (value: number, step: number = CELL): number => Math.floor(value / step) * step;

/** The ground a pass strikes: every land foe within half its width of the lane, anywhere across the field (the rules set no end).
 *  Rows are the 4px ground cells whose centres lie inside, as every reach mark measures them. A pass without a width uses its level's. */
export type Band = { readonly lane: number; readonly half: number; readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };
export function passBand(pass: Pick<ChaosFleetPass, "lane" | "width">, mods: ChaosMods, field: number): Band {
  const half = (pass.width ?? (mods.general === "이순신" ? mods.width : CHAOS_RULES.fleet.manualWidth)) / 2;
  return { lane: pass.lane, half, top: Math.ceil((pass.lane - half - CELL / 2) / CELL) * CELL,
    bottom: snap(pass.lane + half - CELL / 2) + CELL, left: 0, right: field };
}

/** The rules' tick plus the time already banked toward the next one, so the picture moves smoothly between simulation ticks. */
export function fleetTick(state: Pick<ChaosState, "tick" | "remainder">): number {
  return state.tick + Math.max(0, Math.min(1, state.remainder * CHAOS_RULES.simulationHz));
}

/** Where a pass stands on the rules' clock: marked until its due tick, crossing for passTicks, then fading for afterimageTicks. */
export type PassPhase = { readonly kind: "due"; readonly ahead: number } | { readonly kind: "crossing"; readonly sailed: number }
  | { readonly kind: "afterimage"; readonly fade: number } | { readonly kind: "gone" };
export function passPhase(pass: Pick<ChaosFleetPass, "dueTick" | "untilTick">, tick: number): PassPhase {
  const { passTicks, afterimageTicks } = CHAOS_RULES.fleet, crossed = pass.dueTick + passTicks;
  if (tick < pass.dueTick) return { kind: "due", ahead: pass.dueTick - tick };
  if (tick < crossed) return { kind: "crossing", sailed: (tick - pass.dueTick) / passTicks };
  if (tick < Math.min(pass.untilTick, crossed + afterimageTicks)) return { kind: "afterimage", fade: 1 - (tick - crossed) / afterimageTicks };
  return { kind: "gone" };
}

/** What one pass shows this frame. `band` is the alpha of its still mark. Motion off keeps only that mark until the crossing ends:
 *  no tide, ship, wake, spray, shake or afterimage. Flashes off keeps the motion without the bright landing flash. */
export type Layers = { readonly band: number; readonly tide: boolean; readonly ship: boolean; readonly flash: boolean; readonly afterimage: boolean };
export function passLayers(phase: PassPhase, channels: ShowChannels): Layers {
  const { motion } = channels, crossing = motion && phase.kind === "crossing";
  return { band: phase.kind === "gone" ? 0 : phase.kind === "afterimage" ? motion ? phase.fade : 0 : 1, tide: motion && phase.kind === "due",
    ship: crossing, flash: crossing && channels.flash, afterimage: crossing || motion && phase.kind === "afterimage" };
}

/** The largest whole scale at which the hull stays inside the band and is at most half the band's length: a wider band sails a bigger ship. */
export function shipScale(band: Band): number {
  return Math.max(1, Math.min(Math.floor(band.half / SHIP.rise), Math.floor((band.right - band.left) / 2 / (SHIP.bow - SHIP.stern))));
}
/** Where the bow stands after `sailed` of the crossing: it enters at the band's left end, and the stern clears the right end as the pass time runs out. */
export function fleetBow(band: Band, hull: number, sailed: number): number {
  return band.left + (band.right - band.left + hull) * sailed;
}
/** The inverse of fleetBow, shared by the picture and its held HP/hit/death results. */
export function fleetArrivalTick(pass: ChaosFleetPass, mods: ChaosMods, x: number, field: number): number {
  const band = passBand(pass, mods, field), hull = (SHIP.bow - SHIP.stern) * shipScale(band);
  return pass.dueTick + Math.max(0, Math.min(1, (x - band.left) / (band.right - band.left + hull))) * CHAOS_RULES.fleet.passTicks;
}

export type Drop = Point & { readonly at: number; readonly vx: number; readonly vy: number; readonly life: number; readonly paint: Paint; readonly size: number };
/** A ghost of the ship left with its bow at `x` when the crossing reached `at`. */
export type Echo = { readonly at: number; readonly x: number };
export type PassPlan = { readonly scale: number; readonly hull: number; readonly rise: number; readonly spray: readonly Drop[]; readonly embers: readonly Drop[];
  readonly echoes: readonly Echo[]; readonly grain: readonly number[] };

/** One pass's decoration, decided once from its seed: the ship's size, the spray off its bow and the embers from its dragon timed as
 *  shares of the crossing, the afterimages it leaves tiled down the band, and its water's speckle. Everything starts inside the real
 *  band. With motion off nothing is planned to move. */
export function planPass(seed: number, band: Band, still: boolean): PassPlan {
  const random = scatter(seed), scale = shipScale(band), hull = (SHIP.bow - SHIP.stern) * scale, rise = SHIP.rise * scale;
  const grain = Array.from({ length: 256 }, () => random());
  if (still) return { scale, hull, rise, spray: [], embers: [], echoes: [], grain };
  const seconds = CHAOS_RULES.fleet.passSeconds, room = band.half - SPRAY_INSET, span = band.right - band.left;
  const thrown = (count: number, make: (index: number, at: number) => Drop): Drop[] =>
    Array.from({ length: count }, (_, index) => make(index, (index + random()) / count)).filter(drop => drop.x < band.right);
  const spray = thrown(Math.round(RATE.spray * seconds), (index, at) => ({ at, x: fleetBow(band, hull, at) + 2 + random() * 10,
    y: band.lane + (random() - .5) * 2 * room, vx: 60 + random() * 200, vy: -(80 + random() * 140), life: 300 + random() * 160,
    paint: WATER[index % WATER.length], size: 2 + Math.floor(random() * 2) }));
  const embers = thrown(Math.round(RATE.embers * seconds), (index, at) => ({ at, x: fleetBow(band, hull, at) + (SHIP.mouth.x + 2 + random() * 12) * scale,
    y: band.lane + (SHIP.mouth.y + random() * 4) * scale, vx: 380 + random() * 180, vy: -(10 + random() * 60), life: 180 + random() * 150,
    paint: EMBERS[index % EMBERS.length], size: 1 + Math.floor(random() * 2) }));
  const count = Math.max(1, Math.floor(span / hull)), stretch = span / count;
  const echoes = Array.from({ length: count }, (_, index) => {
    const x = band.left + stretch * (index + .5) + hull / 2;
    return { at: (x - band.left) / (span + hull), x };
  });
  return { scale, hull, rise, spray, embers, echoes, grain };
}

/** The way a booked ship's route runs across the field. */
export type Heading = "east" | "west" | "south" | "north";
const SIDE = { row: SHIP.side, x: (SHIP.bow + SHIP.stern) / 2, y: SHIP.keel, fore: (SHIP.bow - SHIP.stern) / 2, beam: SHIP.rise, mouth: -SHIP.mouth.y } as const;
/** The sheet's facing for each heading, measured on it: the row's first cell, the hull's middle in a cell, how far the hull reaches
 *  from there along and across its travel, how far the dragon's mouth sits above the keel, and one pixel of travel. The side row
 *  faces east and is mirrored for west; a ship sailing down the field shows its front, one sailing up it its back. */
export const FACING = {
  east: { ...SIDE, mirrored: false, dx: 1, dy: 0 }, west: { ...SIDE, mirrored: true, dx: -1, dy: 0 },
  south: { row: 0, x: 28, y: 39, fore: 24, beam: 20, mouth: 0, mirrored: false, dx: 0, dy: 1 },
  north: { row: 14, x: 28, y: 37, fore: 25, beam: 20, mouth: 0, mirrored: false, dx: 0, dy: -1 },
} as const;

/** The fleet a manual cast books at army level 1 and up (run.chaosSkills): one event a ship, each on its own real route. Level 0 keeps none. */
export function shipWaves(run: Pick<Run, "chaosSkills">): readonly ChaosSkillEvent[] {
  return run.chaosSkills?.events.filter(event => event.kind === "ships") ?? [];
}
export function shipHeading({ from, to }: Pick<ChaosSkillEvent, "from" | "to">): Heading {
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dy) > Math.abs(dx) ? dy > 0 ? "south" : "north" : dx < 0 ? "west" : "east";
}

/** The ground a booked ship's collision sweeps, as every reach mark measures it: the 4px cells on the field whose middles lie within
 *  the event's radius of its route, joined into the fewest bands (rows, or columns for a route that runs up or down the field). */
export function shipLane(event: Pick<ChaosSkillEvent, "from" | "to" | "radius">): Rect[] {
  const upright = !FACING[shipHeading(event)].dx, spans = new Map<number, { from: number; to: number }>();
  for (const cell of rangeCells(event.to.x, event.to.y, event.radius, event.from)) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= WIDTH || cell.y >= HEIGHT) continue;
    const line = upright ? cell.x : cell.y, along = upright ? cell.y : cell.x, span = spans.get(line);
    if (span) { span.from = Math.min(span.from, along); span.to = Math.max(span.to, along + CELL); }
    else spans.set(line, { from: along, to: along + CELL });
  }
  const runs: { line: number; until: number; from: number; to: number }[] = [];
  for (const [line, { from, to }] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = runs.at(-1);
    if (last && last.until === line && last.from === from && last.to === to) last.until = line + CELL;
    else runs.push({ line, until: line + CELL, from, to });
  }
  return runs.map(run => upright ? { left: run.line, top: run.from, right: run.until, bottom: run.to } : { left: run.from, top: run.line, right: run.to, bottom: run.until });
}

/** What one booked ship shows this frame: the way it faces, the largest whole scale at which its hull stays inside its lane, the
 *  share of the crossing sailed, how strongly its lane shows, and the hull's middle while it is on the field. */
export type ShipSight = { readonly heading: Heading; readonly scale: number; readonly sailed: number; readonly glow: number; readonly hull: Point | undefined };
/** A booked ship on the rules' tick clock; nothing before its start tick or once the rules drop it. While it crosses, the hull's
 *  middle is the rules' own x and y carried on by the time banked toward the next tick, and its lane rises at the launch; after the
 *  crossing the lane fades over the event's afterglow. With motion off nothing travels or fades: the hull stands on its lane where
 *  the route enters the field, for the event's whole life. */
export function shipSight(event: Pick<ChaosSkillEvent, "from" | "to" | "x" | "y" | "radius" | "startedTick" | "impactTick" | "untilTick">,
  state: Pick<ChaosSkillState, "tick" | "remainder">, motion: boolean): ShipSight | undefined {
  const clock = fleetTick(state);
  if (clock < event.startedTick || clock >= event.untilTick) return undefined;
  const heading = shipHeading(event), facing = FACING[heading], scale = Math.max(1, Math.floor(event.radius / facing.beam));
  if (!motion) {
    const reach = facing.fore * scale, { x, y } = event.from;
    return { heading, scale, sailed: 0, glow: 1,
      hull: facing.dx ? { x: Math.max(reach, Math.min(WIDTH - reach, x)), y } : { x, y: Math.max(reach, Math.min(HEIGHT - reach, y)) } };
  }
  const span = event.impactTick - event.startedTick, sailing = clock < event.impactTick, carry = (clock - state.tick) / span;
  return { heading, scale, sailed: Math.min(1, (clock - event.startedTick) / span),
    glow: sailing ? Math.min(1, (clock - event.startedTick) / CHAOS_RULES.simulationHz * 1000 / WASH.riseMs)
      : 1 - (clock - event.impactTick) / (event.untilTick - event.impactTick),
    hull: sailing ? { x: event.x + (event.to.x - event.from.x) * carry, y: event.y + (event.to.y - event.from.y) * carry } : undefined };
}

/** Boxes on the field measured from a hull's middle: from `ahead` of it for `length` along its travel and `half` to each side, on the fine grid. */
export function hullBoxes(at: Point, heading: Heading): (ahead: number, length: number, half: number) => [number, number, number, number] {
  const { dx, dy } = FACING[heading];
  return (ahead, length, half) => dx
    ? [snap(at.x + (dx > 0 ? ahead : -ahead - length), DOT), snap(at.y - half, DOT), length, 2 * half]
    : [snap(at.x - half, DOT), snap(at.y + (dy > 0 ? ahead : -ahead - length), DOT), 2 * half, length];
}

type View = { readonly plan: PassPlan; ship: Phaser.GameObjects.Image | undefined; readonly echoes: (Phaser.GameObjects.Image | undefined)[];
  sprayed: number; breathed: number; struck: Set<number> };
type Live = { readonly pass: ChaosFleetPass; readonly band: Band; readonly phase: PassPhase; readonly layers: Layers; readonly view: View };
const firstFrom = (drops: readonly Drop[], share: number): number => {
  const index = drops.findIndex(drop => drop.at >= share);
  return index < 0 ? drops.length : index;
};

/** 이순신's automatic fleet passes (run.chaos.fleet): each band is marked in its real width before it is due, a turtle ship rams down
 *  it over the pass time behind its dragon's fire with spray and a churned wake, and its ghosts and foam linger for the afterimage time.
 *  The band, the ship and the afterimage sit under the danger marks and the bodies; only small, brief spray flies above them. */
class FleetPassesShow implements AmbientShow {
  readonly id = "fleet-passes";
  readonly general = "이순신";
  private look = { tier: 3, alpha: 1, density: 1, heavy: true };
  private readonly views = new Map<number, View>();
  private readonly lanes = new Map<number, readonly Rect[]>();

  update(stage: SkillStage, { run, channels, foe }: FrameContext): void {
    this.look = skillVfx(run, run.squads.find(squad => squad.general === this.general));
    this.convoy(stage, run, channels);
    const state = run.chaos;
    if (!state || state.mods.general !== "이순신" || !state.fleet.length) {
      for (const view of this.views.values()) this.dock(stage, view);
      this.views.clear();
      return;
    }
    const tick = fleetTick(state), ms = tick / CHAOS_RULES.simulationHz * 1000, live: Live[] = [];
    const marks = new Map<string, { readonly band: Band; readonly alpha: number }>();
    for (const pass of state.fleet) {
      const phase = passPhase(pass, tick), layers = passLayers(phase, channels);
      if (layers.band <= 0) continue;
      const band = passBand(pass, state.mods, WIDTH), key = `${band.top}:${band.bottom}`;
      let view = this.views.get(pass.id);
      if (!view) {
        // A pass first seen mid-crossing (after a clear) throws only what is still ahead of its bow.
        const plan = planPass(Math.imul(pass.id, 0x9e3779b1) ^ 0x2f1e, band, !channels.motion);
        const from = phase.kind === "crossing" ? phase.sailed - 1 / CHAOS_RULES.fleet.passTicks : 0;
        view = { plan, ship: undefined, echoes: [], sprayed: firstFrom(plan.spray, from), breathed: firstFrom(plan.embers, from), struck: new Set() };
        this.views.set(pass.id, view);
      }
      // Passes down one lane share one mark, so a band never darkens by stacking.
      marks.set(key, { band, alpha: Math.max(marks.get(key)?.alpha ?? 0, layers.band) });
      live.push({ pass, band, phase, layers, view });
    }
    for (const [id, view] of this.views) if (!live.some(item => item.pass.id === id)) { this.dock(stage, view); this.views.delete(id); }
    for (const { band, alpha } of marks.values()) {
      const left = snap(band.left), right = Math.ceil(band.right / CELL) * CELL;
      stage.ground.fillStyle(PALETTE.ally, MARK.fill * alpha).fillRect(left, band.top, right - left, band.bottom - band.top);
    }
    for (const item of live) this.draw(stage, item, tick, ms, foe);
  }

  clear(stage: SkillStage): void {
    for (const view of this.views.values()) this.dock(stage, view);
    this.views.clear();
    this.lanes.clear();
  }

  /** Manual ships share marks where their actual routes coincide; wakes follow their current runtime positions. */
  private convoy(stage: SkillStage, run: Readonly<Run>, channels: ShowChannels): void {
    const events = shipWaves(run), state = run.chaosSkills;
    for (const id of this.lanes.keys()) if (!events.some(event => event.id === id)) this.lanes.delete(id);
    if (!state) return;
    const marks = new Map<string, { readonly band: Rect; readonly alpha: number }>();
    for (const event of events) {
      const sight = shipSight(event, state, channels.motion);
      if (!sight) continue;
      let bands = this.lanes.get(event.id);
      if (!bands) { bands = shipLane(event); this.lanes.set(event.id, bands); }
      for (const band of bands) {
        const key = `${band.left}:${band.top}:${band.right}:${band.bottom}`;
        marks.set(key, { band, alpha: Math.max(marks.get(key)?.alpha ?? 0, sight.glow) });
      }
      if (!channels.motion || !sight.hull) continue;
      const facing = FACING[sight.heading], box = hullBoxes(sight.hull, sight.heading), fore = facing.fore * sight.scale;
      for (let step = 0; step < Math.ceil(WASH.wakeAlpha.length * this.look.density); step++) {
        const half = (facing.beam - step * WASH.taper) * sight.scale, length = WASH.wake * sight.scale;
        stage.ground.fillStyle(channels.flash ? WATER[step] : PALETTE.ally, WASH.wakeAlpha[step] * this.look.alpha)
          .fillRect(...box(-fore - (step + 1) * length, length, half));
        stage.ground.fillStyle(step ? PALETTE.teal : PALETTE.tealDeep, WASH.wakeAlpha[step] * this.look.alpha)
          .fillRect(...box(-fore - (step + 1) * length, length * WASH.foam, Math.max(DOT, half - DOT)));
        stage.ground.fillStyle(channels.flash ? WATER[step] : PALETTE.ally, WASH.swellAlpha[step] * this.look.alpha)
          .fillRect(...box(fore + step * WASH.swell * sight.scale, WASH.swell * sight.scale, half));
      }
    }
    for (const { band, alpha } of marks.values()) {
      stage.ground.fillStyle(PALETTE.ally, MARK.fill * alpha).fillRect(band.left, band.top, band.right - band.left, band.bottom - band.top);
    }
  }

  private dock(stage: SkillStage, view: View): void {
    if (view.ship) stage.free(view.ship);
    view.ship = undefined;
    for (const echo of view.echoes) if (echo) stage.free(echo);
    view.echoes.length = 0;
  }

  private draw(stage: SkillStage, { pass, band, phase, layers, view }: Live, tick: number, ms: number, foe: FrameContext["foe"]): void {
    if (layers.tide && phase.kind === "due") this.tide(stage.ground, band, phase.ahead, ms);
    if (layers.ship && phase.kind === "crossing") this.cross(stage, pass, band, view, phase.sailed, layers.flash, foe);
    else if (view.ship) { stage.free(view.ship); view.ship = undefined; }
    if (layers.afterimage && phase.kind === "afterimage") this.foam(stage.ground, band, view.plan, phase.fade, ms);
    this.haunt(stage, pass, band, view, tick, !layers.afterimage ? -1 : phase.kind === "crossing" ? phase.sailed : 1);
  }

  /** Before the pass is due: the band floods from its left end over the last pass time before the strike, and gold chevrons run the
   *  way the ship will sail, brightening as it nears. */
  private tide(ground: Phaser.GameObjects.Graphics, band: Band, ahead: number, ms: number): void {
    const near = Math.max(0, 1 - ahead / CHAOS_RULES.fleet.passTicks), mid = snap(band.lane), gap = MARK.chevronGap;
    if (near > 0) ground.fillStyle(PALETTE.teal, MARK.tide * near).fillRect(snap(band.left), band.top, snap((band.right - band.left) * near), band.bottom - band.top);
    ground.fillStyle(PALETTE.gold, MARK.chevron * (.4 + .6 * near));
    for (let tip = band.left + ms * MARK.chevronPace / 1000 % gap; tip < band.right + gap; tip += gap)
      for (let arm = 0; arm <= MARK.chevronArm; arm++) {
        const x = snap(tip) - arm * CELL;
        if (x < band.left || x + CELL > band.right) continue;
        ground.fillRect(x, mid - arm * CELL, CELL, CELL);
        if (arm) ground.fillRect(x, mid + arm * CELL, CELL, CELL);
      }
  }

  /** One crossing frame: the strike as the pass lands, the flooded band around the hull, the dragon's fire, the ship and its spray. */
  private cross(stage: SkillStage, pass: ChaosFleetPass, band: Band, view: View, sailed: number, flash: boolean, foe: FrameContext["foe"]): void {
    const { plan } = view, elapsed = sailed * CHAOS_RULES.fleet.passSeconds * 1000, bow = fleetBow(band, plan.hull, sailed);
    const struck = [...pass.landIds, ...pass.shipIds].slice(0, IMPACT.struck)
      .filter(id => !view.struck.has(id) && (foe(id)?.x ?? Infinity) <= bow);
    if (struck.length) {
      if (!view.struck.size) stage.navalImpact();
      for (const id of struck) view.struck.add(id);
      this.strike(stage, pass, struck, foe);
    }
    if (flash && this.look.heavy) this.impact(stage.ground, band, elapsed);
    this.churn(stage.ground, band, plan, bow, elapsed, flash);
    this.wash(stage.ground, band, plan, bow, flash);
    this.breathe(stage.ground, band, plan, bow, elapsed, flash);
    view.ship ??= stage.image(SHIP.key, SHIP.side)?.setOrigin(SHIP.bow / SHIP_FRAME.width, SHIP.keel / SHIP_FRAME.height).setScale(plan.scale).setDepth(SHIP_DEPTH);
    view.ship?.setFrame(SHIP.side + SHIP_POSES.walk[0] + Math.floor(elapsed / SHIP.frameMs) % SHIP_POSES.walk[1])
      .setPosition(Math.round(bow), Math.round(band.lane)).setVisible(true);
    for (; view.sprayed < plan.spray.length && plan.spray[view.sprayed].at <= sailed; view.sprayed++) {
      const drop = plan.spray[view.sprayed];
      stage.mote(drop, drop.vx, drop.vy, PULL.spray, drop.life, drop.paint, false, 0, drop.size);
    }
    for (; view.breathed < plan.embers.length && plan.embers[view.breathed].at <= sailed; view.breathed++) {
      const drop = plan.embers[view.breathed];
      stage.mote(drop, drop.vx, drop.vy, PULL.embers, drop.life, drop.paint, true, 0, drop.size);
    }
  }

  /** The pass lands: a light shake, and water thrown up along the real shove behind every foe and ship the rules struck, where each is drawn. */
  private strike(stage: SkillStage, pass: ChaosFleetPass, struck: readonly number[], foe: FrameContext["foe"]): void {
    const random = scatter(Math.imul(pass.id, 0x9e3779b1) ^ 0x51a5);
    for (const id of struck) {
      const body = foe(id);
      if (!body?.visible) continue;
      for (let drop = 0; drop < IMPACT.splash; drop++)
        stage.mote({ x: body.x - random() * pass.push, y: body.y - 6 }, 40 + random() * 160, -(90 + random() * 120), PULL.spray,
          260 + random() * 160, WATER[drop % WATER.length], false, 0, 2 + Math.floor(random() * 2));
    }
  }

  /** The landing with flashes on: the band blinks pale and a bright bow wave runs its whole length ahead of the ship. */
  private impact(ground: Phaser.GameObjects.Graphics, band: Band, elapsed: number): void {
    const left = snap(band.left), right = Math.ceil(band.right / CELL) * CELL;
    if (elapsed < IMPACT.flashMs)
      ground.fillStyle(PALETTE.cream, IMPACT.flash * (1 - elapsed / IMPACT.flashMs)).fillRect(left, band.top, right - left, band.bottom - band.top);
    if (elapsed >= IMPACT.rippleMs) return;
    const front = band.left + (band.right - band.left) * elapsed / IMPACT.rippleMs;
    ground.fillStyle(PALETTE.white, IMPACT.ripple * (1 - elapsed / IMPACT.rippleMs));
    for (let y = band.top; y < band.bottom; y += CELL) {
      const x = snap(front - Math.min(1, Math.abs(y + CELL / 2 - band.lane) / band.half) * IMPACT.sweep);
      if (x >= left && x < right) ground.fillRect(x, y, Math.min(IMPACT.rippleWidth, right - x), CELL);
    }
  }

  /** The band floods around the hull: firelight (flashes on) and a swell bulging ahead of the bow, dark water under the hull and a
   *  churned wake thinning out astern. */
  private churn(ground: Phaser.GameObjects.Graphics, band: Band, plan: PassPlan, bow: number, elapsed: number, flash: boolean): void {
    const grow = plan.scale / 2, swell = CHURN.swell * grow, glow = CHURN.glow * grow, wake = CHURN.wake * grow, { hull, grain } = plan;
    const foam = flash ? PALETTE.white : PALETTE.ally, froth = flash ? PALETTE.silverLight : PALETTE.ally, beat = Math.floor(elapsed / CHURN.beatMs);
    const from = Math.max(snap(band.left), snap(bow - hull - wake)), to = Math.min(band.right, bow + swell + glow);
    for (let y = band.top; y < band.bottom; y += CELL) {
      const off = Math.min(1, Math.abs(y + CELL / 2 - band.lane) / band.half);
      for (let x = from; x < to; x += CELL) {
        const behind = bow - x - CELL / 2, speck = grain[(x / CELL * 7 + y / CELL * 13 + beat * 5) & 255];
        if (behind < 0) {
          const crest = swell * (1 - off * off) + behind;
          if (crest >= 0) ground.fillStyle(crest < CELL ? foam : speck < .4 ? froth : PALETTE.ally, (crest < CELL ? .9 : .7) * CHURN.alpha * this.look.alpha).fillRect(x, y, CELL, CELL);
          else if (flash && crest > -glow && speck < .7)
            ground.fillStyle(speck < .25 ? PALETTE.gold : PALETTE.flame, .32 * (1 + crest / glow) * CHURN.alpha * this.look.alpha).fillRect(x, y, CELL, CELL);
        } else if (behind < hull) ground.fillStyle(speck < .3 ? PALETTE.tealDeep : PALETTE.teal, .7 * CHURN.alpha * this.look.alpha).fillRect(x, y, CELL, CELL);
        else {
          const thin = 1 - (behind - hull) / wake, frothy = off > .75 || speck < .3 * thin;
          ground.fillStyle(frothy ? foam : speck > .85 ? PALETTE.tealDeep : PALETTE.teal, (frothy ? .8 : .6) * thin * CHURN.alpha * this.look.alpha).fillRect(x, y, CELL, CELL);
        }
      }
    }
  }

  /** The wake's foam lines: two dashed lines spreading from the stern toward the band's edges and a short one down the keel. */
  private wash(ground: Phaser.GameObjects.Graphics, band: Band, plan: PassPlan, bow: number, flash: boolean): void {
    const streak = CHURN.streak * plan.scale / 2, stern = snap(bow - plan.hull, DOT) + 2 * DOT, mid = snap(band.lane, DOT);
    for (let back = 0; back < streak && stern - back >= band.left; back += DOT) {
      const x = stern - back, share = back / streak;
      if (x >= band.right || (x % CHURN.every + CHURN.every) % CHURN.every >= CHURN.dash) continue;
      const spread = snap(band.half - 10 + 6 * share, DOT);
      ground.fillStyle(flash ? WATER[Math.floor(share * WATER.length)] : PALETTE.ally, (1 - share) * .9 * this.look.alpha)
        .fillRect(x, mid - spread, DOT, DOT).fillRect(x, mid + spread - DOT, DOT, DOT);
      if (share < .5) ground.fillRect(x, mid, DOT, DOT);
    }
  }

  /** The dragon's fire on the ground ahead of the bow: a ragged jet of fine cells that widens, sinks toward the lane and cools from
   *  white (cream with flashes off) to ember, kept between the band's ends. */
  private breathe(ground: Phaser.GameObjects.Graphics, band: Band, plan: PassPlan, bow: number, elapsed: number, flash: boolean): void {
    const { grain, scale } = plan, beat = Math.floor(elapsed / FIRE.beatMs), length = (FIRE.length + FIRE.surge[beat % FIRE.surge.length]) * scale / 2;
    const mouthX = snap(bow + SHIP.mouth.x * scale, DOT), mouthY = snap(band.lane + SHIP.mouth.y * scale, DOT), hottest = flash ? 0 : 1;
    for (let along = Math.max(0, snap(band.left - mouthX + DOT - 1, DOT)); along < length && mouthX + along < band.right; along += DOT) {
      const spread = DOT + Math.floor(along * FIRE.spread / DOT) * DOT, centre = mouthY + Math.round(along * FIRE.drop / DOT) * DOT, cool = along / length;
      for (let across = -spread; across <= spread; across += DOT) {
        const heat = (1 - cool) * (1 - (across / (spread + DOT)) ** 2) + (grain[((along >> 1) - beat * 3) * 7 + (across >> 1) * 13 & 255] - .5) * .4;
        if (heat < .1) continue;
        const hot = FIRE.bands.findIndex(least => heat > least);
        ground.fillStyle(FLAME[Math.max(hottest, hot < 0 ? FIRE.bands.length : hot)], (hot < 0 ? .8 : .95) * this.look.alpha).fillRect(mouthX + along, centre + across, DOT, DOT);
      }
    }
  }

  /** The afterimage's water: foam streaks drifting on down the band the way the ship went, thinning out as the afterimage ends. */
  private foam(ground: Phaser.GameObjects.Graphics, band: Band, plan: PassPlan, fade: number, ms: number): void {
    const span = band.right - band.left, drift = ms * AFTER.drift / 1000;
    for (let y = band.top, row = 0; y < band.bottom; y += CELL, row++)
      for (let streak = 0; streak < Math.ceil(AFTER.streaks * this.look.density); streak++) {
        const speck = plan.grain[(row * 7 + streak * 89) & 255], length = snap(AFTER.shortest + speck * (AFTER.longest - AFTER.shortest));
        const x = snap(band.left + (speck * span * 3 + streak * span / AFTER.streaks + drift * (1 + speck)) % span);
        ground.fillStyle(speck < .3 ? PALETTE.white : PALETTE.silverLight, AFTER.foam * fade * (.5 + speck / 2) * this.look.alpha).fillRect(x, y, Math.min(length, band.right - x), CELL);
      }
  }

  /** The afterimages: a ghost of the ship left wherever its bow passed a mark, fading out by the time the rules drop the pass. */
  private haunt(stage: SkillStage, pass: ChaosFleetPass, band: Band, view: View, tick: number, reached: number): void {
    const { passTicks, afterimageTicks } = CHAOS_RULES.fleet, end = Math.min(pass.untilTick, pass.dueTick + passTicks + afterimageTicks);
    view.plan.echoes.forEach((echo, index) => {
      const dropped = pass.dueTick + echo.at * passTicks;
      const alpha = !this.look.heavy || reached < echo.at ? 0 : AFTER.echo * this.look.alpha * Math.max(0, 1 - (tick - dropped) / Math.max(1, end - dropped));
      if (alpha <= 0) { view.echoes[index]?.setVisible(false); return; }
      view.echoes[index] ??= stage.image(SHIP.ghost, SHIP.side + SHIP_POSES.idle[0])?.setOrigin(SHIP.bow / SHIP_FRAME.width, SHIP.keel / SHIP_FRAME.height)
        .setScale(view.plan.scale).setDepth(ECHO_DEPTH);
      view.echoes[index]?.setPosition(Math.round(echo.x), Math.round(band.lane)).setAlpha(alpha).setVisible(true);
    });
  }
}

export const ambient: AmbientShow = new FleetPassesShow();
