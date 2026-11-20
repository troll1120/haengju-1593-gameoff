import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chaosArena, chaosEnemy } from "../src/chaos-test-fixture";
import { advance, useSkill } from "../src/rules";
import { passFirstBattleGuide, reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";

// Run from a built source copy: bun scripts/capture-general-split.ts artifacts SOURCE
// The screenshots are real Phaser frames, not replacement or composited artwork.
const out = resolve(Bun.argv[2] ?? "artifacts");
const source = Bun.argv[3];
if (!source) throw new Error("Pass the measured commit/worktree description as argument 3");
await mkdir(out, { recursive: true });
await Bun.write(`${out}/SOURCE.txt`, `Source: ${source}\nUnit: single deterministic fixture per case; seed 144; no averages.\nViewport: 600x1000; Gwon 390x844; 12 fps; simulation 30 Hz.\nBasic: Lv1. Special/manual: Lv20. Separate automatic mechanisms are parked when another is demonstrated.\nActual Phaser rendering over simulated combat snapshots; manual calls rules.useSkill.\n`);
const server = Bun.serve({ port: 0, hostname: "127.0.0.1",
  fetch: request => previewResponse(request, resolve("dist")) });
const browser = reviewBrowserSession();
function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) throw new Error(`Missing ${key}`);
  return Reflect.get(value, key);
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected CDP list");
  return value;
}
const manifest: unknown[] = [];
try {
  for (const general of ["이순신", "황진", "권율"] as const) {
    for (const mode of ["basic", "special", "manual"] as const) {
      const slug = `${general === "이순신" ? "yi" : general === "권율" ? "gwon" : "hwang"}-${mode}`;
      const dir = `${out}/${slug}`;
      await mkdir(dir, { recursive: true });
      const run = chaosArena(general, mode === "basic" ? 0 : 20), squad = run.squads[0];
      squad.x = squad.homeX = squad.targetX = 125;
      squad.y = squad.homeY = squad.targetY = 230;
      squad.clock = 0;
      const specialAttack = Reflect.get(squad, "specialAttack");
      if (specialAttack) {
        specialAttack.clock = mode === "special" ? .9 : 1e9;
        if (mode !== "basic") squad.clock = 1e9;
      }
      const target = chaosEnemy(run, general === "이순신" ? 225 : 155, 230);
      target.boss = true;
      const frames: { run: string; effects: ReturnType<typeof advance> }[] = [];
      let found = mode !== "special", start = 0;
      const duration = 90;
      // Let the real rules reach a passive trigger, retaining its lead-in.
      for (let tick = 0; tick < 30 * 90; tick++) {
        const effects = [
          ...(mode === "manual" && tick === 12 ? useSkill(run, 0) : []),
          ...advance(run, 1 / 30),
        ];
        frames.push({ run: JSON.stringify(run), effects });
        const passive = (run.chaos?.fleet.length ?? 0) + (run.chaos?.rings.length ?? 0)
          + (run.chaos?.stomps.length ?? 0) + (run.chaosSkills?.events.filter(e => e.trigger === "army").length ?? 0);
        const special = effects.some(effect => Reflect.get(effect, "mechanism") === "special");
        if (!found && (passive > 0 || special)) { found = true; start = Math.max(0, tick - 12); }
        if (found && tick >= start + duration) break;
      }
      if (!found) throw new Error(`${slug}: no passive special found within 90 simulation seconds`);
      const selected = frames.slice(start, start + duration);
      const width = general === "권율" ? 390 : 600, height = general === "권율" ? 844 : 1000;
      const page = await browser.open(width, height);
      await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", {
        source: 'localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,timers:true}));',
      });
      await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
      const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
        const end=performance.now()+30000;function check(){if(${condition})return resolve(true);
        if(performance.now()>end)return reject(new Error(${JSON.stringify(condition)}));requestAnimationFrame(check)}check()})`);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      await page.tapElement("#start");
      await ready("document.querySelector('[data-bph-start]')");
      await page.tapElement("[data-bph-start]");
      await passFirstBattleGuide(page);
      await ready("castleSample.snapshot().time>1");
      const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" });
      const props = await page.view.cdp("Runtime.getProperties", { objectId: field(field(fn, "result"), "objectId") });
      const scopesProperty = list(field(props, "internalProperties")).find(p => field(p, "name") === "[[Scopes]]");
      const scopes = await page.view.cdp("Runtime.getProperties", { objectId: field(field(scopesProperty, "value"), "objectId") });
      let bound = false;
      for (const scope of list(field(scopes, "result"))) {
        if (field(scope, "name") === "length") continue;
        const vars = await page.view.cdp("Runtime.getProperties", { objectId: field(field(scope, "value"), "objectId"), ownProperties: true });
        for (const variable of list(field(vars, "result"))) {
          if (field(field(variable, "value"), "type") !== "object") continue;
          const objectId = field(field(variable, "value"), "objectId");
          if (typeof objectId !== "string") continue;
          const result = await page.view.cdp("Runtime.callFunctionOn", { objectId, returnByValue: true,
            functionDeclaration: "function(){if(this.scene&&this.scene.getScene&&this.canvas){globalThis.__captureGame=this;return true}return false}" });
          if (field(field(result, "result"), "value") === true) { bound = true; break; }
        }
        if (bound) break;
      }
      if (!bound) throw new Error("Phaser game not found");
      await page.evaluate(`(()=>{
        __captureGame.loop.stop();globalThis.__captureScene=__captureGame.scene.getScene("castle");
        const scene=__captureScene,s=${selected[0].run};
        scene.positions.clear();scene.entered.clear();scene.bars.clear();scene.healthBoxes.length=0;
        scene.troops.forEach(t=>{t.leader.sprite.destroy();t.troopers.forEach(u=>u.sprite.destroy())});
        scene.foes.forEach(sprite=>sprite.destroy());scene.foes.clear();scene.strides.clear();
        scene.troops=[scene.muster(s.squads[0],"")];
        globalThis.__captureNow=scene.time.now;
        return true;
      })()`);
      const evidence: unknown[] = [];
      let shot = 0;
      for (let tick = 0; tick < selected.length; tick++) {
        const frame = selected[tick];
        const result = await page.evaluate(`(()=>{
          const scene=__captureScene,s=${frame.run},batch=${JSON.stringify(frame.effects)};
          __captureNow+=1000/30;scene.time.update(__captureNow,1000/30);
          scene.tweens.update(__captureNow,1000/30);
          scene.children.list.forEach(o=>{if(o.anims)o.anims.update(__captureNow,1000/30)});
          scene.positions.clear();scene.bars.clear();scene.healthBoxes.length=0;
          scene.syncFoes(s,1);
          const shown=scene.stage(batch,s,true,1000/30,1);
          for(const effect of shown){
            const striker=scene.trooperOf(effect);
            if(striker&&effect.mechanism!=="special"&&(effect.kind==="shot"||effect.kind==="swing")){
              striker.strikeAt=scene.time.now;striker.aimX=effect.x;striker.aimY=effect.y;
            }
            scene.show(effect,s);
          }
          const before=JSON.stringify(s);
          scene.syncTroops(s);scene.syncShots(s);scene.uniqueSkillView?.sync(s,false);
          scene.game.renderer.preRender();scene.game.scene.render(scene.game.renderer);scene.game.renderer.postRender();
          if(before!==JSON.stringify(s))throw new Error("Rendering changed simulation bytes");
          const leader=scene.troops[0].leader.sprite;
          return {time:s.time,body:{texture:leader.texture.key,frame:leader.frame.name,x:leader.x,y:leader.y},
            effects:batch.map(e=>({kind:e.kind,label:e.label,attackId:e.attackId,mechanism:e.mechanism})),
            specialAttack:s.squads[0].specialAttack,passive:s.chaos,skillEvents:s.chaosSkills?.events};
        })()`);
        if (Math.floor(tick * 12 / 30) >= shot) {
          await page.shot(`${dir}/${String(shot++).padStart(3, "0")}.png`);
          evidence.push(result);
        }
      }
      await Bun.write(`${dir}/frames.json`, JSON.stringify(evidence, null, 2));
      const encoder = Bun.spawn(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "12",
        "-i", `${dir}/%03d.png`, "-filter_complex",
        "[0:v]split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0", `${out}/${slug}.gif`],
      { env: process.env, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
      const encoderExit = await encoder.exited;
      if (encoderExit !== 0) throw new Error(`${slug}: ffmpeg exit ${encoderExit}`);
      manifest.push({ slug, source, general, mode, level: mode === "basic" ? 1 : 20,
        seed: 144, frames: shot, fps: 12, viewport: [width, height], firstSimulationTick: start,
        encoderExit, errors: [...page.errors] });
      await Bun.write(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
      if (page.errors.length) throw new Error(page.errors.join("\n"));
      await browser.reset();
      console.log(`CAPTURE_CASE ${slug} frames=${shot} exit=0`);
    }
  }
} finally {
  await browser.close();
  server.stop(true);
}
console.log("CAPTURE_SPLIT_ALL exit=0");
