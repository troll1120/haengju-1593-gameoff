import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";

const LAYOUT = `(() => {
  const shown = element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && !element.closest("[hidden]"); };
  const box = selector => { const element = document.querySelector(selector); if (!element || !shown(element)) return null;
    const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const root = document.documentElement, codex = document.querySelector(".bph-codex");
  const regions = [...document.querySelectorAll(".bph-codex-tabs, .bph-codex-classes, .bph-codex-group, .bph-codex-grid")]
    .filter(shown).map(element => element.getBoundingClientRect());
  const rewardWordBreaks = [];
  for (const label of document.querySelectorAll(".bph-codex-milestones strong")) {
    const text = label.firstChild;
    for (const word of text.textContent.matchAll(/\\S+/g)) {
      const range = document.createRange();
      range.setStart(text, word.index); range.setEnd(text, word.index + word[0].length);
      if (range.getClientRects().length > 1) rewardWordBreaks.push(word[0]);
    }
  }
  return {
    page: [root.scrollWidth, root.scrollHeight, innerWidth, innerHeight],
    backs: [...document.querySelectorAll("button")].filter(button => shown(button) && /돌아가기|Back/.test(button.textContent)).length,
    closes: [...document.querySelectorAll(".bph-codex-x")].filter(shown).length,
    index: box(".bph-codex-index"), detail: box(".bph-codex-page"),
    indexOverflow: Math.max(0, ...[...document.querySelectorAll(".bph-codex-tabs, .bph-codex-classes")]
      .filter(shown).map(element => element.scrollHeight - element.clientHeight)),
    indexOverlap: regions.some((region, index) => index > 0 && regions[index - 1].bottom > region.top),
    rewardWordBreaks,
    font: codex ? getComputedStyle(codex).fontFamily : "",
    hangul: codex && root.lang === "en" ? (codex.innerText.match(/[가-힣]+/g) ?? []) : [],
    gate: codex ? (codex.innerText.match(/미확인|unconfirmed|TODO|TBD|placeholder/gi) ?? []) : [],
  };
})()`;

