import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";

for (const [width, height] of [[390, 844], [1440, 900]]) {
  test(`A02 title settings close without a battle reset and battle pause keeps its actions at ${width}`, async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, resolve(import.meta.dir, "../review-dist")) });
    const profile = await mkdtemp(`${tmpdir()}/castle-a02-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const out = resolve(import.meta.dir, "../review/demo-a02");
    const url = `http://127.0.0.1:${server.port}/?seed=7`;
    const ready = (expression: string) => phone.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+30000;
      function check(){if(${expression})resolve(true);
        else if(performance.now()>end)reject(new Error("UI timeout: "+${JSON.stringify(expression)}));
        else requestAnimationFrame(check);}check();
    })`);
    const motion = () => phone.evaluate(`Promise.all(document.getAnimations().filter(a =>
      a.effect.getComputedTiming().iterations !== Infinity).map(a=>a.finished))`);
    const tap = async (selector: string) => expect(await phone.tapElement(selector)).toBe(true);
    const actions = () => phone.evaluate(`[...document.querySelectorAll('#intro button')]
      .filter(e=>!e.hidden).map(e=>e.id)`);
    // Without a feedback URL the settings feedback link becomes an in-game dialog button (68149ba1).
    const titleActions = ["settings-close", "toggle-sound", "toggle-lang", "toggle-motion", "toggle-flashes", "toggle-numbers", "settings-feedback", "reset-records"];
    const outsidePanel = () => phone.evaluate(`(()=>{const a=document.querySelector('#app').getBoundingClientRect(), r=document.querySelector('#intro').getBoundingClientRect();
      return {x:a.left+8, y:r.top+r.height/2};})()`) as Promise<{ x: number; y: number }>;
    const shot = async (name: string) => { await motion(); await phone.shot(`${out}/${width}-${name}.png`); };
    try {
      await mkdir(out, { recursive: true });
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      await phone.evaluate(`localStorage.setItem('haengju1593-lang','ko')`);
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      await tap("#title-settings");
      expect(await actions()).toEqual(titleActions);
      expect(await phone.evaluate("document.querySelector('#restart')")).toBeNull();
      expect(await phone.evaluate("document.activeElement.id")).toBe("toggle-sound");
      const openDuration = String(await phone.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--ui-open')")).trim();
      const openSeconds = Number.parseFloat(openDuration) / (openDuration.endsWith("ms") ? 1000 : 1);
      expect(await phone.evaluate("getComputedStyle(document.querySelector('#intro')).transitionDuration")).toContain(`${openSeconds}s`);
      await shot("title-ko");
      const identity = "()=>{const s=castleSample.snapshot();return {seed:s.seed,time:s.time,attract:s.attract,record:localStorage.getItem('haengju1593')}}";
      const before = await phone.evaluate(`(${identity})()`);
      await phone.evaluate("document.querySelector('#settings-close').focus()");
      await phone.view.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13 });
      await phone.view.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      expect(await phone.evaluate("document.querySelector('#intro').hidden")).toBe(true);
      expect(await phone.evaluate("document.activeElement.id")).toBe("title-settings");
      expect(await phone.evaluate(`(${identity})()`)).toEqual(before);
      await shot("closed-title");
      await tap("#title-settings");
      for (const id of ["toggle-sound", "toggle-motion", "toggle-flashes", "toggle-lang"]) await tap(`#${id}`);
      expect(await phone.evaluate("document.querySelector('#settings-close').getAttribute('aria-label')")).toBe("Close");
      expect(await phone.evaluate("(()=>{const r=document.querySelector('#settings-close').getBoundingClientRect(), p=document.querySelector('#intro').getBoundingClientRect(); return r.width>=44 && r.height>=44 && Math.abs(r.right-p.right)<=16 && Math.abs(r.top-p.top)<=16;})()")).toBe(true);
      await shot("title-en");
      await tap("#settings-close");
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      await tap("#title-settings");
      expect(await actions()).toEqual(titleActions);
      expect(await phone.evaluate("document.documentElement.lang")).toBe("en");
      expect(await phone.evaluate("JSON.parse(localStorage.getItem('haengju1593'))")).toMatchObject({
        muted: true, motionOff: true, flashesOff: true,
      });
      expect(await phone.evaluate("['sound','motion','flashes'].map(id=>document.querySelector('#toggle-'+id).getAttribute('aria-pressed'))")).toEqual(["false", "true", "true"]);
      await phone.view.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      expect(await phone.evaluate("document.querySelector('#intro').hidden")).toBe(true);
      await tap("#start");
      await ready("document.querySelector('[data-bph-start]')");
      await tap("[data-bph-start]");
      await passFirstBattleGuide(phone);
      await ready("!castleSample.snapshot().attract && castleSample.snapshot().time > 0");
      await tap("#pause");
      expect(await actions()).toEqual(["resume", "toggle-sound", "toggle-lang", "toggle-motion", "toggle-flashes", "toggle-numbers", "codex-open", "home", "settings-feedback"]);
      expect(await phone.evaluate("document.activeElement.id")).toBe("resume");
      const pausedTime = await phone.evaluate("castleSample.snapshot().time");
      await shot("battle-pause-en");
      expect(await phone.evaluate("castleSample.snapshot().time")).toBe(pausedTime);
      await tap("#toggle-lang");
      expect(await phone.evaluate("document.querySelector('#resume b').textContent")).toBe("계속");
      await shot("battle-pause-ko");
      await tap("#resume");
      await ready(`castleSample.snapshot().time > ${pausedTime}`);
      await tap("#pause");
      await tap("#home");
      await tap("#title-settings");
      expect(await actions()).toEqual(titleActions);
      expect(await phone.evaluate("castleSample.snapshot().attract")).toBe(true);
      await shot("returned-title-ko");
      await phone.tap(await outsidePanel());
      expect(await phone.evaluate("document.querySelector('#intro').hidden")).toBe(true);
      expect(await phone.evaluate("document.activeElement.id")).toBe("title-settings");
      expect(await phone.evaluate("document.querySelector('#title').hidden")).toBe(false);
      expect(await phone.evaluate("castleSample.snapshot().attract && !castleSample.snapshot().paused && !document.querySelector('#title').hidden")).toBe(true);
      expect(phone.errors).toEqual([]);
    } finally {
      server.stop(true); await closeBrowser(phone.view, profile);
    }
  }, 120000);
}
