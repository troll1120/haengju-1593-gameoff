import { BPH_GENERALS } from "./bph-commanders";
import type { BphGeneral } from "./bph-commanders";
import type { Run } from "./rules";

// Owner ledger 1037: the 2nd general costs 500 coins and the 3rd 1000.
const BPH_HIRE_PRICES = [500, 1000] as const;
export const BPH_JOIN_LIMIT = 1 + BPH_HIRE_PRICES.length;
export type BphHireSlot = { readonly index: number; readonly price: number } & (
  { readonly status: "joined"; readonly general: BphGeneral }
  | { readonly status: "locked" | "unaffordable" | "available"; readonly general?: never }
);
/** Keeps the join stream apart from the recruit roulette's (seed, purchase ordinal) stream. */
export const BPH_JOIN_SALT = 0x4a4f494e;

export function bphJoinCandidates(run: Run): BphGeneral[] {
  const battle = run.bph;
  if (!battle) return [];
  return BPH_GENERALS.filter(general => battle.save.unlockedGenerals.includes(general)
    && !run.squads.some(squad => squad.general === general));
}

export function bphHireSlots(run: Run): BphHireSlot[] {
  const battle = run.bph;
  if (!battle?.survival) return [];
  const hasCandidate = run.squads.length < BPH_JOIN_LIMIT && bphJoinCandidates(run).length > 0;
  return BPH_HIRE_PRICES.map((price, index) => {
    const general = battle.hiredGenerals?.[index];
    if (general !== undefined) return { index, price, status: "joined", general };
    return { index, price, status: !hasCandidate ? "locked" : run.phase === "playing" && run.gold >= price ? "available" : "unaffordable" };
  });
}

/** One side-stream roll per slot; neither the combat RNG nor account RNG is consumed. */
export function bphHireRoll(seed: number, slot: number): number {
  const salted = Math.imul((seed >>> 0 || 1) ^ BPH_JOIN_SALT, 0x9e3779b1) ^ Math.imul(slot + 1, 0x85ebca77);
  const state = (salted + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state ^ state >>> 15, state | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
