import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";
import { setFieldHeight } from "../src/geometry";
import { riverBank } from "../src/river";

setFieldHeight(800);
const bankTop = riverBank() - 12;

test("sand and water cover both grass gutters after a battle viewport widens", async () => {
  const root = resolve(import.meta.dir, "..");
  const out = resolve(process.env.CASTLE_RIVER_EVIDENCE ?? `${root}/review/owner-water`);
  await mkdir(out, { recursive: true });
  const profile = await mkdtemp(`${out}/chrome-profile-`);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, process.env.CASTLE_TEST_DIST ?? `${root}/review-dist`) });
  const url = process.env.CASTLE_RIVER_URL ?? `http://127.0.0.1:${server.port}/`;
  const page = await launch(`${url}?seed=1337`, profile, 390, 844);
  const ready = (condition: string) => page.evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 25000;
    function frame() {
      if (${condition}) resolve(true);
      else if (performance.now() > deadline) reject(new Error("River condition: " + ${JSON.stringify(condition)}));
      else requestAnimationFrame(frame);
    } frame();
  })`);
  try {
    await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
    expect(await page.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
    expect(await page.tapElement("[data-bph-start]")).toBe(true);
    await ready("!castleSample.snapshot().attract");
    // The visible guide pauses the fresh battle; hide its paint, keeping the simulation still.
    await ready("document.querySelector('#first-battle-guide[open]')");
    await page.evaluate("document.querySelector('#first-battle-guide').style.visibility='hidden'");
    await page.shot(`${out}/390.png`);
    const before = await page.evaluate("JSON.stringify(castleSample.snapshot())");
    await page.view.cdp("Emulation.setDeviceMetricsOverride",
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: true });
    await ready("document.querySelector('#arena canvas').getBoundingClientRect().height > 899");
    await page.shot(`${out}/1440.png`);
    expect(await page.evaluate("JSON.stringify(castleSample.snapshot())")).toBe(before);
    const png = await Bun.file(`${out}/1440.png`).bytes();
    const colors = await page.evaluate(`(async () => {
      const image = new Image(); image.src = "data:image/png;base64,${Buffer.from(png).toString("base64")}";
      await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      const arena = document.querySelector("#arena").getBoundingClientRect();
      const battle = document.querySelector("#arena canvas").getBoundingClientRect();
      const bank = battle.top + battle.height * ${bankTop} / 800;
      return [arena.left + 8, arena.right - 8].map(x => [bank + 10, bank + 70].map(y => {
        const pixels = context.getImageData(Math.round(x), Math.round(y), 4, 4).data;
        const rgb = [0, 0, 0];
        for (let at = 0; at < pixels.length; at += 4) for (let c = 0; c < 3; c++) rgb[c] += pixels[at + c] / 16;
        return rgb;
      }));
    })()`);
    await Bun.write(`${out}/measurements.json`, JSON.stringify({ colors, errors: page.errors }, null, 2));
    // Sand is warm (R > G > B); water is blue (B > G > R). Grass fails both checks.
    expect(colors).toBeArrayOfSize(2);
    if (!Array.isArray(colors)) throw new Error("Missing river pixels");
    for (const side of colors) {
      const [sand, water] = side;
      expect(sand[0]).toBeGreaterThan(sand[1]); expect(sand[1]).toBeGreaterThan(sand[2]);
      expect(water[2]).toBeGreaterThan(water[1]); expect(water[1]).toBeGreaterThan(water[0]);
    }
    expect(page.errors).toEqual([]);
  } finally {
    server.stop(true);
    await closeBrowser(page.view, profile);
  }
}, 60000);
