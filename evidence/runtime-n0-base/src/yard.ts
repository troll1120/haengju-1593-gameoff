import type { PaintedArt } from "./painted-art";

export const YARD_PICTURES = ["rack", "forge0", "forge1", "hall", "flag0", "flag1"] as const;
export type YardPicture = typeof YARD_PICTURES[number];

/** The loaded painted WebP is the sole source; the original texture keys stay stable. */
export const yardPicture = (name: YardPicture, art: PaintedArt): HTMLImageElement => art.source(`yard-${name}`);
