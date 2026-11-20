import type Phaser from "phaser";
import type { BphActor } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import type { Point } from "./geometry";
import { PALETTE, rangeCells, shotArt } from "./presentation";
import type { Paint } from "./presentation";
import type { Run, Unit } from "./rules";
import { scatter } from "./skill-show";
import type { AmbientShow, FrameContext, SkillStage } from "./skill-stage";
import { UnitProjectileView } from "./bph-unit-projectile-view";

type Graphics = Phaser.GameObjects.Graphics;

/** Display-only dressing of run.bph.fx.actors in field pixels, simulation seconds and shares. Every position, reach, path and
 *  lifetime is the actor's own, read each frame; these numbers only decorate inside them. */
export const UNIT_FX_SHOW = {
  /** The drawn clock may lead the 30 Hz rules by at most one step, never further. */
  step: 1 / 30,
  arc: { share: .22, max: 46, drop: 54 },
  tail: { cells: 9, spacing: 3 },
  rope: { sag: .1, maxSag: 14, hand: 6, step: 2 },
  glaive: { trail: 6, trailStep: .035 },
  flail: { idleReach: 11, wakeGap: 4, wakeLife: .6 },
  charge: { tail: 60, lines: 30, gap: 5 },
  mine: { pulse: 1.1, rim: .6, litRim: .75, rimGap: 12, dim: 3, ember: 7 },
  /** Native: a burst mine leaves seven ground fires for five seconds with no damage field, so they only decorate. */
  fire: { count: 7, life: 5, inset: .8 },
  haze: { alpha: .42, edge: .5, wisps: 12, swirl: .6, wispAlpha: .65, puff: .22 },
  whirl: { bands: 5, height: 38, spin: 5.5, sway: 3, debris: .12, gap: 4 },
  stream: { spacing: 2, travel: .14, arrows: 3, arrowGap: 22, embers: 10, flicker: 2 },
  prism: { life: .9, columns: 5, rise: 26, alpha: .6, sparkles: 12 },
  stake: { lift: .3, maxLift: 28, spin: 9 },
} as const;

export type UnitFxLook = "fire-arrow" | "fragment" | "spectre" | "ember-mine" | "smoke-pot" | "smoke-haze" | "whirl" | "singijeon"
  | "hook" | "glaive" | "stake" | "flail" | "charge";
const BY_SPELL: Readonly<Record<string, UnitFxLook>> = {
  Spell_Fireball: "fire-arrow", Spell_Mine: "ember-mine", Spell_InfectionBomb: "smoke-pot", Spell_PoisonCloud: "smoke-haze",
  Spell_Tornado: "whirl", Spell_Quasar: "singijeon",
  Spell_SkeletonBone: "fragment",
};
const BY_KIND: Partial<Record<BphActor["kind"], UnitFxLook>> = { hook: "hook", blade: "glaive", seed: "stake", wheel: "flail", dash: "charge" };

