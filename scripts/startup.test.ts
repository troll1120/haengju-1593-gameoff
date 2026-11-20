import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, sleep, passFirstBattleGuide } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";
import { bphRecruitMultiplier } from "../src/bph-recruit";

// Real Chromium, real touch. Hold one required sprite to verify the start
// button waits for Phaser without depending on network speed.
for (const [width, height] of [[412, 915], [390, 844], [1800, 2880]]) {
  test(`Android ${width} waits for cold-start artwork and starts the chosen battle`, async () => {
    let release = () => {};
    const art = new Promise<void>(resolve => { release = resolve; });
    const server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      fetch: async request => {
        if (new URL(request.url).pathname === "/art/units/gwon_yul.png") await art;
        return previewResponse(request, resolve(import.meta.dir, "../review-dist"));
      },
    });
    const profile = await mkdtemp(`${tmpdir()}/castle-start-android-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const evidence = process.env.CASTLE_START_EVIDENCE;
    async function until(expression: string): Promise<void> {
      const end = Date.now() + 15000;
      while (!await phone.evaluate(expression)) {
        if (Date.now() >= end) throw new Error(`Browser condition timed out: ${expression}`);
        await sleep(30);
      }
    }
    try {
      await phone.view.cdp("Network.setUserAgentOverride", {
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
        platform: "Android",
      });
      await phone.view.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2.6, mobile: true });
      await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
      await until(`Boolean(window.castleSample)`);
      expect(await phone.evaluate(`document.querySelector("#start").disabled`)).toBe(true);
      expect(await phone.tapElement("#start")).toBe(true);
      expect(await phone.evaluate(`castleSample.snapshot().phase`)).toBe("ready");
      expect(await phone.evaluate(`document.querySelector("[data-bph-start]")`)).toBeNull();
      if (evidence) await phone.shot(`${evidence}/pixel-${width}-disabled-loading.png`);
      release();
      await until(`!document.querySelector("#start").disabled`);
      expect(await phone.tapElement("#start")).toBe(true);
      await until(`Boolean(document.querySelector("[data-bph-start]"))`);
      if (evidence) await phone.shot(`${evidence}/pixel-${width}-pick.png`);
      expect(await phone.tapElement("[data-bph-start]")).toBe(true);
      await passFirstBattleGuide(phone);
      expect(await phone.evaluate(`document.querySelector("#title").hidden`)).toBe(true);
      // Actual rendered hit boxes, including disabled skills, must stay disjoint.
      const overlappingControls = () => phone.evaluate(`(() => {
        const controls = [...document.querySelectorAll("#app button")].filter(e => {
          const r = e.getBoundingClientRect();
          return r.width && r.height && getComputedStyle(e).visibility !== "hidden" && !e.closest("[hidden], [inert]");
        });
        const recruit = document.querySelector(".bph-recruit-strip > .bph-recruit-cell");
        const a = recruit.getBoundingClientRect();
        return controls.filter(e => e !== recruit).flatMap(e => {
          const b = e.getBoundingClientRect();
          return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
            ? [e.id || e.className] : [];
        });
      })()`);
      await until(`castleSample.snapshot().time > 0`);
      expect(await phone.evaluate(`castleSample.snapshot().squads[0].general`)).toBe("권율");
      expect(await phone.evaluate(`document.querySelector("#start-loading").hidden`)).toBe(true);
      expect(await phone.evaluate(`document.querySelector("#title").hidden`)).toBe(true);
      expect(phone.errors).toEqual([]);
      if (evidence) await phone.shot(`${evidence}/pixel-${width}-battle.png`);
      expect(await phone.evaluate(`castleSample.snapshot().squads[0].soldiers.length`)).toBe(0);
      expect(await overlappingControls()).toEqual([]);
      // The purchase spends exactly the shown price. Kill coins keep landing while the battle runs, so the frame
      // loop is held (no run.time step) across both reads; the native tap still reaches the DOM recruit button.
      await phone.evaluate(`new Promise(resolve => {
        const native = requestAnimationFrame.bind(window), held = [];
        window.requestAnimationFrame = callback => held.push(callback);
        window.__startRelease = () => { window.requestAnimationFrame = native; for (const callback of held.splice(0)) native(callback); return true; };
        native(() => native(() => resolve(true)));
      })`);
      const wallet = `(() => { const s = castleSample.snapshot(); return { time: s.time, gold: s.gold,
        price: Number(document.querySelector(".bph-recruit-strip > .bph-recruit-cell .bph-price").textContent) }; })()`;
      const beforeBuy = await phone.evaluate(wallet);
      expect(await phone.tapElement(".bph-recruit-strip > .bph-recruit-cell")).toBe(true);
      const afterBuy = await phone.evaluate(wallet);
      expect(await phone.evaluate("window.__startRelease()")).toBe(true);
      if (!beforeBuy || typeof beforeBuy !== "object" || !afterBuy || typeof afterBuy !== "object") throw new Error("Missing purchase wallet");
      console.log("START_WALLET", width, JSON.stringify({ beforeBuy, afterBuy }));
      const price = Number(Reflect.get(beforeBuy, "price"));
      expect(price).toBeGreaterThan(0);
      expect(Reflect.get(afterBuy, "time")).toBe(Reflect.get(beforeBuy, "time"));
      expect(Reflect.get(afterBuy, "gold")).toBe(Number(Reflect.get(beforeBuy, "gold")) - price);
      await until(`!document.querySelector(".bph-receipt:not(.bph-hire-reveal)").hidden`);
      expect(await overlappingControls()).toEqual([]);
      const pending = await phone.evaluate(`castleSample.snapshot().bph.receipts`);
      const map = await phone.fieldMapper(
        Number(await phone.evaluate(`castleSample.snapshot().field.width`)),
        Number(await phone.evaluate(`castleSample.snapshot().field.height`)),
      );
      const center = {
        x: Number(await phone.evaluate(`castleSample.snapshot().field.width`)) / 2,
        y: Number(await phone.evaluate(`castleSample.snapshot().field.height`)) / 2,
      };
      // A repeat press on the pack skips the reel when affordable. This opening purchase
      // leaves too little gold, so let it reach the discovery card and open it there.
      await until(`document.querySelector(".bph-receipt:not(.bph-hire-reveal).bph-cracking")`);
      for (let hit = 0; hit < 3; hit++) {
        expect(await phone.tapElement(".bph-receipt:not(.bph-hire-reveal) .bph-reveal-art")).toBe(true);
      }
      await until(`document.querySelector(".bph-receipt:not(.bph-hire-reveal)").classList.contains("bph-landed")`);
      expect(await phone.evaluate(`document.querySelector(".bph-receipt:not(.bph-hire-reveal)").hidden`)).toBe(false);
      expect(await phone.evaluate(`document.querySelector(".bph-receipt:not(.bph-hire-reveal)").classList.contains("bph-spinning")`)).toBe(false);
      expect(await phone.evaluate(`document.querySelector("#building").hidden`)).toBe(true);
      // The landed card stays pending; its troops entered when the reel stopped, so the receipt now
      // records the copies that spawned (30ba7c36), one drawn card times this seed's roulette roll.
      if (!Array.isArray(pending)) throw new Error("Missing pending receipts");
      expect(await phone.evaluate(`castleSample.snapshot().bph.receipts`))
        .toEqual(pending.map(receipt => ({ ...receipt, spawned: bphRecruitMultiplier(7, 0) })));
      await phone.tap(map({ x: center.x, y: center.y + 18 }));
      await until(`castleSample.snapshot().bph.receipts.length === 0`);
      expect(await phone.evaluate(`document.querySelector("#building").hidden`)).toBe(true);
      expect(await phone.evaluate(`castleSample.snapshot().bph.save.packs.Pack1_Basic.opened`)).toBe(1);
      // One drawn card times the deterministic roulette roll for this seed's first purchase.
      expect(await phone.evaluate(`castleSample.snapshot().squads[0].soldiers.length`)).toBe(bphRecruitMultiplier(7, 0));
      expect(await phone.evaluate(`document.querySelector(".bph-receipt:not(.bph-hire-reveal)").hidden`)).toBe(true);
    } finally {
      release(); server.stop(true);
      await closeBrowser(phone.view, profile);
    }
  });
}
