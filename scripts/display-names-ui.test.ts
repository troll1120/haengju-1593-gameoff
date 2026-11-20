import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_CODEX_DISCOVERY_GOLD } from "../src/bph-codex-rewards";
import { BPH_UPGRADE_GRIDS } from "../src/bph-upgrade-data";

const evidence = process.env.CASTLE_DISPLAY_EVIDENCE;
for (const [width, height] of [[390, 844], [1440, 900]]) {
  test(`built Korean/English skill, shop and recruit UI at ${width}x${height}`, async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, resolve(process.env.CASTLE_CODEX_DIST ?? resolve(import.meta.dir, "../review-dist"))) });
    const profile = await mkdtemp(`${tmpdir()}/castle-display-names-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const url = `http://127.0.0.1:${server.port}/?seed=7`;
    const ready = (condition: string) => phone.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+30000;
      function frame(){
        if(${condition}) return requestAnimationFrame(()=>resolve(true));
        if(performance.now()>end) return reject(new Error("Display UI timeout: "+${JSON.stringify(condition)}));
        requestAnimationFrame(frame);
      } frame();
    })`);
    const tap = async (selector: string) => expect(await phone.tapElement(selector)).toBe(true);
  const checkUpgradeNames = async (label: string) => {
    await ready("document.querySelector('[data-prep-group=\"shared\"]')");
    const tabs = await phone.evaluate("[...document.querySelectorAll('[data-prep-tab]:not([data-locked])')].map(tab => tab.dataset.prepTab)");
    if (!Array.isArray(tabs)) throw new Error("Missing Prep upgrade tabs");
    expect(tabs).toEqual(["shared", "militia", "government", "elite", "general"]);
    const labels: unknown[] = [];
    const node = `button[data-placement][aria-label*="${label}"]`;
    let target: string | undefined;
    for (const id of tabs) {
      const tab = `[data-prep-tab="${id}"]`;
      await phone.evaluate(`document.querySelector(${JSON.stringify(tab)}).scrollIntoView({block:"nearest",inline:"nearest"})`);
      await tap(tab);
      labels.push(await phone.evaluate(`[...document.querySelectorAll("button[data-placement]")].map(e=>e.getAttribute("aria-label"))`));
      if (await phone.evaluate(`Boolean(document.querySelector(${JSON.stringify(node)}))`)) target = tab;
    }
    expect(JSON.stringify(labels)).not.toContain("책략");
    expect(JSON.stringify(labels)).toContain(label);
    if (!target) throw new Error(`No upgrade tab contains ${label}`);
    await phone.evaluate(`document.querySelector(${JSON.stringify(target)}).scrollIntoView({block:"nearest",inline:"nearest"})`);
    await tap(target);
    await phone.evaluate(`document.querySelector(${JSON.stringify(node)}).scrollIntoView({block:"center",inline:"nearest"})`);
    await tap(node);
    expect(await phone.evaluate("document.querySelector('.bph-placement-tooltip strong').textContent")).toContain(label);
    return labels;
  };
    const captures: unknown[] = [];
    try {
      if (evidence) await mkdir(evidence, { recursive: true });
      await phone.view.navigate(url);
      const boardSave = freshBphSave(7);
      boardSave.dimension = 3;
      boardSave.discovered = ["Hero1_Squire", "Hero2_Knight", "Hero3_WitchDoctor"];
      boardSave.purchasedPlacements = BPH_UPGRADE_GRIDS.flatMap(grid => grid.placements.filter(p => p.nodeId).map(p => p.id));
      const boardMeta = { ...freshMeta(), version: 4, bph: boardSave };
      await phone.evaluate(`(() => { localStorage.setItem("haengju1593-lang","ko");
        localStorage.setItem("haengju1593-meta",${JSON.stringify(JSON.stringify(boardMeta))}); return true; })()`);
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
      await tap("#start");
      await ready("document.querySelector('[data-bph-start]')");
      await tap(".bph-actions button");
      const shopLabels = await checkUpgradeNames("전술");
      if (evidence) await phone.shot(`${evidence}/shop-ko-${width}.png`);
      await tap('.bph-actions button[aria-pressed="true"]');
      await tap(".bph-management header button");
      await tap("#title-settings");
      await tap("#toggle-lang");
      await tap("#settings-close");
      await tap("#start");
      await ready("document.querySelector('[data-bph-start]')");
      await tap(".bph-actions button");
      const englishShopLabels = await checkUpgradeNames("Tactic");
      if (evidence) await phone.shot(`${evidence}/shop-en-${width}.png`);
      // Reset the disposable account before the purchase check; board fixture effects never affect it.
      await phone.evaluate(`localStorage.setItem("haengju1593-meta",${JSON.stringify(JSON.stringify(freshMeta()))})`);
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
      await tap("#start");
      await ready("document.querySelector('[data-bph-start]')");
      await tap("[data-bph-start]");
      await passFirstBattleGuide(phone);
      await ready("castleSample.snapshot().time>0 && document.querySelector('.bph-recruit-strip > .bph-recruit-cell')");
      await tap("#pause");
      await tap("#toggle-lang");
      expect(await phone.evaluate(`document.querySelector(".bph-recruit-strip > .bph-recruit-cell").getAttribute("aria-label")`)).toMatch(/^기본 병력 모집 \d+$/);
      expect(await phone.evaluate(`document.querySelector(".bph-recruit-strip > .bph-recruit-cell").textContent`)).toMatch(/^\d+$/);
      await tap("#resume");
      if (evidence) await phone.shot(`${evidence}/recruit-ko-${width}.png`);
      await tap("#pause");
      // Disposable rendering fixture: these two legacy generals are outside the survival selection roster.
      // Reuse the existing live snapshot and language controls to exercise main.ts's real skill renderer.
      for (const lang of ["ko", "en"]) {
        for (const [general, expected] of [
          ["정발", lang === "ko" ? "산성 돌격" : "Fortress Charge"],
          ["이정헌", lang === "ko" ? "행주 화시" : "Haengju Fire Arrows"],
        ]) {
          await phone.evaluate(`castleSample.snapshot().squads[0].general=${JSON.stringify(general)}`);
          await tap("#toggle-lang");
          if (await phone.evaluate("document.documentElement.lang") !== lang) await tap("#toggle-lang");
          await ready(`document.querySelector("#skills button")?.getAttribute("aria-label").includes(${JSON.stringify(expected)})`);
          const label = await phone.evaluate(`document.querySelector("#skills button").getAttribute("aria-label")`);
          expect(String(label)).toContain(expected);
          expect(String(label)).not.toMatch(/Busan|부산|책략/i);
          await tap("#resume");
          if (evidence) await phone.shot(`${evidence}/skill-${general === "정발" ? "charge" : "arrows"}-${lang}-${width}.png`);
          captures.push({ lang, general, label });
          await tap("#pause");
        }
      }
      await phone.evaluate(`castleSample.snapshot().squads[0].general="권율"`);
      await tap("#resume");
      const wallet = `(() => {
        const run = castleSample.snapshot(), save = run.bph.save, rewards = save.codexRewards;
        const discoveries = rewards.claimed.filter(id => id.startsWith("discovery:")).length;
        return JSON.stringify({gold:run.gold, opened:save.totalOpened, earned:run.earned,
          discoveryGold:discoveries * ${BPH_CODEX_DISCOVERY_GOLD} - rewards.pendingGold});
      })()`;
      const before = await phone.evaluate(wallet);
      const price = Number(await phone.evaluate(`document.querySelector(".bph-recruit-strip > .bph-recruit-cell").querySelector(".bph-price").textContent`));
      await tap(".bph-recruit-strip > .bph-recruit-cell");
      const purchase = await phone.evaluate(wallet);
      const previous = JSON.parse(String(before)), current = JSON.parse(String(purchase));
      expect(current.gold).toBe(previous.gold - price + current.discoveryGold - previous.discoveryGold + current.earned - previous.earned);
      expect(current.opened).toBe(previous.opened + 1);
      expect(await phone.evaluate(`document.querySelector(".bph-recruit-strip > .bph-recruit-cell").getAttribute("aria-label")`)).toMatch(/^Basic Recruit \d+$/);
      expect(await phone.evaluate(`document.querySelector(".bph-recruit-strip > .bph-recruit-cell").textContent`)).toMatch(/^\d+$/);
      if (evidence) {
        await phone.shot(`${evidence}/recruit-en-${width}.png`);
        await Bun.write(`${evidence}/ui-${width}.json`, JSON.stringify({ width, height, shopLabels, englishShopLabels, captures, price, before: previous, after: current, errors: phone.errors }, null, 2));
      }
      expect(phone.errors).toEqual([]);
    } finally {
      phone.view.close(); server.stop(true);
      await rm(profile, { recursive: true, force: true });
    }
  }, 120000);
}
