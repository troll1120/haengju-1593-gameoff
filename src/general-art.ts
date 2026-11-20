import type { PaintedArt } from "./painted-art";

type Box = { x: number; y: number; width: number; height: number };
const FLAGS = new Set(["lee_boknam", "no_gaebang", "lee_jeongheon", "kim_huisu", "song_bongsu"]);

/** Transfer material planes from the actual WebP while retaining the original pose alpha. */
export function recolorPainted(pixels: Uint8ClampedArray, source: HTMLImageElement | HTMLCanvasElement, opacity: number,
  select: (at: number) => boolean = () => true, area?: Box): void {
  const box = area ?? { x: 0, y: 0, width: source.width, height: source.height };
  const canvas = document.createElement("canvas"); canvas.width = box.width; canvas.height = box.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  const paint = context.getImageData(0, 0, box.width, box.height).data, unique = new Map<number, readonly number[]>();
  for (let at = 0; at < paint.length; at += 4) if (paint[at + 3])
    unique.set(paint[at] << 16 | paint[at + 1] << 8 | paint[at + 2], [paint[at], paint[at + 1], paint[at + 2]]);
  const tones = [...unique.values()].sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]).slice(1);
  for (let at = 0; at < pixels.length; at += 4) {
    if (!pixels[at + 3] || !select(at)) continue;
    const level = Math.min(tones.length - 1, Math.floor((pixels[at] + pixels[at + 1] + pixels[at + 2]) / 765 * tones.length));
    const tone = tones[level];
    for (let channel = 0; channel < 3; channel++) pixels[at + channel] = Math.round(pixels[at + channel] * (1 - opacity) + tone[channel] * opacity);
  }
}

/** Only five retained 32px unit sheets receive equipment; heads, weapons and poses remain underneath. */
export function personalize(base: string, pixels: Uint8ClampedArray, width: number, art?: PaintedArt): void {
  if (!FLAGS.has(base)) return;
  if (!art) throw new Error("Personalization requires preloaded painted equipment");
  const source = art.source(`personalize-${base}`), height = pixels.length / width / 4;
  if (base === "lee_boknam") recolorPainted(pixels, source, 1, at => {
    const x = at / 4 % width % 32, y = Math.floor(at / 4 / width);
    return x >= 18 && x < 23 && y >= 4 && y < 8 && pixels[at] > pixels[at + 1] * 1.3 && pixels[at] > pixels[at + 2] * 1.3;
  }, { x: 20, y: 21, width: 2, height: 1 });
  if (base === "no_gaebang") recolorPainted(pixels, source, 1, at => {
    const x = at / 4 % width % 32, y = Math.floor(at / 4 / width);
    return x >= 7 && x < 24 && y >= 17 && y < 28 && pixels[at + 2] > pixels[at] && pixels[at + 2] > 80;
  }, { x: 15, y: 22, width: 15, height: 9 });
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  context.imageSmoothingEnabled = false;
  context.globalCompositeOperation = "destination-over";
  for (let frame = 0; frame < width; frame += 32) {
    context.drawImage(source, 3, 2, 3, 28, frame + 1, 1, 3, 24);
    context.drawImage(source, 4, 4, 26, 16, frame + 3, 1, 13, 8);
  }
  pixels.set(context.getImageData(0, 0, width, height).data);
}
