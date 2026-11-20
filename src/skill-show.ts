import type { Rect } from "./geometry";
import type { Effect, Telegraph } from "./rules";

export type ShowChannels = { readonly motion: boolean; readonly flash: boolean };
/** A banner's rows in field pixels while it shows. */
export type Band = { readonly top: number; readonly bottom: number };

/** Where a big number's bottom edge goes so its popped, rising box never passes behind a banner: unchanged when clear of it,
 * else on the banner's side facing the middle of the field (under a top banner, over a bottom one), or over it when there is no room under. */
export function clearOfBand(bottom: number, reach: number, band: Band | undefined, gap: number, floor: number): number {
  if (!band || bottom <= band.top - gap || bottom - reach >= band.bottom + gap) return bottom;
  const under = band.bottom + gap + reach;
  return band.top + band.bottom < floor && under <= floor ? under : Math.max(reach, band.top - gap);
}

/** A cast's ground or an enemy warning, measured like the range cells: a circle, or a lane from `from` when it is set. */
export type Area = { readonly x: number; readonly y: number; readonly radius: number; readonly from?: { readonly x: number; readonly y: number } };

/** The ground a skill effect names: a circle of `value` round it, or a lane of half-width `value` from `fromX`, `fromY`. */
export function effectArea(skill: Pick<Effect, "x" | "y" | "value" | "fromX" | "fromY">): Area {
  return skill.fromX === undefined || skill.fromY === undefined ? { x: skill.x, y: skill.y, radius: skill.value }
    : { x: skill.x, y: skill.y, radius: skill.value, from: { x: skill.fromX, y: skill.fromY } };
}

/** An enemy warning as the rules mark it: a circle round `x`, `y`, or a lane to it from `fromX`, `fromY`. */
type Warning = Pick<Telegraph, "shape" | "x" | "y" | "fromX" | "fromY" | "radius">;
/** Danger cells are 4px squares whose middle lies inside the warning, so a painted corner reaches half a cell's diagonal past its
 *  radius. A window opens one cell further still: a rim of open ground that parts the red cells from the red band. */
const CELL = 4, WINDOW_REACH = Math.hypot(CELL / 2, CELL / 2) + CELL;

/** The name banner keeps its top place for every general, so the banner gives way instead: each enemy warning whose cells reach the
 *  banner's box opens a window there, a cell of open ground wider than its last painted cell. A warning whose own box misses the
 *  banner's opens none. */
export function bannerWindows(box: Rect, marks: readonly Warning[]): Area[] {
  return marks.map((mark): Area => {
    const radius = mark.radius + WINDOW_REACH;
    switch (mark.shape) {
      case "circle": return { x: mark.x, y: mark.y, radius };
      case "lane": return { x: mark.x, y: mark.y, radius, from: { x: mark.fromX, y: mark.fromY } };
      default: return mark.shape satisfies never;
    }
  }).filter(({ x, y, radius, from = { x, y } }) => Math.min(x, from.x) - radius < box.right && Math.max(x, from.x) + radius > box.left
    && Math.min(y, from.y) - radius < box.bottom && Math.max(y, from.y) + radius > box.top);
}

/** Those windows as the banner's CSS mask, measured from the banner's corner in its own pixels (`scale` of them to a field pixel).
 *  The banner stays whole outside every window and gives up the `--cut-in-thin` share of itself inside one, so the red cells read
 *  through it: a circle cuts a round window, a lane a strip along its line as long as the lane's own box. No window, no mask. */
export function windowMask(box: Rect, windows: readonly Area[], scale: number): string {
  if (!windows.length) return "none";
  const px = (field: number): string => `${Math.round(field * scale * 100) / 100}px`;
  const cuts = windows.map(({ x, y, radius, from }) => from === undefined
    ? `radial-gradient(circle at ${px(x - box.left)} ${px(y - box.top)}, #000 ${px(radius)}, #0000 0) add`
    : `linear-gradient(${Math.atan2(y - from.y, x - from.x)}rad, #0000 calc(50% - ${px(radius)}), #000 0 calc(50% + ${px(radius)}), #0000 0) `
      + `${px(Math.min(x, from.x) - radius - box.left)} ${px(Math.min(y, from.y) - radius - box.top)} / `
      + `${px(Math.abs(x - from.x) + 2 * radius)} ${px(Math.abs(y - from.y) + 2 * radius)} no-repeat add`);
  return ["linear-gradient(#000 0 0) subtract", "linear-gradient(rgb(0 0 0 / var(--cut-in-thin)) 0 0) intersect", ...cuts].join(", ");
}

