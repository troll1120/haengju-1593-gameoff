import type { BphMasterySide } from "./bph-mastery-sides";

/**
 * Every relic is general-type or army-type (general-growth design section 4, owner DM 1794929019.876699: the tap volley
 * counts as the general's own strike). Slots stay shared, so the two kinds compete for the same 1-4 slots.
 * Keyed by the relic-40 number; the relic-40 data lane maps its new IDs into BPH_RELIC_NUMBERS.
 */
export type BphRelicTag = BphMasterySide;
const GENERAL_RELICS: ReadonlySet<number> = new Set([2, 6, 12, 14, 15, 25, 26, 31, 24, 30, 33, 40]);
export const BPH_RELIC_COUNT = 40;
export const bphRelicTagOfNumber = (relicNumber: number): BphRelicTag => GENERAL_RELICS.has(relicNumber) ? "general" : "army";

/** Relic IDs present in today's data with their relic-40 number (R_FirstPackPortal is #11's predecessor). */
export const BPH_RELIC_NUMBERS: Readonly<Record<string, number>> = {
  Relic1_CharmWarrior: 1, Relic1_Rapier: 2, Relic1_FourLeafClover: 3, Relic2_Nature_TalkingBeet: 4,
  Relic1_GiantsMight: 5, Relic1_Club: 6, R_HeroMoveSpeed: 7, Relic1_TomeDuration: 8, R_AutomaticBallista: 9,
  R_FirstPackPortal: 11,
};

/** Relics outside the relic-40 table (retired or not yet numbered) count as army-type. */
export function bphRelicTag(relicId: string): BphRelicTag {
  const relicNumber = BPH_RELIC_NUMBERS[relicId];
  return relicNumber === undefined ? "army" : bphRelicTagOfNumber(relicNumber);
}
