import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import type { ChaosSkillEvent } from "./chaos-contract";
import { contains } from "./geometry";
import type { Point, Rect } from "./geometry";
import { PALETTE } from "./presentation";
import type { Paint } from "./presentation";
import type { General } from "./roster";
import { scatter } from "./skill-show";

export const VOLLEY_GENERAL: General = "권율";
/** Display-only staging of the volley, in milliseconds from the cast unless named otherwise. The rules resolve the whole
 *  volley on the cast tick; these numbers only time the picture that follows it. */
export const VOLLEY_SHOW = {
  /** The held results appear here, on the thump of the existing volley sound. */
  impact: 260,
  flight: 150, dropPixels: 170, lead: 70, rain: 440,
  stand: 520, fade: 200,
  dusk: { rise: 90, hold: 400, fall: 280 },
  mark: { rise: 60, fall: 300, still: 500 },
  arrows: 40, arrowsPerTier: 8, maxStrikes: 14, insetPixels: 6,
} as const;

export type VolleyArrow = { readonly x: number; readonly y: number; readonly landAt: number; readonly strike: boolean };
/** Where and when one volley's arrows come down. One arrow per struck foe arrives exactly as its damage is shown; the
 *  others are decoration, spread evenly over the ground and never outside the real radius. With motion off they all stand at once. */
export function planVolley(cast: { readonly seed: number; readonly x: number; readonly y: number; readonly radius: number; readonly tier: number;
  readonly density: number; readonly still: boolean; readonly targets: readonly { readonly x: number; readonly y: number }[] }): VolleyArrow[] {
  const random = scatter(cast.seed), impact = cast.still ? 0 : VOLLEY_SHOW.impact;
  const first = cast.still ? 0 : impact - VOLLEY_SHOW.lead, last = cast.still ? 0 : VOLLEY_SHOW.rain;
  const strikes = cast.targets.slice(0, VOLLEY_SHOW.maxStrikes).map(target => ({ x: target.x, y: target.y, landAt: impact, strike: true }));
  const wanted = Math.round((VOLLEY_SHOW.arrows + VOLLEY_SHOW.arrowsPerTier * (cast.tier - 1)) * cast.density);
  const count = Math.max(0, wanted - strikes.length), reach = Math.max(0, cast.radius - VOLLEY_SHOW.insetPixels);
  const ground = Array.from({ length: count }, (_, index) => {
    const turn = index * 2.399963 + random() * .8, far = reach * Math.sqrt((index + random()) / count);
    return { x: cast.x + Math.cos(turn) * far, y: cast.y + Math.sin(turn) * far,
      landAt: first + (last - first) * ((index * .618034 + random() * .1) % 1), strike: false };
  });
  return [...strikes, ...ground];
}

/** Display-only dressing of the army-level arrow rain: the events of kind "arrows" the rules keep in run.chaosSkills from army level 1.
 *  The rules own every place, size and time (a stream's `to` and radius, its lob from `from` under arcHeight, its startedTick,
 *  impactTick and untilTick). These are only shares of those, and the ground one drawn arrow takes. */
export const RAIN_SHOW = {
  /** Share of the real flight one arrow takes to fall from the top of the rules' lob onto its place. */
  fall: .32,
  /** Shares of one fall: the fade in at the top of the lob, and how far back the streak reaches. */
  rise: .2, streak: .3,
  /** Shares of the real after-glow: how late a stream's last arrows may land, so one wave's rain runs into the next; how long a
   *  landing's dust flies; and the fade of the standing arrows up to untilTick. */
  late: .35, dust: .25, fade: .35,
  /** The dusk the rain holds as a share of the stage's veil, and a dust chip's reach and hop in pixels. */
  dusk: .6, dustReach: 9, dustLift: 12,
} as const;

/** What the rain reads of one event. The rest of the record (power, push, hits) is the rules' own business. */
export type RainStream = Pick<ChaosSkillEvent, "id" | "castId" | "level" | "from" | "to" | "startedTick" | "impactTick" | "untilTick" | "radius" | "arcHeight">;
/** The player's motion and flash settings, and the particle headroom the cast was given. */
export type RainLook = { readonly motion: boolean; readonly flash: boolean; readonly density: number };
/** The ground an arrow can stand on: the field above the river bank, outside the keep. */
export type RainGround = { readonly width: number; readonly bank: number; readonly keep: Rect };
/** One frame of the rain: every event of the run, the army tick it is drawn at, and how and where it may be drawn. */
export type RainFrame = { readonly events: readonly ChaosSkillEvent[]; readonly clock: number; readonly look: RainLook; readonly ground: RainGround };
export type RainLayer = "ground" | "field" | "trails";
/** One rectangle in field pixels, in the stage's own fillStyle and fillRect order, so a frame's thousands of them cost no objects. */
export type RainSink = (layer: RainLayer, paint: Paint, alpha: number, x: number, y: number, wide: number, high: number) => void;
export type RainArrow = { readonly x: number; readonly y: number; readonly landTick: number };

