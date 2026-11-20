import { afterAll, beforeAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { passFirstBattleGuide, reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";

const session = reviewBrowserSession();
let base: string;
let stopServer: (() => void) | undefined;
beforeAll(async () => {
  const suppliedUrl = process.env.CASTLE_WEATHER_URL;
  if (suppliedUrl) { base = suppliedUrl; return; }
  const dist = resolve(process.env.CASTLE_TEST_DIST ?? `${import.meta.dir}/../review-dist`);
  if (!await Bun.file(resolve(dist, "index.html")).exists())
    throw new Error(`Missing weather preview at ${dist}. Build review-dist or set CASTLE_TEST_DIST.`);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, dist) });
  base = server.url.origin;
  stopServer = () => server.stop(true);
});
afterAll(async () => {
  try { await session.close(); } finally { stopServer?.(); }
});
const evidence = process.env.CASTLE_WEATHER_EVIDENCE;

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
test(`${width}x${height} rain guidance expires, reopens on touch, and leaves combat controls clear`, async () => {
  const phone = await session.open(width, height);
  async function capture(state: string) {
    if (!evidence) return;
    await phone.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await phone.shot(`${evidence}/${state}-${width}x${height}.png`);
  }
  const until = (condition: string) => phone.evaluate(`new Promise((resolve, reject) => {
    let timer;
    const observer = new MutationObserver(check);
    function check() {
      if (${condition}) { observer.disconnect(); clearTimeout(timer); resolve(true); }
    }
    observer.observe(document, { subtree: true, attributes: true, childList: true });
    timer = setTimeout(() => { observer.disconnect(); reject(new Error("Weather UI condition timed out")); }, 12000);
    check();
  })`);
  try {
    await phone.view.navigate(base);
    await phone.evaluate(`localStorage.setItem("haengju1593-lang", "ko")`);
    for (const [seed, rain] of [[1, true], [9999, false]] as const) {
      await phone.view.navigate(`${base}/?seed=${seed}`);
      await until(`!document.querySelector("#start").disabled`);
      expect(await phone.tapElement("#start")).toBe(true);
      await until(`Boolean(document.querySelector("[data-bph-start]"))`);
      expect(await phone.tapElement("[data-bph-start]")).toBe(true);
      await passFirstBattleGuide(phone);
      await until(`document.querySelector("#title").hidden`);
      expect(await phone.evaluate(`document.querySelector("#weather").hidden`)).toBe(!rain);
      expect(await phone.evaluate(`document.querySelector("#weather-banner").hidden`)).toBe(!rain);
      if (rain) {
        expect(await phone.evaluate(`document.querySelector("#weather-banner").textContent`))
          .toBe("🌧 비 — 불 공격 약화, 적 느려짐");
        await capture("rain-start");
        await until(`document.querySelector("#weather-banner").hidden`);
        expect(await phone.tapElement("#weather")).toBe(true);
        expect(await phone.evaluate(`document.querySelector("#weather-banner").hidden`)).toBe(false);
        await capture("rain-tapped");
        const box = await phone.rect("#weather");
        expect(box?.w).toBeGreaterThanOrEqual(44);
        expect(box?.h).toBeGreaterThanOrEqual(44);
        expect(await phone.evaluate(`(() => {
          const a = document.querySelector("#weather").getBoundingClientRect();
          return [...document.querySelectorAll("#skills button, .bph-recruit-strip > .bph-recruit-cell, #recruits button")]
            .filter(e => !e.closest("[hidden]")).filter(e => {
              const b = e.getBoundingClientRect();
              return b.width && b.height && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            }).length;
        })()`)).toBe(0);
        await until(`document.querySelector("#weather-banner").hidden`);
        await capture("rain-idle");
        expect(await phone.tapElement("#pause")).toBe(true);
        expect(await phone.tapElement("#toggle-lang")).toBe(true);
        expect(await phone.tapElement("#resume")).toBe(true);
        expect(await phone.tapElement("#weather")).toBe(true);
        expect(await phone.evaluate(`document.querySelector("#weather-banner").textContent`))
          .toBe("Rain — fire attacks weaker, enemies slower");
        await capture("rain-en");
      } else await capture("clear");
    }
    expect(phone.errors).toEqual([]);
  } finally {
    await phone.evaluate("localStorage.clear()");
    await session.reset();
  }
}, 25000);
}
