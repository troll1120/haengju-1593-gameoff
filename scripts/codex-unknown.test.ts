import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { launch, reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave, parseBphSave } from "../src/bph-save";
import { BPH_SILHOUETTE_ART } from "../src/bph-locked-identity";
import { BPH_CODEX_GROUPS } from "../src/bph-codex-groups";
import { BPH_CODEX_CLASSES } from "../src/bph-codex-page";

const previewDist = resolve(process.env.CASTLE_CODEX_PREVIEW_DIST ?? resolve(import.meta.dir, "../review-dist"));
const productionDist = resolve(process.env.CASTLE_CODEX_DIST ?? resolve(import.meta.dir, "../dist"));
const single = BPH_CODEX_GROUPS.find(group => group.slot.kind === "enemy" && group.variants.length === 1);
if (!single) throw new Error("No single-variant enemy");
const singleKey = single.slot.id;
const discovered = ["Hero1_Squire", "Monster1_Caveling", "Monster1_Raider", "Tome_Thunderstorm", singleKey];
// Parsed as every load parses it, so the save already carries what loading backfills (a class whose obtainable members are all found).
const fixture = JSON.stringify({ ...freshMeta(), bph: parseBphSave({ ...freshBphSave(), discovered, seen: [],
  codexRewards: { version: 1, claimed: discovered.map(id => `discovery:${id}`), pendingGold: 0 } }) });
/** A concealed picture is the shared silhouette and nothing else: no letter, no identity image. */
/**
 * The file an <img> shows. Title-screen art preloading (art-preload.ts) swaps a loaded picture's src for
 * `blob:...#./art/<file>` and keeps the original path after the `#`, so the same picture has two spellings depending on
 * whether preloading has reached it yet.
 */
const ART_PATH = `(image => { const src = image.getAttribute("src") ?? "";
  return src.startsWith("blob:") && src.includes("#") ? src.slice(src.indexOf("#") + 1) : src; })`;
const SILHOUETTE_ONLY = (art: string) => `(${art}) && (${art}).textContent === "" &&
  [...(${art}).querySelectorAll("img")].map(${ART_PATH}).join() === ${JSON.stringify(BPH_SILHOUETTE_ART)}`;
const flags = ["--disable-component-extensions-with-background-pages", "--single-process", "--no-zygote", "--disable-gpu"];
const session = reviewBrowserSession(flags);
let initialized = false;
afterAll(() => session.close());
/** Every card on screen: its figure stays inside the card and stands on the art cell's bottom edge, and its name is not cut. */
const CARD_PROBLEMS = `[...document.querySelectorAll(".bph-codex-card")].flatMap(card => {
  const sprite = card.querySelector(".bph-codex-sprite"), label = card.querySelector(".bph-codex-label"), problems = [];
  if (sprite) {
    const figure = sprite.getBoundingClientRect(), cell = card.querySelector(".bph-codex-art").getBoundingClientRect(), frame = card.getBoundingClientRect();
    if (figure.top < cell.top - .5 || figure.left < frame.left || figure.right > frame.right) problems.push("figure outside its cell");
    if (Math.abs(figure.bottom - cell.bottom) > .5) problems.push("figure off the baseline");
  }
  if (label.scrollHeight - label.clientHeight >= parseFloat(getComputedStyle(label).lineHeight) / 2) problems.push("name cut");
  return problems.map(problem => card.dataset.codexKey + ": " + problem);
})`;
type Phone = Awaited<ReturnType<typeof launch>>;
type Browser = {
  readonly phone: Phone;
  readonly ready: (condition: string) => Promise<unknown>;
  readonly tap: (selector: string) => Promise<void>;
  readonly navigate: (options: { readonly lang?: string; readonly save?: string; readonly param?: boolean }) => Promise<void>;
  readonly tab: (n: number) => Promise<void>;
  readonly entry: (key: string) => Promise<void>;
  readonly close: () => Promise<void>;
  readonly count: () => Promise<unknown>;
};

