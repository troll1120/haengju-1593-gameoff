import { BPH_PROFILES } from "./bph-data";
import { BPH_CLASS_ART, BPH_UNIT_VARIANT_ART } from "./bph-art";
import { BOSS_FRAME } from "./sprite-layout";

export const GENERAL_POSES = { walk: 4, attack: 4, hit: 3, death: 3, idle: 4 } as const;
export const GENERAL_SHEET_COLUMNS = 18;
/** Adding an approved class set only changes this table and its installed art. */
const SOLDIER_SETS = {
  spearman: { side: "ally", attack: 4, height: 48 }, archer: { side: "ally", attack: 4, height: 48 },
  monk: { side: "ally", attack: 4, height: 48 }, hwacha: { side: "ally", attack: 4, height: 48 },
  uibyeong: { side: "ally", attack: 4, height: 48 }, chongtong: { side: "ally", attack: 4, height: 48 },
  samurai: { side: "enemy", attack: 4, height: 48 }, yari: { side: "enemy", attack: 4, height: 48 },
  so_yoshitoshi: { side: "enemy", attack: 4, height: 48 },
  teppo: { side: "enemy", attack: 5, height: 48 },
} as const;
const soldiers = new Map<string, { readonly attack: number; readonly height: number }>(Object.entries(SOLDIER_SETS));
export const SOLDIER_ALLY_ART = Object.entries(SOLDIER_SETS).filter(([, set]) => set.side === "ally").map(([actor]) => actor);
export const SOLDIER_ENEMY_ART = Object.entries(SOLDIER_SETS).filter(([, set]) => set.side === "enemy").map(([actor]) => actor);
/** Promoted militia and gunner profiles keep their 32 px sheets until their own motion sets are installed. */
const VARIANTS_WITHOUT_SET: ReadonlySet<string> = new Set(["bph-Hero3_WitchDoctor", "bph-Hero4_Duelist",
  "bph-Hero_Jaguar", "bph-Hero_Rat", "bph-Hero6_BloodMage"]);
for (const actor of BPH_UNIT_VARIANT_ART) {
  const profile = BPH_PROFILES[actor.slice(4)], base = BPH_CLASS_ART[profile.classId];
  const set = soldiers.get(base);
  if (set && !VARIANTS_WITHOUT_SET.has(actor)) { soldiers.set(actor, set); SOLDIER_ALLY_ART.push(actor); }
}
/** The packed file, cell and pose counts are shared by preload, animations and DOM cards. */
export function fullsetArt(actor: string) {
  const soldier = soldiers.get(actor);
  return {
    file: `${soldier ? "soldiers" : "generals"}/${actor}`,
    frame: soldier ? { width: 56, height: soldier.height } : BOSS_FRAME,
    columns: soldier ? GENERAL_SHEET_COLUMNS + soldier.attack - GENERAL_POSES.attack : GENERAL_SHEET_COLUMNS,
    poses: soldier ? { ...GENERAL_POSES, attack: soldier.attack } : GENERAL_POSES,
  };
}
