import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { freshBphSave } from "../src/bph-save";
import { BPH_UNIT_UPGRADES } from "../src/bph-unit-upgrades";
import { pixelIcon } from "../src/icons";
import { freshMeta } from "../src/meta";
import { UNIT_SPECIAL_TEXT } from "../src/unit-codex-i18n";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";

const dist = resolve(process.env.CASTLE_CODEX_DIST ?? resolve(import.meta.dir, "../dist"));

test("all 28 prep specials resolve to icons in the production asset list", async () => {
  const builtIcons = new Set<string>();
  for await (const path of new Bun.Glob("art/icons/*.webp").scan(dist)) builtIcons.add(path);
  expect(BPH_UNIT_UPGRADES.size).toBe(28);
  for (const id of BPH_UNIT_UPGRADES.keys()) {
    const special = UNIT_SPECIAL_TEXT[id];
    if (!special) throw new Error(`Missing special for ${id}`);
    const path = pixelIcon(special.icon);
    expect(builtIcons.has(path.slice(2)), `${id}: ${path}`).toBe(true);
  }
});

test("codex keeps viewing without upgrades and conceals locked cards in the index and detail", async () => {
  const save = freshBphSave(), squire = "Hero1_Squire", knight = "Hero2_Knight", scout = "Hero5_Beastmaster";
  save.discovered = [squire, "Hero5_Rider"]; // Open Government; the knight and scout remain undiscovered.
  save.seen = [...save.discovered];
  save.resources.mastery = 1240;
  const fixture = JSON.stringify({ ...freshMeta(), bph: save });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, dist) });
  const profile = await mkdtemp(`${tmpdir()}/castle-codex-view-`);
  const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const ready = (condition: string) => phone.evaluate(`new Promise((resolve, reject) => {
    const end = performance.now() + 30000;
    (function frame() {
      if (${condition}) resolve(true);
      else if (performance.now() > end) reject(new Error("UI timeout: " + ${JSON.stringify(condition)}));
      else requestAnimationFrame(frame);
    })();
  })`);
  const select = (selector: string) => `document.querySelector(${JSON.stringify(selector)})`;
  const lobby = `${select("#codex-open")} && !${select("#app")}.classList.contains("loading")`;
  const tap = async (selector: string) => {
    await ready(`${select(selector)}?.checkVisibility()`);
    await phone.evaluate(`${select(selector)}.scrollIntoView({block: "center", inline: "nearest"})`);
    expect(await phone.tapElement(selector)).toBe(true);
  };
  const controls = ".bph-codex :is([data-open-upgrade-map], .bph-codex-wallet, .bph-codex-affordable, .upgrade-rows)";
  const results: Record<string, unknown> = {};
  const recordUpgradeControls = async (view: string) => {
    results[`${view} upgrade controls`] = await phone.evaluate(`document.querySelectorAll(${JSON.stringify(controls)}).length`);
  };
  const card = (id: string) => `[data-codex-key="${id}"]`;
  try {
    const url = `http://127.0.0.1:${server.port}/?seed=7`;
    await phone.view.navigate(url);
    await ready(lobby);
    await phone.evaluate(`(() => {
      localStorage.setItem("haengju1593-lang", "ko");
      localStorage.setItem("haengju1593-meta", ${JSON.stringify(fixture)});
    })()`);
    await phone.view.navigate(url);
    await ready(lobby);
    if (await phone.evaluate(`Boolean(${select("[data-relic-toast]")})`)) await tap("[data-relic-toast] strong");
    await tap("#codex-open");
    await ready(`${select(card(squire))}?.checkVisibility()`);
    await recordUpgradeControls("index");
    await tap(card(squire));
    await ready(`${select(`[data-view="${squire}"] h2`)}?.checkVisibility()`);
    expect(await phone.evaluate(`${select(".bph-codex-page h2")}.textContent`)).not.toBe("???");
    await recordUpgradeControls("known troop");
    await tap(".bph-codex-x");
    const locked = card(knight), lockedImage = `${locked} [data-art="unknown"] img`;
    await ready(`${select(locked)}?.checkVisibility()`);
    results["knight accessible name"] = await phone.evaluate(`${select(locked)}.getAttribute("aria-label")`);
    results["knight title"] = await phone.evaluate(`${select(locked)}.title`);
    results["knight silhouette"] = await phone.evaluate(`${select(lockedImage)} && getComputedStyle(${select(lockedImage)}).filter`);
    await tap(locked);
    await ready(`${select(`[data-view="${knight}"] h2`)}?.checkVisibility()`);
    results["knight heading"] = await phone.evaluate(`${select(".bph-codex-page h2")}.textContent`);
    await recordUpgradeControls("locked troop");
    await tap(".bph-codex-x");
    await tap(".bph-codex-class:nth-child(4)"); // Monk class, unnamed before the first discovery.
    await tap(card(scout));
    await ready(`${select(`[data-view="${scout}"] h2`)}?.checkVisibility()`);
    const heading = ".bph-codex-page-head", condition = `${heading} .bph-codex-condition`;
    results["scout heading"] = await phone.evaluate(`${select(`${heading} h2`)}.textContent`);
    results["scout achievement"] = await phone.evaluate(`${select(condition)}?.lastElementChild.textContent ?? null`);
    results["scout silhouette"] = await phone.evaluate(`${select(`${heading} [data-art="unknown"] img`)}?.src.endsWith("/codex-undiscovered-silhouette.webp") ?? false`);
    results["scout leaks identity"] = await phone.evaluate(`JSON.stringify(${select(heading)}.outerHTML).includes("척후장 승병")`);
    await recordUpgradeControls("scout");
    await tap(".bph-codex-x");
    await tap(".bph-codex-tabs button:nth-child(4)");
    const lockedGeneral = `.bph-codex-grid [data-codex-key^="general:"][data-discovered="false"]`;
    await tap(lockedGeneral);
    await ready(`${select(`${heading} h2`)}?.checkVisibility()`);
    results["general achievement"] = await phone.evaluate(`${select(condition)}?.lastElementChild.textContent.startsWith("해금 방법: ") ?? false`);
    await recordUpgradeControls("locked general");
    await tap(".bph-codex-head button");
    await tap("#barracks-open");
    await tap('[data-prep-tab="government"]');
    results["scout tree silhouette"] = await phone.evaluate(`${select(`[data-card="${scout}"] [data-art="unknown"] img`)}?.src.endsWith("/codex-undiscovered-silhouette.webp") ?? false`);
    await tap(`[data-card="${scout}"]`);
    results["scout tree achievement"] = await phone.evaluate(`${select('[data-locked-tooltip="card"]')}?.textContent ?? null`);
    expect(results).toEqual({
      "index upgrade controls": 0, "known troop upgrade controls": 0,
      "knight accessible name": "???", "knight title": "", "knight silhouette": "brightness(0)",
      "knight heading": "???", "locked troop upgrade controls": 0,
      "scout heading": "???", "scout achievement": "해금 방법: 강화에서 막사 숲 모집 구입 후 전투에서 해당 모집 열기",
      "scout silhouette": true, "scout leaks identity": false, "scout upgrade controls": 0,
      "general achievement": true, "locked general upgrade controls": 0,
      "scout tree silhouette": true,
      "scout tree achievement": results["scout achievement"],
    });
  } finally {
    phone.view.close(); server.stop(true);
    await rm(profile, { recursive: true, force: true });
  }
}, 90000);
