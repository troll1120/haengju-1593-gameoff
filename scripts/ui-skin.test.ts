import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_PLACEMENTS } from "../src/bph-upgrades";
import { BPH_DEFAULT_GRID } from "../src/bph-upgrade-data";

type Box = { name: string; box: number[]; source: string; slice: string; width: string; outset: string; plain: boolean };
type Corners = { compared: number; hidden: number; off: string[] };

const root = resolve(import.meta.dir, "..");
const evidence = resolve(process.env.CASTLE_SKIN_EVIDENCE ?? `${root}/review/ui-skin-hanji`);
const visible = (scope: string) => `[...document.querySelectorAll(${JSON.stringify(`${scope}, ${scope} *`)})].filter(e => e.checkVisibility())`;
// The game's own purchase frame sits over a ready button, and a faded box blends with what is behind it; neither shows the raw piece.
const survey = (scope: string) => `${visible(scope)}.map(e => {
  const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  let opacity = 1;
  for (let n = e; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
  return { name: e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + (e.getAttribute("class") ?? ""),
    box: [r.x, r.y, r.width, r.height], source: s.borderImageSource, slice: s.borderImageSlice, width: s.borderImageWidth,
    outset: s.borderImageOutset, plain: opacity === 1 && !e.matches(".ready") };
})`;
// Reads the four corners of each frame back from the screenshot: every opaque art pixel must be the same 2x2 block, starting on the box corner.
// A corner counts as hidden when something outside this screen sits on it or within reach of a soft shadow, as the HUD gear does over a tall panel.
const corners = (scope: string) => `(async (png, frames) => {
  const read = async url => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const paint = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
    paint.drawImage(bitmap, 0, 0);
    return paint.getImageData(0, 0, bitmap.width, bitmap.height);
  };
  const shot = await read("data:image/png;base64," + png), pieces = new Map(), all = ${visible(scope)}, off = [];
  const host = document.querySelector(${JSON.stringify(scope)}), reach = 16;
  let compared = 0, hidden = 0;
  for (const f of frames) {
    if (!pieces.has(f.url)) pieces.set(f.url, await read(f.url));
    const piece = pieces.get(f.url), n = f.cut, [x, y, w, h] = f.box;
    const left = Math.round(x), top = Math.round(y), right = Math.round(x + w), bottom = Math.round(y + h);
    for (const [ax, ay, sx, sy] of [[0, 0, left, top], [piece.width - n, 0, right - 2 * n, top],
      [0, piece.height - n, left, bottom - 2 * n], [piece.width - n, piece.height - n, right - 2 * n, bottom - 2 * n]]) {
      const frame = all[f.index], span = 2 * n + 2 * reach;
      let clear = document.elementFromPoint(sx + n, sy + n) === frame;
      for (let v = 0; clear && v <= 4; v++) for (let u = 0; clear && u <= 4; u++) {
        const hit = document.elementFromPoint(sx - reach + span * u / 4, sy - reach + span * v / 4);
        clear = !hit || hit.contains(frame) || host.contains(hit);
      }
      if (!clear) { hidden++; continue; }
      let wrong = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = ((ay + j) * piece.width + ax + i) * 4;
        if (piece.data[a + 3] !== 255) continue;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const b = ((sy + 2 * j + dy) * shot.width + sx + 2 * i + dx) * 4;
          compared++;
          if (shot.data[b] !== piece.data[a] || shot.data[b + 1] !== piece.data[a + 1] || shot.data[b + 2] !== piece.data[a + 2]) wrong++;
        }
      }
      if (wrong) off.push(f.name + " @" + sx + "," + sy + " " + wrong + "px");
    }
  }
  return { compared, hidden, off };
})`;

