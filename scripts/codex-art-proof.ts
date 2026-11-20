// Captures the Wakizaka boss card and one commander exactly as the codex draws them, for a before/after art check.
// Usage: CODEX_PHASE=before|after CODEX_DIST=<dist dir> bun scripts/codex-art-proof.ts
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";

const dist = resolve(process.env.CODEX_DIST ?? resolve(import.meta.dir, "../dist"));
const output = resolve(import.meta.dir, "../review/codex-unknown/art", process.env.CODEX_PHASE ?? "after");
await mkdir(output, { recursive: true });
const discovered = ["Boss2_Beast", "Boss1_Apogre", "Hero1_Squire", "Monster1_Caveling"];
const fixture = JSON.stringify({ ...freshMeta(), bph: { ...freshBphSave(), discovered, seen: [...discovered],
  unlockedGenerals: ["권율", "신립", "송상현", "황진", "김시민", "곽재우", "사명대사", "이순신"],
  codexRewards: { version: 1, claimed: discovered.map(id => `discovery:${id}`), pendingGold: 0 } } });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, dist) });
const profile = await mkdtemp(`${tmpdir()}/codex-art-`);
const phone = await launch("about:blank", profile, 390, 844,
  ["--disable-component-extensions-with-background-pages", "--single-process", "--no-zygote", "--disable-gpu"]);
const ready = (condition: string) => phone.evaluate(`new Promise((resolve, reject) => {
  const end = performance.now() + 30000;
  (function frame() {
    if (${condition}) requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
    else if (performance.now() > end) reject(new Error("UI timeout: " + ${JSON.stringify(condition)}));
    else requestAnimationFrame(frame);
  })();
})`);
const tap = async (selector: string) => {
  await ready(`document.querySelector(${JSON.stringify(selector)})`);
  if (!await phone.tapElement(selector)) throw new Error(`Missing control: ${selector}`);
};
const view = (key: string) => ready(`document.querySelector(".bph-codex-page")?.dataset.view === ${JSON.stringify(key)}`);
const shot = async (name: string) => {
  await ready(`[...document.images].every(image => image.complete)`);
  await phone.shot(resolve(output, `${name}.png`));
};
try {
  const url = `http://127.0.0.1:${server.port}/?seed=7`;
  const lobby = `document.querySelector("#codex-open") && !document.querySelector("#app").classList.contains("loading")`;
  await phone.view.navigate(url);
  await ready(lobby);
  await phone.evaluate(`(() => { localStorage.clear(); localStorage.setItem("haengju1593-lang", "ko");
    localStorage.setItem("haengju1593-meta", ${JSON.stringify(fixture)}); })()`);
  await phone.view.navigate(url);
  await ready(lobby);
  await tap("#codex-open");
  await tap(".bph-codex-tabs button:nth-child(3)");
  await shot("enemies");
  await tap('[data-codex-key="Boss2_Beast"]');
  await view("Boss2_Beast");
  await shot("wakizaka-detail");
  await tap(".bph-codex-x");
  await view("summary");
  await tap(".bph-codex-tabs button:nth-child(4)");
  await shot("generals");
  await tap('[data-codex-key="general:권율"]');
  await view("general:권율");
  await shot("gwon-yul-detail");
  if (phone.errors.length) throw new Error(phone.errors.join("\n"));
  console.log(`codex art captures written to ${output}`);
} finally {
  phone.view.close();
  server.stop(true);
  await rm(profile, { recursive: true, force: true });
}
