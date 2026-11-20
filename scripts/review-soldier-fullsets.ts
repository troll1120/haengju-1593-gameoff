import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { createBphRun } from "../src/bph-session";
import { addBphProfile } from "../src/bph-combat";
import { BPH_PROFILES } from "../src/bph-data";
import { fullsetArt, SOLDIER_ALLY_ART } from "../src/fullset-art";

const root = resolve(import.meta.dir, ".."), out = `${root}/out/soldier-fullsets`;
await mkdir(out, { recursive: true });
const profile = await mkdtemp(`${tmpdir()}/castle-soldier-fullsets-`);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, `${root}/review-dist`) });
const page = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
  const end=performance.now()+30000;function frame(){if(${condition})return requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)));
  if(performance.now()>end)return reject(new Error(${JSON.stringify(condition)}));requestAnimationFrame(frame)}frame()})`);
function field(value: unknown, ...keys: readonly (string | number)[]): unknown {
  let result = value;
  for (const key of keys) {
    if (typeof result !== "object" || result === null) throw new Error(`Missing CDP ${key}`);
    result = Reflect.get(result, key);
  }
  return result;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Missing CDP list");
  return value;
}
const captures: string[] = [], checks: unknown[] = [];
async function capture(name: string): Promise<void> {
  const file = `${out}/${name}.png`;
  await page.shot(file); captures.push(file);
}
try {
  await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source:
    `localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,timers:true}));` });
  for (const [width, height] of [[390, 844], [1440, 1000]]) {
    await page.view.resize(width, height);
    await page.view.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 390 });
    await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7&codex=all`);
    await ready(`document.querySelector(".bph-codex-card") && !document.querySelector("#app").classList.contains("loading")`);
    for (const [index, id] of [[1, "Hero2_Knight"], [2, "Hero3_DemonSlayer"]] as const) {
      await page.tapElement(`.bph-codex-classes button:nth-child(${index})`);
      await ready(`document.querySelector('[data-codex-key="${id}"]')`);
      await page.evaluate(`document.querySelector('[data-codex-key="${id}"]').click()`);
      await ready(`document.querySelector(".bph-codex-page")?.dataset.view==="${id}"`);
      await page.evaluate(`Promise.all([...document.querySelectorAll(".bph-codex-screen img")].filter(i=>i.src).map(i=>i.decode()))`);
      checks.push(await page.evaluate(`(()=>({codex:"${id}",width:innerWidth,
        textures:[...document.querySelectorAll(".bph-codex-page .bph-codex-art")].map(n=>n.dataset.texture),
        overflow:document.documentElement.scrollWidth>innerWidth}))()`));
      await capture(`codex-${id}-${width}`);
    }
  }
  await page.view.resize(390, 844);
  await page.view.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
  await ready(`window.castleSample && !document.querySelector("#start").disabled`);
  await page.tapElement("#start");
  await ready(`document.querySelector("[data-bph-start]")`);
  await page.tapElement("[data-bph-start]");
  await passFirstBattleGuide(page);
  await ready(`castleSample.snapshot().time>1 && castleSample.snapshot().enemyUnits.length>0`);
  const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" });
  const props = await page.view.cdp("Runtime.getProperties", { objectId: field(fn, "result", "objectId") });
  const scopesProperty = list(field(props, "internalProperties")).find(p => field(p, "name") === "[[Scopes]]");
  const scopes = await page.view.cdp("Runtime.getProperties", { objectId: field(scopesProperty, "value", "objectId") });
  let bound = false;
  for (const scope of list(field(scopes, "result"))) {
    if (field(scope, "name") === "length") continue;
    const vars = await page.view.cdp("Runtime.getProperties", { objectId: field(scope, "value", "objectId"), ownProperties: true });
    for (const variable of list(field(vars, "result"))) {
      if (field(variable, "value", "type") !== "object") continue;
      const id = field(variable, "value", "objectId");
      if (!id) continue;
      const result = await page.view.cdp("Runtime.callFunctionOn", { objectId: id, returnByValue: true,
        functionDeclaration: "function(){if(this.scene&&this.scene.getScene&&this.canvas){globalThis.__soldierGame=this;return true}return false}" });
      if (field(result, "result", "value") === true) { bound = true; break; }
    }
    if (bound) break;
  }
  if (!bound) throw new Error("Phaser game not found");
  const fixture = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  for (const classId of ["spearman", "archer", "monk", "hwacha"]) {
    const unit = Object.values(BPH_PROFILES).find(p => p.classId === classId);
    if (!unit) throw new Error(`Missing ${classId}`);
    addBphProfile(fixture, { profileId: unit.id, copies: 1, foil: false, discovered: false }, { packId: "DeliveryBox", cause: "pack" });
  }
  await page.evaluate(`(()=>{
    const game=__soldierGame,scene=game.scene.getScene("castle"),s=castleSample.snapshot(),q=s.squads[0];
    game.loop.stop();scene.positions.clear();scene.foes.forEach(sprite=>sprite.destroy());scene.foes.clear();
    q.x=195;q.y=515;q.state="guard";q.strikeAt=0;q.soldiers=${JSON.stringify(fixture.squads[0].soldiers)}
      .map((u,i)=>({...u,id:10000+i,x:62+i*87,y:245,emerging:false,strikeAt:0,perch:undefined}));
    s.squads.splice(1);scene.troops.forEach(t=>{t.leader.sprite.destroy();t.troopers.forEach(u=>{u.sprite.destroy();u.prism?.destroy()})});
    scene.troops=[scene.muster(q,"")];scene.entered.clear();scene.bars.clear();scene.healthBoxes.length=0;
    const model=s.enemyUnits.find(e=>!e.boss&&e.kind!=="ship");
    window.__soldierCurrent={...s,time:100,enemies:["yari","samurai","teppo"].map((kind,i)=>({...model,id:20000+i,kind,
      boss:false,elite:false,bossArt:undefined,ladder:false,x:100+i*95,y:370,strikeAt:0,casting:0,prey:undefined})),telegraphs:[]};
  })()`);
  for (const direction of ["side", "front", "back"]) for (const pose of ["walk", "attack"]) {
    const seen = await page.evaluate(`(()=>{
      const game=__soldierGame,scene=game.scene.getScene("castle"),s=__soldierCurrent,now=scene.time.now;
      const attack=${pose === "attack"},direction="${direction}",dx=direction==="side"?-8:0,dy=direction==="front"?8:direction==="back"?-8:0;
      const before=JSON.stringify(s);s.time+=1;
      for(const [i,u] of s.squads[0].soldiers.entries()){
        const t=scene.troops[0].troopers[i];u.strikeAt=0;t.strikeAt=attack?now:-1e9;
        t.aimX=u.x+(direction==="side"?-60:0);t.aimY=u.y+(direction==="front"?60:direction==="back"?-60:0);
        Object.assign(t.motion,{x:u.x-dx,y:u.y-dy,sampledAt:s.time-1,direction});
        scene.pose(t,u,s,false);
        if(!attack)t.sprite.anims.pause(t.sprite.anims.currentAnim.frames[1]);
      }
      for(const e of s.enemies){
        const motion=scene.strides.get(e.id)??{gait:0,step:-1};Object.assign(motion,{x:e.x-dx,y:e.y-dy,sampledAt:s.time-1,direction,faceLeft:dx<0});
        scene.strides.set(e.id,motion);const sprite=scene.foes.get(e.id);
        if(sprite){sprite.setData("lungeAt",attack?now:-1e9).setData("aimX",e.x+(direction==="side"?-60:0))
          .setData("aimY",e.y+(direction==="front"?60:direction==="back"?-60:0));}
      }
      scene.syncFoes(s);
      if(attack)for(const e of s.enemies){const sprite=scene.foes.get(e.id);
        sprite.setData("lungeAt",now).setData("aimX",e.x+(direction==="side"?-60:0))
          .setData("aimY",e.y+(direction==="front"?60:direction==="back"?-60:0));}
      scene.syncFoes(s);
      if(!attack)for(const sprite of scene.foes.values())sprite.anims.pause(sprite.anims.currentAnim.frames[1]);
      scene.pose(scene.troops[0].leader,s.squads[0],s,false);
      game.renderer.preRender();game.scene.render(game.renderer);game.renderer.postRender();
      const measure=sprite=>({key:sprite.texture.key,frame:Number(sprite.frame.name),scale:[sprite.scaleX,sprite.scaleY],
        origin:[sprite.originX,sprite.originY],flipX:sprite.flipX,cell:[sprite.frame.cutWidth,sprite.frame.cutHeight],
        footBottom:sprite.getBounds().bottom-sprite.y});
      return {direction,pose:"${pose}",allies:scene.troops[0].troopers.map(t=>measure(t.sprite)),
        enemies:[...scene.foes.values()].map(measure),general:measure(scene.troops[0].leader.sprite)};
    })()`);
    checks.push(seen);
    await capture(`battle-${direction}-${pose}-390x844`);
    const shot = await page.view.cdp("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 140, width: 390, height: 380, scale: 3 } });
    await Bun.write(`${out}/battle-${direction}-${pose}-zoom.png`, Buffer.from(String(field(shot, "data")), "base64"));
    captures.push(`${out}/battle-${direction}-${pose}-zoom.png`);
  }
  checks.push(await page.evaluate(`(()=>{
    const scene=__soldierGame.scene.getScene("castle"),canvas=document.createElement("canvas");canvas.width=56;
    const ctx=canvas.getContext("2d"),result={};
    for(const [actor,height] of ${JSON.stringify(SOLDIER_ALLY_ART.map(actor => [actor, fullsetArt(actor).frame.height]))}){
      canvas.height=height;
      const image=scene.textures.get("ally-sheet-"+actor).getSourceImage();
      const frames=[];for(let i=0;i<54;i++){ctx.clearRect(0,0,56,height);ctx.drawImage(image,i%18*56,Math.floor(i/18)*height,56,height,0,0,56,height);
        const data=ctx.getImageData(0,0,56,height).data;let foot=-1;for(let y=0;y<height;y++)for(let x=0;x<56;x++)if(data[(y*56+x)*4+3])foot=y;frames.push(foot);}
      result[actor]={frames:frames.length,feet:frames};
    }return result;
  })()`));
  if (page.errors.length) throw new Error(JSON.stringify(page.errors));
  await Bun.write(`${out}/captures.json`, JSON.stringify({ captures, checks, errors: page.errors }, null, 2));
  console.log(`SOLDIER_CAPTURES_PASS ${captures.length} captures ${out}`);
} finally {
  page.view.close(); server.stop(true); await rm(profile, { recursive: true, force: true });
}
