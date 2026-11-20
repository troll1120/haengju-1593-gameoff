import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { grantBphRelic } from "../src/bph-account";
import { BPH_UPGRADE_NODES } from "../src/bph-upgrade-data";

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const meta = freshMeta(), save = freshBphSave();
const ids = ["Relic1_CharmWarrior", "Relic1_Rapier", "Relic1_FourLeafClover",
  ...Object.values(BPH_UPGRADE_NODES).filter(node => node.type === 5).map(node => node.id)];
for (const id of new Set(ids)) grantBphRelic(save, id);
save.relicState.equipped = ["Relic1_Rapier"];
meta.bph = save;
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, resolve("review-dist")),
});
const results = [];
try {
  for (const [width, height] of [[390, 844], [1280, 800]]) {
    const profile = await mkdtemp(`${tmpdir()}/castle-relic-copy-`);
    const page = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    try {
      const url = `http://127.0.0.1:${server.port}/?seed=7`;
      await page.view.navigate(url);
      await page.evaluate(`(localStorage.clear(), localStorage.setItem("haengju1593-lang", "ko"),
        localStorage.setItem("haengju1593-meta", ${JSON.stringify(JSON.stringify(meta))}), true)`);
      await page.view.navigate(url);
      await page.evaluate(`new Promise((resolve, reject) => {
        const end = performance.now() + 30000;
        function frame() {
          if (document.querySelector("[data-relic-toast] button")) return resolve(true);
          if (performance.now() > end) return reject(new Error("relic notice missing"));
          requestAnimationFrame(frame);
        } frame();
      })`);
      if (!await page.tapElement("[data-relic-toast] button")) throw new Error("relic notice is unreachable");
      await page.evaluate(`new Promise((resolve, reject) => {
        const end = performance.now() + 30000;
        function frame() {
          if (document.querySelector(".bph-relic-card")) return resolve(true);
          if (performance.now() > end) return reject(new Error("relic panel missing"));
          requestAnimationFrame(frame);
        } frame();
      })`);
      await page.evaluate("document.fonts.ready.then(() => true)");
      await page.evaluate(`Promise.all([...document.querySelectorAll(".bph-relic-card img")]
        .map(image => image.decode())).then(() => true)`);
      await page.evaluate(`Promise.all(document.getAnimations()
        .filter(animation => animation.effect.getComputedTiming().iterations !== Infinity)
        .map(animation => animation.finished)).then(() => true)`);
      const measured = await page.evaluate(`(() => {
        const list = document.querySelector(".bph-relic-list");
        const cards = [...document.querySelectorAll(".bph-relic-card")];
        const bounds = list.getBoundingClientRect();
        const rows = cards.map(card => {
          const rect = card.getBoundingClientRect();
          return { top: rect.top - bounds.top + list.scrollTop,
            bottom: rect.bottom - bounds.top + list.scrollTop };
        });
        const pageOffsets = [0];
        for (const row of rows) {
          if (row.bottom > pageOffsets.at(-1) + list.clientHeight)
            pageOffsets.push(Math.min(row.top, list.scrollHeight - list.clientHeight));
        }
        const clipped = [...document.querySelectorAll(".bph-relic-card, .bph-relic-copy, .bph-relic-copy span")]
          .filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
          .map(e => ({ text: e.textContent, width: e.clientWidth, scroll: e.scrollWidth }));
        return { width: innerWidth, height: innerHeight, cards: cards.length, clipped,
          overflow: document.documentElement.scrollWidth > innerWidth || list.scrollWidth > list.clientWidth,
          pageOffsets: [...new Set(pageOffsets)], oversized: rows.some(row => row.bottom - row.top > list.clientHeight),
          text: cards.map(card => ({ id: card.dataset.relic,
            title: card.querySelector(".bph-relic-copy strong").textContent,
            text: card.querySelector(".bph-relic-copy span").textContent,
            fontSize: parseFloat(getComputedStyle(card.querySelector(".bph-relic-copy span")).fontSize),
            art: card.querySelector(".bph-relic-face > img").getAttribute("src") })) };
      })()`) as { cards: number; clipped: unknown[]; overflow: boolean; oversized: boolean;
        pageOffsets: number[]; text: { id: string; title: string; text: string; fontSize: number; art: string }[] };
      const expected = 45;
      const invalid = measured.text.filter(card => !card.title.trim() || /유물|미확인|[A-Za-z_]/.test(card.title)
        || /미확인|미구현|효과가 없습니다/.test(card.text)
        || card.fontSize < 14 || card.art.includes("unit-cap-relic"));
      if (measured.cards !== expected || new Set(measured.text.map(card => card.title)).size !== expected
        || new Set(measured.text.map(card => card.art)).size !== expected
        || invalid.length || measured.clipped.length || measured.overflow || measured.oversized || page.errors.length)
        throw new Error(JSON.stringify({ measured, expected, errors: page.errors }));
      const fullyVisible = new Set<string>();
      for (let index = 0; index < measured.pageOffsets.length; index++) {
        await page.evaluate(`(() => { const list = document.querySelector(".bph-relic-list");
          list.scrollTop = ${measured.pageOffsets[index]};
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))); })()`);
        const visible = await page.evaluate(`(() => {
          const bounds = document.querySelector(".bph-relic-list").getBoundingClientRect();
          return [...document.querySelectorAll(".bph-relic-card")].filter(card => {
            const rect = card.getBoundingClientRect();
            return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
          }).map(card => card.dataset.relic);
        })()`) as string[];
        for (const id of visible) fullyVisible.add(id);
        await page.shot(`${out}/relics-${width}x${height}-${index + 1}.png`);
      }
      if (fullyVisible.size !== expected) throw new Error(`Only ${fullyVisible.size}/${expected} relics were captured in full`);
      // Details live in each list card; selecting a card equips it rather than opening a separate dialog.
      for (const id of ["Relic1_CharmArcanist", "R_HunterPeriodicInvisibility", "_REMOVER_HeroSpawnInvisibility"]) {
        const selector = `.bph-relic-card[data-relic="${id}"]`;
        await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center" })`);
        if (!await page.tapElement(selector)) throw new Error(`Cannot select relic detail ${id}`);
        await page.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
        await page.shot(`${out}/relic-detail-${width}x${height}-${id}.png`);
      }
      results.push({ ...measured, pages: measured.pageOffsets.length, fullyVisible: fullyVisible.size, errors: page.errors });
    } finally {
      page.view.close();
      await rm(profile, { recursive: true, force: true });
    }
  }
  await Bun.write(`${out}/layout.json`, JSON.stringify(results, null, 2));
  console.log("RELIC_CAPTURE_OK", JSON.stringify(results.map(({ cards, overflow, clipped }) => ({ cards, overflow, clipped }))));
} finally {
  server.stop(true);
}
