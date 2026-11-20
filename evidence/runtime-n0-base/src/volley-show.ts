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
