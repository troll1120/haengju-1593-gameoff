import type { PaintedArt } from "./painted-art";

export const YARD_PICTURES = ["rack", "forge0", "forge1", "hall", "flag0", "flag1"] as const;
export type YardPicture = typeof YARD_PICTURES[number];

/** The loaded painted WebP is the sole source; the original texture keys stay stable. A packed picture arrives as a canvas,
 *  which Phaser takes as an image source the same way. */
export const yardPicture = (name: YardPicture, art: PaintedArt): HTMLImageElement => art.source(`yard-${name}`) as HTMLImageElement;
