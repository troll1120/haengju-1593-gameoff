import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";
import { BPH_CODEX_CLASSES } from "../src/bph-codex-page";
import { BPH_PROFILES } from "../src/bph-data";

const previewDist = resolve(process.env.CASTLE_CODEX_PREVIEW_DIST ?? resolve(import.meta.dir, "../review-dist"));
const flags = ["--disable-component-extensions-with-background-pages", "--single-process", "--no-zygote", "--disable-gpu"];
const REVIEW_SIZES = [[390, 844], [405, 670], [1440, 900]] as const;
const LOBBY = `document.querySelector("#codex-open") && !document.querySelector("#app").classList.contains("loading")`;
/** Ice-Armored Spearman, Scattershot Chongtong Gunner and Vampiric Chongtong Gunner: the English names that need a third line. */
const THREE_LINE_NAMES = ["Hero7_Icebourne", "Hero6_Shotgun", "Hero6_BloodMage"] as const;
/** Every card name in the open grid: its glyphs stay inside the name area, and name areas and cards share one height. */
const nameProblems = (required: readonly string[]) => `(() => {
  const cards = [...document.querySelectorAll(".bph-codex-card")], areas = new Set(), frames = new Set();
  const problems = ${JSON.stringify(required)}.filter(key => !cards.some(card => card.dataset.codexKey === key)).map(key => key + ": card missing");
  if (!cards.length) problems.push("no cards");
  for (const card of cards) {
    const label = card.querySelector(".bph-codex-label"), area = label.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(label);
    // A hidden line lies a whole line below the area; a glyph taller than its line box overhangs by a pixel or two.
    const slack = parseFloat(getComputedStyle(label).lineHeight) / 2;
    if ([...range.getClientRects()].some(box => box.width > 0 && (box.bottom - area.bottom >= slack || area.top - box.top >= slack
      || box.left < area.left - 1 || box.right > area.right + 1))) problems.push(card.dataset.codexKey + ": name outside its area");
    areas.add(area.height); frames.add(card.getBoundingClientRect().height);
  }
  if (areas.size > 1) problems.push("name areas differ: " + [...areas].join("/"));
  if (frames.size > 1) problems.push("card heights differ: " + [...frames].join("/"));
  return problems;
})()`;
/** Every place in the open codex page where a line break falls between two letters or digits, as "left/right". A break next to a bracket or a dash is a fair one. */
const BROKEN_WORDS = `(() => {
  const page = document.querySelector(".bph-codex-page"), walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT), broken = [];
  if (!page.textContent.trim()) broken.push("empty page");
  const top = (node, index) => {
    const range = document.createRange();
    range.setStart(node, index); range.setEnd(node, index + 1);
    return [...range.getClientRects()].find(box => box.width > 0)?.top;
  };
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // The two halves of a cut word sit a line apart; a glyph from a fallback font only shifts by a pixel or two.
    const apart = parseFloat(getComputedStyle(node.parentElement).fontSize) / 2;
    for (const pair of node.data.matchAll(/[\\p{L}\\p{N}](?=[\\p{L}\\p{N}])/gu)) {
      const left = top(node, pair.index), right = top(node, pair.index + 1);
      if (left !== undefined && right !== undefined && right - left >= apart)
        broken.push(node.data.slice(0, pair.index + 1).match(/\\S+$/)[0] + "/" + node.data.slice(pair.index + 1).match(/^\\S+/)[0]);
    }
  }
  return broken;
})()`;

type Phone = Awaited<ReturnType<typeof launch>>;
type Codex = {
  readonly phone: Phone;
  /** Starts a new account and shows its codex: as it is, or as the preview build's read-only copy with everything found. */
  readonly open: (everything: boolean) => Promise<void>;
  readonly choose: (selector: string) => Promise<void>;
  readonly view: (key: string) => Promise<void>;
};

async function codex(size: readonly [number, number], lang: "ko" | "en", run: (codex: Codex) => Promise<void>): Promise<void> {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, previewDist) });
  const profile = await mkdtemp(`${tmpdir()}/codex-text-test-`);
  let phone: Phone | undefined;
  try {
    phone = await launch("about:blank", profile, size[0], size[1], flags);
    const page = phone, url = `http://127.0.0.1:${server.port}/?seed=7`;
    const ready = (condition: string) => page.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + 30000;
      function frame() {
        if (${condition}) requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
        else if (performance.now() > end) reject(new Error("UI timeout: " + ${JSON.stringify(condition)}));
        else requestAnimationFrame(frame);
      } frame();
    })`);
    const tap = async (selector: string) => {
      await ready(`document.querySelector(${JSON.stringify(selector)})`);
      expect(await page.tapElement(selector)).toBe(true);
    };
    await run({ phone: page,
      open: async everything => {
        await page.view.navigate(url);
        await ready(LOBBY);
        await page.evaluate(`(() => { localStorage.clear(); localStorage.setItem("haengju1593-lang", ${JSON.stringify(lang)}); })()`);
        await page.view.navigate(everything ? `${url}&codex=all` : url);
        if (!everything) { await ready(LOBBY); await tap("#codex-open"); }
        // Names are fitted against the loaded pixel font, so nothing is measured before it has arrived.
        await ready(`document.querySelector(".bph-codex-page")?.dataset.view === "summary" && document.fonts.status === "loaded"`);
      },
      choose: async selector => {
        await tap(selector);
        await ready(`document.querySelector(${JSON.stringify(selector)}).getAttribute("aria-selected") === "true"`);
      },
      view: async key => {
        await tap(`[data-codex-key="${key}"]`);
        await ready(`document.querySelector(".bph-codex-page")?.dataset.view === ${JSON.stringify(key)}`);
      },
    });
    expect(page.errors).toEqual([]);
  } finally {
    server.stop(true);
    await closeBrowser(phone?.view, profile);
  }
}

for (const size of REVIEW_SIZES) {
  test(`English card names stay whole inside one shared name area at ${size.join("x")}`, async () => {
    await codex(size, "en", async c => {
      await c.open(true);
      for (const [index, classId] of BPH_CODEX_CLASSES.entries()) {
        await c.choose(`.bph-codex-classes button:nth-child(${index + 1})`);
        const required = THREE_LINE_NAMES.filter(key => BPH_PROFILES[key].classId === classId);
        expect({ grid: classId, problems: await c.phone.evaluate(nameProblems(required)) }).toEqual({ grid: classId, problems: [] });
      }
      for (const tab of [2, 3, 4]) {
        await c.choose(`.bph-codex-tabs button:nth-child(${tab})`);
        expect({ grid: tab, problems: await c.phone.evaluate(nameProblems([])) }).toEqual({ grid: tab, problems: [] });
      }
    });
  }, 120000);

  test(`Korean codex text breaks between words, never inside one, at ${size.join("x")}`, async () => {
    await codex(size, "ko", async c => {
      await c.open(false);
      const fresh = await c.phone.evaluate(BROKEN_WORDS);
      await c.open(true);
      const found = await c.phone.evaluate(BROKEN_WORDS);
      await c.choose(".bph-codex-tabs button:nth-child(4)");
      await c.view("general:권율");
      const commander = await c.phone.evaluate(BROKEN_WORDS);
      expect({ fresh, found, commander }).toEqual({ fresh: [], found: [], commander: [] });
    });
  }, 120000);
}
