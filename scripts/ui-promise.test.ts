import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

for (const lang of ["ko", "en"] as const) {
  for (const check of ["shortcut", "blocker", "milestones"] as const) {
  test(`${check} explains its actual UI behavior in ${lang}`, async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, resolve(process.env.CASTLE_CODEX_DIST ?? resolve(import.meta.dir, "../review-dist"))) });
    const profile = await mkdtemp(`${tmpdir()}/castle-promise-upgrade-`);
    const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const base = process.env.CASTLE_PROMISE_URL ?? `http://127.0.0.1:${server.port}/`;
    const ready = (condition: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const deadline = performance.now() + 25000;
      function check() {
        if (${condition}) return resolve(true);
        if (performance.now() > deadline) return reject(new Error("UI condition: " + ${JSON.stringify(condition)}));
        requestAnimationFrame(check);
      } check();
    })`);
    try {
      await phone.view.navigate(base);
      await phone.evaluate(`localStorage.setItem("haengju1593-lang", "${lang}")`);
      await phone.view.navigate(`${base}?seed=7`);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      expect(await phone.tapElement("#barracks-open")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      if (check === "shortcut") {
      expect(await phone.evaluate("document.querySelector('[data-bph-tab=\"upgrades\"]').getAttribute('aria-pressed')")).toBe("true");
      } else if (await phone.evaluate("document.querySelector('[data-bph-tab=\"upgrades\"]').getAttribute('aria-pressed')") !== "true") {
        expect(await phone.tapElement('[data-bph-tab="upgrades"]')).toBe(true);
      }
      const shared = '[data-prep-tab="shared"]';
      await ready(`document.querySelector(${JSON.stringify(shared)})`);
      const node = 'button[data-placement="_SkillTreeMain_Demo:23:15"]';
      await ready(`document.querySelector(${JSON.stringify(node)})`);
      await phone.evaluate(`document.querySelector(${JSON.stringify(node)}).scrollIntoView({block:"nearest",inline:"nearest"})`);
      expect(await phone.tapElement(node)).toBe(true);
      const first = ".bph-placement-tooltip:popover-open";
      await ready(`document.querySelector(${JSON.stringify(first)})`);
      if (check === "blocker") {
      expect(await phone.evaluate(`document.querySelector(${JSON.stringify(first)}).dataset.short`)).toBe("true");
      expect(await phone.evaluate(`document.querySelector(${JSON.stringify(first)}).querySelector(".bph-placement-cost img").alt`))
        .toBe(lang === "ko" ? "강화 포인트" : "Upgrade Points");
      expect(await phone.evaluate(`document.querySelector(${JSON.stringify(first)}).querySelector(".bph-placement-cost").textContent`)).toBe("1");
      await phone.evaluate(`Promise.all(document.getAnimations().filter(a =>
        a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished))`);
      expect(await phone.evaluate(`(() => {
        const b = document.querySelector(${JSON.stringify(first)}).getBoundingClientRect();
        return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight;
      })()`)).toBe(true);
      }
      if (check === "milestones") {
      expect(await phone.tapElement(".bph-back")).toBe(true);
      expect(await phone.tapElement("#codex-open")).toBe(true);
      await ready("document.querySelector('.bph-codex-page')");
      expect(await phone.evaluate("document.querySelector('.bph-codex-page').innerText")).not.toContain(lang === "ko"
        ? "수집 달성 기록입니다. 칭호나 초상틀 외형은 바뀌지 않습니다."
        : "These record collection milestones. They do not change titles or portrait frames.");
      }
      expect(phone.errors).toEqual([]);
    } finally {
      phone.view.close(); server.stop(true); await rm(profile, { recursive: true, force: true });
    }
  }, 60000);
  }

  test(`an unaffordable recruit pack shows its price and becomes purchasable in ${lang}`, async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, resolve(process.env.CASTLE_CODEX_DIST ?? resolve(import.meta.dir, "../review-dist"))) });
    const profile = await mkdtemp(`${tmpdir()}/castle-promise-recruit-`);
    const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const base = process.env.CASTLE_PROMISE_URL ?? `http://127.0.0.1:${server.port}/`;
    const ready = (condition: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const deadline = performance.now() + 25000;
      function check() {
        if (${condition}) return resolve(true);
        if (performance.now() > deadline) return reject(new Error("UI condition: " + ${JSON.stringify(condition)}));
        requestAnimationFrame(check);
      } check();
    })`);
    try {
      await phone.view.navigate(base);
      await phone.evaluate(`localStorage.setItem("haengju1593-lang", "${lang}")`);
      await phone.view.navigate(`${base}?seed=7`);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      expect(await phone.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await phone.tapElement("[data-bph-start]")).toBe(true);
      await passFirstBattleGuide(phone);
      await ready("!castleSample.snapshot().paused && document.querySelector('.bph-recruit-strip > .bph-recruit-cell')");
      const price = Number(await phone.evaluate("document.querySelector('.bph-recruit-strip > .bph-recruit-cell .bph-price').textContent"));
      expect(price).toBeGreaterThan(0);
      const unaffordable = Number(await phone.evaluate(`(() => {
        const run = castleSample.snapshot();
        const offer = run.bph.recruitShop.offers[0];
        return offer.price = Math.max(run.gold + 100, ${price} + 100);
      })()`));
      await ready("document.querySelector('.bph-recruit-strip > .bph-recruit-cell').disabled");
      expect(await phone.evaluate("document.querySelector('.bph-recruit-strip > .bph-recruit-cell').getAttribute('aria-label')"))
        .toBe(`${lang === "ko" ? "기본 병력 모집" : "Basic Recruit"} ${unaffordable}`);
      await phone.evaluate(`castleSample.snapshot().bph.recruitShop.offers[0].price = ${price}`);
      await ready("!document.querySelector('.bph-recruit-strip > .bph-recruit-cell').disabled");
      await phone.evaluate(`(() => {
        const pack = document.querySelector('.bph-recruit-strip > .bph-recruit-cell');
        let gold;
        pack.addEventListener('click', () => { gold = castleSample.snapshot().gold; }, { capture: true, once: true });
        pack.addEventListener('click', () => { window.recruitDebit = gold - castleSample.snapshot().gold; }, { once: true });
      })()`);
      expect(await phone.tapElement(".bph-recruit-strip > .bph-recruit-cell")).toBe(true);
      await ready("castleSample.snapshot().bph.receipts.length > 0");
      expect(await phone.evaluate("castleSample.snapshot().bph.recruitShop.purchases['Pack1_Basic:false']")).toBe(1);
      expect(await phone.evaluate("castleSample.snapshot().bph.bought.Pack1_Basic")).toBe(1);
      expect(await phone.evaluate("window.recruitDebit")).toBe(price);
      expect(phone.errors).toEqual([]);
    } finally {
      phone.view.close(); server.stop(true); await rm(profile, { recursive: true, force: true });
    }
  }, 60000);
}
