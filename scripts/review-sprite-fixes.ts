import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

const root = `${import.meta.dir}/..`;
const [label = "after", out = `${root}/review/sprite-fixes`] = Bun.argv.slice(2);
await mkdir(out, { recursive: true });
const profile = await mkdtemp(`${out}/profile-`);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, `${root}/review-dist`) });
const page = await launch(`http://127.0.0.1:${server.port}/?seed=7`, profile, 390, 844,
  ["--single-process", "--no-zygote", "--disable-gpu"]);
function at(value: unknown, ...keys: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) throw new Error(`Missing CDP object at ${key}`);
    current = Reflect.get(current, key);
  }
  return current;
}
function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("Missing CDP property list");
  return value;
}
const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
  const deadline=performance.now()+30000;function check(){
    if(${condition})return resolve(true);
    if(performance.now()>deadline)return reject(new Error("State timeout: "+${JSON.stringify(condition)}));
    requestAnimationFrame(check);
  }check();
})`);
try {
  await ready("window.castleSample && !document.querySelector('#start').disabled");
  await page.tapElement("#start");
  await ready("document.querySelector('[data-bph-start]')");
  await page.tapElement("[data-bph-start]");
  await passFirstBattleGuide(page);
  await ready("!castleSample.snapshot().attract && !castleSample.snapshot().paused");
  const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" });
  const props = await page.view.cdp("Runtime.getProperties", { objectId: at(fn, "result", "objectId") });
  const scopesProperty = list(at(props, "internalProperties")).find(p => at(p, "name") === "[[Scopes]]");
  const scopes = await page.view.cdp("Runtime.getProperties", { objectId: at(scopesProperty, "value", "objectId") });
  let bound = false;
  for (const scope of list(at(scopes, "result"))) {
    if (at(scope, "name") === "length") continue;
    const vars = await page.view.cdp("Runtime.getProperties", { objectId: at(scope, "value", "objectId"), ownProperties: true });
    for (const variable of list(at(vars, "result"))) {
      if (at(variable, "value", "type") !== "object") continue;
      const id = at(variable, "value", "objectId");
      if (!id) continue;
      const result = await page.view.cdp("Runtime.callFunctionOn", { objectId: id, returnByValue: true,
        functionDeclaration: "function(){if(this.scene&&this.scene.getScene&&this.canvas){globalThis.__spriteGame=this;return true}return false}" });
      if (at(result, "result", "value") === true) { bound = true; break; }
    }
    if (bound) break;
  }
  if (!bound) throw new Error("Could not find Phaser game in existing snapshot scope");
  await page.evaluate(`(()=>{
    const s=__spriteGame.scene.getScene('castle');window.__spriteScene=s;
    s.update=()=>{};s.sys.sceneUpdate=()=>{};s.anims.globalTimeScale=1;
    const current=castleSample.snapshot();
    window.__spriteCurrent={...current,enemies:[],shots:[],time:1};
    const u={...current.squads[0],id:700000,general:"신립",kind:"general",x:130,y:300,
      strikeAt:0,soldiers:[],quarry:undefined,aim:undefined};
    window.__spriteUnit=u;
    window.__spriteTrooper=s.recruitTrooper("shin_rip",u);
    s.pose(__spriteTrooper,u,__spriteCurrent,false);
    return true;
  })()`);
  const results: unknown[] = [];
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    await page.view.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 390 });
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    const result = await page.evaluate(`(()=>{
      const s=__spriteScene,u=__spriteUnit,t=__spriteTrooper,c=__spriteCurrent;
      u.x=s.scale.width*.31;u.y=s.scale.height*.64;t.motion.x=u.x;t.motion.y=u.y;
      t.motion.sampledAt=-1;t.motion.direction="side";s.pose(t,u,c,false);
      const rect=sp=>{const b=sp.getBounds();return {x:b.x,y:b.y,width:b.width,height:b.height,
        centerX:b.centerX,centerY:b.centerY,feet:b.bottom,originX:sp.originX,originY:sp.originY};};
      const old=s.add.sprite(t.sprite.x,t.sprite.y,"shin_rip",0).setScale(2).setVisible(false);
      const bounds={old:rect(old),current:rect(t.sprite),
        mirroredOld:rect(old.setFlipX(true)),mirroredCurrent:rect(t.sprite.setFlipX(true))};
      t.sprite.setFlipX(false);old.destroy();
      const poses=[];
      for(const direction of ["front","back","side"])for(const [pose,count] of [["idle",4],["walk",4],["attack",4],["hit",3],["death",3]]){
        const key=${JSON.stringify(label)}==="before"?"ally-shin_rip-"+pose:"ally-full-sin_rip-"+direction+"-"+pose;
        const a=s.anims.get(key),sp=t.sprite;sp.anims.stop();sp.anims.resume();sp.play(key);
        const observed=new Set();
        for(let tick=0;tick<100;tick++){sp.anims.update(tick*16,16);observed.add(sp.texture.key+":"+sp.frame.name);}
        poses.push({key,count,registered:a.frames.length,observed:[...observed]});
      }
      t.sprite.play(${JSON.stringify(label)}==="before"?"ally-shin_rip-idle":"ally-full-sin_rip-side-idle");
      c.shots=Array.from({length:5},(_,i)=>({id:710000+i,kind:"rocket",x:u.x+50+i*24,y:u.y-80-i*6,toX:u.x+160,toY:u.y-140,tier:1}));
      c.shots.push({id:720000,kind:"arrow",x:u.x+90,y:u.y+25,toX:u.x+180,toY:u.y+25,tier:1});
      s.bars.clear();s.syncShots(c);
      const shots=c.shots.map(shot=>{
        const sp=s.missiles.get(shot.id),observed=new Set();const a=sp.anims.currentAnim;
        if(a)for(let tick=0;tick<30;tick++){sp.anims.update(tick*16,16);observed.add(sp.frame.name);}
        return {kind:shot.kind,texture:sp.texture.key,frame:sp.frame.name,animation:a?.key,
          registered:a?.frames.length,observed:[...observed],rotation:sp.rotation,tint:sp.tintTopLeft};});
      return {width:innerWidth,height:innerHeight,bounds,poses,shots,
        art:{scaleX:t.sprite.scaleX,scaleY:t.sprite.scaleY,sourceWidth:t.sprite.frame.cutWidth,
          sourceHeight:t.sprite.frame.cutHeight,logicalWidth:t.sprite.frame.realWidth,logicalHeight:t.sprite.frame.realHeight}};
    })()`);
    results.push(result);
    if (label !== "before") {
      for (const pose of list(at(result, "poses"))) {
        if (at(pose, "registered") !== at(pose, "count") || list(at(pose, "observed")).length !== at(pose, "count"))
          throw new Error(`Animation count mismatch: ${JSON.stringify(pose)}`);
      }
      if (JSON.stringify(at(result, "bounds", "old")) !== JSON.stringify(at(result, "bounds", "current")))
        throw new Error(`Shin Rip rectangle changed: ${JSON.stringify(at(result, "bounds"))}`);
      if (JSON.stringify(at(result, "bounds", "mirroredOld")) !== JSON.stringify(at(result, "bounds", "mirroredCurrent")))
        throw new Error(`Mirrored Shin Rip rectangle changed: ${JSON.stringify(at(result, "bounds"))}`);
      if (at(result, "art", "scaleX") !== at(result, "art", "scaleY"))
        throw new Error(`Shin Rip art was stretched: ${JSON.stringify(at(result, "art"))}`);
      for (const shot of list(at(result, "shots"))) {
        const expected = at(shot, "kind") === "rocket" ? "rocket" : "arrow";
        if (at(shot, "texture") !== expected) throw new Error(`Wrong projectile texture: ${JSON.stringify(shot)}`);
        if (expected === "rocket" && (at(shot, "registered") !== 3 || list(at(shot, "observed")).length !== 3))
          throw new Error(`Rocket flight does not play all three original frames: ${JSON.stringify(shot)}`);
        if (expected === "arrow" && at(shot, "frame") !== 0)
          throw new Error(`Arrow frame changed: ${JSON.stringify(shot)}`);
      }
    }
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await page.shot(`${out}/${label}-${width}x${height}.png`);
    if (width === 390 && label !== "before") {
      await page.evaluate("(__spriteTrooper.sprite.setFlipX(true),new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))");
      await page.shot(`${out}/${label}-${width}x${height}-mirrored.png`);
      await page.evaluate("Boolean(__spriteTrooper.sprite.setFlipX(false))");
    }
    console.log(`SPRITE_VIEWPORT_OK=${width}x${height}`);
  }
  if (label !== "before") {
    const strip = await page.evaluate(`(()=>{
      const s=__spriteScene,c=document.createElement("canvas");
      c.width=4*56*4;c.height=15*(64*4+24);const x=c.getContext("2d");x.imageSmoothingEnabled=false;
      x.fillStyle="#262b44";x.fillRect(0,0,c.width,c.height);x.font="16px monospace";let row=0;
      for(const direction of ["front","back","side"])for(const pose of ["idle","walk","attack","hit","death"]){
        const a=s.anims.get("ally-full-sin_rip-"+direction+"-"+pose);
        a.frames.forEach((f,i)=>{const image=f.frame.source.image;
          x.drawImage(image,f.frame.cutX,f.frame.cutY,56,64,i*56*4,row*(64*4+24),56*4,64*4);});
        x.fillStyle="white";x.fillText(direction+" "+pose+" ("+a.frames.length+")",4,row*(64*4+24)+64*4+18);row++;
      }
      return c.toDataURL("image/png").split(",")[1];
    })()`);
    if (typeof strip !== "string") throw new Error("Missing animation strip");
    await Bun.write(`${out}/shin-rip-animations-x4.png`, Buffer.from(strip, "base64"));
  }
  await Bun.write(`${out}/${label}-runtime.json`, JSON.stringify({ results, errors: page.errors }, null, 2));
  if (page.errors.length) throw new Error(page.errors.join("\n"));
  console.log(`SPRITE_FIXES_RESULT=PASS label=${label}`);
} finally {
  page.view.close(); server.stop(true); await rm(profile, { recursive: true, force: true });
}
