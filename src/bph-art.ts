import type { BphClass } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import type { Unit } from "./rules";

/** Art identity is independent of the combat body used for movement and attacks. */
export const BPH_CLASS_ART = {
  spearman: "spearman", archer: "archer", militia: "uibyeong", monk: "monk",
  hwacha: "hwacha", chongtong: "chongtong", joseon_cavalry: "joseon_cavalry", panokseon: "panokseon",
} as const satisfies Readonly<Record<BphClass, string>>;

/** The basic recruit of a class keeps the class sheet; every other profile has its own recoloured sheet under art/<units|ships>/bph/. */
const CLASS_LOOK: ReadonlySet<string> = new Set(["Hero1_Squire", "Hero1_Archer", "Hero1_Barbarian"]);
const VARIANT = "bph-";
/** Every ally cavalry profile draws the shared Joseon cavalry sheet (owner DM 1794888398.514179). */
const classLook = (profileId: string): boolean => CLASS_LOOK.has(profileId) || BPH_PROFILES[profileId].classId === "joseon_cavalry";
export const bphProfileArt = (profileId: string): string =>
  classLook(profileId) ? BPH_CLASS_ART[BPH_PROFILES[profileId].classId] : `${VARIANT}${profileId}`;
const variants = (ship: boolean): readonly string[] => Object.values(BPH_PROFILES)
  .filter(profile => !classLook(profile.id) && (profile.classId === "panokseon") === ship).map(profile => bphProfileArt(profile.id));
export const BPH_UNIT_VARIANT_ART = variants(false);
export const BPH_SHIP_VARIANT_ART = variants(true);
export const bphShipArt = (texture: string): boolean => texture === "panokseon" || BPH_SHIP_VARIANT_ART.includes(texture);

/** All Joseon cavalry share the Ming rider; enemy cavalry has its own painted sheet. */
export const bphArtFile = (texture: string): string => texture === "joseon_cavalry" ? "ming_cavalry"
  : texture.startsWith(VARIANT) ? `bph/${texture.slice(VARIANT.length)}` : texture;
export const bphArtPath = (texture: string): string => `${bphShipArt(texture) ? "ships" : "units"}/${bphArtFile(texture)}.png`;

export function bphUnitArt(unit: Unit, fallback: string): string {
  return unit.bph ? bphProfileArt(unit.bph.profileId) : fallback;
}