type Chip = readonly [paint: Paint, x: number, y: number, wide: number, high: number];
/** The arrow sheet's downward frame as rectangles round its middle (outline, fletching, the ally band, shaft, head, tip), so a stream
 *  draws more arrows than the stage's pooled pictures could give it. */
const FALLING: readonly Chip[] = [[PALETTE.outline, -1, -7, 3, 14], [PALETTE.outline, -2, -6, 5, 3], [PALETTE.white, -1, -6, 3, 2],
  [PALETTE.ally, -1, -4, 3, 1], [PALETTE.leatherLight, 0, -6, 1, 9], [PALETTE.silver, -1, 3, 3, 2], [PALETTE.silverLight, 0, 5, 1, 2]];
/** A landed arrow shows its fletching and shaft; its head is in the ground. */
const STUCK: readonly Chip[] = [[PALETTE.outline, -1, -7, 3, 10], ...FALLING.slice(1, 5)];
const RAIN_STREAK: readonly Paint[] = [PALETTE.white, PALETTE.cream, PALETTE.gold], CALM_STREAK: readonly Paint[] = [PALETTE.cream, PALETTE.gold, PALETTE.brass];
const RAIN_DUST: readonly Paint[] = [PALETTE.sand, PALETTE.sandLight, PALETTE.cream];

/** The events the rain draws at army tick `clock`: the arrow streams the rules have started and not yet ended. A planned wave is not drawn. */
export function liveRain(events: readonly ChaosSkillEvent[], clock: number): ChaosSkillEvent[] {
  return events.filter(event => event.kind === "arrows" && clock >= event.startedTick && clock < event.untilTick);
}

/** Arrows one stream draws: its real reach per CHAOS_RULES arrow area, scaled by the band's visual density
 *  and by the device's headroom. A live stream always draws at least one. */
export function rainCount(stream: Pick<RainStream, "level" | "radius">, density: number): number {
  const rules = CHAOS_RULES.skills.arrows, reach = Math.max(0, stream.radius - VOLLEY_SHOW.insetPixels);
  return Math.max(1, Math.round(Math.PI * reach * reach / rules.arrowArea * rules.visualDensity[chaosSkillBand(stream.level)] * density));
}

/** Where one stream's arrows come down and when, spread evenly over its real reach. Every fall starts after the stream's startedTick
 *  and ends well inside its after-glow, and the first arrow lands exactly as the rules strike. */
export function rainArrows(stream: RainStream, seed: number, count: number): RainArrow[] {
  const random = scatter(seed), reach = Math.max(0, stream.radius - VOLLEY_SHOW.insetPixels), arrows: RainArrow[] = [];
  const earliest = stream.startedTick + (stream.impactTick - stream.startedTick) * RAIN_SHOW.fall;
  const latest = stream.impactTick + (stream.untilTick - stream.impactTick) * RAIN_SHOW.late;
  for (let index = 0; index < count; index++) {
    const turn = index * 2.399963 + random() * .8, far = reach * Math.sqrt((index + random()) / count), wait = (index * .618034 + random() * .1) % 1;
    arrows.push({ x: stream.to.x + Math.cos(turn) * far, y: stream.to.y + Math.sin(turn) * far,
      landTick: index ? earliest + (latest - earliest) * wait : stream.impactTick });
  }
  return arrows;
}

/** The rules' moving point at `share` of its flight, measured from `to`: straight from `from` to `to`, lifted by arcHeight * 4 * t * (1 - t). */
export function lobOffset(stream: Pick<RainStream, "from" | "to" | "arcHeight">, share: number): Point {
  const left = 1 - share;
  return { x: (stream.from.x - stream.to.x) * left, y: (stream.from.y - stream.to.y) * left - stream.arcHeight * 4 * share * left };
}

/** Where an arrow is `progress` of the way down its fall, measured from its landing place: the falling side of the rules' lob, from the
 *  lob's top to `to`. The rise before the top is never drawn, so the rain only ever comes down. */
export function rainFall(stream: Pick<RainStream, "from" | "to" | "arcHeight">, progress: number): Point {
  const top = stream.arcHeight > 0 ? Math.max(0, Math.min(1, .5 - (stream.to.y - stream.from.y) / (8 * stream.arcHeight))) : 0;
  return lobOffset(stream, top + (1 - top) * progress);
}

/** How deep the rain's dusk is at army tick `clock`, as a share of the stage's veil: it rises with the first live wave's flight, holds
 *  while later waves are still planned, and falls over the last wave's after-glow. With motion off it stands still while a stream is live. */
