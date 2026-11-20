import { CENTER, HEIGHT } from "./geometry";
import type { Point } from "./geometry";

export const RIVER_FIRST_AT = 180;
export const RIVER_EVERY = 240;
export const RIVER_SECONDS = 45;
export const SHIP_ART = ["atakebune", "sekibune"] as const;
export const SHIP_TEXTURES = [...SHIP_ART, "kobaya", "panokseon", "geobukseon"] as const;
export type ShipArt = typeof SHIP_ART[number] | "kobaya";
export const SHIP_FRAME = { width: 56, height: 64 };
/** Original Imjin ship sheets: front/back/side rows, fourteen cells each. No separate firing cells. */
export const SHIP_POSES = { idle: [0, 4], walk: [4, 4], attack: [4, 4], hit: [8, 3], death: [11, 3] } as const;
/** The shore sits 136 px below the field centre (56 px below the castle's south wall), never lower than the old 136 px band. */
export const riverBank = (): number => Math.min(HEIGHT - 136, HEIGHT / 2 + 136);
/** Bow-on run a transport makes to the shore after its side-on approach. */
export const SHIP_TURN = 64;
/** Display-only path of a landing transport: the simulated ship rises straight up; on screen it sails in side-on along
 *  the lane SHIP_TURN below the shore from the nearer edge, then turns bow-on and meets its simulated position for the last SHIP_TURN. */
export function transportView(at: Point): Point & { readonly direction: "side" | "back"; readonly faceLeft: boolean } {
  const lane = riverBank() + SHIP_TURN, left = at.x < CENTER.x;
  if (at.y <= lane) return { x: at.x, y: at.y, direction: "back", faceLeft: !left };
  return { x: at.x + (left ? -1 : 1) * (at.y - lane), y: lane, direction: "side", faceLeft: !left };
}
export const riverLane = (): number => riverBank() + 36;

/** Japanese landing craft escalate over the run. capacity = passengers aboard before it sails, hull = hull HP per passenger HP,
 *  scale = on-screen size against the kobaya. Only the atakebune shoots at the shore while it approaches. */
export const TRANSPORT_TIERS = {
  kobaya: { capacity: 5, hull: .5, speed: 40, scale: 1, volley: 0 },
  sekibune: { capacity: 8, hull: .8, speed: 34, scale: 1.3, volley: 0 },
  atakebune: { capacity: 12, hull: 1.2, speed: 28, scale: 1.65, volley: 10 },
} as const;
export type TransportTier = keyof typeof TRANSPORT_TIERS;
export const SEKIBUNE_FROM = 300, ATAKEBUNE_FROM = 600, BOSS_FLAGSHIP_FROM = 240, ENDLESS_FROM = 900;
/** Atakebune volley: one shot every VOLLEY_EVERY s at the nearest of our troops within VOLLEY_RANGE of the hull. */
export const VOLLEY_EVERY = 3, VOLLEY_RANGE = 180;
export function transportTier(time: number, bossAfield: boolean): TransportTier {
  if (time >= ATAKEBUNE_FROM || bossAfield && time >= BOSS_FLAGSHIP_FROM) return "atakebune";
  return time >= SEKIBUNE_FROM ? "sekibune" : "kobaya";
}
/** Endless keeps scaling past 15:00: one more passenger every 2 min (up to 20) and +25 % hull every 5 min. */
export function transportLoad(tier: TransportTier, time: number): { readonly capacity: number; readonly hull: number } {
  const late = Math.max(0, time - ENDLESS_FROM), base = TRANSPORT_TIERS[tier];
  return { capacity: Math.min(20, base.capacity + Math.floor(late / 120)), hull: base.hull * (1 + late / 300 * .25) };
}
