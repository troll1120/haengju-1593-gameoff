import { HEIGHT } from "./geometry";

export const RIVER_FIRST_AT = 180;
export const RIVER_EVERY = 240;
export const RIVER_SECONDS = 45;
export const SHIP_ART = ["atakebune", "sekibune"] as const;
export const SHIP_TEXTURES = [...SHIP_ART, "kobaya", "panokseon", "geobukseon"] as const;
export type ShipArt = typeof SHIP_ART[number] | "kobaya";
export const SHIP_FRAME = { width: 56, height: 64 };
/** Original Imjin ship sheets: front/back/side rows, fourteen cells each. No separate firing cells. */
export const SHIP_POSES = { idle: [0, 4], walk: [4, 4], attack: [4, 4], hit: [8, 3], death: [11, 3] } as const;
export const riverBank = (): number => HEIGHT - 136;
export const riverLane = (): number => riverBank() + 36;
