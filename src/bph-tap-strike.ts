import { TUNABLES } from "./tunables";

/** Tap strike: a tap on the open battlefield calls a castle arrow volley onto that spot.
 *  It replaces the original's pointer-following cursor attack, which a thumb cannot steer on a phone;
 *  the original cursor nodes and relics now upgrade this volley instead (see bph-fx-status tapStrikeStats). */
export const BPH_TAP_STRIKE = TUNABLES.tapStrike;

export type BphTapStrikeView = {
  readonly charges: number;
  readonly max: number;
  /** Battlefield pixels the next volley hits, upgrades included: the aim ring's size. */
  readonly radius: number;
  /** Share of the next volley already refilled, 0..1; 1 when every charge is full. */
  readonly refill: number;
};
