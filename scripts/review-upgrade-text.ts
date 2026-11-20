import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_UPGRADE_GRIDS } from "../src/bph-upgrade-data";
import { BPH_PROFILES, BPH_TOMES } from "../src/bph-data";

// Rendering fixture only, in a disposable Chrome profile; never a real player's save.
const before = process.argv[2], after = process.argv[3];
if (!before || !after) throw new Error("Expected before and after bundle directories");
const evidence = resolve("review/p10/node-effects/captures");
await mkdir(evidence, { recursive: true });
const save = freshBphSave();
save.dimension = 3;
save.resources.mastery = 10000000;
save.discovered = [...Object.keys(BPH_PROFILES), ...Object.keys(BPH_TOMES)];
save.purchasedPlacements = BPH_UPGRADE_GRIDS.flatMap(grid => grid.placements.filter(p => p.nodeId).map(p => p.id));
const meta = { ...freshMeta(), version: 4, bph: save };
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  fetch: request => {
    const url = new URL(request.url), variant = url.pathname.startsWith("/before/") ? "before" : "after";
    url.pathname = url.pathname.replace(/^\/(?:before|after)/, "");
    return previewResponse(new Request(url, request), variant === "before" ? before : after);
  },
});
const results: unknown[] = [];
try {
  for (const [width, height] of [[390, 844], [1440, 900]]) for (const lang of ["ko", "en"]) {
    const profile = await mkdtemp(`${tmpdir()}/castle-node-text-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const ready = async (condition: string) => {
      await phone.view.cdp("Runtime.evaluate", {
        expression: `new Promise((resolve, reject) => {
          const end = performance.now() + 15000;
          function check() {
            if (${condition}) resolve(true);
            else if (performance.now() > end) reject(new Error("Timed out: " + ${JSON.stringify(condition)}));
            else requestAnimationFrame(check);
          }
          check();
        })`, awaitPromise: true, returnByValue: true,
      });
      if (!await phone.evaluate(condition)) throw new Error(`Condition failed: ${condition}`);
    };
    try {
      await phone.view.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
      for (const variant of ["before", "after"]) {
        const url = `http://127.0.0.1:${server.port}/${variant}/`;
        await phone.view.navigate(url);
        await phone.evaluate(`(() => { localStorage.setItem("haengju1593-lang", ${JSON.stringify(lang)});
          localStorage.setItem("haengju1593-meta", ${JSON.stringify(JSON.stringify(meta))}); return true; })()`);
        await phone.view.navigate(url);
        await ready("Boolean(window.castleSample)");
        if (!await phone.tapElement("#start")) throw new Error("Start button missing");
        await ready('Boolean(document.querySelector(".bph-actions button"))');
        if (!await phone.tapElement(".bph-actions button")) throw new Error("Upgrade button missing");
        await ready('Boolean(document.querySelector(".bph-web-node"))');
        const selector = '[data-placement="_SkillTreeFrozen:29:25"]';
        await phone.evaluate(`(() => { document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center",inline:"center"}); return true; })()`);
        if (!await phone.tapElement(selector)) throw new Error("Astral Fisher node missing");
        await ready('Boolean(document.querySelector(".bph-web-description"))');
        await phone.view.cdp("Runtime.evaluate", {
          expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", awaitPromise: true,
        });
        const info = await phone.evaluate(`(() => {
          const description = document.querySelector(".bph-web-description");
          const r = description.getBoundingClientRect();
          return {
            description: description.textContent, userAgent: navigator.userAgent,
            viewport: [innerWidth, innerHeight],
            documentScroll: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
            descriptionVisible: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            scrollOwners: [...document.querySelectorAll("*")].filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)
              .map(el => el.id || el.className || el.tagName)
          };
        })()`);
        const file = `${variant}-${lang}-${width}x${height}.png`;
        await phone.shot(`${evidence}/${file}`);
        results.push({ variant, lang, width, height, file, info, consoleErrors: [...phone.errors] });
        console.log(`CAPTURE ${file} ${JSON.stringify(info)}`);
      }
    } finally {
      phone.view.close();
      await rm(profile, { recursive: true, force: true });
    }
  }
  await Bun.write(`${evidence}/smoke.json`, JSON.stringify({
    scope: "Built-bundle upgrade description before/after only; not the full deploy smoke. No deployment.",
    fixture: "All tree placements purchased to expose a late-game description in a disposable profile.",
    results,
  }, null, 2) + "\n");
  console.log("UPGRADE_CAPTURE_COMPLETE");
} finally {
  server.stop(true);
}
