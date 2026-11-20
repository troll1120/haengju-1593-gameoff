import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { bphBattleMedals } from "../src/bph-session";
import type { Run } from "../src/rules";
import { launch, passFirstBattleGuide } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";

test("mastery earned stays visible and grows with each kill medal in the opening fight", async () => {
  const root = resolve(import.meta.dir, "..");
  const out = process.env.CASTLE_MASTERY_EVIDENCE ?? resolve(root, "review/mastery-hud");
  await mkdir(out, { recursive: true });
  const profile = await mkdtemp(`${out}/chrome-profile-`);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, process.env.CASTLE_TEST_DIST ?? `${root}/review-dist`) });
  const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 25000;
    function check() {
      if (${expression}) resolve(true);
      else if (performance.now() > deadline) reject(new Error("HUD condition not reached: " + ${JSON.stringify(expression)}));
      else requestAnimationFrame(check);
    } check();
  })`);
  const samples: unknown[] = [];
  const progress: unknown[] = [];
  // Own the browser's external frame clock, not advance(), combat or HUD state.
  // A background headless renderer may deliver only 5 RAF callbacks per second.
  const advanceTo = async (expression: string) => {
    const observation = await phone.evaluate(`(() => {
      const start=castleSample.snapshot().time, wallDeadline=Date.now()+25000;
      for(let frame=0;frame<=60*45;frame++) {
        const s=castleSample.snapshot();
        if(${expression})return {condition:${JSON.stringify(expression)},frames:frame,time:s.time,kills:s.kills};
        if(s.time-start>=45||Date.now()>wallDeadline)break;
        window.__masteryClock+=1000/60;
        const callbacks=window.__masteryQueue.splice(0);
        for(const callback of callbacks)callback(window.__masteryClock);
      }
      const s=castleSample.snapshot();
      throw new Error("Simulation condition not reached: "+${JSON.stringify(expression.replace(/\s+/g, " "))}+
        " "+JSON.stringify({time:s.time,kills:s.kills,mastery:s.bph.pendingMastery,killMedals:s.bph.killMedals,
          hud:document.querySelector('#mastery-earned-value')?.textContent}));
    })()`);
    progress.push(observation);
    console.log("MASTERY_SIM", JSON.stringify(observation));
  };
  try {
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    // The game now starts in English (714f9572); this HUD check keeps its Korean label by saving the Settings choice.
    await phone.evaluate("localStorage.setItem('haengju1593-lang','ko')");
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
    expect(await phone.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
    expect(await phone.tapElement("[data-bph-start]")).toBe(true);
    await ready("!castleSample.snapshot().attract");
    await passFirstBattleGuide(phone);
    await ready("!castleSample.snapshot().paused");
    // Drain the already scheduled native frame before taking over its successor.
    await phone.evaluate(`new Promise(resolve=>{
      const native=requestAnimationFrame.bind(window);
      window.__masteryNativeRaf=native;window.__masteryQueue=[];
      window.requestAnimationFrame=callback=>window.__masteryQueue.push(callback);
      native(()=>native(()=>resolve(true)));
    })`);
    await phone.evaluate(`(() => {
      window.__masteryClock=performance.now();
      Object.defineProperty(performance,"now",{configurable:true,value:()=>window.__masteryClock});
    })()`);
    await advanceTo("castleSample.snapshot().kills > 9");
    const opening = await phone.evaluate(`(() => {
      const b = castleSample.snapshot().bph;
      return { survival:b.survival, killMedals:b.killMedals, pendingMastery:b.pendingMastery };
    })()`);
    let previous = bphBattleMedals({ bph: opening } as Run);
    // Since f6694b14/ec1c508d the unattended seed-7 general falls near 33 kills (40 s), so the HUD tops out at +4:
    // it reads +1 at kill 10 and rises at kills 11, 27 and 32. Three rises keep the kill-to-HUD check inside that fight.
    for (let observation = 0; observation < 3; observation++) {
      // The HUD shows bphBattleMedals: in survival, whole kill medals plus capped scaled pending mastery.
      await advanceTo(`(() => {
        const text = document.querySelector('#mastery-earned-value')?.textContent ?? '';
        return /^\\+[0-9,]+$/.test(text) && Number(text.slice(1).replaceAll(',', '')) > ${previous};
      })()`);
      const sample = await phone.evaluate(`(() => {
        const s = castleSample.snapshot(), output = document.querySelector('#mastery-earned');
        return { kills:s.kills, battle:{ survival:s.bph.survival, killMedals:s.bph.killMedals, pendingMastery:s.bph.pendingMastery },
          text:output.textContent, label:output.getAttribute('aria-label'), visible:output.getBoundingClientRect().height > 0 && !output.hidden,
          barHidden:document.querySelector('#xp').hidden, level:s.level,
          legacyLevelingDisabled:s.nextXp === Infinity };
      })()`);
      if (!sample || typeof sample !== "object") throw new Error("Missing mastery HUD observation");
      const battle = Reflect.get(sample, "battle");
      if (!battle || typeof battle !== "object") throw new Error("Missing battle reward state");
      const earned = bphBattleMedals({ bph: battle } as Run);
      expect(earned).toBeGreaterThan(previous);
      expect(Reflect.get(sample, "text")).toBe(`+${earned.toLocaleString("en-US")}`);
      expect(Reflect.get(sample, "label")).toBe(`강화 포인트 +${earned.toLocaleString("en-US")}`);
      expect(Reflect.get(sample, "visible")).toBe(true);
      expect(Reflect.get(sample, "barHidden")).toBe(true);
      expect(Reflect.get(sample, "level")).toBe(1);
      expect(Reflect.get(sample, "legacyLevelingDisabled")).toBe(true);
      samples.push(sample); previous = earned;
    }
    await phone.evaluate("new Promise(resolve=>window.__masteryNativeRaf(()=>window.__masteryNativeRaf(resolve)))");
    await phone.shot(`${out}/past-nine-390.png`);
    expect(phone.errors).toEqual([]);
  } finally {
    await Bun.write(`${out}/simulation-progress.json`, JSON.stringify(progress, null, 2));
    await Bun.write(`${out}/samples.json`, JSON.stringify(samples, null, 2));
    server.stop(true);
    await closeBrowser(phone.view, profile);
  }
}, 120000);