export function rainVeil(events: readonly ChaosSkillEvent[], clock: number, motion: boolean): number {
  const rain = events.filter(event => event.kind === "arrows" && clock < event.untilTick), live = rain.filter(event => clock >= event.startedTick);
  if (!live.length) return 0;
  if (!motion) return RAIN_SHOW.dusk;
  const first = live.reduce((a, b) => a.startedTick <= b.startedTick ? a : b), last = rain.reduce((a, b) => a.untilTick >= b.untilTick ? a : b);
  return RAIN_SHOW.dusk * Math.min(1, (clock - first.startedTick) / (first.impactTick - first.startedTick),
    (last.untilTick - clock) / (last.untilTick - last.impactTick));
}

const flowSeed = (stream: RainStream): number => Math.imul(stream.id + 1, 0x9e3779b1) ^ 0x1593;
/** Later waves of one cast fall on the same ground, so the still picture is keyed by the cast and the place, not by the wave. */
const stillSeed = (stream: RainStream): number => Math.imul(stream.castId + 1, 0x9e3779b1)
  ^ Math.imul(Math.round(stream.to.x) + 1, 0x85ebca6b) ^ Math.imul(Math.round(stream.to.y) + 1, 0xc2b2ae35);
const stands = (ground: RainGround, spot: Point): boolean =>
  spot.x >= 0 && spot.x <= ground.width && spot.y >= 0 && spot.y <= ground.bank && !contains(ground.keep, spot);

/** The rain at one army tick. Motion on: every live stream's arrows come down one after another along the rules' lob with a streak
 *  behind, kick up dust where they land and stand until they fade by untilTick. Motion off: nothing flies or fades, and each real circle
 *  of a cast holds the same standing arrows for as long as any of its waves is live. Flash off: no white streak. */
export function paintRain({ events, clock, look, ground }: RainFrame, sink: RainSink): void {
  const streams = liveRain(events, clock);
  const draw = (layer: RainLayer, shape: readonly Chip[], at: Point & { readonly alpha: number }): void => {
    const x = Math.round(at.x), y = Math.round(at.y);
    for (const [paint, dx, dy, wide, high] of shape) sink(layer, paint, at.alpha, x + dx, y + dy, wide, high);
  };
  if (!look.motion) {
    const circles = new Map<string, RainStream>();
    for (const stream of streams) circles.set(`${stream.castId}:${stream.to.x}:${stream.to.y}`, stream);
    for (const [, stream] of [...circles].sort(([a], [b]) => a < b ? -1 : 1))
      for (const arrow of rainArrows(stream, stillSeed(stream), rainCount(stream, look.density)))
        if (stands(ground, arrow)) draw("ground", STUCK, { x: arrow.x, y: arrow.y, alpha: 1 });
    return;
  }
  const streak = look.flash ? RAIN_STREAK : CALM_STREAK;
  const fly = (stream: RainStream, arrow: RainArrow, progress: number): void => {
    const at = rainFall(stream, progress), alpha = Math.min(1, progress / RAIN_SHOW.rise);
    let head = at;
    streak.forEach((tone, band) => {
      const tail = rainFall(stream, Math.max(0, progress - RAIN_SHOW.streak * (band + 1) / streak.length));
      const high = Math.round(Math.abs(head.y - tail.y));
      if (high > 0) sink("trails", tone, (1 - band / streak.length) * .9 * alpha, Math.round(arrow.x + Math.min(head.x, tail.x)) - 1,
        Math.round(arrow.y + Math.min(head.y, tail.y)), 2 + Math.round(Math.abs(head.x - tail.x)), high);
      head = tail;
    });
    draw("trails", FALLING, { x: arrow.x + at.x, y: arrow.y + at.y, alpha });
  };
  for (const stream of streams) {
    const fall = (stream.impactTick - stream.startedTick) * RAIN_SHOW.fall, glow = stream.untilTick - stream.impactTick;
    const fade = Math.min(1, (stream.untilTick - clock) / (glow * RAIN_SHOW.fade));
    for (const arrow of rainArrows(stream, flowSeed(stream), rainCount(stream, look.density))) {
      if (!stands(ground, arrow)) continue;
      const progress = 1 - (arrow.landTick - clock) / fall;
      if (progress <= 0) continue;
      if (progress < 1) { fly(stream, arrow, progress); continue; }
      draw("ground", STUCK, { x: arrow.x, y: arrow.y, alpha: fade });
      const settle = (clock - arrow.landTick) / (glow * RAIN_SHOW.dust);
      if (settle < 1) RAIN_DUST.forEach((tone, chip) => sink("field", tone, 1 - settle,
        Math.round(arrow.x) + (chip - 1) * Math.round(RAIN_SHOW.dustReach * settle) - 1,
        Math.round(arrow.y) + 2 - Math.round(RAIN_SHOW.dustLift * (chip % 2 ? 1 : .6) * 4 * settle * (1 - settle)), 2, 2));
    }
  }
}
