import type Phaser from "phaser";
import type { ArtLoads } from "./art-atlas";

export const paintedUrl = (slug: string) => "./art/icons/" + slug + ".webp";

type Box = { x: number; y: number; width: number; height: number };
type Run = { x: number; end: number; y: number; bottom: number; color: number; alpha: number };
type Slice = { source: number; length: number; target: number; size: number };

export class PaintedArt {
  private readonly cache = new Map<string, { width: number; height: number; rectangles: Run[] }>();

  constructor(private readonly scene: Phaser.Scene) {}

  preload(slugs: readonly string[], load: ArtLoads = this.scene.load): void {
    for (const slug of slugs) load.image("painted:" + slug, paintedUrl(slug));
  }

  source(slug: string): HTMLImageElement | HTMLCanvasElement {
    return this.scene.textures.get("painted:" + slug).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  }

  prepare(slugs: readonly string[]): void {
    for (const slug of slugs) {
      const image = this.source(slug);
      const canvas = document.createElement("canvas");
      const natural = "naturalWidth" in image ? { width: image.naturalWidth, height: image.naturalHeight } : image;
      canvas.width = natural.width;
      canvas.height = natural.height;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const rectangles: Run[] = [];
      let previous = new Map<string, Run>();
      for (let y = 0; y < canvas.height; y++) {
        const row = new Map<string, Run>();
        for (let x = 0; x < canvas.width;) {
          const at = (y * canvas.width + x) * 4;
          const alpha = pixels[at + 3];
          if (!alpha) { x++; continue; }
          let end = x + 1;
          while (end < canvas.width) {
            const next = (y * canvas.width + end) * 4;
            if (pixels[next] !== pixels[at] || pixels[next + 1] !== pixels[at + 1]
              || pixels[next + 2] !== pixels[at + 2] || pixels[next + 3] !== alpha) break;
            end++;
          }
          const color = pixels[at] << 16 | pixels[at + 1] << 8 | pixels[at + 2];
          const key = `${x}:${end}:${color}:${alpha}`;
          let rectangle = previous.get(key);
          if (rectangle) rectangle.bottom = y + 1;
          else {
            rectangle = { x, end, y, bottom: y + 1, color, alpha };
            rectangles.push(rectangle);
          }
          row.set(key, rectangle);
          x = end;
        }
        previous = row;
      }
      rectangles.sort((a, b) => a.color - b.color || a.alpha - b.alpha);
      this.cache.set(slug, { width: canvas.width, height: canvas.height, rectangles });
    }
  }

  // Caps retain source pixels. A short target clips caps rather than scaling them.
  private tiles(start: number, length: number, size: number, before: number, after: number): Slice[] {
    const result: Slice[] = [];
    const first = Math.min(before, size);
    const last = Math.min(after, size - first);
    if (first > 0) result.push({ source: start, length: first, target: 0, size: first });
    const middle = length - before - after;
    for (let target = first; middle > 0 && target < size - last; target += middle) {
      const part = Math.min(middle, size - last - target);
      result.push({ source: start + before, length: part, target, size: part });
    }
    if (last > 0) result.push({ source: start + length - last, length: last, target: size - last, size: last });
    return result;
  }

  draw(g: Phaser.GameObjects.Graphics, slug: string, x: number, y: number, options: {
    width?: number; height?: number; alpha?: number; source?: Box; clip?: Box;
    insets?: { left: number; right: number; top: number; bottom: number };
  } = {}): Phaser.GameObjects.Graphics {
    const cached = this.cache.get(slug)!;
    // Defaults refer to the full decoded image, including when source selects a crop.
    const width = Math.round(options.width ?? cached.width);
    const height = Math.round(options.height ?? cached.height);
    const alpha = options.alpha ?? 1;
    const source = options.source ?? { x: 0, y: 0, width: cached.width, height: cached.height };
    const clip = options.clip ?? { x: 0, y: 0, width, height };
    const left = Math.max(0, Math.round(clip.x)), right = Math.min(width, Math.round(clip.x + clip.width));
    const top = Math.max(0, Math.round(clip.y)), bottom = Math.min(height, Math.round(clip.y + clip.height));
    if (right <= left || bottom <= top || !alpha || source.width <= 0 || source.height <= 0) return g;
    const insets = options.insets;
    const columns = insets
      ? this.tiles(source.x, source.width, width, insets.left, insets.right)
      : [{ source: source.x, length: source.width, target: 0, size: width }];
    const bands = insets
      ? this.tiles(source.y, source.height, height, insets.top, insets.bottom)
      : [{ source: source.y, length: source.height, target: 0, size: height }];
    const originX = Math.round(x), originY = Math.round(y);
    let lastColor = -1, lastAlpha = -1;
    for (const band of bands) {
      for (const run of cached.rectangles) {
        const fromY = Math.max(run.y, band.source), toY = Math.min(run.bottom, band.source + band.length);
        if (toY <= fromY) continue;
        const y0 = Math.max(top, Math.round(band.target + (fromY - band.source) * band.size / band.length));
        const y1 = Math.min(bottom, Math.round(band.target + (toY - band.source) * band.size / band.length));
        if (y1 <= y0) continue;
        for (const column of columns) {
          const from = Math.max(run.x, column.source), to = Math.min(run.end, column.source + column.length);
          if (to <= from) continue;
          const x0 = Math.max(left, Math.round(column.target + (from - column.source) * column.size / column.length));
          const x1 = Math.min(right, Math.round(column.target + (to - column.source) * column.size / column.length));
          if (x1 <= x0) continue;
          const opacity = run.alpha / 255 * alpha;
          if (lastColor !== run.color || lastAlpha !== opacity) {
            g.fillStyle(run.color, opacity);
            lastColor = run.color; lastAlpha = opacity;
          }
          g.fillRect(originX + x0, originY + y0, x1 - x0, y1 - y0);
        }
      }
    }
    return g;
  }
}
