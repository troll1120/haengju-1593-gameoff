import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { bphBattleMedals } from "../src/bph-session";
import type { Run } from "../src/rules";
import { confirmFirstResultUnlock, launch } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";

const cases = [
  { width: 390, height: 844, lang: "ko", finish: true },
  { width: 390, height: 844, lang: "en", finish: false },
  { width: 1440, height: 900, lang: "ko", finish: false },
  { width: 1440, height: 900, lang: "en", finish: true },
] as const;

// closeBrowser ends every WebView in the process and bun does not stop a timed-out test body, so a test that
// overran would close the next test's view from its finally. A new test first closes a still-running previous
// test's view (its next evaluate rejects, so its finally runs at once), waits for that cleanup, then launches.
type OwnView = (view: { close(): void }) => void;
let previous = { done: Promise.resolve(), stop: () => {} };
function afterPreviousCleanup(body: (own: OwnView) => Promise<void>): () => Promise<void> {
  return async () => {
    const prior = previous;
    let release = () => {}, settled = false, view: { close(): void } | undefined;
    previous = { done: new Promise(resolve => { release = resolve; }), stop: () => { if (!settled) view?.close(); } };
    try {
      prior.stop();
      await prior.done;
      await body(owned => { view = owned; });
    } finally { settled = true; release(); }
  };
}

