import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_PLACEMENTS } from "../src/bph-upgrades";

for (const [width, height] of [[390, 844], [900, 1266], [1440, 900]]) {
  test(`cold upgrade view keeps the placement tooltip and cost visible at ${width}x${height}`, async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, resolve(process.env.CASTLE_CODEX_DIST ?? resolve(import.meta.dir, "../review-dist"))),
    });
    const profile = await mkdtemp(`${tmpdir()}/castle-upgrade-layout-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const evidence = process.env.CASTLE_LAYOUT_EVIDENCE;
    const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + 30000;
      const check = () => {
        if (${expression}) requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
        else if (performance.now() > end) reject(new Error("UI timeout: " + ${JSON.stringify(expression)}));
        else requestAnimationFrame(check);
      }; check();
    })`);
    try {
      await phone.view.cdp("Network.enable");
      await phone.view.cdp("Network.setCacheDisabled", { cacheDisabled: true });
      await phone.view.navigate(process.env.CASTLE_LAYOUT_URL ?? `http://127.0.0.1:${server.port}/?seed=7`);
      await phone.evaluate("localStorage.clear()");
      await phone.view.navigate(process.env.CASTLE_LAYOUT_URL ?? `http://127.0.0.1:${server.port}/?seed=7`);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      await phone.evaluate("(() => { performance.clearResourceTimings(); performance.setResourceTimingBufferSize(10000); })()");
      expect(await phone.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await phone.evaluate(`performance.getEntriesByType("resource").some(e => /bph-upgrade-view.*\\.js/.test(e.name))`)).toBe(false);
      expect(await phone.tapElement(".bph-actions button")).toBe(true);
      const starter = ".bph-placement-tooltip:popover-open";
      const shared = '[data-prep-tab="shared"]';
      const starterNode = 'button[data-placement="_SkillTreeMain_Demo:23:15"]';
      const openShared = async () => {
        await ready(`document.querySelector(${JSON.stringify(shared)})`);
        await ready(`document.querySelector(${JSON.stringify(starterNode)})`);
        await phone.evaluate(`document.querySelector(${JSON.stringify(starterNode)}).scrollIntoView({block:"nearest",inline:"nearest"})`);
        expect(await phone.tapElement(starterNode)).toBe(true);
        await ready(`document.querySelector(${JSON.stringify(starter)})`);
      };
      await openShared();
      await ready("[...document.querySelectorAll('.bph-web-wallet > img')].every(image => image.complete && image.naturalWidth > 0)");
      const measure = async () => {
        await phone.evaluate(`Promise.all(document.querySelector('.bph-management').getAnimations({subtree:true})
          .filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished))`);
        return phone.evaluate(`(() => {
        const rect = selector => {
          const element = document.querySelector(selector), r = element.getBoundingClientRect(), css = getComputedStyle(element);
          return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom,
            display: css.display, flex: css.flex, maxHeight: css.maxHeight, scrollTop: element.scrollTop };
        };
        const button = document.querySelector(${JSON.stringify(starter)}), r = button.getBoundingClientRect();
        const footer = document.querySelector(".bph-management footer").getBoundingClientRect();
        const start = document.querySelector("[data-bph-start]"), startBox = start.getBoundingClientRect();
        const cost = ${JSON.stringify(`${starter} .bph-placement-cost`)};
        return { viewport: [innerWidth, innerHeight], buy: rect(${JSON.stringify(starter)}), cost: document.querySelector(cost) && rect(cost),
          root: rect(".bph-web"), body: rect(".bph-management-body"),
          footer: rect(".bph-management footer"),
          wallet: [...document.querySelectorAll(".bph-web-wallet > img")].map(image => image.getAttribute("src")),
          frameResolved: getComputedStyle(document.documentElement).getPropertyValue("--frame")
            .includes(new URL("./art/icons/timber-frame.webp", document.baseURI).href),
          menusClear: [...document.querySelectorAll('.bph-actions button, .bph-web-wallet')]
            .filter(element => element.checkVisibility()).every(element => {
            const box = element.getBoundingClientRect(), owner = element.closest('.bph-management').getBoundingClientRect();
            return box.width > 0 && box.height > 0 &&
              box.left >= owner.left && box.right <= owner.right && box.top >= owner.top && box.bottom <= owner.bottom;
          }),
          gaugeBoxSizing: getComputedStyle(document.querySelector(".bar"), "::before").boxSizing,
          resultMastery: document.querySelector(".stats [data-icon='mastery']")?.getAttribute("src"),
          inViewport: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
            && r.left >= 0 && r.right <= innerWidth,
          panelContainsCost: (() => {
            const panel = r, rCost = button.querySelector(".bph-placement-cost").getBoundingClientRect();
            return rCost.top >= panel.top && rCost.bottom <= panel.bottom && rCost.left >= panel.left && rCost.right <= panel.right;
          })(),
          hit: button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
          startHit: start.contains(document.elementFromPoint(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2)),
          styles: [...document.styleSheets].map(s => s.href),
          chunks: performance.getEntriesByType("resource").filter(e => /bph-upgrade-view.*\\.js/.test(e.name)).map(e => e.name) };
      })()`);
      };
      const initial = await measure();
      if (evidence) {
        await mkdir(evidence, { recursive: true });
        await phone.shot(`${evidence}/upgrade-${width}x${height}.png`);
        const diagnosis = process.env.CASTLE_LAYOUT_DIAGNOSE
          ? await phone.evaluate(`(() => {
              const root = document.querySelector(".bph-web"), host = root.parentElement;
              const before = { hostClass: host.className, hostHeight: host.getBoundingClientRect().height,
                direct: root.parentElement.matches(".bph-side") };
              host.replaceWith(root);
              const buy = document.querySelector(${JSON.stringify(starter)}).getBoundingClientRect();
              return { before, after: { panelHeight: buy.height,
                buyY: buy.y, buyBottom: buy.bottom } };
            })()`) : undefined;
        await Bun.write(`${evidence}/layout-${width}x${height}.json`, JSON.stringify({ initial, diagnosis, errors: phone.errors }, null, 2));
      }
      expect(await phone.evaluate(`performance.getEntriesByType("resource").some(e => /bph-upgrade-view.*\\.js/.test(e.name))`)).toBe(true);
      // Geometry and hit testing catch both offscreen placement and footer occlusion.
      expect(initial).toMatchObject({ inViewport: true, hit: true, startHit: true, panelContainsCost: true,
        menusClear: true,
        wallet: ["./art/icons/star-mastery.webp"], frameResolved: true,
        gaugeBoxSizing: "border-box", resultMastery: "./art/icons/star-mastery.webp" });
      expect(initial).toMatchObject({ cost: { width: expect.any(Number), height: expect.any(Number) } });
      expect(await phone.evaluate(`(() => {
        const buy = document.querySelector(${JSON.stringify(starter)}), b = buy.getBoundingClientRect();
        const cost = buy.querySelector(".bph-placement-cost"), c = cost.getBoundingClientRect();
        return c.width > 0 && c.height > 0 && c.left >= b.left && c.right <= b.right &&
          c.top >= b.top && c.bottom <= b.bottom && cost.textContent === "1";
      })()`)).toBe(true);
      expect(await phone.evaluate(`Array.from(document.querySelectorAll('.bph-web img')).every(image =>
        getComputedStyle(image).backgroundColor === 'rgba(0, 0, 0, 0)')`)).toBe(true);
      // Late-game rows and capped controls must still fit above the outer footer.
      const lateMeta = freshMeta(), lateSave = freshBphSave();
      lateSave.purchasedPlacements = [...BPH_PLACEMENTS.keys()];
      lateSave.resources.mastery = 13_500_000; lateSave.resources.foilium = 9;
      lateMeta.bph = lateSave;
      await phone.evaluate(`localStorage.setItem('haengju1593-meta', ${JSON.stringify(JSON.stringify(lateMeta))})`);
      await phone.view.navigate(process.env.CASTLE_LAYOUT_URL ?? `http://127.0.0.1:${server.port}/?seed=7`);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      expect(await phone.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await phone.tapElement(".bph-actions button")).toBe(true);
      await openShared();
      await ready("[...document.querySelectorAll('.bph-web img')].every(image => image.complete && image.naturalWidth > 0)");
      const late = await measure();
      if (evidence) {
        await phone.shot(`${evidence}/late-upgrade-${width}x${height}.png`);
        await Bun.write(`${evidence}/late-layout-${width}x${height}.json`, JSON.stringify(late, null, 2));
      }
      expect(late).toMatchObject({ inViewport: true, hit: true, menusClear: true, panelContainsCost: true });
      // A viewport-anchored tooltip may overlap the footer. Dismissing it must restore the start hit target.
      await phone.view.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await phone.view.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await ready(`!document.querySelector(${JSON.stringify(starter)})`);
      expect(await phone.evaluate(`(() => {
        const start = document.querySelector("[data-bph-start]"), r = start.getBoundingClientRect();
        return start.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })()`)).toBe(true);
      expect(phone.errors).toEqual([]);
    } finally {
      phone.view.close(); server.stop(true);
      await rm(profile, { recursive: true, force: true });
    }
  });
}
