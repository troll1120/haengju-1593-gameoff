import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { BPH_GENERALS } from "../src/bph-commanders";
import { UI_ENGLISH } from "../src/i18n-ui";
import { launch, passFirstBattleGuide } from "./review-browser";
import { CAPTION_INSET, captionPainter, type CaptionPicture } from "./review-caption";
import { previewResponse } from "./serve";

type Box = { left: number; top: number; right: number; bottom: number };
type Placed = { caption: string; picture: Omit<CaptionPicture, "png">; tag: Box; clocks: { reading: string; text: Box }[]; view: { width: number; height: number } };

const CAPTIONS = {
  ko: BPH_GENERALS.map(name => `${name}·Lv20`),
  en: BPH_GENERALS.map(name => `${UI_ENGLISH[name] ?? name} Lv20`),
} as const;
const READINGS = ["00:00", "00:17", "01:24", "08:88", "88:88", "11:11"];

for (const [width, height] of [[360, 640], [390, 844], [405, 670], [1440, 900]] as const)
  for (const lang of ["ko", "en"] as const)
    test(`the review name tag ends left of the battle clock at ${width}x${height} ${lang}`, async () => {
      const root = resolve(import.meta.dir, "..");
      const out = resolve(process.env.CASTLE_CAPTION_EVIDENCE ?? `${root}/review/caption-clock`);
      await mkdir(out, { recursive: true });
      const profile = await mkdtemp(`${out}/chrome-profile-`);
      const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
        fetch: request => previewResponse(request, process.env.CASTLE_TEST_DIST ?? `${root}/review-dist`) });
      const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
      const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
        const deadline = performance.now() + 25000;
        function check() {
          if (${expression}) resolve(true);
          else if (performance.now() > deadline) reject(new Error("Condition not reached: " + ${JSON.stringify(expression)}));
          else requestAnimationFrame(check);
        } check();
      })`);
      try {
        await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
        await ready("Boolean(window.castleSample)");
        await phone.evaluate(`localStorage.setItem("haengju1593-lang", "${lang}")`);
        await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
        await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
        expect(await phone.tapElement("#start")).toBe(true);
        await ready("document.querySelector('[data-bph-start]')");
        expect(await phone.tapElement("[data-bph-start]")).toBe(true);
        await ready("!castleSample.snapshot().attract");
        await passFirstBattleGuide(phone);
        await ready("!castleSample.snapshot().paused && getComputedStyle(document.getElementById('clock')).visibility === 'visible'");
        const placed: Placed[] = [];
        for (const caption of CAPTIONS[lang]) {
          const picture = await phone.evaluate(captionPainter(caption)) as CaptionPicture;
          // Lay the picture over the page exactly where the MP4 step overlays it, then read both boxes from layout.
          placed.push(JSON.parse(String(await phone.evaluate(`new Promise(done => {
            document.getElementById("caption-probe")?.remove();
            const tag = document.createElement("img"); tag.id = "caption-probe";
            tag.style.cssText = "position:fixed;left:${CAPTION_INSET}px;top:${CAPTION_INSET}px;z-index:99;image-rendering:pixelated";
            tag.onload = () => {
              const box = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
              const clock = document.getElementById("clock"), shown = clock.textContent, clocks = [];
              for (const reading of ${JSON.stringify(READINGS)}) {
                clock.textContent = reading;
                const range = document.createRange(); range.selectNodeContents(clock);
                clocks.push({ reading, text: box(range.getBoundingClientRect()) });
              }
              clock.textContent = "00:17";
              done(JSON.stringify({ caption: ${JSON.stringify(caption)}, picture: ${JSON.stringify({ ...picture, png: undefined })},
                tag: box(tag.getBoundingClientRect()), clocks, view: { width: innerWidth, height: innerHeight } }));
            };
            tag.src = "data:image/png;base64,${picture.png}"; document.body.append(tag);
          })`))));
        }
        await phone.shot(`${out}/caption-${width}x${height}-${lang}.png`);
        await Bun.write(`${out}/caption-${width}x${height}-${lang}.json`, JSON.stringify(placed, null, 2));
        for (const { tag, clocks, view } of placed) {
          expect(tag.left).toBeGreaterThanOrEqual(0);
          expect(tag.top).toBeGreaterThanOrEqual(0);
          expect(tag.bottom).toBeLessThanOrEqual(view.height);
          for (const { text } of clocks) expect(tag.right).toBeLessThan(text.left);
        }
        expect(phone.errors.filter(line => line.startsWith("exception"))).toEqual([]);
      } finally {
        phone.view.close(); server.stop(true);
        await rm(profile, { recursive: true, force: true });
      }
    }, 120000);
