import { ART_ATLAS, artPath, cropFrame, loadPage, releasePages } from "./art-atlas";

/**
 * Owner DM 1794932697/1794932769: DOM screens (codex, recruit reel, relics, prep) painted an empty slot for a frame or
 * two while an image they had never shown before loaded and decoded. The title screen decodes every picture once and
 * keeps it referenced so the decoded pixels stay warm. Packed pictures come out of their sheet as blob URLs; every
 * `./art/...` URL the screens use (img src, inline and stylesheet url()) is pointed at that blob once it is decoded, so
 * the existing markup and CSS stay as they are. Until then a URL keeps loading the single file, as before.
 */
const kept: HTMLImageElement[] = [];
const ready = new Map<string, string>();
let running: Promise<void> | undefined;
/** Folders the DOM screens draw from come first; the battle already loaded its own textures through Phaser. */
const SCREEN_ART = ["icons/", "portraits/", "tomes/", "relics/", "skills/", "soldiers/", "ui/", "units/"];
const forScreens = (file: string) => SCREEN_ART.some(folder => file.startsWith(folder));
/** Per-actor pose folders (generals/<actor>/, soldiers/<actor>/) are battle frames the Phaser loader already cut out;
 *  the screens only show their standing frame, so only that one is turned into a screen picture. */
const onScreens = (file: string) => !/^(?:generals|soldiers)\/[^/]+\//.test(file) || file.endsWith("/front_idle_0.png");

export function artSrc(url: string, base?: string): string {
  const path = artPath(url, base);
  return path === undefined ? url : ready.get(path) ?? url;
}

const swapUrls = (text: string, base?: string) => text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
  (match, _quote: string, url: string) => { const swapped = artSrc(url, base); return swapped === url ? match : `url("${swapped}")`; });

function swapElement(element: Element): void {
  const src = element instanceof HTMLImageElement ? element.getAttribute("src") : null;
  if (src) { const swapped = artSrc(src); if (swapped !== src) element.setAttribute("src", swapped); }
  const style = element.getAttribute("style");
  if (style?.includes("url(")) { const swapped = swapUrls(style); if (swapped !== style) element.setAttribute("style", swapped); }
}

function swapDeclarations(style: CSSStyleDeclaration, base?: string): void {
  for (const name of Array.from(style)) {
    const value = style.getPropertyValue(name);
    if (!value.includes("url(")) continue;
    const swapped = swapUrls(value, base);
    if (swapped !== value) style.setProperty(name, swapped, style.getPropertyPriority(name));
  }
}

function swapStyleSheets(): void {
  const walk = (rules: CSSRuleList, base?: string) => {
    for (const rule of Array.from(rules)) {
      if ("style" in rule && rule.style instanceof CSSStyleDeclaration) swapDeclarations(rule.style, base);
      if ("cssRules" in rule && rule.cssRules instanceof CSSRuleList) walk(rule.cssRules, base);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    walk(rules, sheet.href ?? undefined);
  }
  swapDeclarations(document.documentElement.style);
}

let installed = false;
/** Routes `img.src = ...` and markup inserted later (innerHTML, setAttribute) through `artSrc`. */
function installArtUrls(): void {
  if (installed) return;
  installed = true;
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
  Object.defineProperty(HTMLImageElement.prototype, "src", { ...src, set(this: HTMLImageElement, value: string) { src.set!.call(this, artSrc(String(value))); } });
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes") { swapElement(record.target as Element); continue; }
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof Element)) continue;
        swapElement(node);
        node.querySelectorAll("img[src], [style*='url(']").forEach(swapElement);
      }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
}

function decodeArt(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  return image.decode().then(() => image);
}

const pngOf = (canvas: HTMLCanvasElement) => new Promise<Blob>((done, fail) =>
  canvas.toBlob(blob => blob ? done(blob) : fail(new Error("그림 조각 생성 실패")), "image/png"));

async function warm(file: string): Promise<void> {
  const frame = ART_ATLAS.frames[file];
  if (!frame) { kept.push(await decodeArt(`./art/${file}`)); return; }
  // The fragment keeps the original path in the attribute, so CSS like img[src$="/coin.webp"] still matches; a blob URL
  // ignores its fragment when loading.
  const url = `${URL.createObjectURL(await pngOf(cropFrame(await loadPage(frame[0]), frame)))}#./art/${file}`;
  kept.push(await decodeArt(url));
  ready.set(file, url);
}

export function preloadAllArt(workers = 12): Promise<void> {
  return running ??= (async () => {
    installArtUrls();
    const files = [...Object.keys(ART_ATLAS.frames).filter(onScreens), ...ART_ATLAS.loose].sort(), failed: string[] = [];
    const drain = (queue: string[]) => Promise.all(Array.from({ length: workers }, async () => {
      for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        try { await warm(file); } catch { failed.push(file); }
      }
    }));
    await drain(files.filter(forScreens));
    swapStyleSheets();
    performance.mark("art-preload-screens");
    await drain(files.filter(file => !forScreens(file)));
    releasePages();
    swapStyleSheets();
    if (failed.length) console.error(`그림 미리 읽기 실패 ${failed.length}개: ${failed.slice(0, 5).join(", ")}`);
    const decodedBytes = kept.reduce((sum, image) => sum + image.naturalWidth * image.naturalHeight * 4, 0);
    performance.mark("art-preload-done", { detail: { files: files.length, sheets: ART_ATLAS.pages.length, failed: failed.length, decodedBytes } });
  })();
}

/** Waits until every image already in `host` has pixels, or `limitMs` passes, so a screen never opens on empty slots. */
export function imagesReady(host: ParentNode, limitMs: number): Promise<void> {
  const pending = Array.from(host.querySelectorAll("img"))
    .filter(image => image.getAttribute("src") && !(image.complete && image.naturalWidth > 0))
    .map(image => image.decode().catch(() => undefined));
  if (!pending.length) return Promise.resolve();
  return Promise.race([Promise.all(pending).then(() => undefined), new Promise<void>(done => setTimeout(done, limitMs))]);
}
