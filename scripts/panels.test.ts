import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { reviewBrowserSession, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_PLACEMENTS } from "../src/bph-upgrades";
import { BPH_DEFAULT_GRID } from "../src/bph-upgrade-data";

const session = reviewBrowserSession(["--single-process", "--no-zygote", "--disable-gpu"]);
afterAll(() => session.close());

for (const [width, height] of [[390, 844], [1440, 900]]) {
  test(`panels keep the document fixed, edges clear and audio buses separate at ${width}`, async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, resolve(import.meta.dir, "../review-dist")) });
    const phone = await session.open(width, height);
    const url = `http://127.0.0.1:${server.port}/?seed=7`;
    const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + 30000;
      const check = () => {
        if (${expression}) requestAnimationFrame(() => resolve(true));
        else if (performance.now() > end) reject(new Error("UI timeout: " + ${JSON.stringify(expression)}));
        else requestAnimationFrame(check);
      }; check();
    })`);
    const motion = () => ready(`!document.getAnimations().some(a =>
      a.playState==='running'&&a.effect.getComputedTiming().iterations!==Infinity)`);
    const assertTiming = async (selector: string, token: "--ui-open" | "--ui-close") => {
      const timing = await phone.evaluate(`(() => {
        const style=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));
        const milliseconds=value=>parseFloat(value)*(value.trim().endsWith('ms')?1:1000);
        const durations=style.transitionDuration.split(',').map(milliseconds);
        return {expected:milliseconds(getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(token)})),
          actual:Object.fromEntries(style.transitionProperty.split(',').map((property,index)=>
            [property.trim(),durations[index%durations.length]]))};
      })()`);
      if (!timing || typeof timing !== "object") throw new Error("Missing panel transition timing");
      const expected = Reflect.get(timing, "expected");
      expect(Reflect.get(timing, "actual")).toEqual({ opacity: expected, scale: expected, display: expected, overlay: expected });
    };
    const fit = async (selector: string) => {
      await motion();
      expect(await phone.evaluate(`(() => {
        window.scrollTo(100, 100);
        const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(), d = document.scrollingElement;
        return scrollX === 0 && scrollY === 0 && d.scrollWidth <= innerWidth && d.scrollHeight <= innerHeight
          && r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      })()`)).toBe(true);
    };
    try {
      await phone.view.navigate(url);
      const meta = freshMeta(), save = freshBphSave();
      const root = [...BPH_PLACEMENTS.values()].find(p => p.gridId === BPH_DEFAULT_GRID && p.nodeId === "SN_TowerHP");
      if (!root) throw new Error("Missing base HP placement");
      save.purchasedPlacements.push(root.id); save.resources.mastery = 100;
      save.relicState.owned.push("Relic1_Club");
      save.relicState.discovered.push("Relic1_Club");
      save.lifecycle.claimed.push("relic-notice:Relic1_Club");
      meta.bph = save;
      await phone.evaluate(`localStorage.setItem('haengju1593-meta', ${JSON.stringify(JSON.stringify(meta))})`);
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      await phone.evaluate(`(() => {
        window.panelTransitions=[];
        document.addEventListener('transitionrun',event=>window.panelTransitions.push({
          id:event.target.id,property:event.propertyName,hidden:event.target.hidden
        }),true);
      })()`);
      await phone.tapElement("#title-settings");
      await fit("#intro");
      expect(await phone.evaluate("document.querySelector('#restart')")).toBeNull();
      await assertTiming("#intro", "--ui-open");
      expect(await phone.evaluate("window.panelTransitions.some(e=>e.id==='intro'&&e.property==='opacity'&&!e.hidden)")).toBe(true);
      for (const [bus, value] of [["bgm", 37], ["sfx", 68]] as const) {
        await phone.evaluate(`(() => {
          const input = document.querySelector('#volume-${bus}');
          input.value = '${value}'; input.dispatchEvent(new Event('input', {bubbles:true}));
          input.dispatchEvent(new Event('change', {bubbles:true}));
        })()`);
      }
      await ready("Math.abs(castleSample.snapshot().sound.bgmGain - .37) < .001 && Math.abs(castleSample.snapshot().sound.sfxGain - .68) < .001");
      expect(await phone.evaluate("castleSample.snapshot().sound")).toMatchObject({ bgmVolume: 37, sfxVolume: 68 });
      await phone.tapElement("#settings-close"); await motion();
      await assertTiming("#intro", "--ui-close");
      expect(await phone.evaluate("window.panelTransitions.some(e=>e.id==='intro'&&e.property==='opacity'&&e.hidden)")).toBe(true);
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      await phone.tapElement("#title-settings"); await motion();
      expect(await phone.evaluate("['bgm','sfx'].map(bus => document.querySelector('#volume-'+bus).value)")).toEqual(["37", "68"]);
      expect(await phone.evaluate("[...document.querySelectorAll('.audio-volumes input')].every(e => e.getBoundingClientRect().height >= 44)")).toBe(true);
      await phone.tapElement("#settings-close"); await motion();
      await phone.tapElement("#start");
      await ready("document.querySelector('[data-bph-start]')"); await fit(".bph-management");
      await phone.tapElement(".bph-actions button");
    await ready("document.querySelector('[data-prep-group=\"shared\"]')"); await fit(".bph-web");
      await phone.tapElement('.bph-actions button[aria-pressed="true"]'); await motion();
      await ready("!document.querySelector('.bph-web')");
      expect(await phone.evaluate(`({
        tabsReleased: [...document.querySelectorAll(".bph-actions button[data-bph-tab]")]
          .every(tab => tab.getAttribute("aria-pressed") === "false"),
        commandersBack: getComputedStyle(document.querySelector(".bph-commanders")).display !== "none"
      })`)).toEqual({ tabsReleased: true, commandersBack: true });
      await phone.tapElement('[data-bph-tab="relics"]');
      await ready("document.querySelector('.bph-relics')"); await fit(".bph-relics");
      expect(await phone.evaluate("document.querySelector('.bph-relic-count').textContent")).toBe("Equipped 0/1");
      await phone.tapElement('[data-relic="Relic1_Club"]');
      await ready("document.querySelector('[data-relic=\"Relic1_Club\"]').getAttribute('aria-pressed') === 'true'");
      expect(await phone.evaluate("JSON.parse(localStorage.getItem('haengju1593-meta')).bph.relicState.equipped")).toEqual(["Relic1_Club"]);
      await phone.tapElement('[data-bph-tab="relics"]'); await motion();
      await ready("!document.querySelector('.bph-relics')");
      await phone.tapElement('[data-bph-tab="relics"]');
      await ready("document.querySelector('.bph-relics')");
      await ready("document.querySelector('[data-relic=\"Relic1_Club\"]').getAttribute('aria-pressed') === 'true'");
      await fit(".bph-relics");
      await phone.tapElement('[data-relic="Relic1_Club"]');
      expect(await phone.evaluate("JSON.parse(localStorage.getItem('haengju1593-meta')).bph.relicState.equipped")).toEqual([]);
      await phone.tapElement('[data-bph-tab="relics"]'); await motion();
      await phone.tapElement("[data-bph-start]");
      await passFirstBattleGuide(phone);
      await ready("castleSample.snapshot().time > 0 && document.querySelector('.bph-recruit-strip > .bph-recruit-cell')");
      await motion();
      const positions = () => phone.evaluate(`['#app','#arena canvas','.bph-recruit-strip > .bph-recruit-cell'].map(s => {
        const r=document.querySelector(s).getBoundingClientRect();return [r.x,r.y,r.width,r.height];
      })`);
      const before = await positions();
      const box = await phone.rect(".bph-recruit-strip > .bph-recruit-cell");
      if (!box) throw new Error("Missing recruit hit box");
      await phone.view.cdp("Input.dispatchTouchEvent", { type: "touchStart",
        touchPoints: [{ x: box.x + box.w / 2, y: box.y + box.h / 2, id: 1 }] });
      expect(await positions()).toEqual(before);
      await phone.view.cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await ready("!document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden"); await fit(".bph-receipt:not(.bph-hire-reveal)");
      expect(await positions()).toEqual(before);
      await phone.tapElement("#pause"); await fit("#intro");
      await phone.evaluate(`(() => {
        document.querySelector('#intro').hidden=true; document.querySelector('#result').hidden=false;
        document.querySelector('#result-damage').textContent='처치 123 · 숙련 +456 · 누적 개봉 78';
      })()`);
      await fit("#result");
      await phone.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      expect(await phone.evaluate("getComputedStyle(document.querySelector('#result')).scale")).toBe("1");
      expect(phone.errors).toEqual([]);
    } finally {
      await session.reset(); server.stop(true);
    }
  }, 120000);
}