/** Scatter for decoration only: its own generator, so a show never draws from the run's seeded stream or Math.random. */
export function scatter(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = state + 0x6d2b79f5 >>> 0;
    let mixed = Math.imul(state ^ state >>> 15, state | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

/** A cast's own results that may wait for its picture. Danger marks, interrupts, events and everything else always show at once. */
export const HELD_KINDS: ReadonlySet<Effect["kind"]> = new Set<Effect["kind"]>(["hit", "devastate", "kill", "coin", "total", "stun"]);

const CASTS = new WeakMap<Effect, readonly Effect[]>();
/** fire() records each tapped cast, so the scene can tell which effects of a frame belong to it wherever the rules put them. */
export function noteCast(cast: readonly Effect[]): void {
  for (const effect of cast) if (effect.kind === "skill") CASTS.set(effect, cast);
}

/** The results that belong to the skill effect at `index`: the recorded cast when it was tapped, otherwise (a volley echo that
 *  the rules fire on their own) the run from the skill effect up to the total that closes it. Skill effects themselves are never results. */
export function castResults(batch: readonly Effect[], index: number): Effect[] {
  const skill = batch[index];
  if (!skill) return [];
  const recorded = CASTS.get(skill);
  if (recorded) return recorded.filter(effect => effect.kind !== "skill");
  const total = batch.findIndex((effect, at) => at > index && effect.kind === "total" && effect.x === skill.x);
  return total < 0 ? [] : batch.slice(index + 1, total + 1).filter(effect => effect.kind !== "skill");
}

export function holdBack(batch: readonly Effect[], held: ReadonlySet<Effect>): { readonly shown: Effect[]; readonly held: Effect[] } {
  return { shown: batch.filter(effect => !held.has(effect)), held: batch.filter(effect => held.has(effect)) };
}

export function envelope(age: number, rise: number, hold: number, fall: number): number {
  if (age < 0) return 0;
  if (age < rise) return rise > 0 ? age / rise : 1;
  if (age < rise + hold) return 1;
  return Math.max(0, 1 - (age - rise - hold) / Math.max(1, fall));
}

export type Release = { readonly effect: Effect; readonly at: number };
/** When each held result appears, in milliseconds from the cast. A hit (and its devastation or stun) appears when its show says;
 *  a felled foe's kill and the coin that follows it wait for that foe's last hit plus the struck flash, so the body flashes before it
 *  falls; anything else (the total) appears when its show says. With no flash the fall follows the hit at once. */
export function releases(held: readonly Effect[], timeOf: (effect: Effect, index: number) => number, flashMs: number): Release[] {
  const lastHit = new Map<number, number>();
  held.forEach((effect, index) => {
    if (effect.kind === "hit" && effect.target !== undefined)
      lastHit.set(effect.target, Math.max(lastHit.get(effect.target) ?? 0, Math.max(0, timeOf(effect, index))));
  });
  let fallen = 0;
  return held.map((effect, index) => {
    if (effect.kind === "kill") {
      fallen = effect.target !== undefined && lastHit.has(effect.target) ? lastHit.get(effect.target)! + flashMs : Math.max(0, timeOf(effect, index));
      return { effect, at: fallen };
    }
    if (effect.kind === "coin") return { effect, at: fallen };
    if ((effect.kind === "devastate" || effect.kind === "stun") && effect.target !== undefined && lastHit.has(effect.target))
      return { effect, at: lastHit.get(effect.target)! };
    return { effect, at: Math.max(0, timeOf(effect, index)) };
  });
}
