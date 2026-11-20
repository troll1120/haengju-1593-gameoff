import type Phaser from "phaser";
import ATLAS from "virtual:art-atlas";

export type AtlasFrame = (typeof ATLAS.frames)[string];

export const ART_ATLAS = ATLAS;
export const pageUrl = (page: number) => `./${ATLAS.pages[page].file}`;

export function artPath(url: string, base: string = document.baseURI): string | undefined {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return undefined;
  const root = new URL("./art/", document.baseURI).href, href = new URL(url, base).href;
  return href.startsWith(root) ? decodeURIComponent(href.slice(root.length).split(/[?#]/)[0]) : undefined;
}

export function cropFrame(page: CanvasImageSource, [, x, y, width, height]: AtlasFrame): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d")!.drawImage(page, x, y, width, height, 0, 0, width, height);
  return canvas;
}

const pages = new Map<number, Promise<HTMLImageElement>>();
/** A decoded sheet, shared by the battle loader and the screen preload so each sheet is fetched and decoded once. */
export function loadPage(page: number): Promise<HTMLImageElement> {
  let known = pages.get(page);
  if (!known) {
    const image = new Image();
    image.decoding = "async";
    image.src = pageUrl(page);
    known = image.decode().then(() => image);
    pages.set(page, known);
  }
  return known;
}
export const releasePages = () => pages.clear();

type Loads = Pick<Phaser.Loader.LoaderPlugin, "image" | "spritesheet">;
/**
 * `scene.load.image/spritesheet` for art that may live in a sheet: the sheet is loaded through the Phaser loader (so the
 * start bar still counts it) and each key gets its own canvas with the original file's exact size and pixels, so code
 * that reads `getSourceImage()` keeps working. Anything not in a sheet loads as before.
 */
export function sceneArt(scene: Phaser.Scene): { image: (key: string, url: string) => void; spritesheet: (key: string, url: string, sheet: Phaser.Types.Textures.SpriteSheetConfig) => void } {
  let cutBytes = 0;
  const waiting = new Map<number, { key: string; frame: AtlasFrame; sheet?: Phaser.Types.Textures.SpriteSheetConfig }[]>();
  const queue = (key: string, url: string, sheet?: Phaser.Types.Textures.SpriteSheetConfig) => {
    const path = artPath(url), frame = path === undefined ? undefined : ATLAS.frames[path];
    if (!frame) { if (sheet) scene.load.spritesheet(key, url, sheet); else scene.load.image(key, url); return; }
    const page = frame[0];
    let list = waiting.get(page);
    if (!list) {
      const pageKey = `art-page:${page}`, items: { key: string; frame: AtlasFrame; sheet?: Phaser.Types.Textures.SpriteSheetConfig }[] = [];
      waiting.set(page, list = items);
      scene.load.image(pageKey, pageUrl(page));
      scene.load.once(`filecomplete-image-${pageKey}`, () => {
        const image = scene.textures.get(pageKey).getSourceImage() as HTMLImageElement;
        if (!pages.has(page)) pages.set(page, Promise.resolve(image));
        for (const item of items) {
          const canvas = cropFrame(image, item.frame) as unknown as HTMLImageElement;
          if (item.sheet) scene.textures.addSpriteSheet(item.key, canvas, item.sheet); else scene.textures.addImage(item.key, canvas);
        }
        scene.textures.remove(pageKey);
        cutBytes += items.reduce((sum, item) => sum + item.frame[3] * item.frame[4] * 4, 0);
        performance.mark("art-battle-textures", { detail: { bytes: cutBytes } });
      });
    }
    list.push({ key, frame, sheet });
  };
  return { image: (key, url) => queue(key, url), spritesheet: (key, url, sheet) => queue(key, url, sheet) };
}

export type ArtLoads = ReturnType<typeof sceneArt> | Loads;