/** Cast spell first, then status-spell mode, then profile actor kind; anything else draws nothing. */
export function unitFxLook(actor: Pick<BphActor, "kind" | "data" | "cast">): UnitFxLook | null {
  const spell = actor.cast?.spellId;
  if (spell !== undefined && BY_SPELL[spell]) return BY_SPELL[spell];
  if (actor.data.boneTargetId !== undefined) return "fragment";
  if (actor.data.martialSpectre === 1) return "spectre";
  if (actor.data.martialLeap === 1 || actor.data.martialDismount === 1) return "charge";
  if (actor.data.statusSpell === 1) return actor.data.mode === 2 ? "fire-arrow" : actor.data.mode === 1 ? "ember-mine" : "smoke-haze";
  return actor.data.profiles === 1 ? BY_KIND[actor.kind] ?? null : null;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const lerp = (from: Point, to: Point, share: number): Point => ({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
const finite = (...values: readonly (number | undefined)[]): boolean => values.every(value => typeof value === "number" && Number.isFinite(value));

export function flightPoint(from: Point, to: Point, share: number): Point & { readonly lift: number } {
  const s = clamp01(share), far = Math.hypot(to.x - from.x, to.y - from.y), { share: rise, max, drop } = UNIT_FX_SHOW.arc;
  const lift = far < 2 ? drop * (1 - s * s) : 4 * Math.min(max, far * rise) * s * (1 - s);
  const ground = lerp(from, to, s);
  return { x: ground.x, y: ground.y - lift, lift };
}

/** Origin is the recorded data.fromX/fromY, else `fallback` (where the hwacha stood when first drawn) until the rules record one. */
export function fireArrowThrow(actor: Pick<BphActor, "x" | "y" | "startedAt" | "until" | "data">, fallback: Point | undefined, time: number):
  { readonly from: Point; readonly to: Point; readonly share: number } {
  const { fromX, fromY } = actor.data, span = actor.until - actor.startedAt;
  const from = finite(fromX, fromY) ? { x: fromX, y: fromY } : fallback ?? { x: actor.x, y: actor.y };
  return { from, to: { x: actor.x, y: actor.y }, share: span > 0 ? clamp01((time - actor.startedAt) / span) : 1 };
}

export function potShare(actor: Pick<BphActor, "data">, lead = 0): number {
  const { flight, age, landed } = actor.data;
  if (landed === 1 || !(flight > 0)) return 1;
  return clamp01(((Number.isFinite(age) ? age : 0) + lead) / flight);
}

export type HazeRow = { readonly x: number; readonly y: number; readonly width: number };
export function hazeRows(x: number, y: number, radius: number): HazeRow[] {
  const rows = new Map<number, { min: number; max: number }>();
  for (const cell of rangeCells(x, y, radius)) {
    const row = rows.get(cell.y);
    if (!row) rows.set(cell.y, { min: cell.x, max: cell.x });
    else { row.min = Math.min(row.min, cell.x); row.max = Math.max(row.max, cell.x); }
  }
  return [...rows].map(([py, row]) => ({ x: row.min, y: py, width: row.max - row.min + 4 }));
}

export type StreamSegment = { readonly from: Point; readonly to: Point };
/** Recorded path segments in order; a screen-edge wrap stays a gap. Without a recorded path: cast origin to tip. */
export function streamSegments(actor: Pick<BphActor, "x" | "y" | "data">): StreamSegment[] {
  const data = actor.data, out: StreamSegment[] = [], count = Number.isFinite(data.pathCount) ? data.pathCount : 0;
  for (let n = 0; n < count; n++) {
    const from = { x: data[`path${n}FromX`], y: data[`path${n}FromY`] }, to = { x: data[`path${n}ToX`], y: data[`path${n}ToY`] };
    if (finite(from.x, from.y, to.x, to.y)) out.push({ from, to });
  }
  if (!out.length && finite(data.fromX, data.fromY)) out.push({ from: { x: data.fromX, y: data.fromY }, to: { x: actor.x, y: actor.y } });
  return out;
}
export type StreamPoint = Point & { readonly heading: number; readonly along: number };
export function streamPoints(segments: readonly StreamSegment[], spacing: number, reach: number): StreamPoint[] {
  const out: StreamPoint[] = [];
  let start = 0;
  for (const segment of segments) {
    if (start > reach) break;
    const dx = segment.to.x - segment.from.x, dy = segment.to.y - segment.from.y, length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    const heading = Math.atan2(dy, dx);
    for (let along = Math.ceil(start / spacing) * spacing; along <= start + length && along <= reach; along += spacing) {
      const share = (along - start) / length;
      out.push({ x: segment.from.x + dx * share, y: segment.from.y + dy * share, heading, along });
    }
    start += length;
  }
  return out;
}

export function groundFires(mine: { readonly id: number; readonly x: number; readonly y: number; readonly radius: number }): Point[] {
  const random = scatter(Math.imul(mine.id + 1, 0x9e3779b1) ^ 0x2545f491), { count, inset } = UNIT_FX_SHOW.fire, out: Point[] = [];
  for (let n = 0; n < count; n++) {
    const turn = (n + random() * .8) / count * Math.PI * 2, far = mine.radius * inset * Math.sqrt(.15 + .85 * random());
    out.push({ x: mine.x + Math.cos(turn) * far, y: mine.y + Math.sin(turn) * far });
  }
  return out;
}

function fill(g: Graphics, paint: Paint, alpha: number, x: number, y: number, wide: number, high: number): void {
  if (alpha > .01 && wide > 0 && high > 0) g.fillStyle(paint, Math.min(1, alpha)).fillRect(Math.round(x), Math.round(y), wide, high);
}
const dot = (g: Graphics, paint: Paint, alpha: number, at: Point, size = 2): void => fill(g, paint, alpha, at.x - size / 2, at.y - size / 2, size, size);
/** Small effect rings and streaks, never a newly drawn object or unit sprite. */
function glint(g: Graphics, x: number, y: number, heading: number, paint: Paint, alpha: number, ring = false): void {
  for (let n = 0; n < 8; n++) {
    const angle = n / 8 * Math.PI * 2;
    const at = ring ? { x: x + Math.cos(angle) * 4, y: y + Math.sin(angle) * 3 }
      : { x: x - Math.cos(heading) * n, y: y - Math.sin(heading) * n };
    dot(g, paint, alpha * (ring ? .8 : 1 - n / 9), at, 2);
  }
}
const shadow = (g: Graphics, at: Point, alpha: number): void => fill(g, PALETTE.outline, alpha, at.x - 3, at.y - 1, 6, 2);

type Shade = { readonly paint: Paint; readonly alpha: number; readonly size: number };
const FIRE_WAKE: readonly Shade[] = [
  { paint: PALETTE.cream, alpha: 1, size: 3 }, { paint: PALETTE.gold, alpha: .95, size: 3 }, { paint: PALETTE.gold, alpha: .9, size: 2 },
  { paint: PALETTE.flame, alpha: .85, size: 2 }, { paint: PALETTE.flame, alpha: .7, size: 2 }, { paint: PALETTE.ember, alpha: .6, size: 2 },
  { paint: PALETTE.silverShade, alpha: .45, size: 2 }, { paint: PALETTE.steelLight, alpha: .32, size: 2 }, { paint: PALETTE.silverShade, alpha: .2, size: 2 },
];
const CALM_FIRE_WAKE: readonly Shade[] = FIRE_WAKE.map((shade, index) => index === 0 ? { ...shade, paint: PALETTE.gold } : shade);
const SMOKE_WAKE: readonly Paint[] = [PALETTE.olive, PALETTE.moss, PALETTE.sand];
const HAZE: readonly Paint[] = [PALETTE.olive, PALETTE.moss, PALETTE.leafLight, PALETTE.sandLight];
/** No red anywhere in this view: red is reserved for enemy warnings. */
const PRISM: readonly Paint[] = [PALETTE.cream, PALETTE.gold, PALETTE.leafLight, PALETTE.teal, PALETTE.steelLight, PALETTE.silverLight];

type Look = { readonly motion: boolean; readonly flash: boolean; readonly now: number; readonly time: number; readonly lead: number };
type Memory = {
  readonly look: UnitFxLook; readonly seed: number; readonly random: () => number;
  origin: Point | undefined; legs: number; angle: number; emitted: number;
  trail: (Point & { readonly at: number })[];
  rows: { readonly key: string; readonly rows: readonly HazeRow[] } | undefined;
  segments: StreamSegment[] | undefined;
  x: number; y: number; radius: number; until: number; seenAt: number; lit: boolean;
  rocket: Phaser.GameObjects.Sprite | undefined;
};
type Fire = Point & { readonly at: number; readonly seed: number };
type Shimmer = { readonly unitId: number; readonly at: number; x: number; y: number; started: boolean };
const isLit = (actor: BphActor): boolean => actor.data.exploded === 1 || actor.data.fuseAt > 0 || finite(actor.data.litAt);
function onceEvery(memory: Memory, time: number, every: number): boolean {
  const bucket = Math.floor(time / every);
  if (bucket === memory.emitted) return false;
  memory.emitted = bucket;
  return true;
}

/** Never writes the run, its actors or the rules' random stream. Pictures drop with their actors; a mine gone before its time leaves
 *  ground fires, and a foil soldier whose kill stage rises gets a prism shimmer. */
export class UnitFxView implements AmbientShow {
  readonly id = "bph-unit-fx";
  private readonly projectiles = new UnitProjectileView();
  private memory = new Map<number, Memory>();
  private ranks = new Map<number, { lifeId: number; stage: number }>();
  private fires: Fire[] = [];
  private shimmers: Shimmer[] = [];
  private run: Readonly<Run> | undefined;
  private stage: SkillStage | undefined;
  private simTime = Number.NaN;
  private simAt = 0;

  get tracked(): number { return this.memory.size + this.fires.length + this.shimmers.length; }

  update(stage: SkillStage, frame: FrameContext): void {
    this.projectiles.update(stage, frame);
    this.stage = stage;
    if (frame.run !== this.run) { this.forget(); this.run = frame.run; }
    const run = frame.run;
    if (run.time !== this.simTime) { this.simTime = run.time; this.simAt = frame.now; }
    const lead = Math.min(UNIT_FX_SHOW.step, Math.max(0, frame.now - this.simAt) / 1000);
    const look: Look = { motion: frame.channels.motion, flash: frame.channels.flash, now: frame.now, time: run.time + lead, lead };
    const units = new Map<number, Unit>();
    for (const squad of run.squads) { units.set(squad.id, squad); for (const soldier of squad.soldiers) units.set(soldier.id, soldier); }
    this.promotions(units, frame, look);
    const seen = new Set<number>();
    for (const actor of run.bph?.fx.actors ?? []) {
      const kind = unitFxLook(actor);
      if (!kind) continue;
      seen.add(actor.id);
      const memory = this.memory.get(actor.id) ?? this.open(actor, kind, units, frame);
      memory.seenAt = run.time; memory.until = actor.until; memory.x = actor.x; memory.y = actor.y; memory.radius = actor.radius;
      memory.lit ||= isLit(actor);
      this.draw(stage, frame, actor, memory, units, look);
    }
    for (const [id, memory] of this.memory) if (!seen.has(id)) { this.close(stage, id, memory, look); this.dropRocket(stage, memory); this.memory.delete(id); }
    for (const { from, at, time } of run.bph?.fx.flailContacts ?? []) {
      const age = look.time - time;
      const alpha = clamp01(1 - Math.max(0, age - UNIT_FX_SHOW.step) / .08);
      const dx = at.x - from.x, dy = at.y - from.y, length = Math.hypot(dx, dy);
      if (look.motion) for (let i = 4; i < length; i += 4)
        dot(stage.field, PALETTE.silverShade, alpha * .65, { x: from.x + dx * i / length, y: from.y + dy * i / length });
      glint(stage.trails, at.x, at.y, Math.atan2(dy, dx), PALETTE.silverLight, alpha);
    }
    this.drawFires(stage, look);
    this.drawShimmers(stage, frame, units, look);
  }

  clear(): void {
    this.projectiles.clear();
    this.forget();
    this.run = undefined;
  }

  private forget(): void {
    if (this.stage) for (const memory of this.memory.values()) this.dropRocket(this.stage, memory);
    this.memory.clear(); this.ranks.clear(); this.fires = []; this.shimmers = [];
    this.simTime = Number.NaN;
  }

  private open(actor: BphActor, look: UnitFxLook, units: ReadonlyMap<number, Unit>, frame: FrameContext): Memory {
    const seed = Math.imul(actor.id + 1, 0x9e3779b1) ^ 0x51ed;
    const source = units.get(actor.data.statusSpell === 1 ? actor.data.sourceId : actor.ownerId);
    const hand = source ? frame.at(source) : undefined;
    const memory: Memory = { look, seed, random: scatter(seed ^ 0x2c1b3c6d),
      origin: look === "fire-arrow" && hand ? { x: hand.x, y: hand.y - UNIT_FX_SHOW.rope.hand } : look === "stake" ? { x: actor.x, y: actor.y } : undefined,
      legs: actor.targets.length, angle: Number.isFinite(actor.data.angle) ? actor.data.angle : 0, emitted: Number.NaN, trail: [],
      rows: undefined, segments: undefined, x: actor.x, y: actor.y, radius: actor.radius, until: actor.until, seenAt: frame.run.time, lit: false,
      rocket: undefined };
    this.memory.set(actor.id, memory);
    return memory;
  }

  private close(stage: SkillStage, id: number, memory: Memory, look: Look): void {
    if (memory.look === "ember-mine" && memory.lit)
      for (const spot of groundFires({ id, x: memory.x, y: memory.y, radius: memory.radius })) this.fires.push({ ...spot, at: look.time, seed: id });
    if (memory.look === "stake" && look.motion)
      for (let n = 0; n < 6; n++) {
        const turn = n / 6 * Math.PI * 2;
        stage.mote({ x: memory.x, y: memory.y - 4 }, Math.cos(turn) * 40, Math.sin(turn) * 24 - 30, 140, 320, n % 2 ? PALETTE.leafLight : PALETTE.sandLight, false, 0, 2);
      }
  }

  private draw(stage: SkillStage, frame: FrameContext, actor: BphActor, memory: Memory, units: ReadonlyMap<number, Unit>, look: Look): void {
    switch (memory.look) {
      case "fire-arrow": this.fireArrow(stage, actor, memory, look); break;
      case "fragment": this.fireArrow(stage, actor, memory, look, true); break;
      case "spectre":
        if (look.motion && onceEvery(memory, look.time, .15))
          stage.mote(frame.at(units.get(actor.ownerId) ?? actor), 0, -20, -10, 500,
            PALETTE.teal, false, 0, 2);
        break;
      case "ember-mine": this.mine(stage, actor, memory, look); break;
      case "smoke-pot":
        if (potShare(actor, look.lead) < 1) this.pot(stage, actor, memory, look);
        else this.haze(stage, actor, memory, look, actor.startedAt + (Number.isFinite(actor.data.flight) ? actor.data.flight : 0));
        break;
      case "smoke-haze": this.haze(stage, actor, memory, look, actor.startedAt); break;
      case "whirl": this.whirl(stage, actor, memory, look); break;
      case "singijeon": this.stream(stage, actor, memory, look); break;
      case "hook": this.hook(stage, frame, actor, units, look); break;
      case "glaive": this.glaive(stage, frame, actor, memory, units, look); break;
      case "stake": this.stake(stage, actor, memory, units, look); break;
      case "flail": this.flail(stage, frame, actor, memory, units, look); break;
      case "charge": this.charge(stage, frame, actor, units, look); break;
    }
  }

  private drawnOffset(frame: FrameContext, owner: Unit | undefined): Point {
    if (!owner) return { x: 0, y: 0 };
    const drawn = frame.at(owner);
    return { x: drawn.x - owner.x, y: drawn.y - owner.y };
  }

  private fireArrow(stage: SkillStage, actor: BphActor, memory: Memory, look: Look, fragment = false): void {
    const thrown = fireArrowThrow(actor, memory.origin, look.time);
    if (thrown.share >= 1) { this.dropRocket(stage, memory); return; }
    const far = Math.max(24, Math.hypot(thrown.to.x - thrown.from.x, thrown.to.y - thrown.from.y));
    const head = flightPoint(thrown.from, thrown.to, thrown.share), next = flightPoint(thrown.from, thrown.to, thrown.share + 2 / far);
    const heading = Math.atan2(next.y - head.y, next.x - head.x);
    shadow(stage.ground, lerp(thrown.from, thrown.to, thrown.share), .28);
    const wake = fragment ? FIRE_WAKE.map(shade => ({ ...shade, paint: PALETTE.silverLight })) : look.flash ? FIRE_WAKE : CALM_FIRE_WAKE;
    for (let k = UNIT_FX_SHOW.tail.cells; k >= 1; k--) {
      const share = thrown.share - k * UNIT_FX_SHOW.tail.spacing / far, shade = wake[k - 1];
      if (share >= 0) dot(stage.field, shade.paint, shade.alpha, flightPoint(thrown.from, thrown.to, share), shade.size);
    }
    if (fragment) glint(stage.trails, head.x, head.y, heading, PALETTE.silverLight, 1);
    else this.rocket(stage, memory, head, heading, look);
    if (look.motion && onceEvery(memory, look.time, .06)) {
      const random = memory.random, speed = 20 + random() * 30;
      stage.mote(head, -Math.cos(heading) * speed, -Math.sin(heading) * speed - 10, 120, 220 + random() * 120,
        fragment ? PALETTE.silverLight : random() < .5 ? PALETTE.gold : PALETTE.flame, false, 0, random() < .5 ? 1 : 2);
    }
  }

  /** The fire cart's fire arrow is the hwacha volley's drawn rocket sheet riding the same arc, so it reaches the impact point at share 1,
   *  the tick the rules detonate it (actor.until), and the explosion takes over there (owner DM 1794902731). */
  private rocket(stage: SkillStage, memory: Memory, head: Point, heading: number, look: Look): void {
    memory.rocket ??= stage.sprite("rocket", 0);
    const rocket = memory.rocket;
    if (!rocket) return;
    const art = shotArt("rocket", heading);
    if (look.motion && !rocket.anims.isPlaying) rocket.play("rocket-flight");
    rocket.setPosition(head.x, head.y).setRotation(art.rotation).setVisible(true);
  }
  private dropRocket(stage: SkillStage, memory: Memory): void {
    if (!memory.rocket) return;
    stage.freeSprite(memory.rocket);
    memory.rocket = undefined;
  }

  private mine(stage: SkillStage, actor: BphActor, memory: Memory, look: Look): void {
    const show = UNIT_FX_SHOW.mine, age = look.time - actor.startedAt, left = actor.until - look.time;
    const fade = clamp01(Math.min(age / .2, memory.lit ? 1 : left / show.dim));
    if (fade <= 0) return;
    const { x, y, radius } = actor;
    const count = Math.max(8, Math.round(Math.PI * 2 * radius / show.rimGap)), march = look.motion ? look.time * .25 : 0;
    for (let i = 0; i < count; i++) {
      if (!memory.lit && i % Math.max(1, Math.round(count / 8)) !== 0) continue;
      const turn = i / count * Math.PI * 2 + march;
      dot(stage.ground, memory.lit ? PALETTE.cream : PALETTE.gold, (memory.lit ? show.litRim : show.rim) * fade,
        { x: x + Math.cos(turn) * (radius - 1), y: y + Math.sin(turn) * (radius - 1) }, 2);
    }
    glint(stage.field, x, y - 2, 0, PALETTE.gold, fade, true);
    const beat = look.motion ? .5 + .5 * Math.sin((look.time * show.pulse + memory.seed % 97 / 97) * Math.PI * 2) : .7;
    const ember = { x, y: y - show.ember };
    const hot = memory.lit ? look.flash && Math.floor(look.now / 60) % 2 === 0 ? PALETTE.white : PALETTE.cream : beat > .6 ? PALETTE.gold : PALETTE.flame;
    dot(stage.field, PALETTE.gold, (memory.lit ? .55 : .2 + .25 * beat) * fade, ember, 6);
    dot(stage.field, hot, fade, ember, 2);
    if (memory.lit && look.motion && onceEvery(memory, look.time, .04)) {
      const random = memory.random;
      stage.mote(ember, (random() - .5) * 60, -40 - random() * 40, 160, 200 + random() * 120, random() < .5 ? PALETTE.cream : PALETTE.gold, look.flash, 0, 2);
    }
  }

  private pot(stage: SkillStage, actor: BphActor, memory: Memory, look: Look): void {
    const share = potShare(actor, look.lead), data = actor.data;
    const from = finite(data.fromX, data.fromY) ? { x: data.fromX, y: data.fromY } : { x: actor.x, y: actor.y };
    const to = { x: actor.toX, y: actor.toY }, far = Math.max(24, Math.hypot(to.x - from.x, to.y - from.y));
    const lift = flightPoint(from, to, share).lift;
    shadow(stage.ground, actor, .28);
    for (let k = UNIT_FX_SHOW.tail.cells; k >= 1; k -= 2) {
      const back = share - k * UNIT_FX_SHOW.tail.spacing / far;
      if (back >= 0) dot(stage.field, SMOKE_WAKE[(k >> 1) % SMOKE_WAKE.length], .5 - k * .04, flightPoint(from, to, back), 3);
    }
    glint(stage.trails, actor.x, actor.y - lift, 0, PALETTE.leafLight, 1, true);
    if (look.motion && onceEvery(memory, look.time, .08))
      stage.mote({ x: actor.x, y: actor.y - lift - 4 }, (memory.random() - .5) * 20, -20, -20, 360, PALETTE.olive, false, 0, 2);
  }

  private haze(stage: SkillStage, actor: BphActor, memory: Memory, look: Look, born: number): void {
    const show = UNIT_FX_SHOW.haze, fade = clamp01(Math.min((look.time - born) / .3, (actor.until - look.time) / .6));
    if (fade <= 0) return;
    const key = `${actor.x},${actor.y},${actor.radius}`;
    if (memory.rows?.key !== key) memory.rows = { key, rows: hazeRows(actor.x, actor.y, actor.radius) };
    for (const row of memory.rows.rows) {
      fill(stage.ground, PALETTE.leafLight, show.alpha * fade, row.x, row.y, row.width, 4);
      fill(stage.ground, PALETTE.mossDeep, show.edge * fade, row.x, row.y, 4, 4);
      if (row.width > 4) fill(stage.ground, PALETTE.mossDeep, show.edge * fade, row.x + row.width - 4, row.y, 4, 4);
    }
    const layout = scatter(memory.seed ^ 0x7f4a7c15);
    for (let i = 0; i < show.wisps; i++) {
      const base = layout() * Math.PI * 2, share = .15 + layout() * .6, turn = base + (look.motion ? look.time * show.swirl * (i % 2 ? 1 : -1) : 0);
      const cellX = Math.floor((actor.x + Math.cos(turn) * actor.radius * share) / 4) * 4;
      const cellY = Math.floor((actor.y + Math.sin(turn) * actor.radius * share * .8) / 4) * 4;
      for (const dx of i % 3 ? [0, 4] : [0])
        if (Math.hypot(cellX + dx + 2 - actor.x, cellY + 2 - actor.y) <= actor.radius) fill(stage.ground, HAZE[i % HAZE.length], show.wispAlpha * fade, cellX + dx, cellY, 4, 4);
    }
    if (look.motion && onceEvery(memory, look.time, show.puff)) {
      const random = memory.random, turn = random() * Math.PI * 2, far = random() * actor.radius * .6;
      stage.mote({ x: actor.x + Math.cos(turn) * far, y: actor.y + Math.sin(turn) * far }, (random() - .5) * 12, -18 - random() * 10, -8,
        700, random() < .5 ? PALETTE.olive : PALETTE.moss, false, 0, 2);
    }
  }

  private whirl(stage: SkillStage, actor: BphActor, memory: Memory, look: Look): void {
    const show = UNIT_FX_SHOW.whirl, fade = clamp01(Math.min((look.time - actor.startedAt) / .25, (actor.until - look.time) / .5));
    if (fade <= 0) return;
    const { x, y, radius } = actor, spin = look.motion ? look.time * show.spin : 0;
    const ring = Math.max(10, Math.round(Math.PI * 2 * radius / 6));
    for (let i = 0; i < ring; i++) {
      const turn = i / ring * Math.PI * 2 + spin * .4;
      dot(stage.ground, i % 3 ? PALETTE.sand : PALETTE.sandLight, .32 * fade, { x: x + Math.cos(turn) * radius, y: y + Math.sin(turn) * radius * .9 }, 2);
    }
    for (let band = 0; band < show.bands; band++) {
      const rise = band / (show.bands - 1), rx = radius * (.35 + .65 * rise), ry = rx * .32, cy = y - 4 - rise * show.height;
      const sway = look.motion ? Math.sin(look.time * 3 + band) * show.sway * rise : 0, count = Math.max(10, Math.round(Math.PI * 2 * rx / show.gap));
      for (let i = 0; i < count; i++) {
        if (i % 5 === 4) continue;
        const turn = i / count * Math.PI * 2 + spin * (1 + .25 * band), front = Math.sin(turn) > 0;
        const at = { x: x + sway + Math.cos(turn) * rx, y: cy + Math.sin(turn) * ry };
        if (front) fill(stage.field, band % 2 ? PALETTE.cream : PALETTE.silverLight, .6 * fade, at.x - 1.5, at.y - 1, 3, 2);
        else dot(stage.field, PALETTE.silverShade, .3 * fade, at, 2);
      }
    }
    if (look.motion && onceEvery(memory, look.time, show.debris)) {
      const random = memory.random, turn = random() * Math.PI * 2;
      stage.mote({ x: x + Math.cos(turn) * radius, y: y + Math.sin(turn) * radius * .9 }, -Math.sin(turn) * 50, -30 - random() * 30, 60, 420,
        random() < .5 ? PALETTE.sand : PALETTE.timberLight, false, 0, 2);
    }
  }

  private stream(stage: SkillStage, actor: BphActor, memory: Memory, look: Look): void {
    memory.segments ??= streamSegments(actor);
    const segments = memory.segments, show = UNIT_FX_SHOW.stream;
    if (!segments.length) return;
    const span = actor.until - actor.startedAt, life = span > 0 ? clamp01((look.time - actor.startedAt) / span) : 1, fade = (1 - life) ** .8;
    if (fade <= .01) return;
    const total = segments.reduce((sum, segment) => sum + Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y), 0);
    const reach = total, points = streamPoints(segments, show.spacing, reach);
    const core = life < .3 ? look.flash ? PALETTE.white : PALETTE.cream : life < .6 ? PALETTE.cream : PALETTE.gold;
    const beat = look.motion ? Math.floor(look.now / 50) : 0;
    for (const [index, point] of points.entries()) {
      const lick = ((index * 7 + beat) % 5 - 2) / 2 * show.flicker, side = { x: -Math.sin(point.heading) * lick, y: Math.cos(point.heading) * lick };
      dot(stage.field, life < .5 ? PALETTE.flame : PALETTE.ember, .24 * fade, { x: point.x + side.x, y: point.y + side.y }, 6);
      dot(stage.field, PALETTE.gold, .5 * fade, point, 4);
      dot(stage.trails, core, fade, point, 2);
    }
    if (look.motion && life < show.travel * 1.6 && points.length)
      for (let k = 0, index = points.length - 1; k < show.arrows; k++) {
        const along = reach - k * show.arrowGap;
        while (index > 0 && points[index].along > along) index--;
        if (points[index].along > along) break;
        glint(stage.trails, points[index].x, points[index].y, points[index].heading, PALETTE.gold, fade);
      }
    if (look.motion && Number.isNaN(memory.emitted) && points.length) {
      memory.emitted = 0;
      for (let n = 0; n < show.embers; n++) {
        const spot = points[Math.floor(memory.random() * points.length)];
        stage.mote(spot, (memory.random() - .5) * 40, -10 - memory.random() * 20, 160, 260 + memory.random() * 200,
          memory.random() < .5 ? PALETTE.gold : PALETTE.flame, false, 0, 2);
      }
    }
  }

  private hook(stage: SkillStage, frame: FrameContext, actor: BphActor, units: ReadonlyMap<number, Unit>, look: Look): void {
    const owner = units.get(actor.ownerId);
    if (!owner) return;
    const hand = frame.at(owner), start = { x: hand.x, y: hand.y - UNIT_FX_SHOW.rope.hand };
    const target = frame.run.enemies.find(enemy => enemy.id === actor.targets[0]);
    const pulling = actor.data.phase === 1, tip = pulling && target ? frame.at(target) : { x: actor.x, y: actor.y };
    const length = Math.hypot(tip.x - start.x, tip.y - start.y), sag = pulling ? 0 : Math.min(UNIT_FX_SHOW.rope.maxSag, length * UNIT_FX_SHOW.rope.sag);
    const samples = Math.max(2, Math.ceil(length / UNIT_FX_SHOW.rope.step));
    for (let k = 0; k <= samples; k++) {
      const t = k / samples, hum = pulling && look.motion ? Math.sin(look.time * 40 + t * 12) * (1 - Math.abs(2 * t - 1)) : 0;
      const at = lerp(start, tip, t), y = at.y + sag * 4 * t * (1 - t) + hum;
      fill(stage.field, PALETTE.outline, .7, at.x, y + 1, 2, 1);
      fill(stage.field, PALETTE.sandLight, 1, at.x, y, 2, 1);
    }
    glint(stage.field, tip.x, tip.y, Math.atan2(tip.y - start.y, tip.x - start.x), PALETTE.silverLight, 1);
  }

  private glaive(stage: SkillStage, frame: FrameContext, actor: BphActor, memory: Memory, units: ReadonlyMap<number, Unit>, look: Look): void {
    const owner = units.get(actor.ownerId), shift = this.drawnOffset(frame, owner), data = actor.data;
    const orbit = Number.isFinite(data.orbit) ? data.orbit : 0, angular = Number.isFinite(data.angular) ? data.angular : 0;
    const angle = (Number.isFinite(data.angle) ? data.angle : 0) + angular * look.lead;
    const center = owner ? { x: owner.x + shift.x, y: owner.y + shift.y } : { x: actor.x - Math.cos(angle) * orbit, y: actor.y - Math.sin(angle) * orbit };
    const at = (turn: number): Point => ({ x: center.x + Math.cos(turn) * orbit, y: center.y + Math.sin(turn) * orbit });
    if (look.motion)
      for (let k = UNIT_FX_SHOW.glaive.trail; k >= 1; k--)
        dot(stage.field, k < 3 ? PALETTE.silverLight : PALETTE.steelLight, .6 - k * .08, at(angle - k * UNIT_FX_SHOW.glaive.trailStep * Math.sign(angular || 1) * Math.PI), 2);
    const blade = at(angle);
    glint(stage.trails, blade.x, blade.y, angle + Math.sign(angular || 1) * Math.PI / 2, PALETTE.silverLight, 1);
    memory.angle = angle;
  }

  private stake(stage: SkillStage, actor: BphActor, memory: Memory, units: ReadonlyMap<number, Unit>, look: Look): void {
    if (memory.legs !== actor.targets.length) { memory.legs = actor.targets.length; memory.origin = { x: actor.x, y: actor.y }; }
    const ally = units.get(actor.targets[actor.targets.length - 1]), to = ally ? { x: ally.x, y: ally.y } : { x: actor.toX, y: actor.toY };
    const from = memory.origin ?? { x: actor.x, y: actor.y }, leg = Math.hypot(to.x - from.x, to.y - from.y);
    const share = leg > 1 ? clamp01(1 - Math.hypot(to.x - actor.x, to.y - actor.y) / leg) : 1;
    const lift = 4 * Math.min(UNIT_FX_SHOW.stake.maxLift, leg * UNIT_FX_SHOW.stake.lift) * share * (1 - share);
    shadow(stage.ground, actor, .25);
    glint(stage.trails, actor.x, actor.y - lift, -Math.PI / 2, PALETTE.leafLight, 1);
    if (look.motion && onceEvery(memory, look.time, .09))
      stage.mote({ x: actor.x, y: actor.y - lift }, (memory.random() - .5) * 30, 10, 60, 360, memory.random() < .5 ? PALETTE.leafLight : PALETTE.moss, false, 0, 2);
  }

  private flail(stage: SkillStage, frame: FrameContext, actor: BphActor, memory: Memory, units: ReadonlyMap<number, Unit>, look: Look): void {
    const show = UNIT_FX_SHOW.flail, shift = this.drawnOffset(frame, units.get(actor.ownerId));
    const center = { x: actor.x + shift.x, y: actor.y + shift.y }, last = memory.trail[memory.trail.length - 1];
    if (!last || Math.hypot(center.x - last.x, center.y - last.y) >= show.wakeGap) memory.trail.push({ ...center, at: look.time });
    memory.trail = memory.trail.filter(spot => look.time - spot.at < show.wakeLife);
    for (const spot of memory.trail) fill(stage.ground, PALETTE.sand, .35 * (1 - (look.time - spot.at) / show.wakeLife), spot.x - 2, spot.y + 2, 4, 2);
    const angle = Number.isFinite(actor.data.angle) ? actor.data.angle : memory.angle;
    const head = { x: center.x + Math.cos(angle) * show.idleReach, y: center.y + Math.sin(angle) * show.idleReach };
    glint(stage.trails, head.x, head.y, angle, PALETTE.silverLight, .75);
    const turned = Math.abs(Math.atan2(Math.sin(angle - memory.angle), Math.cos(angle - memory.angle)));
    if (turned > 1 && look.motion)
      for (let n = 0; n < 6; n++) {
        const turn = n / 6 * Math.PI * 2;
        stage.mote(center, Math.cos(turn) * 70, Math.sin(turn) * 70 - 20, 200, 220, n % 2 ? PALETTE.gold : look.flash ? PALETTE.white : PALETTE.cream, false, 0, 2);
      }
    memory.angle = angle;
  }

  private charge(stage: SkillStage, frame: FrameContext, actor: BphActor, units: ReadonlyMap<number, Unit>, look: Look): void {
    if (look.time < actor.startedAt || !finite(actor.data.fromX, actor.data.fromY)) return;
    const show = UNIT_FX_SHOW.charge, owner = units.get(actor.ownerId), shift = this.drawnOffset(frame, owner);
    const head = { x: actor.x + shift.x, y: actor.y + shift.y - (actor.data.elevation ?? 0) }, from = { x: actor.data.fromX + shift.x, y: actor.data.fromY + shift.y };
    if (actor.data.monkHop === 1) {
      if (!owner || owner.hp <= 0) return;
      const ground = frame.at(owner), to = { x: actor.toX + shift.x, y: actor.toY + shift.y };
      fill(stage.ground, PALETTE.outline, .48, ground.x - 8, ground.y + 10, 16, 4);
      if (!look.motion) return;
      const duration = actor.until - actor.startedAt;
      for (let n = 6; n >= 1; n--) {
        const t = (look.time - actor.startedAt - n * .018) / duration;
        if (t <= 0 || t >= 1) continue;
        const at = lerp(from, to, t);
        at.y -= 4 * t * (1 - t) * actor.data.height + 5;
        dot(stage.trails, n <= 2 ? PALETTE.cream : PALETTE.teal, (7 - n) * .11, at, n <= 2 ? 5 : 3);
      }
      return;
    }
    const length = Math.hypot(head.x - from.x, head.y - from.y);
    if (length < 2) return;
    const ux = (head.x - from.x) / length, uy = (head.y - from.y) / length, tail = Math.min(length, show.tail);
    for (let along = 0; along <= tail; along += 4)
      fill(stage.ground, PALETTE.sandLight, .42 * (1 - along / tail), head.x - ux * along - 2, head.y - uy * along + 2, 4, 2);
    const monk = owner?.bph ? BPH_PROFILES[owner.bph.profileId]?.classId === "monk" : false;
    const streak = monk ? PALETTE.teal : look.flash ? PALETTE.white : PALETTE.cream;
    for (const offset of [-show.gap, 0, show.gap])
      for (let along = 4; along <= Math.min(length, show.lines); along += 2) {
        const back = along / length, arc = actor.data.martialLeap === 1 || actor.data.martialDismount === 1;
        const at = arc ? flightPoint(from, { x: actor.toX + shift.x, y: actor.toY + shift.y },
          Math.max(0, (look.time - actor.startedAt) / ((actor.data.landAt ?? actor.until) - actor.startedAt) - back))
          : { x: head.x - ux * along, y: head.y - uy * along };
        dot(stage.trails, streak, .8 * (1 - along / show.lines), { x: at.x - uy * offset, y: at.y - 6 + ux * offset }, 2);
      }
  }

  private promotions(units: ReadonlyMap<number, Unit>, frame: FrameContext, look: Look): void {
    for (const unit of units.values()) {
      const progress = unit.bph;
      if (!progress) continue;
      const known = this.ranks.get(unit.id);
      if (progress.foil && known && known.lifeId === progress.lifeId && progress.stage > known.stage) {
        const at = frame.at(unit);
        this.shimmers.push({ unitId: unit.id, at: look.time, x: at.x, y: at.y, started: false });
      }
      this.ranks.set(unit.id, { lifeId: progress.lifeId, stage: progress.stage });
    }
    for (const id of this.ranks.keys()) if (!units.has(id)) this.ranks.delete(id);
  }

  private drawShimmers(stage: SkillStage, frame: FrameContext, units: ReadonlyMap<number, Unit>, look: Look): void {
    const show = UNIT_FX_SHOW.prism;
    this.shimmers = this.shimmers.filter(shimmer => look.time - shimmer.at < show.life);
    for (const shimmer of this.shimmers) {
      const unit = units.get(shimmer.unitId);
      if (unit && unit.hp > 0) { const at = frame.at(unit); shimmer.x = at.x; shimmer.y = at.y; }
      const age = clamp01((look.time - shimmer.at) / show.life), ease = 1 - (1 - age) ** 2, fade = 1 - age;
      const cycle = look.motion ? Math.floor(look.now / 40) : 0;
      for (let column = 0; column < show.columns; column++) {
        const dx = (column - (show.columns - 1) / 2) * 4, height = show.rise * ease * (.6 + .2 * (column % 3));
        for (let up = 0; up <= height; up += 2)
          fill(stage.field, PRISM[(column + Math.floor((up + cycle) / 4)) % PRISM.length], show.alpha * fade * (1 - up / Math.max(1, height) * .5),
            shimmer.x + dx - 1, shimmer.y + 4 - up, 2, 2);
      }
      for (let n = 0; n < show.sparkles; n++) {
        const turn = n / show.sparkles * Math.PI * 2 + (look.motion ? age * 2 : 0), far = 4 + 12 * ease;
        dot(stage.field, PRISM[n % PRISM.length], fade, { x: shimmer.x + Math.cos(turn) * far, y: shimmer.y - 10 + Math.sin(turn) * far * .7 }, 2);
      }
      if (!shimmer.started && look.motion) {
        for (let n = 0; n < 8; n++)
          stage.mote({ x: shimmer.x + (n - 3.5) * 2, y: shimmer.y - 6 }, (n - 3.5) * 6, -50 - n % 3 * 12, 40, 520, PRISM[n % PRISM.length], look.flash, n * 30, 2);
      }
      shimmer.started = true;
    }
  }

  private drawFires(stage: SkillStage, look: Look): void {
    const show = UNIT_FX_SHOW.fire;
    this.fires = this.fires.filter(fire => look.time - fire.at < show.life);
    for (const [index, fire] of this.fires.entries()) {
      const age = look.time - fire.at, fade = clamp01(Math.min(age / .15, (show.life - age) / 1.2));
      const flicker = look.motion ? (Math.floor(look.now / 90) + index) % 3 : 0, tall = flicker % 2;
      fill(stage.ground, PALETTE.jade, .35 * fade, fire.x - 3, fire.y, 6, 2);
      fill(stage.ground, PALETTE.gold, .9 * fade, fire.x - 2, fire.y - 3 - tall, 4, 3 + tall);
      fill(stage.ground, PALETTE.cream, .9 * fade, fire.x - 1, fire.y - 2, 2, 2);
      fill(stage.ground, PALETTE.leafLight, .8 * fade, fire.x - 1 + (flicker === 2 ? 1 : -1), fire.y - 5 - tall, 2, 2);
    }
  }
}

export const ambient: AmbientShow = new UnitFxView();
