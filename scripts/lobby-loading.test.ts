import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";

for (const [width, height, dpr] of [[390, 844, 3], [1440, 900, 1]]) {
  test(`lobby loads through its disabled start button without an overlay at ${width}`, async () => {
    let release = () => {};
    const art = new Promise<void>(resolve => { release = resolve; });
    const server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      fetch: async request => {
        if (new URL(request.url).pathname.startsWith("/art-sheets/units-")) await art;
        return previewResponse(request, resolve(import.meta.dir, "../review-dist"));
      },
    });
    const profile = await mkdtemp(`${tmpdir()}/castle-lobby-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const evidence = process.env.CASTLE_LOBBY_EVIDENCE;
    const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + 30000;
      const check = () => {
        if (${expression}) requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
        else if (performance.now() > end) reject(new Error("UI timeout: " + ${JSON.stringify(expression)}));
        else requestAnimationFrame(check);
      }; check();
    })`);
    try {
      await phone.view.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: width === 390 });
      await phone.view.navigate(process.env.CASTLE_LOBBY_URL ?? `http://127.0.0.1:${server.port}/?seed=7`);
      await ready("window.castleSample");
      expect(await phone.evaluate("document.querySelector('#title-loading')")).toBeNull();
      await ready("/\\d+%/.test(document.querySelector('#start b').textContent)");
      expect(await phone.evaluate("document.querySelector('#start').disabled")).toBe(true);
      expect(await phone.evaluate("parseFloat(getComputedStyle(document.querySelector('#start')).opacity)")).toBeLessThan(1);
      expect(await phone.evaluate(`Number(document.querySelector('#start b').textContent.match(/(\\d+)%/)[1])`)).toBeGreaterThan(0);
      expect(await phone.evaluate(`(() => {
        const label = document.querySelector('#start b'), r = label.getBoundingClientRect();
        const button = document.querySelector('#start').getBoundingClientRect();
        return parseFloat(getComputedStyle(label).fontSize) >= 16 && r.left >= button.left && r.right <= button.right;
      })()`)).toBe(true);
      if (evidence) await phone.shot(`${evidence}/loading-${width}.png`);
      expect(await phone.tapElement("#start")).toBe(true);
      expect(await phone.evaluate("document.querySelector('[data-bph-start]')")).toBeNull();
      release();
      await ready("!document.querySelector('#app').classList.contains('loading')");
      expect(await phone.evaluate("document.querySelector('#start').disabled")).toBe(false);
      // Warm reload must also leave the ready lobby unobscured.
      await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
      await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
      expect(await phone.evaluate("document.querySelector('#title-loading')")).toBeNull();
      expect(await phone.evaluate("document.querySelector('#start').disabled")).toBe(false);
      for (const lang of ["ko", "en"]) {
        expect(await phone.tapElement("#title-settings")).toBe(true);
        if (await phone.evaluate("document.documentElement.lang") !== lang)
          expect(await phone.tapElement("#toggle-lang")).toBe(true);
        expect(await phone.tapElement("#settings-close")).toBe(true);
        expect(await phone.evaluate("document.querySelector('#start b').textContent")).toBe(lang === "ko" ? "서바이벌" : "Survival");
        expect(await phone.evaluate(`['#barracks-open', '#title-settings'].map(selector => {
          const button = document.querySelector(selector), label = button.querySelector('b');
          const r = label?.getBoundingClientRect();
          return !!r && r.width > 0 && r.height > 0 && label.textContent.trim().length > 0
            && parseFloat(getComputedStyle(label).fontSize) >= 16
            && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button;
        })`)).toEqual([true, true]);
        if (evidence) await phone.shot(`${evidence}/lobby-${width}-${lang}.png`);
      }
      if (width === 390) {
        // The separate battle-start gauge still uses these art slices.
        // Check painted pixels rather than trusting a CSS width or ARIA value.
        for (const share of [0, 0.5, 1]) {
          await phone.evaluate(`(() => {
            const loading = document.querySelector('#start-loading');
            loading.hidden = false; loading.style.setProperty('--share', '${share}');
          })()`);
          await ready("!document.querySelector('#start-loading').hidden");
          const png = await phone.view.screenshot({ format: "png", encoding: "buffer" });
          if (evidence) await Bun.write(`${evidence}/battle-gauge-${share * 100}.png`, png);
          const painted = await phone.evaluate(`(async () => {
            const image = new Image();
            image.src = 'data:image/png;base64,${Buffer.from(png).toString("base64")}';
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
            const r = document.querySelector('#start-loading > span').getBoundingClientRect();
            let end = 0, total = 0;
            for (let x = Math.ceil((r.left + 8) * ${dpr}); x < Math.floor((r.right - 8) * ${dpr}); x++) {
              const [red, green, blue] = ctx.getImageData(x, Math.round((r.top + 8) * ${dpr}), 1, 1).data;
              total++;
              if (red > 150 && green > 100 && red > blue * 1.3) end = total;
            }
            // Tile seams are navy. The last painted gold pixel measures fill
            // extent without counting those intentional seams as empty gauge.
            return end / total;
          })()`);
          expect(Number(painted)).toBeCloseTo(share, 1);
        }
        await phone.evaluate("document.querySelector('#start-loading').hidden = true");
      }
      expect(await phone.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(phone.errors).toEqual([]);
    } finally {
      release(); server.stop(true);
      await closeBrowser(phone.view, profile);
    }
  }, 120000);
}

test("a failed asset offers Retry and a real click reloads successfully", async () => {
  let fail = true;
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: request => fail && new URL(request.url).pathname.startsWith("/art-sheets/units-")
      ? new Response("test asset failure", { status: 503 })
      : previewResponse(request, resolve(import.meta.dir, "../review-dist")),
  });
  const profile = await mkdtemp(`${tmpdir()}/castle-lobby-retry-`);
  const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
    const end = performance.now() + 30000;
    const check = () => {
      if (${expression}) requestAnimationFrame(() => resolve(true));
      else if (performance.now() > end) reject(new Error("UI timeout: " + ${JSON.stringify(expression)}));
      else requestAnimationFrame(check);
    }; check();
  })`);
  try {
    await phone.view.cdp("Network.setUserAgentOverride", {
      userAgent: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36", acceptLanguage: "en-US", platform: "MacIntel",
    });
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    await ready("document.querySelector('#start b').textContent === 'Retry'");
    expect(await phone.evaluate("document.querySelector('#start').disabled")).toBe(false);
    expect(await phone.evaluate("document.querySelector('#title-loading')")).toBeNull();
    fail = false;
    expect(await phone.tapElement("#start")).toBe(true);
    await ready("document.querySelector('#start b').textContent === 'Survival' && !document.querySelector('#start').disabled");
    expect(await phone.evaluate("document.querySelector('#app').classList.contains('loading')")).toBe(false);
    expect(await phone.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
  } finally {
    server.stop(true);
    await closeBrowser(phone.view, profile);
  }
}, 120000);
