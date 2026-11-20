import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

// Preserve 3edc4ab's held-touch rect contract in the shared bottom HUD.
test("the paid recruit cell stays in the bottom HUD during a held touch and after purchase", async () => {
  const root = resolve(import.meta.dir, "..");
  const out = resolve(process.env.CASTLE_RECRUIT_EVIDENCE ?? `${root}/review/recruit-position`);
  await mkdir(out, { recursive: true });
  const profile = await mkdtemp(`${out}/chrome-profile-`);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, process.env.CASTLE_TEST_DIST ?? `${root}/review-dist`) });
  const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const measurements: Record<string, unknown> = {};
  const recruit = ".bph-field-dock > .bph-recruit-strip > .bph-recruit-cell";
  const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 25000;
    function check() {
      if (${expression}) resolve(true);
      else if (performance.now() > deadline) reject(new Error("Recruit condition not reached: " + ${JSON.stringify(expression)}));
      else requestAnimationFrame(check);
    } check();
  })`);
  const positions = () => phone.evaluate(`['#app','#arena canvas',${JSON.stringify(recruit)}].map(s=>{
    const r=document.querySelector(s).getBoundingClientRect();return [r.x,r.y,r.width,r.height];
  })`);
  try {
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
    expect(await phone.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
    expect(await phone.tapElement("[data-bph-start]")).toBe(true);
    await ready("!castleSample.snapshot().attract");
    await passFirstBattleGuide(phone);
    await ready("!castleSample.snapshot().paused");
    // As in A03, drive only the external frame clock during battle setup.
    await phone.evaluate(`new Promise(resolve=>{
      const native=requestAnimationFrame.bind(window);
      window.__recruitNativeRaf=native;window.__recruitQueue=[];
      window.__recruitNativeNow=performance.now.bind(performance);
      window.requestAnimationFrame=callback=>window.__recruitQueue.push(callback);
      native(()=>native(()=>resolve(true)));
    })`);
    const setup = await phone.evaluate(`(() => {
      window.__recruitClock=window.__recruitNativeNow();
      Object.defineProperty(performance,"now",{configurable:true,value:()=>window.__recruitClock});
      const start=castleSample.snapshot().time, wallStart=Date.now();
      let frames=0;
      for(;frames<=60*45;frames++){
        const s=castleSample.snapshot();
        if(s.kills>0&&s.gold>=4||s.time-start>=45||Date.now()-wallStart>25000)break;
        window.__recruitClock+=1000/60;
        for(const callback of window.__recruitQueue.splice(0))callback(window.__recruitClock);
      }
      const s=castleSample.snapshot();
      const result={frames,time:s.time,simSeconds:s.time-start,wallMs:Date.now()-wallStart,
        kills:s.kills,gold:s.gold,ready:s.kills>0&&s.gold>=4};
      // Hand back native frame pacing with a continuous clock before the real held touch.
      const offset=window.__recruitClock-window.__recruitNativeNow();
      Object.defineProperty(performance,"now",{configurable:true,value:()=>window.__recruitNativeNow()+offset});
      window.requestAnimationFrame=callback=>window.__recruitNativeRaf(time=>callback(time+offset));
      for(const callback of window.__recruitQueue.splice(0))requestAnimationFrame(callback);
      return result;
    })()`);
    measurements.setup = setup; console.log("RECRUIT_SETUP", JSON.stringify(setup));
    if (!setup || typeof setup !== "object" || Reflect.get(setup, "ready") !== true)
      throw new Error("Recruit setup did not reach the press check: " + JSON.stringify(setup));
    const before = await positions(), box = await phone.rect(recruit);
    if (!box) throw new Error("Missing recruit hit box");
    expect(await phone.evaluate(`(() => {
      const cell = document.querySelector(${JSON.stringify(recruit)});
      const dock = cell.parentElement.parentElement.getBoundingClientRect();
      return !cell.disabled && dock.top > innerHeight / 2 && dock.bottom <= innerHeight;
    })()`)).toBe(true);
    measurements.before = before;
    await phone.view.cdp("DOM.enable");
    await phone.view.cdp("CSS.enable");
    const document = await phone.view.cdp("DOM.getDocument");
    if (!document || typeof document !== "object") throw new Error("Missing DOM document");
    const documentRoot = Reflect.get(document, "root");
    if (!documentRoot || typeof documentRoot !== "object") throw new Error("Missing DOM root");
    const target = await phone.view.cdp("DOM.querySelector", {
      nodeId: Reflect.get(documentRoot, "nodeId"), selector: recruit,
    });
    if (!target || typeof target !== "object") throw new Error("Missing recruit DOM target");
    const nodeId = Reflect.get(target, "nodeId");
    if (typeof nodeId !== "number" || nodeId === 0) throw new Error("Missing recruit DOM id");
    await phone.view.cdp("Input.dispatchTouchEvent", { type: "touchStart",
      touchPoints: [{ x: box.x + box.w / 2, y: box.y + box.h / 2, id: 1 }] });
    // Keep the real stylesheet's pressed state observable; transient touch activation
    // otherwise let the unchanged faulty build pass without ever testing :active.
    await phone.view.cdp("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] });
    measurements.pressedState = "held touch with deterministic native CSS :active fixture";
    await phone.shot(`${out}/held.png`);
    measurements.pressed = await positions();
    expect(measurements.pressed).toEqual(before);
    await phone.view.cdp("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
    await phone.view.cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await ready("!document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden");
    await phone.shot(`${out}/after.png`);
    measurements.after = await positions();
    expect(measurements.after).toEqual(before);
    expect(await phone.evaluate(`document.querySelector(${JSON.stringify(recruit)}).disabled`)).toBe(false);
    expect(phone.errors).toEqual([]);
  } finally {
    await Bun.write(`${out}/measurements.json`, JSON.stringify(measurements, null, 2));
    phone.view.close(); server.stop(true);
    await rm(profile, { recursive: true });
  }
}, 120000);