for (const [width, height, lang] of [[390, 844, "ko"], [1440, 900, "ko"], [390, 844, "en"], [1440, 900, "en"]] as const) {
  test(`lobby codex at ${width}x${height} (${lang}) keeps one back control, an X detail close and no nested codex`, async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, resolve(import.meta.dir, "../review-dist")),
    });
    const profile = await mkdtemp(`${tmpdir()}/castle-codex-layout-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + 30000;
      const check = () => {
        if (${expression}) requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
        else if (performance.now() > end) reject(new Error("UI timeout: " + ${JSON.stringify(expression)}));
        else requestAnimationFrame(check);
      }; check();
    })`);
    const tap = async (selector: string) => expect(await phone.tapElement(selector)).toBe(true);
    const shot = async (name: string) => {
      if (!process.env.CASTLE_CODEX_EVIDENCE) return;
      await phone.evaluate(`Promise.all(document.getAnimations().filter(animation =>
        animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished))`);
      await phone.shot(resolve(process.env.CASTLE_CODEX_EVIDENCE, `${lang}-${width}-${name}.png`));
    };
    const layout = async () => await phone.evaluate(LAYOUT) as {
      page: number[]; backs: number; closes: number; font: string; hangul: string[]; gate: string[]; indexOverflow: number; indexOverlap: boolean; rewardWordBreaks: string[];
      index: { left: number; top: number; right: number; bottom: number } | null;
      detail: { left: number; top: number; right: number; bottom: number } | null;
    };
    try {
      const url = process.env.CASTLE_CODEX_URL ?? `http://127.0.0.1:${server.port}/?seed=7`;
      await phone.view.navigate(url);
      await phone.evaluate(`(() => { localStorage.clear(); localStorage.setItem("haengju1593-lang", "${lang}"); })()`);
      await phone.view.navigate(url);
      await ready("window.castleSample && document.querySelector('#codex-open') && !document.querySelector('#app').classList.contains('loading')");

      await tap("#codex-open");
      await ready("document.querySelector('.bph-codex-page')");
      const summary = await layout();
      if (process.env.CASTLE_CODEX_EVIDENCE) {
        await shot("summary");
      }
      expect(summary.page).toEqual([width, height, width, height]);
      expect([summary.backs, summary.closes]).toEqual([1, 0]);
      expect(summary.font.startsWith("DNFBitBitv2")).toBe(true);
      expect(summary.gate).toEqual([]);
      expect(summary.hangul).toEqual([]);
      expect(summary.indexOverflow).toBe(0);
      expect(summary.indexOverlap).toBe(false);
      expect(summary.rewardWordBreaks).toEqual([]);
      const index = summary.index, detail = summary.detail;
      if (!index || !detail) throw new Error("codex panes missing");
      if (width < 600) expect(detail.top).toBeGreaterThanOrEqual(index.bottom);
      else expect(detail.left).toBeGreaterThanOrEqual(index.right);

      await tap(".bph-codex-card");
      await ready("document.querySelector('.bph-codex-x')");
      await shot("fresh-hidden");
      const opened = await layout();
      expect([opened.backs, opened.closes]).toEqual([1, 1]);
      expect(opened.page).toEqual([width, height, width, height]);
      await tap(".bph-codex-x");
      await ready("document.querySelector('.bph-codex-page')?.dataset.view === 'summary'");
      expect((await layout()).closes).toBe(0);

      await tap(".bph-codex-head .bph-back");
      await ready("!document.querySelector('.bph-codex') && document.querySelector('#codex-open')");
      await shot("lobby");
      await tap("#start");
      await ready("document.querySelector('[data-bph-start]') && document.querySelector('.bph-commander-info')");
      const preparation = await phone.evaluate(`(() => ({
        nested: [...document.querySelectorAll(".bph-management button")].filter(button => /도감|Codex/.test(button.textContent)).length,
        backs: [...document.querySelectorAll(".bph-management button")].filter(button => /돌아가기|Back/.test(button.textContent)).length,
        general: document.querySelector(".bph-commander-info")?.dataset.general,
      }))()`);
      expect(preparation).toEqual({ nested: 0, backs: 1, general: "권율" });
      await shot("preparation");
      await phone.evaluate(`(() => {
        const meta = JSON.parse(localStorage.getItem("haengju1593-meta"));
        meta.bph.discovered = ["Hero1_Squire", "Tome_Thunderstorm", "Monster1_Raider"];
        localStorage.setItem("haengju1593-meta", JSON.stringify(meta));
      })()`);
      await phone.view.navigate(url);
      await ready("window.castleSample && document.querySelector('#codex-open') && !document.querySelector('#app').classList.contains('loading')");
      await tap("#codex-open");
      await ready("document.querySelector('.bph-codex-page')");
      const discoveredSummary = await layout();
      expect(discoveredSummary.rewardWordBreaks).toEqual([]);
      if (process.env.CASTLE_CODEX_EVIDENCE) {
        await shot("discovered-summary");
        await Bun.write(resolve(process.env.CASTLE_CODEX_EVIDENCE, `${lang}-${width}-layout.json`),
          JSON.stringify({ fresh: summary, discovered: discoveredSummary, preparation }, null, 2));
      }
      for (const [tab, key] of [[1, "Hero1_Squire"], [2, "Tome_Thunderstorm"], [3, "Monster1_Caveling"], [4, "general:권율"]] as const) {
        await tap(`.bph-codex-tabs button:nth-child(${tab})`);
        await tap(`[data-codex-key="${key}"]`);
        await ready(`document.querySelector('.bph-codex-page')?.dataset.view === ${JSON.stringify(key)}`);
        const detailFits = await phone.evaluate(`(() => {
          const page = document.querySelector(".bph-codex-page"), close = document.querySelector(".bph-codex-x");
          const bounds = page.getBoundingClientRect(), x = close.getBoundingClientRect();
          return { horizontalOverflow: page.scrollWidth - page.clientWidth,
            closeInside: x.left >= bounds.left && x.right <= bounds.right };
        })()`);
        if (process.env.CASTLE_CODEX_EVIDENCE) {
          await shot(`tab${tab}`);
        }
        expect(detailFits).toEqual({ horizontalOverflow: 0, closeInside: true });
        const selectedLayout = await layout();
        expect(selectedLayout.backs).toBe(1);
        expect(selectedLayout.indexOverflow).toBe(0);
        expect(selectedLayout.indexOverlap).toBe(false);
        // No promotion is bought on this save, so the codex reveals no promotion line (bph-codex-details gates it);
        // bph-promotion-ui.test.ts covers the bought ranks.
        if (tab === 1) expect(await phone.evaluate(`!!document.querySelector(".bph-codex-evolution")`)).toBe(false);
        // A tome reads one plain line per effect with its duration; its tuning-number list is gone (1ea7ccd8).
        if (tab === 2) expect(await phone.evaluate(`[document.querySelectorAll(".bph-codex-page .bph-skill-card strong").length > 0,
          document.querySelectorAll(".bph-codex-page .bph-facts").length]`)).toEqual([true, 0]);
        if (tab === 4) expect(await phone.evaluate(`document.querySelectorAll(".bph-codex-battles li").length`)).toBeGreaterThan(0);
        await phone.evaluate(`document.querySelector(".bph-codex-page").scrollTop = document.querySelector(".bph-codex-page").scrollHeight`);
        await shot(`tab${tab}-bottom`);
        await phone.evaluate(`document.querySelector(".bph-codex-page").scrollTop = 0`);
        await tap(".bph-codex-x");
        await ready("document.querySelector('.bph-codex-page')?.dataset.view === 'summary'");
      }
      expect(phone.errors).toEqual([]);
    } finally {
      server.stop(true);
      await closeBrowser(phone.view, profile);
    }
  });
}
