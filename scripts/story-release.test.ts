import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";

test("public release blocks story, including stale mode and direct links, and starts Survival", async () => {
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
    const tap = async (selector: string) => expect(await phone.tapElement(selector)).toBe(true);
    await phone.view.navigate(url);
    await phone.evaluate(`(() => {
      localStorage.setItem('haengju1593-lang', 'ko');
      localStorage.setItem('haengju1593', JSON.stringify({story: true, lastMode: 'story', firstBattleGuide: true}));
    })()`);
    await phone.view.navigate(`${url}?mode=story&stage=2&continue=1&sandbox=1#story`);
    await ready(`window.castleSample?.snapshot().attract && !document.querySelector('#start').disabled`);
    expect(await phone.evaluate("document.querySelector('#pick').hidden && document.querySelector('#story').hidden")).toBe(true);
    await phone.evaluate("document.querySelector('#story').click()");
    expect(await phone.evaluate("document.querySelector('#pick').hidden")).toBe(true);
    await tap("#story-mode");
    expect(await phone.evaluate("document.querySelector('#story-dialog[open] p').textContent")).toBe("스토리모드는 준비중입니다");
    const out = process.env.CASTLE_CAPTURE_DIR;
    if (out) { await mkdir(out, { recursive: true }); await phone.shot(resolve(out, "story-coming-soon-390x844.png")); }
    await tap("#story-dialog button");
    expect(await phone.evaluate("document.querySelector('#story-dialog').open")).toBe(false);
    expect(await phone.evaluate("document.activeElement.id")).toBe("story-mode");
    await tap("#title-settings");
    await tap("#toggle-lang");
    await tap("#settings-close");
    await tap("#story-mode");
    expect(await phone.evaluate("document.querySelector('#story-dialog[open] p').textContent")).toBe("Story mode is coming soon");
    await tap("#story-dialog button");
    await tap("#start");
    await ready(`document.querySelector('[data-bph-start]')`);
    await tap("[data-bph-start]");
    await ready(`!castleSample.snapshot().attract && castleSample.snapshot().bph?.survival`);
    await tap("#pause");
    await tap("#resume");
    expect(await phone.evaluate("Boolean(castleSample.snapshot().bph.survival && !castleSample.snapshot().paused)")).toBe(true);
  } finally {
    await browser.close();
    server.stop(true);
  }
}, 120000);
