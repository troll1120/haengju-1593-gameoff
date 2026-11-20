import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chaosArena, chaosEnemy } from "../src/chaos-test-fixture";
import { advance, chooseGeneral } from "../src/rules";
import { raiseChaosLevel } from "../src/chaos-growth";
import { setFieldSize } from "../src/geometry";
import { previewResponse } from "./serve";
import { reviewBrowserSession, passFirstBattleGuide } from "./review-browser";

const out = resolve(Bun.argv[2] ?? "badge-evidence");
await mkdir(out, { recursive: true });
const server = Bun.serve({ port: 0, hostname: "127.0.0.1",
  fetch: request => previewResponse(request, resolve("review-dist")) });
const browser = reviewBrowserSession();
const evidence: unknown[] = [];
try {
  for (const width of [390, 1280]) for (const mode of ["normal", "disabled", "flashes-off", "reduced-motion"]) {
    const enabled = mode !== "disabled";
    const page = await browser.open(width, 844);
    await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source:
      `localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,firstBattleGuide:true,flashesOff:${mode === "flashes-off"}}));` });
    if (mode === "reduced-motion")
      await page.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7${enabled ? "" : "&lvbadge=0"}`);
    const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+45000;function check(){if(${condition})return resolve(true);
      if(performance.now()>end)return reject(new Error(${JSON.stringify(condition)}));
      requestAnimationFrame(check)}check()})`);
    await ready("window.castleSample && !document.querySelector('#start').disabled");
    await page.tapElement("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await page.tapElement("[data-bph-start]");
    await passFirstBattleGuide(page);
    await ready("castleSample.snapshot().time>1 && !castleSample.snapshot().paused");
    const field = await page.evaluate("castleSample.snapshot().field") as { width: number; height: number };
    setFieldSize(field.width, field.height);
    type Property = { name: string; value?: { objectId?: string; type?: string } };
    const properties = (objectId: string) => page.view.cdp("Runtime.getProperties", { objectId, ownProperties: true }) as Promise<{
      result: Property[]; internalProperties?: Property[];
    }>;
    const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" }) as { result: { objectId: string } };
    const scopes = (await properties(fn.result.objectId)).internalProperties?.find(p => p.name === "[[Scopes]]")?.value?.objectId;
    assert(scopes);
    for (const scope of (await properties(scopes)).result) if (scope.value?.objectId) {
      for (const variable of (await properties(scope.value.objectId)).result) {
        if (variable.value?.type !== "object" || !variable.value.objectId) continue;
        await page.view.cdp("Runtime.callFunctionOn", { objectId: variable.value.objectId,
          functionDeclaration: `function(){
            if(this&&this.scene&&this.scene.getScene&&this.canvas)globalThis.__captureGame=this;
            if(this&&Array.isArray(this.squads)&&Array.isArray(this.enemies)&&this.metrics&&this.bph)globalThis.__captureRun=this;
          }` });
      }
    }
    await page.evaluate(`(()=>{
      __captureGame.loop.stop();globalThis.__captureScene=__captureGame.scene.getScene("castle");
      globalThis.__captureNow=__captureScene.time.now+2000;
      globalThis.__badgeFlashes=0;
      globalThis.__buttonCasts=[];
      const animate=Element.prototype.animate;
      Element.prototype.animate=function(...args){
        if(this.classList.contains("skill-level-badge"))__badgeFlashes++;
        if(args[1]?.id==="skill-cast")__buttonCasts.push({
          tag:this.tagName,skill:this.classList.contains("skill"),duration:args[1].duration,
          wrapped:this.parentElement.classList.contains("skill-slot")});
        return animate.apply(this,args);
      };return true;
    })()`);
    const run = chaosArena("권율", 0);
    run.bph!.save.unlockedGenerals.push("황진");
    run.generalOffers = ["황진"];
    chooseGeneral(run, "황진");
    for (const squad of run.squads) {
      squad.y = squad.homeY = squad.targetY = 180;
      squad.skillClock = 15;
      chaosEnemy(run, squad.x + 35, squad.y);
    }
    for (let tick = 0; tick < 30; tick++) advance(run, 1 / 30);
    for (const [name, level, tier, flash] of [
      ["lv1", 1, 1, false], ["lv7", 7, 1, false], ["lv20-awakened", 20, 3, false],
      ["same-level-redraw", 20, 3, false], ["ready-state", 20, 3, false],
      ["before-flash", 19, 3, false], ["level-up-flash", 20, 3, true],
    ] as const) {
      if (!enabled && name !== "lv1") continue;
      if (mode !== "normal" && mode !== "disabled" && !["lv1", "lv7", "same-level-redraw"].includes(name)) continue;
      raiseChaosLevel(run.chaos!, level);
      for (const squad of run.squads) {
        squad.tier = tier; squad.awakened = tier - 1; squad.skillClock = name === "ready-state" || !enabled ? 0 : 15;
      }
      Object.assign(run.bph!, { upgrades: Array.from({ length: (tier - 1) * 3 }, (_, index) => ({
        nodeId: "SN_HeroDmg", type: "HeroAttackPower", value: .25,
        effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
        targets: { placementId: `growth:${index}`, nodeType: "0" },
      })) });
      const proof = await page.evaluate(`(()=>{
        const scene=__captureScene,s=${JSON.stringify(run)},battle=__captureRun.bph,flashesBefore=__badgeFlashes;
        for(const key of Object.keys(battle))delete battle[key];Object.assign(battle,s.bph);s.bph=battle;
        for(const key of Object.keys(__captureRun))delete __captureRun[key];
        Object.assign(__captureRun,s);scene.accumulator=0;scene.frames=4;scene.hitStopUntil=0;
        __captureNow+=1000/30;scene.time.update(__captureNow,1000/30);
        scene.update(__captureNow,0);
        scene.game.renderer.preRender();scene.game.scene.render(scene.game.renderer);scene.game.renderer.postRender();
        const badges=[...document.querySelectorAll(".skill-level-badge")];
        const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
        const samples=badges.map(b=>{
          const animations=b.getAnimations();
          for(const a of animations){a.pause();a.currentTime=${flash ? 60 : 520}}
          return {text:b.textContent,tier:b.dataset.tier,animations:animations.length,
            box:rect(b.getBoundingClientRect()),font:getComputedStyle(b).fontFamily,
            border:getComputedStyle(b).borderColor,
            portrait:rect(b.parentElement.querySelector(".skill-portrait").getBoundingClientRect()),
            art:rect(b.parentElement.querySelector(".skill-art").getBoundingClientRect()),
            button:rect(b.parentElement.querySelector("button").getBoundingClientRect()),
            outsideButton:!b.closest("button")};
        });
        const otherUi=[...document.querySelectorAll(".xp,.bph-recruit-strip > .bph-recruit-cell,#synergies,#notice")]
          .filter(e=>!e.hidden&&getComputedStyle(e).display!=="none")
          .flatMap(e=>{
            const r=e.getBoundingClientRect(),boxes=[rect(r)],before=getComputedStyle(e,"::before");
            if(before.content!=="none"&&before.display!=="none"&&parseFloat(before.height)>0)
              boxes.push({x:r.x+(parseFloat(before.left)||0),y:r.y+(parseFloat(before.top)||0),
                width:parseFloat(before.width)||r.width,height:parseFloat(before.height)});
            return boxes;
          }).filter(r=>r.width&&r.height);
        const xp=document.querySelector(".xp"),xpStyle=getComputedStyle(xp),xpFrame=getComputedStyle(xp,"::before");
        const xpFrameTop=xp.parentElement.getBoundingClientRect().bottom-parseFloat(xpStyle.bottom)
          -parseFloat(xpStyle.height)+parseFloat(xpFrame.top);
        return {mode:${JSON.stringify(mode)},query:location.search,enabled:${enabled},level:s.chaos.level,tier:${tier},samples,
          otherUi,xpFrameTop,newFlashes:__badgeFlashes-flashesBefore};
      })()`) as { newFlashes: number; xpFrameTop: number; otherUi: { x: number; y: number; width: number; height: number }[];
        samples: { text: string; tier: string; animations: number; outsideButton: boolean;
        box: { x: number; y: number; width: number; height: number };
        portrait: { x: number; y: number; width: number; height: number };
        art: { x: number; y: number; width: number; height: number };
        button: { x: number; y: number; width: number; height: number } }[] };
      assert.equal(proof.samples.length, enabled ? 2 : 0);
      for (const sample of proof.samples) {
        assert.equal(sample.text, String(level));
        assert.equal(sample.tier, String(tier));
        if (flash) assert.equal(sample.animations, 1);
        const a = sample.box;
        assert(sample.outsideButton, "Number must be outside the clickable button");
        assert(a.y >= sample.button.y + sample.button.height, "Number must be below its button");
        assert(Number.isFinite(proof.xpFrameTop));
        assert(proof.xpFrameTop - (a.y + a.height) >= 4, "Number must clear the XP frame by at least 4px");
        for (const b of [...proof.samples.flatMap(other => [other.portrait, other.art, other.button]), ...proof.otherUi]) {
          const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
            * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
          assert.equal(overlap, 0, "Number must not overlap any skill art, portrait, button or nearby UI");
        }
        assert(a.x >= 0 && a.x + a.width <= width && a.y >= 0 && a.y + a.height <= 844);
      }
      if (mode !== "normal" || ["same-level-redraw", "ready-state", "before-flash", "lv1"].includes(name))
        assert.equal(proof.newFlashes, 0);
      else assert.equal(proof.newFlashes, 2);
      evidence.push({ width, name, proof });
      if (mode === "normal" && name === "ready-state" || mode === "disabled") {
        assert(await page.tapElement("#skills button"), "Skill button must receive a real touch");
        const casts = await page.evaluate("__buttonCasts");
        assert.deepEqual(casts, [{ tag: "BUTTON", skill: true, duration: 120, wrapped: enabled }]);
        evidence.push({ width, mode, acceptedCast: casts });
      }
      if (["same-level-redraw", "ready-state", "before-flash"].includes(name) || (mode !== "normal" && mode !== "disabled")) continue;
      const file = `${width}-${enabled ? name : "disabled-no-badge"}.png`;
      await page.shot(`${out}/${file}`);
      evidence.push({ file });
    }
    assert.equal(page.errors.length, 0, page.errors.join("\n"));
    await browser.reset();
  }
  await Bun.write(`${out}/manifest.json`, JSON.stringify(evidence, null, 2));
} finally {
  await browser.close(); server.stop(true);
}
console.log("BADGE_CAPTURE_DONE exit=0");