for (const [width, height] of [[390, 844], [405, 720], [1440, 900]]) {
  test(`the hanji skin repaints in place and lands every frame corner on its box at ${width}x${height}`, async () => {
    const out = `${evidence}/${width}x${height}`;
    await mkdir(out, { recursive: true });
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, process.env.CASTLE_TEST_DIST ?? `${root}/review-dist`) });
    const profile = await mkdtemp(`${tmpdir()}/castle-skin-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const url = `http://127.0.0.1:${server.port}/?seed=7`;
    const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + 30000;
      const check = () => {
        if (${expression}) requestAnimationFrame(() => resolve(true));
        else if (performance.now() > end) reject(new Error("UI timeout: " + ${JSON.stringify(expression)}));
        else requestAnimationFrame(check);
      }; check();
    })`);
    const settled = async () => {
      await phone.evaluate("document.fonts.ready.then(() => true)");
      await ready(`!document.getAnimations().some(a =>
        a.effect.getComputedTiming().iterations !== Infinity && (a.pending || a.playState === "running"))`);
    };
    const stableSurvey = async (scope: string): Promise<Box[]> => {
      await settled();
      const first = await phone.evaluate(survey(scope)) as Box[];
      await phone.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))");
      const second = await phone.evaluate(survey(scope)) as Box[];
      expect(second.map(e => [e.name, e.box])).toEqual(first.map(e => [e.name, e.box]));
      return second;
    };
    const measured: Record<string, unknown> = {};
    const compare = async (screen: string, scope: string) => {
      const skinned = await stableSurvey(scope);
      const png = await phone.view.screenshot({ format: "png", encoding: "buffer" });
      await Bun.write(`${out}/${screen}-after.png`, png);
      await phone.evaluate("delete document.documentElement.dataset.skin");
      const bare = await stableSurvey(scope);
      await phone.shot(`${out}/${screen}-before.png`);
      await phone.evaluate("document.documentElement.dataset.skin = 'hanji'");
      expect(skinned.map(e => [e.name, e.box])).toEqual(bare.map(e => [e.name, e.box]));
      const frames = skinned.map((e, index) => ({ ...e, index })).filter(e => e.source !== bare[e.index]?.source)
        .map(e => ({ ...e, cut: Number.parseInt(e.slice), url: e.source.slice(5, -2) }));
      expect(frames.length).toBeGreaterThan(0);
      for (const frame of frames)
        expect([frame.name, frame.outset, frame.slice, frame.width]).toEqual([frame.name, "0", `${frame.cut} fill`, `${frame.cut * 2}px`]);
      const seen = await phone.evaluate(`${corners(scope)}(${JSON.stringify(Buffer.from(png).toString("base64"))}, ${JSON.stringify(frames.filter(f => f.plain))})`) as Corners;
      await Bun.write(`${out}/${screen}-corner-proof.json`, JSON.stringify({ skinned, frames, seen }, null, 2));
      expect(seen.off).toEqual([]);
      expect(seen.compared).toBeGreaterThan(0);
      measured[screen] = { boxes: skinned.length, frames: frames.map(f => f.name), cornerPixels: seen.compared, hiddenCorners: seen.hidden };
    };
    try {
      await phone.view.navigate(url);
      const meta = freshMeta(), save = freshBphSave();
      const first = [...BPH_PLACEMENTS.values()].find(p => p.gridId === BPH_DEFAULT_GRID && p.nodeId === "SN_TowerHP");
      if (!first) throw new Error("Missing base HP placement");
      save.purchasedPlacements.push(first.id); save.resources.mastery = 100;
      meta.bph = save;
      await phone.evaluate(`localStorage.setItem('haengju1593-meta', ${JSON.stringify(JSON.stringify(meta))})`);
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      await compare("title", ".title-menu");
      expect(await phone.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      await compare("sortie", ".bph-management");
      expect(await phone.tapElement(".bph-actions button")).toBe(true);
    await ready("document.querySelector('[data-prep-group=\"shared\"]')");
      await compare("upgrade-web", ".bph-management");
      expect(await phone.tapElement('.bph-actions button[aria-pressed="true"]')).toBe(true);
      await settled();
      expect(await phone.tapElement("[data-bph-start]")).toBe(true);
      await ready("document.querySelector('#first-battle-guide[open]')");
      await compare("first-guide", "#first-battle-guide");
      await passFirstBattleGuide(phone);
      await ready("castleSample.snapshot().time > 0");
      expect(await phone.tapElement("#pause")).toBe(true);
      await ready("!document.querySelector('#intro').hidden");
      await compare("pause", "#intro");
      await phone.evaluate("(() => { document.querySelector('#intro').hidden = true; document.querySelector('#result').hidden = false; })()");
      await compare("result", "#result");
      expect(phone.errors).toEqual([]);
    } finally {
      await Bun.write(`${out}/measurements.json`, JSON.stringify(measured, null, 2));
      server.stop(true); await closeBrowser(phone.view, profile);
    }
  }, 120000);
}