async function browser(dist: string, run: (browser: Browser) => Promise<void>): Promise<void> {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, dist) });
  try {
    const page = await session.open(), url = `http://127.0.0.1:${server.port}/?seed=7`;
    if (!initialized) {
      await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
        window.codexAccountWrites = [];
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (key === "haengju1593-meta") window.codexAccountWrites.push(value);
          return original.call(this, key, value);
        };
      ` });
      initialized = true;
    }
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
      await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "nearest" })`);
      expect(await page.tapElement(selector)).toBe(true);
    };
    const navigate: Browser["navigate"] = async options => {
      await page.view.navigate(url);
      await ready(`document.querySelector("#codex-open") && !document.querySelector("#app").classList.contains("loading")`);
      await page.evaluate(`(() => { localStorage.clear();
        localStorage.setItem("haengju1593-lang", ${JSON.stringify(options.lang ?? "ko")});
        ${options.save === undefined ? "" : `localStorage.setItem("haengju1593-meta", ${JSON.stringify(options.save)});`} })()`);
      await page.view.navigate(url + (options.param ? "&codex=all" : ""));
      await ready(`window.castleSample && !document.querySelector("#app").classList.contains("loading") &&
        (document.querySelector("#codex-open") || document.querySelector(".bph-codex-page"))`);
    };
    await run({ phone: page, ready, tap, navigate,
      tab: async n => {
        await tap(`.bph-codex-tabs button:nth-child(${n})`);
        await ready(`document.querySelector(".bph-codex-tabs button:nth-child(${n})").getAttribute("aria-selected") === "true"`);
      },
      entry: async key => {
        await tap(`[data-codex-key="${key}"]`);
        await ready(`document.querySelector(".bph-codex-page")?.dataset.view === ${JSON.stringify(key)}`);
      },
      close: async () => {
        await tap(".bph-codex-x");
        await ready(`document.querySelector(".bph-codex-page")?.dataset.view === "summary"`);
      },
      count: async () => {
        await ready(`document.querySelector(".bph-codex-head")`);
        return page.evaluate(`document.querySelector(".bph-codex-count")`);
      },
    });
    expect(page.errors).toEqual([]);
  } finally {
    await session.reset();
    server.stop(true);
  }
}

for (const lang of ["ko", "en"]) {
  test(`fresh ${lang} codex conceals all undiscovered cards and seven locked commanders`, async () => {
    await browser(previewDist, async b => {
      await b.navigate({ lang }); await b.tap("#codex-open");
      expect(await b.count()).toBeNull();
      expect(await b.phone.evaluate(`[...document.querySelectorAll(".bph-codex-classes button")].map(button =>
        [button.querySelector(".bph-codex-art")?.dataset.art, [...button.querySelectorAll("img")].map(${ART_PATH}).join(),
          button.getAttribute("aria-label")?.startsWith("???")])`))
        .toEqual(BPH_CODEX_CLASSES.map(() => ["unknown", BPH_SILHOUETTE_ART, true]));
      expect(await b.phone.evaluate(`[...document.querySelector(".bph-codex-milestones").children].map(row =>
        [row.querySelector(".bph-codex-art")?.dataset.art, row.querySelector("strong")?.textContent])`))
        .toEqual(BPH_CODEX_CLASSES.map(() => ["unknown", "???"]));
      const hiddenCards = () => b.phone.evaluate(`(() => {
        const cards = [...document.querySelectorAll("button.bph-codex-card")];
        return cards.length > 0 && cards.every(card => {
          const art = card.querySelector("span.bph-codex-art");
          return card.dataset.discovered === "false" && art?.dataset.art === "unknown" && ${SILHOUETTE_ONLY("art")} &&
            card.querySelector("span.bph-codex-label")?.textContent === "???";
        });
      })()`);
      for (const n of [1, 2, 3]) {
        await b.tab(n); expect(await hiddenCards()).toBe(true);
        if (n === 1) {
          // Check every ally class, since the first tab filters its cards by class.
          const classes = await b.phone.evaluate(`document.querySelectorAll(".bph-codex-classes button").length`);
          if (typeof classes !== "number") throw new Error("Missing class controls");
          for (let c = 1; c <= classes; c++) {
            await b.tap(`.bph-codex-classes button:nth-child(${c})`);
            expect(await hiddenCards()).toBe(true);
            // The caption names the class, then carries the recruit tally (593179ef); the name itself stays hidden.
            expect(await b.phone.evaluate(`(() => { const caption = document.querySelector(".bph-codex-group");
              return [caption.firstChild.textContent, [...caption.children].map(child => child.className)]; })()`))
              .toEqual(["???", ["bph-codex-recruit"]]);
          }
        }
      }
      await b.tab(4);
      expect(await b.phone.evaluate(`(() => {
        const cards = [...document.querySelectorAll(".bph-codex-card")];
        const named = cards.filter(card => card.querySelector(".bph-codex-label").textContent !== "???");
        const locked = cards.filter(card => card.dataset.codexKey !== "general:권율");
        return { total: cards.length, named: named.map(card => card.dataset.codexKey),
          portrait: !!named[0]?.querySelector(".bph-codex-art img"),
          unlocked: named[0]?.dataset.discovered,
          hidden: locked.every(card => card.dataset.discovered === "false" &&
            card.querySelector(".bph-codex-label").textContent === "???" &&
            ${SILHOUETTE_ONLY(`card.querySelector('span.bph-codex-art[data-art="unknown"]')`)}) };
      })()`)).toEqual({ total: 8, named: ["general:권율"], portrait: true, unlocked: "true", hidden: true });
      await b.tab(1); await b.tap(".bph-codex-card");
      await b.ready(`document.querySelector(".bph-codex-x")`);
      expect(await b.phone.evaluate(`document.querySelector(".bph-codex-title h2").textContent`)).toBe("???");
    });
  }, 120000);
}

