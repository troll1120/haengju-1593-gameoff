import type Phaser from "phaser";
import type { PaintedArt } from "./painted-art";
import { PAINTED_BOUNDS } from "./painted-files";
import type { Effect } from "./rules";
import { GENERAL_SKILLS } from "./roster";
import type { General } from "./roster";

/** Source unit palette. UI timber/paper tokens remain in style.css. */
export const PALETTE = {
  outline: 0x262b44, dark: 0x1e2333, ally: 0x6ea5ac, danger: 0xc34b35,
  warning: 0xe19a65, gold: 0xfdbe53, heal: 0x65a556, silver: 0xc0cbdc,
  flame: 0xfeae34,
  jade: 0x25956a, forest: 0x2c433c, slateDeep: 0x2d3249, tealDeep: 0x2d4f56,
  wineDeep: 0x3d212d, wine: 0x3f2631, ash: 0x3f3337, teal: 0x427a86,
  slate: 0x43485a, mossDeep: 0x435f47, leaf: 0x479f4a, steelDeep: 0x51607d,
  steelShade: 0x52607c, steel: 0x58657d, steelMid: 0x5a6988, moss: 0x617a57,
  clayDeep: 0x623938, timber: 0x655849, bark: 0x6a4e46, brickDeep: 0x763b36,
  brickShade: 0x773833, leafLight: 0x84c669, steelLight: 0x8b9bb4,
  timberLight: 0x8e7a5c, steelPale: 0x8e9bb0, olive: 0x909d6f,
  brick: 0x944b49, ochre: 0x967850, leather: 0x976a52, purple: 0x9b4ca3,
  silverShade: 0xaab7cc, sand: 0xb19f7c, clay: 0xbd6c4a, clayLight: 0xbe6c49,
  silverMid: 0xbec7d5, rose: 0xc86f60, leatherLight: 0xc99972, brass: 0xceac66,
  copper: 0xcf8254, sandLight: 0xd1c098, silverLight: 0xdee5ef, skinShade: 0xe1a077,
  ember: 0xe38628, skin: 0xe4bd94, white: 0xe4edf9, red: 0xe84537,
  scarlet: 0xe94334, skinWarm: 0xeaa56c, cream: 0xebd2ac, paper: 0xf4dca7,
  skinGold: 0xf7c282, skinPink: 0xfcbc8f, skinLight: 0xfec99c,
} as const;
export type Paint = typeof PALETTE[keyof typeof PALETTE];
export const color = (paint: Paint): string => `#${paint.toString(16).padStart(6, "0")}`;
export const LAYER = { dusk: 7, ground: 8, impact: 1000, bars: 1100, weather: 1200, alarm: 1300, veil: 1400 } as const;
export const bodyDepth = (y: number): number => 100 + Math.round(Math.max(0, Math.min(800, y)));
export const bodyScale = (full: boolean, chief: boolean, big: boolean): number => full ? chief ? 2 : 1 : chief ? 3 : big ? 2 : 1;

/** Axis-aligned 4px cells give both circles and lanes the same pixel edge. */
export function rangeCells(x: number, y: number, radius: number, from?: { readonly x: number; readonly y: number }): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [], a = from ?? { x, y };
  const dx = x - a.x, dy = y - a.y, length = dx * dx + dy * dy;
  for (let py = Math.floor((Math.min(a.y, y) - radius) / 4) * 4; py <= Math.max(a.y, y) + radius; py += 4)
    for (let px = Math.floor((Math.min(a.x, x) - radius) / 4) * 4; px <= Math.max(a.x, x) + radius; px += 4) {
      const along = length ? Math.max(0, Math.min(1, ((px + 2 - a.x) * dx + (py + 2 - a.y) * dy) / length)) : 0;
      if (Math.hypot(px + 2 - a.x - along * dx, py + 2 - a.y - along * dy) <= radius) cells.push({ x: px, y: py });
    }
  return cells;
}

