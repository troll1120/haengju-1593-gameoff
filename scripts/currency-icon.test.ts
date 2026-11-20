import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

// Compare the actual Canvas texture keys with the DOM asset below. This protects
// the cross-renderer image-path contract, including the flying coin reward.
test("Canvas HUD and flying rewards use the same currency image", async () => {
  const main = await Bun.file(resolve(import.meta.dir, "../src/main.ts")).text();
  const hud = main.match(/painted\.draw\(this\.goldHud, "([^"]+)"/)?.[1];
  const reward = main.match(/coin\.setTexture\("painted:([^"]+)"/)?.[1];
  expect(hud).toBe("coin-hud-pixels");
  expect(reward).toBe(hud);
});

// The shared currency's shipped image path is a user-facing visual contract.
for (const [width, height] of [[390, 844], [1440, 900]]) {
  test(`HUD and all coin prices share the gold asset at ${width}x${height}`, async () => {
    const root = resolve(import.meta.dir, "..");
    const out = process.env.CASTLE_COIN_EVIDENCE ?? "/tmp/castle-currency-icon";
    await mkdir(out, { recursive: true });
    const profile = await mkdtemp(`${tmpdir()}/castle-coin-`);
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, process.env.CASTLE_TEST_DIST ?? `${root}/review-dist`) });
    const page = await launch("about:blank", profile, width, height,
      ["--single-process", "--no-zygote", "--disable-gpu"]);
    const ready = (expression: string) => page.evaluate(`new Promise((resolve, reject) => {
      const deadline = performance.now() + 25000;
      function check() {
        if (${expression}) resolve(true);
        else if (performance.now() > deadline) reject(new Error(${JSON.stringify(expression)}));
        else requestAnimationFrame(check);
      } check();
    })`);
    try {
      await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
      await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
      expect(await page.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await page.tapElement("[data-bph-start]")).toBe(true);
      await ready("!castleSample.snapshot().attract");
      await passFirstBattleGuide(page);
      await ready("!castleSample.snapshot().paused && document.querySelector('.bph-recruit-strip > .bph-recruit-cell .bph-smithy-price img')");
      await page.shot(`${out}/battle-${width}x${height}.png`);
      const icons = await page.evaluate(`(() => {
        const price = document.querySelector('.bph-recruit-strip > .bph-recruit-cell .bph-smithy-price img');
        const result = document.querySelector('#result [data-icon="coin"]');
        return [price.getAttribute('src'), result.getAttribute('src')];
      })()`);
      expect(icons).toEqual(["./art/icons/coin-hud-pixels.webp", "./art/icons/coin-hud-pixels.webp"]);
      const before = Number(await page.evaluate("castleSample.snapshot().gold"));
      const price = Number(await page.evaluate("document.querySelector('.bph-recruit-cell .bph-price').textContent"));
      expect(await page.tapElement(".bph-recruit-strip > .bph-recruit-cell")).toBe(true);
      await ready(`castleSample.snapshot().bph.bought.Pack1_Basic === 1
        && !document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden`);
      const after = Number(await page.evaluate("castleSample.snapshot().gold"));
      expect(await page.evaluate(`(() => {
        const button = document.querySelector('.bph-recruit-strip > .bph-recruit-cell');
        const coin = button.querySelector('.bph-smithy-price img');
        return { disabled: button.disabled, buttonOpacity: getComputedStyle(button).opacity,
          coinOpacity: getComputedStyle(coin).opacity, filter: getComputedStyle(coin).filter };
      })()`)).toEqual({ disabled: after < price, buttonOpacity: after < price ? "0.55" : "1", coinOpacity: "1", filter: "none" });
      await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      await page.shot(`${out}/receipt-${width}x${height}.png`);
      expect(after).toBeGreaterThanOrEqual(before - price);
      expect(page.errors).toEqual([]);
    } finally {
      page.view.close(); server.stop(true);
      await rm(profile, { recursive: true });
    }
  }, 60000);
}