test("ally and enemy pages show trait words instead of stat numbers; the commander shows one skill card and no number list", async () => {
  await browser(previewDist, async b => {
    await b.navigate({ save: fixture }); await b.tap("#codex-open");
    for (const [tab, key] of [[1, "Hero1_Squire"], [3, "Monster1_Caveling"], [3, singleKey], [4, "general:권율"]] as const) {
      await b.tab(tab); await b.entry(key);
      expect(await b.phone.evaluate(`[
        document.querySelectorAll(".bph-codex-page > dl.bph-facts").length,
        document.querySelectorAll(".bph-codex-page .bph-stats").length
      ]`)).toEqual([0, 0]);
      // The commander page keeps only the skill line and its cooldown (1ea7ccd8); its HP facts list is gone.
      if (tab === 4) expect(await b.phone.evaluate(`document.querySelectorAll(".bph-codex-page .bph-skill-card").length`)).toBe(1);
      if (tab !== 4) {
        const traits = await b.phone.evaluate(`[
          ...document.querySelectorAll(".bph-codex-page > .bph-codex-traits li")
        ].map(trait => trait.textContent)`) as string[];
        expect(traits.length).toBeGreaterThanOrEqual(2);
        expect(traits.length).toBeLessThanOrEqual(3);
        expect(traits.join("")).not.toMatch(/\d/);
      }
      await b.close();
    }
  });
}, 120000);

test("reward rows keep icon, name, tally and conditional check on one row", async () => {
  await browser(previewDist, async b => {
    await b.navigate({ save: fixture }); await b.tap("#codex-open");
    // The codex module loads on demand, so wait for class rewards and their pictures before measuring rows.
    await b.ready(`document.querySelectorAll(".bph-codex-milestones").length === 1 &&
      [...document.querySelectorAll(".bph-codex img")].every(image => image.complete && image.naturalWidth > 0)`);
    expect(await b.phone.evaluate(`[...document.querySelectorAll(".bph-codex-milestones")].map(list => list.children.length)`))
      .toEqual([BPH_CODEX_CLASSES.length]);
    expect(await b.phone.evaluate(`[...document.querySelectorAll(".bph-codex-milestones li")].flatMap((row, index) => {
      const children = [...row.children], first = children[0].getBoundingClientRect(), problems = [];
      if (!row.querySelector("strong")) problems.push("name");
      if (!row.querySelector("span.bph-codex-tally")) problems.push("tally");
      if (!row.querySelector("img, .bph-codex-art")) problems.push("picture");
      if (row.querySelectorAll('img[src*="bph-node-check"]').length !== Number(row.classList.contains("is-claimed"))) problems.push("check");
      if (children.some(child => { const box = child.getBoundingClientRect();
        return Math.min(box.bottom, first.bottom) <= Math.max(box.top, first.top); })) problems.push("wrapped");
      return problems.map(problem => index + ":" + problem);
    })`)).toEqual([]);
    expect(await b.phone.evaluate(`(() => {
      const classes = document.querySelector(".bph-codex-milestones");
      return { rewardText: classes.textContent.includes("유물 1개"),
        relic: !!classes.querySelector('img[src*="relic"]'),
        ruleAbove: [...document.querySelectorAll(".bph-codex-page p")].some(p =>
          p.textContent === "병종을 모두 발견하면 유물 칸에서 획득할 수 있어요" &&
          !!(p.compareDocumentPosition(classes) & Node.DOCUMENT_POSITION_FOLLOWING)),
        rows: [...classes.children].map(row => row.querySelector(".bph-codex-art").dataset.art + ":" + (row.querySelector("strong").textContent !== "???")),
        tabs: [...document.querySelectorAll(".bph-codex-classes button .bph-codex-art")].map(art => art.dataset.art) };
    })()`)).toEqual({ rewardText: false, relic: false, ruleAbove: true,
      rows: ["sprite:true", ...BPH_CODEX_CLASSES.slice(1).map(() => "unknown:false")],
      tabs: ["sprite", ...BPH_CODEX_CLASSES.slice(1).map(() => "unknown")] });
  });
}, 120000);

