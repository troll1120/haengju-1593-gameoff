import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";
import { createServer } from "vite";
import { reviewBrowserSession, passFirstBattleGuide } from "./review-browser";
import { createBphRun } from "../src/bph-session";
import { freshMeta } from "../src/meta";
import { BPH_CASTLE_UNLOCK_PLACEMENTS } from "../src/bph-castle-buildings";
import { advance } from "../src/rules";
import { setFieldSize } from "../src/geometry";

const [folder, label, mode = "courtyard"] = Bun.argv.slice(2);
assert(folder && label, "Evidence folder and label are required");
await mkdir(folder, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0 },
  plugins: [{ name: "refresh-keep-capture", enforce: "pre", transform(source, id) {
    if (id.split("?")[0] === resolve("src/main.ts"))
      return `${source}
        import { bphFxContext as keepCaptureContext } from "./bph-fx-dispatch";
        globalThis.__refreshKeepCapture = () => {
          Object.assign(keepCaptureContext(run), { effects: run.bph.upgrades, state: run.bph.fx });
          updateBphField?.();
        };`;
  } }] });
await server.listen();
const url = server.resolvedUrls!.local[0];
const browser = reviewBrowserSession();
const results: unknown[] = [];
try {
  for (const [width, height] of mode === "pennant" ? [[390, 844]] : [[390, 844], [1280, 800]]) {
    const page = await browser.open(width, height);
    await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source:
      'localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,firstBattleGuide:true}));' });
    await page.view.navigate(`${url}?seed=7`);
    const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+45000;function check(){try{if(${condition})return resolve(true);
      if(performance.now()>end)return reject(new Error(${JSON.stringify(condition)}));
      requestAnimationFrame(check);}catch(error){reject(error)}}check()})`);
    await ready("window.castleSample && !document.querySelector('#start').disabled");
    await page.tapElement("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await page.tapElement("[data-bph-start]");
    await passFirstBattleGuide(page);
    await ready("castleSample.snapshot().time>1 && !castleSample.snapshot().paused");
    type Property = { name: string; value?: { objectId?: string; type?: string } };
    const properties = (objectId: string) => page.view.cdp("Runtime.getProperties", { objectId, ownProperties: true }) as Promise<{
      result: Property[]; internalProperties?: Property[];
    }>;
    const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" }) as { result: { objectId: string } };
    const scopes = (await properties(fn.result.objectId)).internalProperties?.find(p => p.name === "[[Scopes]]")?.value?.objectId;
    assert(scopes);
    let found = false, live = false;
    for (const scope of (await properties(scopes)).result) if (scope.value?.objectId) {
      for (const variable of (await properties(scope.value.objectId)).result) {
        if (variable.value?.type !== "object" || !variable.value.objectId) continue;
        const result = await page.view.cdp("Runtime.callFunctionOn", { objectId: variable.value.objectId, returnByValue: true,
          functionDeclaration: `function(){
            if(this&&this.scene&&this.scene.getScene&&this.canvas){globalThis.__keepGame=this;return "game"}
            if(this&&Array.isArray(this.squads)&&this.metrics&&this.bph){globalThis.__keepRun=this;return "run"}
            return "";
          }` }) as { result: { value?: string } };
        found ||= result.result.value === "game";
        live ||= result.result.value === "run";
      }
      if (found && live) break;
    }
    assert(found && live, "Live game and run missing");
    const field = await page.evaluate("castleSample.snapshot().field") as { width: number; height: number };
    setFieldSize(field.width, field.height);
    const fixture = createBphRun(freshMeta(), { seed: 7, general: "권율",
      upgrades: Object.values(BPH_CASTLE_UNLOCK_PLACEMENTS).map(placementId => ({
        nodeId: "SN_Building_Basic_Unlock", type: "UnlockBuilding", value: 1,
        effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
        targets: { targetBuilding: "Building_1Basic", placementId },
      })) });
    for (let tick = 0; tick < 200; tick++) advance(fixture, .05);
    const proof = await page.evaluate(`(()=>{
      __keepGame.loop.stop();const scene=__keepGame.scene.getScene("castle");
      const s=${JSON.stringify(fixture)},battle=__keepRun.bph;
      for(const key of Object.keys(battle))delete battle[key];
      Object.assign(battle,s.bph);s.bph=battle;
      for(const key of Object.keys(__keepRun))delete __keepRun[key];
      Object.assign(__keepRun,s);
      scene.accumulator=0;scene.frames=4;scene.hitStopUntil=0;
      scene.update(scene.time.now+1000/30,0);
      globalThis.__refreshKeepCapture();
      scene.game.renderer.preRender();scene.game.scene.render(scene.game.renderer);scene.game.renderer.postRender();
      const ring=document.querySelector(".bph-barracks-ring");
      const canvas=scene.game.canvas.getBoundingClientRect(),camera=scene.cameras.main,tent=scene.keep.tent;
      const x=canvas.left+(camera.x+(tent.x-camera.worldView.x)*camera.zoom)/scene.scale.width*canvas.width;
      const y=canvas.top+(camera.y+(tent.y-camera.worldView.y)*camera.zoom)/scene.scale.height*canvas.height;
      return {snapshot:castleSample.snapshot(), ring: ring ? {hidden:ring.hidden,frame:ring.style.getPropertyValue("--ring")}:null,
        courtyardFlags:scene.yard.flag ? 1 : 0,
        buildings:{keep:tent.visible,hall:scene.yard.hall.visible,forge:scene.yard.forge.visible},
        crop:{x:x-90,y:y-95,width:180,height:115,scale:3}};
    })()`);
    const path = resolve(folder, `${label}-${width}x${height}.png`);
    await page.shot(path);
    const visible = proof as { ring: { hidden: boolean; frame: string } | null; courtyardFlags: number;
      buildings: { keep: boolean; hall: boolean; forge: boolean } };
    assert.deepEqual(visible.buildings, { keep: true, hall: true, forge: true });
    assert.equal(visible.courtyardFlags, mode !== "pennant" && label === "before" ? 1 : 0);
    if (mode !== "pennant" && label === "before") {
      assert.equal(visible.ring?.hidden, false);
      assert.equal(visible.ring?.frame, "6");
    } else assert.equal(visible.ring, null);
    const crop = await page.view.cdp("Page.captureScreenshot", { format: "png",
      clip: (proof as { crop: object }).crop }) as { data: string };
    await Bun.write(resolve(folder, `${label}-${width}x${height}-keep.png`), Buffer.from(crop.data, "base64"));
    results.push({ width, height, path, proof, errors: [...page.errors] });
    assert.equal(page.errors.length, 0, page.errors.join("\n"));
    await browser.reset();
  }
  await Bun.write(resolve(folder, `${label}-capture.json`), JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await server.close();
}
console.log(`KEEP_CAPTURE_DONE ${label} exit=0`);