for (const entry of cases) {
  test(`first battle ${entry.width} ${entry.lang}: paused guide, ${entry.finish ? "finish" : "skip"}, settlement, retry and reload`, afterPreviousCleanup(async own => {
    const out = resolve(process.env.CASTLE_GUIDE_EVIDENCE ?? `${import.meta.dir}/../review/a03`);
    await mkdir(out, { recursive: true });
    const profile = await mkdtemp(`${tmpdir()}/castle-guide-`);
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, resolve(import.meta.dir, "../review-dist")) });
    const phone = await launch("about:blank", profile, entry.width, entry.height,
      ["--single-process", "--no-zygote", "--disable-gpu"]);
    own(phone.view);
    const url = `http://127.0.0.1:${server.port}/?seed=7`;
    const evidence: unknown[] = [];
    const ready = (expression: string, ms = 30000) => phone.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + ${ms};
      function check() {
        if (${expression}) resolve(true);
        else if (performance.now() > end) reject(new Error("Guide condition timed out: " + ${JSON.stringify(expression)}));
        else requestAnimationFrame(check);
      } check();
    })`);
    const tap = async (selector: string) => expect(await phone.tapElement(selector)).toBe(true);
    const key = async (key: string, code: string, shift = false) => {
      const virtualKey = key === "Tab" ? 9 : 13;
      await phone.view.cdp("Input.dispatchKeyEvent", { type: key === "Enter" ? "keyDown" : "rawKeyDown", key, code,
        ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}),
        windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey, modifiers: shift ? 8 : 0 });
      await phone.view.cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code,
        windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey, modifiers: shift ? 8 : 0 });
    };
    const values = `(() => {
      const s = castleSample.snapshot();
      return { time:s.time, gold:s.gold, earned:s.earned, kills:s.kills, base:s.base, walls:s.walls,
        squads:s.squads, pendingMastery:s.bph.pendingMastery, settled:s.bph.settled,
        account:s.bph.save.resources, coins:s.bph.save.coins, receipts:s.bph.receipts,
        meta:localStorage.getItem('haengju1593-meta'), clock:document.querySelector('#clock').textContent };
    })()`;
    const capture = async (step: number) => {
      for (const reduced of [false, true]) {
        await phone.view.cdp("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }],
        });
        await ready(`document.querySelector('#first-battle-guide')?.dataset.step === '${step}'`);
        const layout = await phone.evaluate(`(() => {
          const d = document.querySelector('#first-battle-guide'), r = d.getBoundingClientRect();
          return { viewport:[innerWidth,innerHeight], step:d.dataset.step, text:d.innerText,
            fits:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth,
            buttons:[...d.querySelectorAll('button')].map(b=>({id:b.id,height:b.getBoundingClientRect().height})),
            animation:getComputedStyle(d).animationName, font:getComputedStyle(d).fontFamily,
            reduced:matchMedia('(prefers-reduced-motion: reduce)').matches };
        })()`);
        expect(layout).toMatchObject({ fits: true, step: String(step), animation: "none", reduced });
        expect(layout && typeof layout === "object" && Reflect.get(layout, "buttons")).toEqual([
          { id: "first-guide-skip", height: 48 }, { id: "first-guide-next", height: 48 },
        ]);
        evidence.push(layout);
        await phone.shot(`${out}/${entry.width}-${entry.lang}-step${step}-${reduced ? "reduced" : "normal"}.png`);
      }
    };
    try {
      await phone.view.cdp("Emulation.setDeviceMetricsOverride", {
        width: entry.width, height: entry.height, deviceScaleFactor: 1, mobile: entry.width === 390,
      });
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      expect(await phone.evaluate("castleSample.snapshot().attract")).toBe(true);
      expect(await phone.evaluate("document.querySelector('#first-battle-guide')")).toBeNull();
      await tap("#title-settings");
      if (await phone.evaluate("document.documentElement.lang") !== entry.lang) await tap("#toggle-lang");
      await tap("#settings-close");
      await tap("#start");
      await ready("document.querySelector('[data-bph-start]')");
      expect(await phone.evaluate("document.querySelector('#first-battle-guide')")).toBeNull();
      await tap("[data-bph-start]");
      await ready("document.querySelector('#first-battle-guide[open]')");
      expect(await phone.evaluate("castleSample.snapshot().attract")).toBe(false);
      expect(await phone.evaluate("castleSample.snapshot().paused")).toBe(true);
      const before = await phone.evaluate(values);
      expect(before).toMatchObject({ time: 0, kills: 0, pendingMastery: 0, settled: false, clock: "00:00" });
      expect(await phone.evaluate("document.activeElement.id")).toBe("first-guide-next");
      await key("Tab", "Tab", true);
      expect(await phone.evaluate("document.activeElement.id")).toBe("first-guide-skip");
      await key("Tab", "Tab");
      expect(await phone.evaluate("document.activeElement.id")).toBe("first-guide-next");
      // Real pointer input attempts against the inert battle must not spend or cast.
      await tap(".bph-recruit-strip > .bph-recruit-cell");
      await tap("#pause");
      const stable = await phone.evaluate(`new Promise(resolve => {
        const baseline = JSON.stringify(${values}), end = performance.now()+700;
        let frames=0;
        function check() {
          frames++;
          if (JSON.stringify(${values}) !== baseline) return resolve({stable:false,frames});
          if (performance.now() >= end) return resolve({stable:true,frames});
          requestAnimationFrame(check);
        } check();
      })`);
      expect(stable).toMatchObject({ stable: true });
      evidence.push({ pauseObservation: stable, before });
      const subjects = entry.lang === "ko" ? ["지휘", "모집", "필살기", "성 방어"]
        : ["Command", "Recruit", "Ultimate", "Castle Defense"];
      for (const [index, subject] of subjects.entries()) {
        expect(await phone.evaluate("document.querySelector('#first-guide-heading').textContent")).toBe(subject);
        if (index === 0 || index === 3) await capture(index + 1);
        expect(await phone.evaluate(values)).toEqual(before);
        if (index < 3) await tap("#first-guide-next");
      }
      // Both completion routes are genuine inputs. Enter also proves the default keyboard route.
      if (entry.finish) await key("Enter", "Enter");
      else await tap("#first-guide-skip");
      console.log("GUIDE_DISMISSED", entry.width, entry.lang, await phone.evaluate(
        "({open:!!document.querySelector('#first-battle-guide[open]'),paused:castleSample.snapshot().paused,time:castleSample.snapshot().time,focus:document.activeElement.id})"));
      await ready("!castleSample.snapshot().paused && castleSample.snapshot().time > .5");
      expect(await phone.evaluate("document.querySelector('#first-battle-guide')")).toBeNull();
      expect(await phone.evaluate("JSON.parse(localStorage.getItem('haengju1593')).firstBattleGuide")).toBe(true);
      const resumed = await phone.evaluate(`new Promise(resolve => {
        const start=performance.now(), time=castleSample.snapshot().time;
        function observe() {
          if(performance.now()-start>=700) return resolve(castleSample.snapshot().time-time);
          requestAnimationFrame(observe);
        } observe();
      })`);
      expect(Number(resumed)).toBeGreaterThan(.3);
      expect(Number(resumed)).toBeLessThan(1);
      evidence.push({ resumedSecondsOver700ms: resumed });
      await tap("#pause");
      expect(await phone.evaluate("castleSample.snapshot().paused")).toBe(true);
      expect(await phone.evaluate("document.querySelector('#first-battle-guide')")).toBeNull();
      await tap("#resume");
      await ready("castleSample.snapshot().time > 1");
      console.log("GUIDE_COMBAT", entry.width, entry.lang);
      // Natural combat: no save injection, no speed changes, no forced loss. The test owns the browser's external
      // frame clock (as mastery-hud does) and steps real frames to the natural end instead of waiting wall time.
      await phone.evaluate(`new Promise(resolve=>{
        const native=requestAnimationFrame.bind(window);window.__guideNative=native;window.__guideQueue=[];
        window.requestAnimationFrame=callback=>window.__guideQueue.push(callback);
        native(()=>native(()=>resolve(true)));
      })`);
      await phone.evaluate(`(()=>{
        window.__guideRealNow=performance.now.bind(performance);window.__guideClock=window.__guideRealNow();
        Object.defineProperty(performance,"now",{configurable:true,value:()=>window.__guideClock});
      })()`);
      let ended: unknown = null;
      // Each stepped frame carries 0.1 s, the largest delta the game takes per frame (main.ts adds min(delta, .1) to
      // its accumulator and runs fixed 1/30 s steps), so a frame renders once per three simulation steps.
      for (let chunk = 0; chunk < 30 && !ended; chunk++) {
        ended = await phone.evaluate(`(()=>{
          for(let frame=0;frame<200;frame++){
            const s=castleSample.snapshot();
            if(s.phase!=='playing')return {phase:s.phase,time:s.time};
            window.__guideBefore={mastery:s.bph.save.resources.mastery,claimed:[...s.bph.save.lifecycle.claimed]};
            window.__guideClock+=100;
            for(const callback of window.__guideQueue.splice(0))callback(window.__guideClock);
          }
          return null;
        })()`);
      }
      if (!ended) throw new Error("Natural combat did not end within 600 battle seconds");
      // Hand the page back a monotonic real clock that continues from the stepped time.
      await phone.evaluate(`(()=>{
        const offset=window.__guideClock-window.__guideRealNow(),real=window.__guideRealNow,native=window.__guideNative;
        Object.defineProperty(performance,"now",{configurable:true,value:()=>real()+offset});
        window.requestAnimationFrame=callback=>native(time=>callback(time+offset));
        for(const callback of window.__guideQueue.splice(0))native(time=>callback(time+offset));
      })()`);
      evidence.push({ naturalEnd: ended });
      await ready("castleSample.snapshot().phase === 'lost' || castleSample.snapshot().phase === 'won'");
      await ready("!document.querySelector('#result').hidden");
      const settlement = await phone.evaluate(`(() => {
        const s=castleSample.snapshot(), m=JSON.parse(localStorage.getItem('haengju1593-meta'));
        return {phase:s.phase,kills:s.kills,gold:s.gold,earned:s.earned,pending:s.bph.pendingMastery,
          battle:{survival:s.bph.survival,killMedals:s.bph.killMedals,pendingMastery:s.bph.pendingMastery},
          before:window.__guideBefore,claimed:s.bph.save.lifecycle.claimed,
          settled:s.bph.settled,runs:m.runs,mastery:m.bph.resources.mastery,
          coins:m.bph.coins,receipts:m.bph.lifecycle,codex:m.bph.codexRewards};
      })()`);
      expect(settlement).toMatchObject({ settled: true, runs: 1, coins: 0 });
      if (!settlement || typeof settlement !== "object") throw new Error("Missing settlement");
      // Survival pays whole kill medals through one combat receipt at settlement (6e7fa3a6), on top of the
      // discovery and pack receipts already credited during the battle.
      const battle = Reflect.get(settlement, "battle"), preSettlement = Reflect.get(settlement, "before");
      if (!battle || typeof battle !== "object" || !preSettlement || typeof preSettlement !== "object") throw new Error("Missing reward state");
      const medals = bphBattleMedals({ bph: battle } as Run);
      expect(medals).toBeGreaterThan(0);
      expect(Reflect.get(preSettlement, "claimed")).not.toContain("mastery:combat:1");
      expect(Reflect.get(settlement, "claimed")).toContain("mastery:combat:1");
      expect(Reflect.get(settlement, "mastery")).toBe(Number(Reflect.get(preSettlement, "mastery")) + medals);
      // Kill coins are rolled per kill (6e7fa3a6) and counted in run.earned; discovery gold adds one coin each.
      const discoveryGold = await phone.evaluate(`castleSample.snapshot().bph.save.codexRewards.claimed.filter(id => id.startsWith("discovery:")).length`);
      expect(Reflect.get(settlement, "gold")).toBe(3 + Number(Reflect.get(settlement, "earned")) + Number(discoveryGold));
      evidence.push({ settlement });
      console.log("GUIDE_SETTLED", entry.width, entry.lang, settlement);
      await confirmFirstResultUnlock(phone);
      await tap("#pause"); await tap("#resume");
      expect(await phone.evaluate("JSON.parse(localStorage.getItem('haengju1593-meta')).runs")).toBe(1);
      expect(await phone.evaluate("JSON.parse(localStorage.getItem('haengju1593-meta')).bph.resources.mastery"))
        .toBe(Reflect.get(settlement, "mastery"));
      await tap("#retry"); await ready("document.querySelector('[data-bph-start]')");
      await tap("[data-bph-start]");
      await ready("castleSample.snapshot().time > 0 && !castleSample.snapshot().paused");
      expect(await phone.evaluate("document.querySelector('#first-battle-guide')")).toBeNull();
      await phone.view.cdp("Page.reload");
      console.log("GUIDE_RELOAD", entry.width, entry.lang);
      await ready("window.castleSample && !document.querySelector('#start').disabled && castleSample.snapshot().attract");
      await tap("#start"); await ready("document.querySelector('[data-bph-start]')");
      await tap("[data-bph-start]");
      await ready("castleSample.snapshot().time > 0 && !castleSample.snapshot().paused");
      expect(await phone.evaluate("document.querySelector('#first-battle-guide')")).toBeNull();
      expect(phone.errors).toEqual([]);
    } catch (error) {
      evidence.push({ failure: error instanceof Error ? error.message : String(error),
        state: await phone.evaluate("({focus:document.activeElement?.outerHTML,guide:document.querySelector('#first-battle-guide')?.outerHTML,state:((s)=>({phase:s.phase,time:s.time,paused:s.paused,gold:s.gold,kills:s.kills}))(castleSample.snapshot())})") });
      await phone.shot(`${out}/${entry.width}-${entry.lang}-failure.png`);
      throw error;
    } finally {
      await Bun.write(`${out}/${entry.width}-${entry.lang}.json`, JSON.stringify({ entry, evidence, errors: phone.errors }, null, 2));
      server.stop(true);
      await closeBrowser(phone.view, profile);
    }
  }), 120000);
}

test("old UI save compatibility fixture: Escape skips at step one and preserves settings and records", afterPreviousCleanup(async own => {
  const profile = await mkdtemp(`${tmpdir()}/castle-guide-old-save-`);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, resolve(import.meta.dir, "../review-dist")) });
  const phone = await launch("about:blank", profile, 390, 844,
    ["--single-process", "--no-zygote", "--disable-gpu"]);
  own(phone.view);
  const url = `http://127.0.0.1:${server.port}/?seed=7`;
  const oldSettings = {
    story: true, muted: true, timers: false, motionOff: true, flashesOff: true,
    record: { plays: 12, wins: 3, kills: 456, score: 789, fastest: 123 },
  };
  const ready = (expression: string) => phone.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+30000;
    function check(){if(${expression})resolve(true);
      else if(performance.now()>end)reject(new Error("Old save condition timed out: "+${JSON.stringify(expression)}));
      else requestAnimationFrame(check);}check();
  })`);
  try {
    await phone.view.navigate(url);
    // Compatibility fixture only. The first-player cases above never inject state.
    await phone.evaluate(`localStorage.setItem('haengju1593',${JSON.stringify(JSON.stringify(oldSettings))})`);
    await phone.view.cdp("Page.reload");
    await ready("window.castleSample && !document.querySelector('#start').disabled");
    expect(await phone.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
    expect(await phone.tapElement("[data-bph-start]")).toBe(true);
    await ready("document.querySelector('#first-battle-guide[open]')");
    expect(await phone.evaluate("document.querySelector('#first-battle-guide').dataset.step")).toBe("1");
    // The first real frame now persists the already-initialized run account,
    // including the owned commander discovery. Guide dismissal must add nothing else.
    const meta = await phone.evaluate(`JSON.stringify({
      ...JSON.parse(localStorage.getItem("haengju1593-meta")), bph: castleSample.snapshot().bph.save
    })`);
    await phone.view.cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await phone.view.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await ready("castleSample.snapshot().time > 0 && !castleSample.snapshot().paused");
    expect(await phone.evaluate("JSON.parse(localStorage.getItem('haengju1593'))"))
      .toEqual({ ...oldSettings, firstBattleGuide: true });
    expect(await phone.evaluate("localStorage.getItem('haengju1593-meta')")).toBe(meta);
    await phone.view.cdp("Page.reload");
    await ready("window.castleSample && !document.querySelector('#start').disabled && castleSample.snapshot().attract");
    expect(await phone.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
    expect(await phone.tapElement("[data-bph-start]")).toBe(true);
    await ready("castleSample.snapshot().time > 0 && !castleSample.snapshot().paused");
    expect(await phone.evaluate("document.querySelector('#first-battle-guide')")).toBeNull();
    expect(phone.errors).toEqual([]);
  } finally {
    server.stop(true);
    await closeBrowser(phone.view, profile);
  }
}), 120000);
