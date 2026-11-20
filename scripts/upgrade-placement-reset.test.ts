import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";
import { freshBphSave } from "../src/bph-save";
import { freshMeta } from "../src/meta";

const session = reviewBrowserSession();
afterAll(() => session.close());

test.each([[390, 844], [1280, 800]])("both mastery sides keep the wallet and upgrades without any refund control at %dx%d", async (width, height) => {
  const worktree = resolve(import.meta.dir, "..");
  const evidence = resolve(process.env.CASTLE_MAP_EVIDENCE ?? resolve(worktree, "out/upgrade-reset"), `${width}x${height}`);
  await mkdir(evidence, { recursive: true });
  const dist = resolve(process.env.CASTLE_CODEX_DIST ?? resolve(worktree, "review-dist"));
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: req => previewResponse(req, dist) });
  try {
    const page = await session.open(width, height);
    const save = freshBphSave();
    save.resources.mastery = 42;
    save.purchasedPlacements = ["_SkillTreeMain_Demo:23:15", "_SkillTreeMain_Demo:24:14"];
    save.generalUpgrades = { 권율: { health: 2 } };
    const url = new URL("?seed=7", server.url).href;
    await page.view.navigate(url);
    await page.evaluate(`localStorage.setItem("haengju1593-meta", ${JSON.stringify(JSON.stringify({ ...freshMeta(), bph: save }))})`);
    await page.view.navigate(url);
    const ready = (selector: string) => page.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + 12000;
      function frame() {
        if (document.querySelector(${JSON.stringify(selector)})?.checkVisibility()) resolve(true);
        else if (performance.now() > end) reject(new Error(${JSON.stringify(selector)}));
        else requestAnimationFrame(frame);
      } frame();
    })`);
    await ready("#app:not(.loading) #barracks-open");
    expect(await page.tapElement("#barracks-open")).toBe(true);
    for (const tab of ["shared", "general"]) {
      if (tab === "general") expect(await page.tapElement('[data-prep-tab="general"]')).toBe(true);
      await ready(`[data-prep-group="${tab}"] button[data-${tab === "general" ? "general" : "placement"}]`);
      expect(await page.evaluate(`(() => {
        const tree = document.querySelector(".bph-prep-upgrades");
        return Boolean(tree.querySelector(".bph-prep-refunds,[data-bph-prep-refund]")) ||
          [...tree.querySelectorAll("button")].some(b => /되돌리기|refund|reset/i.test(b.textContent));
      })()`)).toBe(false);
      expect(await page.evaluate(`document.querySelector(".bph-web-wallet span").textContent`)).toBe("42");
      expect(await page.evaluate(`JSON.parse(localStorage.getItem("haengju1593-meta")).bph.purchasedPlacements`)).toEqual(save.purchasedPlacements);
      expect(await page.evaluate(`JSON.parse(localStorage.getItem("haengju1593-meta")).bph.generalUpgrades.권율.health`)).toBe(2);
    }
    await page.shot(resolve(evidence, "final.png"));
    expect(page.errors).toEqual([]);
  } finally {
    try { await session.reset(); } finally { server.stop(true); }
  }
}, 120_000);
