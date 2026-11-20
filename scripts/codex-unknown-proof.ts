import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_CODEX_GROUPS } from "../src/bph-codex-groups";

const phase = process.env.CODEX_PHASE ?? "after";
if (phase !== "before" && phase !== "after") throw new Error(`Invalid CODEX_PHASE: ${phase}`);
const lang = process.env.CODEX_LANG ?? "ko";
if (lang !== "ko" && lang !== "en") throw new Error(`Invalid CODEX_LANG: ${lang}`);
const single = BPH_CODEX_GROUPS.find(group => group.slot.kind === "enemy" && group.variants.length === 1);
if (!single) throw new Error("No single-variant enemy");
const singleKey = single.slot.id;
const discovered = ["Hero1_Squire", "Monster1_Caveling", "Monster1_Raider", "Tome_Thunderstorm", singleKey];
const fixture = JSON.stringify({ ...freshMeta(), bph: { ...freshBphSave(), discovered, seen: [],
  codexRewards: { version: 1, claimed: discovered.map(id => `discovery:${id}`), pendingGold: 0 } } });
const args = ["--disable-component-extensions-with-background-pages", "--single-process", "--no-zygote", "--disable-gpu"];
const session = reviewBrowserSession(args);
const base = resolve(import.meta.dir, "../review/codex-unknown", process.env.CODEX_OUT ?? "");

async function capture(dist: string, preview: boolean): Promise<void> {
  const output = resolve(base, `${preview ? "all-discovered" : phase}${lang === "ko" ? "" : `-${lang}`}`);
  await mkdir(output, { recursive: true });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, resolve(dist)) });
  try {
    const page = await session.open();
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
      if (!await page.tapElement(selector)) throw new Error(`Missing control: ${selector}`);
    };
    const shot = async (name: string) => {
      await ready(`document.querySelector(".bph-codex-page") &&
        [...document.images].every(image => image.complete) &&
        document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity)
          .every(a => a.playState === "finished" || a.playState === "idle")`);
      await page.shot(resolve(output, `${name}.png`));
      console.log(`CAPTURE ${output}/${name}.png`);
    };
    const tab = async (n: number) => {
      await tap(`.bph-codex-tabs button:nth-child(${n})`);
      await ready(`document.querySelector(".bph-codex-tabs button:nth-child(${n})").getAttribute("aria-selected") === "true"`);
    };
    const detail = async (key: string, name: string) => {
      await tap(`[data-codex-key="${key}"]`);
      await ready(`document.querySelector(".bph-codex-page")?.dataset.view === ${JSON.stringify(key)}`);
      await shot(name);
    };
    const close = async () => {
      await tap(".bph-codex-x");
      await ready(`document.querySelector(".bph-codex-page")?.dataset.view === "summary"`);
    };
    const bottom = () => page.evaluate(`(() => {
      const page = document.querySelector(".bph-codex-page"); page.scrollTop = page.scrollHeight;
    })()`);
    const url = `http://127.0.0.1:${server.port}/?seed=7${preview ? "&codex=all" : ""}`;
    // Set the language on this origin before the measured navigation.
    await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    await ready(`document.querySelector("#codex-open") && !document.querySelector("#app").classList.contains("loading")`);
    await page.evaluate(`(() => { localStorage.clear(); localStorage.setItem("haengju1593-lang", ${JSON.stringify(lang)}); })()`);
    await page.view.navigate(url);
    if (preview) {
      await ready(`document.querySelector(".bph-codex-page")`);
      for (const [n, name] of [[1, "allies"], [2, "tomes"], [3, "enemies"], [4, "generals"]] as const) {
        await tab(n); await shot(name);
        if (n === 1) {
          await tap(".bph-codex-classes button:last-child"); await shot("allies-last-class");
          await tap(".bph-codex-classes button:first-child");
        }
        if (n === 3) {
          await page.evaluate(`(() => { const grid = document.querySelector(".bph-codex-grid"); grid.scrollTop = grid.scrollHeight; })()`);
          await shot("enemies-more");
          await page.evaluate(`document.querySelector(".bph-codex-grid").scrollTop = 0`);
        }
      }
      for (const [n, key, name] of [[1, "Hero1_Squire", "entry-ally"],
        [3, "Monster1_Caveling", "entry-enemy"], [4, "general:권율", "entry-general"]] as const) {
        await tab(n); await detail(key, name); await close();
      }
      await bottom(); await shot("summary-rewards");
    } else {
      await ready(`document.querySelector("#codex-open") && !document.querySelector("#app").classList.contains("loading")`);
      await tap("#codex-open"); await shot("fresh-allies");
      await tab(4); await shot("fresh-generals");
      await tab(1);
      const key = await page.evaluate(`document.querySelector("[data-codex-key]")?.dataset.codexKey`);
      if (typeof key !== "string") throw new Error("First card missing");
      await detail(key, "fresh-hidden-detail");
      await page.evaluate(`localStorage.setItem("haengju1593-meta", ${JSON.stringify(fixture)})`);
      await page.view.navigate(url);
      await ready(`document.querySelector("#codex-open") && !document.querySelector("#app").classList.contains("loading")`);
      await tap("#codex-open");
      await detail("Hero1_Squire", "ally-detail");
      await bottom(); await shot("ally-detail-bottom"); await close();
      await tab(3); await detail("Monster1_Caveling", "enemy-group-detail"); await close();
      await detail(singleKey, "enemy-single-detail"); await close();
      await tab(4); await detail("general:권율", "general-detail"); await close();
      await bottom(); await shot("rewards-list");
    }
    if (page.errors.length) throw new Error(page.errors.join("\n"));
    console.log(`PASS ${preview ? "all-discovered" : phase}; single enemy ${singleKey}`);
  } finally {
    await session.reset();
    server.stop(true);
  }
}

try {
  await capture(process.env.CODEX_DIST ?? resolve(import.meta.dir, "../dist"), false);
  if (phase === "after") {
    if (!process.env.CODEX_PREVIEW_DIST) throw new Error("CODEX_PREVIEW_DIST is required for after captures");
    await capture(process.env.CODEX_PREVIEW_DIST, true);
  }
} finally {
  await session.close();
}