/** Range artwork supplies every visible pixel; gameplay radius and endpoints are untouched. */
export function paintedRange(g: Phaser.GameObjects.Graphics, art: PaintedArt, slug: "range-friendly" | "range-danger",
  x: number, y: number, radius: number, alpha: number, from?: { readonly x: number; readonly y: number }): void {
  const diameter = Math.max(1, Math.round(radius * 2));
  const source = PAINTED_BOUNDS[from ? "range-danger" : slug];
  if (!from) { art.draw(g, slug, x - radius, y - radius, { source, width: diameter, height: diameter, alpha }); return; }
  const dx = x - from.x, dy = y - from.y, length = Math.round(Math.hypot(dx, dy)), half = Math.round(radius);
  g.save().translateCanvas(Math.round(from.x), Math.round(from.y)).rotateCanvas(Math.atan2(dy, dx));
  art.draw(g, "range-danger", -half, -half, { source, width: diameter, height: diameter, alpha,
    clip: { x: 0, y: 0, width: half, height: diameter } });
  art.draw(g, "range-danger-lane", 0, -half, { source: { x: 16, y: source.y, width: 32, height: source.height }, width: length, height: diameter, alpha });
  art.draw(g, "range-danger", length - half, -half, { source, width: diameter, height: diameter, alpha,
    clip: { x: half, y: 0, width: diameter - half, height: diameter } });
  g.restore();
}

const PER_SECOND: Partial<Record<Effect["kind"], number>> = { hit: 12, hurt: 12, devastate: 12, swing: 10, kill: 12, blast: 4 };
const HIDDEN: readonly Effect["kind"][] = ["total", "deploy", "retreat", "merge", "event"];
/** Rolling seconds, independent of rendering rate. Safety marks are never submitted here. */
export class DecorationBudget {
  private events = new Map<string, number[]>();
  private live = new Map<"sprite" | "scorch" | "burst", number>();
  allow(kind: string, at: number, limit: number): boolean {
    const recent = (this.events.get(kind) ?? []).filter(time => at - time < 1000);
    if (recent.length >= limit) return false;
    recent.push(at); this.events.set(kind, recent); return true;
  }
  effect(effect: Effect, at: number): boolean {
    if (HIDDEN.includes(effect.kind)) return false;
    const limit = PER_SECOND[effect.kind];
    return limit === undefined || this.allow(effect.kind === "hurt" || effect.kind === "devastate" ? "hit" : effect.kind, at, limit);
  }
  acquire(kind: "sprite" | "scorch" | "burst"): boolean {
    const count = this.live.get(kind) ?? 0;
    if (count >= (kind === "sprite" ? 48 : kind === "burst" ? 3 : 6)) return false;
    this.live.set(kind, count + 1); return true;
  }
  release(kind: "sprite" | "scorch" | "burst"): void { this.live.set(kind, (this.live.get(kind) ?? 0) - 1); }
}
const SKILL_ART = { volley: "volley_arc", shield: "guard", charge: "charge", sweep: "slash", heal: "heal", bombard: "blast_big", hold: "guard", ambush: "slash" } as const;
export function skillFace(general: General): { readonly file: string; readonly frame: number; readonly size: number; readonly frames: number } {
  const kind = GENERAL_SKILLS[general].kind;
  return { file: SKILL_ART[kind], frame: 2, size: kind === "bombard" ? 64 : 32, frames: kind === "volley" || kind === "bombard" ? 6 : 4 };
}
/** Arrow flight sheet: one drawn frame per sixteenth of a turn clockwise from east, so no frame is resampled by rotation. */
export const ARROW_ART = { key: "arrow", file: "fx/arrow", size: 17, directions: 16 } as const;
/** A flying shot's picture. Arrows take the drawn frame nearest their heading; rockets keep their own turning sheet. */
export function shotArt(kind: "arrow" | "rocket", heading: number, flaming = false): { readonly key: string; readonly frame: number; readonly rotation: number; readonly tint: number } {
  if (kind === "rocket") return { key: "rocket", frame: 2, rotation: heading + Math.PI / 2, tint: 0xffffff };
  const turn = Math.round(heading / (Math.PI * 2 / ARROW_ART.directions)) % ARROW_ART.directions;
  return { key: ARROW_ART.key, frame: (turn + ARROW_ART.directions) % ARROW_ART.directions, rotation: 0, tint: flaming ? PALETTE.flame : 0xffffff };
}
export function skillCharge(clock: number, cooldown: number): number {
  return Math.floor((1 - Math.min(1, Math.max(0, clock / cooldown))) * 12);
}
export function feedbackChannels(motionOff: boolean, flashesOff: boolean, reduced: boolean): { readonly motion: boolean; readonly flash: boolean } {
  return { motion: !motionOff && !reduced, flash: !flashesOff && !reduced };
}
