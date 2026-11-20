// Captures the new-relic notice, the relic tab and its empty state in both languages: bun scripts/capture-relic-panel.ts <out-dir>
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { grantBphRelic } from "../src/bph-account";
import { BPH_CODEX_CLASS_REWARDS } from "../src/bph-codex-rewards";

const out = resolve(process.argv[2] ?? "review/relic-panel-1117");
const dist = process.env.CASTLE_TEST_DIST ?? resolve(import.meta.dir, "../review-dist");
// 405x670 is the hub's game iframe.
const sizes: [number, number][] = (process.env.CASTLE_SIZES ?? "390x844 405x670 1440x900").split(" ")
  .map(size => size.split("x").map(Number) as [number, number]);
const owner = (() => {
  const meta = freshMeta(), save = freshBphSave();
  for (const id of Object.values(BPH_CODEX_CLASS_REWARDS)) grantBphRelic(save, id);
  meta.bph = save;
  return JSON.stringify(meta);
})();
await mkdir(out, { recursive: true });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, dist) });
const url = `http://127.0.0.1:${server.port}/?seed=7`;
const report: Record<string, unknown>[] = [];
try {
  for (const [width, height] of sizes) {
    const profile = await mkdtemp(`${tmpdir()}/castle-relic-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const ready = (condition: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + 30000;
      function check() { if (${condition}) return requestAnimationFrame(() => resolve(true));
        if (performance.now() > end) return reject(new Error("timeout: " + ${JSON.stringify(condition)}));
        requestAnimationFrame(check); } check(); })`);
    const settled = async () => {
      await phone.evaluate("document.fonts.ready.then(() => true)");
      await ready(`!document.getAnimations().some(a => a.effect.getComputedTiming().iterations !== Infinity && (a.pending || a.playState === "running"))`);
    };
    const tap = async (selector: string) => { if (!await phone.tapElement(selector)) throw new Error(`unreachable: ${selector}`); };
    const measure = () => phone.evaluate(`(() => {
      const box = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); };
      const panel = document.querySelector('.bph-relics');
      return { panel: box('.bph-relics'), list: box('.bph-relic-list'), toast: box('[data-relic-toast]'),
        overflowX: panel ? panel.scrollWidth > panel.clientWidth : null,
        clipped: [...document.querySelectorAll('.bph-relic-card, .bph-relic-slots, .bph-relic-status, [data-relic-toast]')]
          .filter(e => e.scrollWidth > e.clientWidth + 1).length,
        cards: document.querySelectorAll('.bph-relic-card').length,
        worn: document.querySelectorAll('.bph-relic-card[aria-pressed="true"]').length,
        slots: document.querySelectorAll('.bph-relic-slot').length,
        status: document.querySelector('.bph-relic-status')?.textContent ?? null };
    })()`);
    try {
      for (const lang of ["ko", "en"]) {
        const shot = async (kind: string) => {
          await settled();
          const name = `${kind}-${width}x${height}-${lang}`;
          await phone.shot(`${out}/${name}.png`);
          const boxes = await measure();
          report.push({ name, boxes, errors: [...phone.errors] });
          console.log(name, JSON.stringify(boxes));
        };
        await phone.view.navigate(url);
        await phone.evaluate(`(localStorage.clear(), localStorage.setItem("haengju1593-lang", ${JSON.stringify(lang)}), localStorage.setItem("haengju1593-meta", ${JSON.stringify(owner)}), true)`);
        await phone.view.navigate(url);
        await ready("window.castleSample && !document.querySelector('#start').disabled && document.querySelector('[data-relic-toast]')");
        await shot("toast");
        await tap("[data-relic-toast] button");
        await ready("document.querySelector('.bph-relics .bph-relic-card')");
        await tap(".bph-relic-card");
        await ready(`document.querySelector('.bph-relic-card[aria-pressed="true"]')`);
        await shot("panel");
        await phone.evaluate(`localStorage.removeItem("haengju1593-meta")`);
        await phone.view.navigate(url);
        await ready("window.castleSample && !document.querySelector('#start').disabled");
        await tap("#start");
        await ready(`document.querySelector('[data-bph-tab="relics"]')`);
        await tap(`[data-bph-tab="relics"]`);
        await ready("document.querySelector('.bph-relic-empty')");
        await shot("empty");
      }
    } finally {
      phone.view.close(); await rm(profile, { recursive: true, force: true });
    }
  }
  await Bun.write(`${out}/boxes.json`, JSON.stringify(report, null, 2));
} finally {
  server.stop(true);
}