test("all-discovered preview reveals every tab and writes nothing after the startup save", async () => {
  await browser(previewDist, async b => {
    await b.navigate({ save: fixture, param: true });
    await b.ready(`document.querySelector(".bph-codex-page")`);
    // Every startup may store the parsed account once (main.ts migration); browsing the preview must add nothing.
    const startup = await b.phone.evaluate(`[window.codexAccountWrites.length, localStorage.getItem("haengju1593-meta")]`) as [number, string];
    const seeded = JSON.parse(fixture).bph, stored = JSON.parse(startup[1]).bph;
    expect([stored.discovered, stored.seen, stored.codexRewards]).toEqual([seeded.discovered, seeded.seen, seeded.codexRewards]);
    expect(await b.phone.evaluate(`document.querySelector(".bph-codex-head .bph-codex-preview")?.textContent`)).toBe("미리보기: 전부 발견");
    expect(await b.count()).toBeNull();
    // Names are fitted against the loaded pixel font, so every tab below is drawn after it has arrived.
    await b.ready(`document.fonts.status === "loaded"`);
    for (const [tab, key] of [[1, "Hero1_Squire"], [2, "Tome_Thunderstorm"], [3, "Monster1_Caveling"], [4, "general:권율"]] as const) {
      await b.tab(tab);
      expect(await b.phone.evaluate(`(() => {
        const cards = [...document.querySelectorAll(".bph-codex-card")];
        return cards.length > 0 && cards.every(card => card.dataset.discovered === "true" &&
          card.querySelector(".bph-codex-label").textContent !== "???" && !!card.querySelector(".bph-codex-art img"));
      })()`)).toBe(true);
      expect(await b.phone.evaluate(CARD_PROBLEMS)).toEqual([]);
      if (tab === 1) expect(await b.phone.evaluate(`[...document.querySelectorAll(".bph-codex-classes button .bph-codex-art")]
        .every(art => art.dataset.art === "sprite")`)).toBe(true);
      if (tab === 3) expect(await b.phone.evaluate(`[...document.querySelectorAll(".bph-codex-label.is-long")]
        .map(label => label.closest("[data-codex-key]").dataset.codexKey)`)).toEqual(["Boss3_Witch"]);
      if (tab === 4) expect(await b.phone.evaluate(`document.querySelectorAll('.bph-codex-card[data-discovered="true"]').length`)).toBe(8);
      await b.entry(key); await b.close();
    }
    await b.tap(".bph-codex-head .bph-back");
    await b.ready(`!document.querySelector(".bph-codex") && document.querySelector("#codex-open")`);
    expect(await b.phone.evaluate(`window.codexAccountWrites.length`)).toBe(startup[0]);
    expect(await b.phone.evaluate(`localStorage.getItem("haengju1593-meta")`)).toBe(startup[1]);
  });
}, 120000);

for (const [name, dist, param] of [["preview without parameter", previewDist, false], ["production ignores parameter", productionDist, true]] as const) {
  test(`${name} preserves real discovery and acknowledges unread entries normally`, async () => {
    await browser(dist, async b => {
      await b.navigate({ save: fixture, param });
      expect(await b.phone.evaluate(`!!document.querySelector(".bph-codex")`)).toBe(false);
      expect(await b.phone.evaluate(`!!document.querySelector(".bph-codex-preview")`)).toBe(false);
      await b.tap("#codex-open"); expect(await b.count()).toBeNull();
      expect(await b.phone.evaluate(`!!document.querySelector(".bph-codex-preview")`)).toBe(false);
      expect(await b.phone.evaluate(`JSON.parse(localStorage.getItem("haengju1593-meta")).bph.seen`)).toEqual([]);
      const writes = await b.phone.evaluate(`window.codexAccountWrites.length`);
      await b.entry("Hero1_Squire");
      await b.ready(`JSON.parse(localStorage.getItem("haengju1593-meta")).bph.seen.includes("Hero1_Squire")`);
      expect(await b.phone.evaluate(`window.codexAccountWrites.length > ${JSON.stringify(writes)}`)).toBe(true);
    });
    if (param) {
      // Distribution boundary: the preview marker must be eliminated from production bytes.
      for (const [directory, expected] of [[productionDist, false], [previewDist, true]] as const) {
        let files = 0, contains = false;
        for await (const file of new Bun.Glob("**/*.js").scan(directory)) {
          files++; contains = (await Bun.file(resolve(directory, file)).text()).includes("미리보기: 전부 발견") || contains;
        }
        expect(files).toBeGreaterThan(0); expect(contains).toBe(expected);
      }
    }
  }, 120000);
}
