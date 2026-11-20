import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { confirmFirstResultUnlock, reviewBrowserSession, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";

const root = resolve(import.meta.dir, "..");
const evidence = process.env["UNLOCK_EVIDENCE"];
const session = reviewBrowserSession(["--single-process", "--no-zygote", "--disable-gpu"]);
let server: ReturnType<typeof Bun.serve>, temporary: string, url: string;
beforeAll(async () => {
  temporary = await mkdtemp(`${tmpdir()}/castle-result-unlock-`);
  if (evidence) await mkdir(evidence, { recursive: true });
  server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, `${root}/review-fixtures/unlock`) });
  url = `http://127.0.0.1:${server.port}/?seed=1593`;
}, 60000);
afterAll(async () => {
  await session.close();
  server?.stop(true);
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

for (const [width, height] of [[320, 568], [390, 844], [1440, 900]]) for (const lang of ["ko", "en"]) {
  test(`result panel stays clear of the battle clock and gear at ${width}x${height} ${lang}`, async () => {
    const page = await session.open(width, height);
    const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
      const deadline=performance.now()+45000;
      function frame(){if(${condition})resolve(true);
        else if(performance.now()>deadline)reject(new Error("Result fixture timeout"));
        else requestAnimationFrame(frame);}frame();
    })`);
    try {
      await page.view.navigate(url);
      await page.evaluate(`(()=>{localStorage.clear();localStorage.setItem('haengju1593-lang','${lang}');
        localStorage.setItem('haengju1593-meta',${JSON.stringify(JSON.stringify(freshMeta()))});return true;})()`);
      await page.view.navigate(url);
      await ready("window.unlockResultProbe && !document.querySelector('#start').disabled");
      expect(await page.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await page.tapElement("[data-bph-start]")).toBe(true);
      await passFirstBattleGuide(page);
      await ready("castleSample.snapshot().time>0 && !castleSample.snapshot().attract");
      await page.evaluate("unlockResultProbe.finish()");
      await ready("!document.querySelector('#result').hidden");
      await confirmFirstResultUnlock(page);
      await page.evaluate(`Promise.all([document.fonts.ready, ...document.querySelector('#result').getAnimations({subtree:true})
        .filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>null))]).then(()=>true)`);
      const layout = await page.evaluate(`(()=>{
        const p=document.querySelector('#result').getBoundingClientRect();
        const clear=selector=>{const node=document.querySelector(selector),a=node.getBoundingClientRect(),s=getComputedStyle(node);
          return s.visibility==='hidden'||s.display==='none'||a.bottom<=p.top||a.top>=p.bottom||a.right<=p.left||a.left>=p.right;};
        const edges=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [r.left,r.top,r.right,r.bottom];};
        return {clock:clear('#clock'),gear:clear('#pause'),
          onScreen:p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight,
          // #result-endless stays hidden (no box) unless a survival win offers the endless continuation.
          actionsShown:[...document.querySelectorAll('#result .menu button')].filter(action=>!action.hidden).every(action=>{
            const a=action.getBoundingClientRect();return a.height>0&&a.top>=p.top&&a.bottom<=p.bottom;}),
          actionCount:[...document.querySelectorAll('#result .menu button')].filter(action=>!action.hidden).length,
          edges:{result:edges('#result'),gear:edges('#pause')}};
      })()`) as Record<string, unknown>;
      console.log("RESULT_HUD", `${width}x${height}`, lang, JSON.stringify(layout));
      if (evidence) await page.shot(`${evidence}/result-hud-${lang}-${width}x${height}.png`);
      expect(layout).toMatchObject({ clock: true, gear: true, onScreen: true, actionsShown: true, actionCount: 2 });
      expect(page.errors).toEqual([]);
    } finally {
      await session.reset();
    }
  }, 120000);
}

for (const [width, height] of [[390, 844], [405, 670], [405, 720], [1440, 900]]) for (const lang of ["ko", "en"]) {
  test(`result unlocks 0/1/2/3 stay sequential and preserve saves at ${width} ${lang}`, async () => {
    const page = await session.open(width, height);
    const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
      const deadline=performance.now()+45000;
      requestAnimationFrame(function frame(){
        if(${condition})resolve(true);
        else if(performance.now()>deadline)reject(new Error("Timeout: "+${JSON.stringify(condition)}));
        else requestAnimationFrame(frame);
      });
    })`);
    const saved = () => page.evaluate("localStorage.getItem('haengju1593-meta')");
    const capture = async (state: string) => {
      if (evidence) await page.shot(`${evidence}/${lang}-${width}x${height}-${state}.png`);
    };
    const enter = async (repeat = false) => {
      await page.view.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter",
        windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, autoRepeat: repeat });
      await page.view.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter",
        windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    };
    const inspect = async (index: number, count: number) => {
      await ready("document.querySelector('#result-unlock-modal img')?.complete");
      expect(await page.evaluate(`(() => {
        const modal=document.querySelector('#result-unlock-modal'), r=modal.getBoundingClientRect();
        const button=modal.querySelector('button'), b=button.getBoundingClientRect();
        const description=modal.querySelector('#result-unlock-description');
        return {
          modals:document.querySelectorAll('#result-unlock-modal[open]').length,
          centred:Math.abs(r.x+r.width/2-innerWidth/2)<1 && Math.abs(r.y+r.height/2-innerHeight/2)<1,
          fits:r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight,
          overflow:modal.scrollWidth>modal.clientWidth,
          target:b.width>=44 && b.height>=44,
          focused:document.activeElement===button,
          counter:modal.querySelector('#result-unlock-counter').textContent,
          counterHidden:modal.querySelector('#result-unlock-counter').hidden,
          name:modal.querySelector('h2').textContent,
          confirm:button.textContent,
          oneLine:description.getBoundingClientRect().height<=parseFloat(getComputedStyle(description).lineHeight)+1,
          imageLoaded:modal.querySelector('img').naturalWidth>0,
          motion:modal.getAnimations({subtree:true}).length
        };
      })()`)).toMatchObject({
        modals: 1, centred: true, fits: true, overflow: false, target: true,
        focused: true, counter: `${index + 1}/${count}`, counterHidden: count === 1,
        name: (lang === "ko" ? ["신립 해금", "송상현 해금", "황진 해금"]
          : ["Sin Rip Unlocked", "Song Sang-hyeon Unlocked", "Hwang Jin Unlocked"])[index],
        confirm: lang === "ko" ? "확인" : "Confirm", oneLine: true, imageLoaded: true, motion: 0,
      });
      await capture(`${count}-step-${index + 1}`);
    };
    try {
      await page.view.navigate(url);
      const initial = freshMeta(); initial.bph = freshBphSave();
      // Chrome-backed WebViews share an origin store within this test process.
      // Load the real fresh account through its normal parser/migration once,
      // so reload equality covers unlock persistence rather than first migration.
      await page.evaluate(`(() => {
        localStorage.setItem('haengju1593-meta', ${JSON.stringify(JSON.stringify(initial))});
        localStorage.removeItem('haengju1593');
        localStorage.setItem('haengju1593-lang', '${lang}');
      })()`);
      await page.view.navigate(url);
      await ready("window.unlockResultProbe && window.castleSample && !document.querySelector('#start').disabled");
      const initialRuns = await page.evaluate("JSON.parse(localStorage.getItem('haengju1593-meta') ?? '{}').runs ?? 0");
      console.log("UNLOCK_INITIAL", width, lang, initialRuns);
      expect(initialRuns).toBe(0);
      expect(await page.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await page.tapElement("[data-bph-start]")).toBe(true);
      await passFirstBattleGuide(page);
      await ready("castleSample.snapshot().time>0 && !castleSample.snapshot().attract");
      await page.evaluate("unlockResultProbe.finish()");
      await ready("!document.querySelector('#result').hidden && document.querySelector('#result-unlock-modal[open]')");
      expect(await page.evaluate("JSON.parse(localStorage.getItem('haengju1593-meta'))")).toMatchObject({
        runs: 1, losses: 1, bestSeconds: 30,
        bph: { coins: 0, unlockedGenerals: ["권율", "신립"], resources: { mastery: 17 } },
      });
      const firstSave = await saved();
      await inspect(0, 1);
      await page.view.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      expect(await page.evaluate("document.querySelector('#result-unlock-modal').open")).toBe(true);
      expect(await page.tapElement("#result-unlock-modal button")).toBe(true);
      expect(await page.evaluate("document.querySelector('#result-unlock-modal')")).toBeNull();
      expect(await saved()).toBe(firstSave);
      expect(await page.evaluate("document.activeElement.id")).toBe("retry");

      // A second short run cannot reach the next commander's unchanged 180s gate.
      await page.evaluate("unlockResultProbe.resume()");
      expect(await page.tapElement("#retry")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await page.tapElement("[data-bph-start]")).toBe(true);
      await ready("castleSample.snapshot().time>0 && !castleSample.snapshot().attract");
      await page.evaluate("unlockResultProbe.finish()");
      await ready("!document.querySelector('#result').hidden");
      expect(await page.evaluate("document.querySelector('#result-unlock-modal')")).toBeNull();
      expect(await page.evaluate("document.querySelector('#result-unlock, #result-progress, #result-flip')")).toBeNull();
      expect(await page.evaluate("JSON.parse(localStorage.getItem('haengju1593-meta'))")).toMatchObject({
        runs: 2, losses: 2, bestSeconds: 30,
        bph: { unlockedGenerals: ["권율", "신립"], resources: { mastery: 34 } },
      });
      // Retry and upgrades are picture-only tiles named by aria-label (30359836); a lost run hides #result-endless.
      expect(await page.evaluate(`[...document.querySelectorAll('#result .menu button')].filter(action => !action.hidden).map(action => {
        const tile = action.getBoundingClientRect(), pictures = [...action.querySelectorAll('img')].map(img => img.getBoundingClientRect());
        return { id: action.id, label: action.getAttribute('aria-label'), text: action.textContent.trim(),
          pictured: pictures.length > 0 && pictures.every(p => p.width > 0 && p.left >= tile.left && p.right <= tile.right && p.top >= tile.top && p.bottom <= tile.bottom) };
      })`)).toEqual([
        { id: "retry", label: lang === "ko" ? "출전 준비" : "Battle Prep", text: "", pictured: true },
        { id: "result-upgrade", label: lang === "ko" ? "강화망" : "Upgrades", text: "", pictured: true },
      ]);
      expect(await page.evaluate("document.querySelector('#result-title').innerText.trim()")).toBe(lang === "ko" ? "패배" : "Defeat");
      await capture("0-result");
      const unchanged = await saved();
      await page.evaluate("(() => { unlockResultProbe.refresh(); unlockResultProbe.present([]); })()");
      expect(await page.evaluate("document.querySelector('#result-unlock-modal')")).toBeNull();
      expect(await saved()).toBe(unchanged);

      await page.view.cdp("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      for (const count of [2, 3]) {
        await page.evaluate(`unlockResultProbe.present(${JSON.stringify(["신립", "송상현", "황진"].slice(0, count))})`);
        for (let index = 0; index < count; index++) {
          await inspect(index, count);
          if (index === 0) {
            await page.view.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
            await page.view.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
            expect(await page.evaluate("document.activeElement === document.querySelector('#result-unlock-modal button')")).toBe(true);
          }
          if (index % 2 === 0) await enter();
          else expect(await page.tapElement("#result-unlock-modal button")).toBe(true);
          if (index + 1 < count) {
            await enter(true);
            expect(await page.evaluate("document.querySelector('#result-unlock-counter').textContent")).toBe(`${index + 2}/${count}`);
          }
        }
        expect(await page.evaluate("document.querySelector('#result-unlock-modal')")).toBeNull();
        expect(await page.evaluate("document.activeElement.id")).toBe("retry");
        expect(await saved()).toBe(unchanged);
      }
      await capture("closed-result");
      await page.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      expect(await saved()).toBe(unchanged);
      expect(page.errors).toEqual([]);
      console.log("UNLOCK_PASS", width, height, lang, "counts=0,1,2,3 saved-byte-identical-after-confirm-and-reload");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      console.error("UNLOCK_CONTEXT", width, lang, await page.evaluate(`(() => ({
        phase:window.castleSample?.snapshot().phase,
        resultHidden:document.querySelector('#result').hidden,
        modal:document.querySelector('#result-unlock-modal')?.open,
        saved:localStorage.getItem('haengju1593-meta')
      }))()`), page.errors);
      await capture("failure");
      throw error;
    } finally { await session.reset(); }
  }, 180000);
}
