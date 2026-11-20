import type { BphClass } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import type { Unit } from "./rules";

/** Art identity is independent of the combat body used for movement and attacks. */
export const BPH_CLASS_ART = {
  spearman: "spearman", archer: "archer", militia: "uibyeong", monk: "monk",
  hwacha: "hwacha", chongtong: "chongtong", joseon_cavalry: "joseon_cavalry", panokseon: "panokseon",
} as const satisfies Readonly<Record<BphClass, string>>;

/** The approved Joseon sheet retains its original asset filename. */
export const bphArtFile = (texture: string): string => texture === "joseon_cavalry" ? "cavalry" : texture;

export function bphUnitArt(unit: Unit, fallback: string): string {
  return unit.bph ? BPH_CLASS_ART[BPH_PROFILES[unit.bph.profileId].classId] : fallback;
}
