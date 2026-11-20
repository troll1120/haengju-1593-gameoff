import { PALETTE } from "./presentation";

/** Recolor a copy of an existing effect sheet; preserve its shape, alpha and lightness. */
export function recolorAlliedEffectPixels(pixels: Uint8ClampedArray): void {
  for (let at = 0; at < pixels.length; at += 4) {
    const red = pixels[at], green = pixels[at + 1], blue = pixels[at + 2];
    if (!pixels[at + 3] || red <= green * 1.15 || red <= blue * 1.3) continue;
    const light = red / 255;
    pixels[at] = Math.round((PALETTE.gold >> 16 & 255) * light);
    pixels[at + 1] = Math.round((PALETTE.gold >> 8 & 255) * light);
    pixels[at + 2] = Math.round((PALETTE.gold & 255) * light);
  }
}
