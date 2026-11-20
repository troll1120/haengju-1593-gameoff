import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { freshBphSave } from "../src/bph-save";
import { reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";

test("title settings cancel preserves a purchase; reset restores fresh play and keeps audio and language", async () => {
  const dist = process.env.CASTLE_PUBLIC_DIST ?? resolve(import.meta.dir, "../review-dist");
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, dist) });
  const browser = reviewBrowserSession();
  try {
    const phone = await browser.open(390, 844);
    const url = `http://127.0.0.1:${server.port}/`;
    const ready = (expression: string) => phone.evaluate(`new Promise((ok, fail) => {
      const deadline = performance.now() + 20000;
      function check() { if (${expression}) ok(true);
        else if (performance.now() > deadline) fail(new Error(${JSON.stringify(expression)}));
        else requestAnimationFrame(check); }
      check();
    })`);
    const tap = async (selector: string) => expect(await phone.tapElement(selector), selector).toBe(true);
    const titleReady = `window.castleSample?.snapshot().attract && !document.querySelector('#start').disabled`;
    const meta = `JSON.parse(localStorage.getItem('haengju1593-meta'))`;
    const gameKeys = ["haengju1593", "haengju1593-meta", "haengju1593.damageNumbersOn"];
    const gameValues = `(${JSON.stringify(gameKeys)}).map(key => localStorage.getItem(key))`;
    await phone.view.navigate(url);
    const bph = freshBphSave();
    bph.resources.mastery = 10000;
    bph.discovered.push("Hero1_Squire");
    bph.seen.push("Hero1_Squire");
    await phone.evaluate(`(() => {
      localStorage.setItem('haengju1593-meta', ${JSON.stringify(JSON.stringify({ version: 4, bph }))});
      localStorage.setItem('haengju1593', JSON.stringify({ firstBattleGuide: true, muted: true, motionOff: true, record: { plays: 8 } }));
      localStorage.setItem('haengju1593.damageNumbersOn', 'on');
      localStorage.setItem('haengju-audio-bgm-volume', '32');
      localStorage.setItem('haengju-audio-sfx-volume', '47');
      localStorage.setItem('haengju1593-lang', 'ko');
      localStorage.setItem('unrelated-host-key', 'keep');
    })()`);
    await phone.view.navigate(url);
    await ready(titleReady);
    await tap("#barracks-open");
    await ready(`document.querySelector('[data-prep-tab="militia"]')`);
    await tap('[data-prep-tab="militia"]');
    await tap('button[data-card="Hero1_Squire"]');
    const buy = '.bph-prep-detail [aria-label="병력 강화"] .ur-buy:not(:disabled)';
    await ready(`document.querySelector(${JSON.stringify(buy)})`);
    await tap(buy);
    expect(await phone.evaluate(`${meta}.bph.resources.mastery`)).toBeLessThan(10000);
    expect(await phone.evaluate(`Object.keys(${meta}.bph.unitUpgrades).length`)).toBeGreaterThan(0);
    // Reopen the title with the persisted purchase, independent of shop panel navigation.
    await phone.view.navigate(url);
    await ready(titleReady);
    await tap("#title-settings");
    await ready(`!document.querySelector('#intro').hidden && !document.querySelector('#reset-records').hidden`);
    expect(await phone.evaluate("document.querySelector('#reset-records').textContent")).toBe("기록 초기화");
    await tap("#toggle-lang");
    expect(await phone.evaluate("document.querySelector('#reset-records').textContent")).toBe("Reset records");
    await tap("#toggle-lang");
    const out = process.env.CASTLE_CAPTURE_DIR;
    if (out) {
      await mkdir(out, { recursive: true });
      await phone.evaluate(`Promise.all(document.querySelector('#intro').getAnimations().map(animation => animation.finished))`);
      await phone.shot(resolve(out, "settings-390x844.png"));
    }
    const before = await phone.evaluate(gameValues);
    await tap("#reset-records");
    expect(await phone.evaluate("document.querySelector('#reset-dialog').open")).toBe(true);
    if (out) await phone.shot(resolve(out, "reset-confirmation-390x844.png"));
    await tap("#reset-dialog button[autofocus]");
    expect(await phone.evaluate(gameValues)).toEqual(before);
    expect(await phone.evaluate("document.querySelector('#intro').hidden")).toBe(false);
    await phone.evaluate("window.beforeReset = true");
    await tap("#reset-records");
    await tap("#confirm-reset");
    await ready(`!window.beforeReset && ${titleReady}`);
    expect(await phone.evaluate(gameValues)).toEqual([null, null, null]);
    expect(await phone.evaluate(`[
      document.documentElement.lang, castleSample.snapshot().sound.muted,
      document.querySelector('#volume-bgm').value, document.querySelector('#volume-sfx').value,
      localStorage.getItem('unrelated-host-key'), document.querySelector('#intro').hidden
    ]`)).toEqual(["ko", true, "32", "47", "keep", true]);
    await tap("#start");
    await ready(`document.querySelector('[data-bph-start]')`);
    await tap("[data-bph-start]");
    await ready(`!castleSample.snapshot().attract && document.querySelector('.first-battle-guide')`);
    await tap("#first-guide-skip");
    await tap("#pause");
    expect(await phone.evaluate("document.querySelector('#reset-records').hidden")).toBe(true);
  } finally {
    await browser.close();
    server.stop(true);
  }
}, 120000);
