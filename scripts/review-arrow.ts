// Captures archers and their shots in the real renderer at phone and desktop size and records which picture each shot flies on.
// Usage: bun scripts/review-arrow.ts <before|after> <out dir> [dist dir]
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

const root = `${import.meta.dir}/..`;
const [label = "after", out = `${root}/review/arrow-projectile`, dist = `${root}/review-dist`] = Bun.argv.slice(2);
await mkdir(out, { recursive: true });
const profile = await mkdtemp(`${out}/profile-`);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, dist) });
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
const frames = "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))";
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
        functionDeclaration: "function(){if(this.scene&&this.scene.getScene&&this.canvas){globalThis.__arrowGame=this;return true}return false}" });
      if (at(result, "result", "value") === true) { bound = true; break; }
    }
    if (bound) break;
  }
  if (!bound) throw new Error("Could not find Phaser game in existing snapshot scope");
  await page.evaluate(`(()=>{
    const s=__arrowGame.scene.getScene('castle');window.__arrowScene=s;
    s.update=()=>{};s.sys.sceneUpdate=()=>{};
    const W=s.scale.width,H=s.scale.height;
    window.__arrowCurrent={...castleSample.snapshot(),enemies:[],shots:[],time:1};
    window.__arrowUnits=[[.2,.62],[.3,.66],[.4,.62]].map(([x,y],i)=>({id:700000+i,kind:"archer",tier:1,hp:10,maxHp:10,
      x:W*x,y:H*y,clock:0,strikeAt:0,aim:0,downUntil:0}));
    window.__arrowTroopers=__arrowUnits.map(unit=>s.recruitTrooper("archer",unit));
    return true;
  })()`);
  const results: unknown[] = [];
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    await page.view.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 390 });
    await page.evaluate(frames);
    const result = await page.evaluate(`(()=>{
      const s=__arrowScene,c=__arrowCurrent,W=s.scale.width,H=s.scale.height,shots=[];
      __arrowUnits.forEach((unit,i)=>{
        const t=__arrowTroopers[i],toX=W*.78,toY=H*(.34+.06*i);
        t.motion.x=unit.x;t.motion.y=unit.y;t.motion.sampledAt=-1;t.motion.direction="side";
        t.strikeAt=s.time.now;t.aimX=toX;t.aimY=toY;s.pose(t,unit,c,false);
        for(const [n,along] of [.35,.7].entries())shots.push({id:720000+i*2+n,kind:"arrow",tier:1,
          x:unit.x+(toX-unit.x)*along,y:unit.y-6+(toY-unit.y+6)*along,toX,toY});
      });
      for(let turn=0;turn<16;turn++){
        const a=turn*Math.PI/8,x=W*.72,y=H*.33;
        shots.push({id:730000+turn,kind:"arrow",tier:1,x:x+Math.cos(a)*30,y:y+Math.sin(a)*30,toX:x+Math.cos(a)*90,toY:y+Math.sin(a)*90});
      }
      shots.push({id:740000,kind:"arrow",tier:3,flaming:true,x:W*.56,y:H*.5,toX:W*.56+60,toY:H*.5-25});
      shots.push({id:740001,kind:"arrow",tier:2,x:W*.56,y:H*.55,toX:W*.56+60,toY:H*.55});
      shots.push({id:750000,kind:"rocket",tier:1,x:W*.2,y:H*.46,toX:W*.5,toY:H*.3});
      shots.push({id:750001,kind:"rocket",tier:1,x:W*.3,y:H*.44,toX:W*.5,toY:H*.3});
      shots.push({id:760000,kind:"bullet",tier:1,x:W*.86,y:H*.52,toX:W*.6,toY:H*.52});
      c.shots=shots;s.bars.clear();s.syncShots(c);
      const seen=shots.filter(shot=>shot.kind!=="bullet").map(shot=>{
        const sp=s.missiles.get(shot.id),a=sp.anims.currentAnim,observed=new Set();
        if(a)for(let tick=0;tick<30;tick++){sp.anims.update(tick*16,16);observed.add(sp.frame.name);}
        return {id:shot.id,kind:shot.kind,tier:shot.tier,flaming:Boolean(shot.flaming),
          heading:Math.atan2(shot.toY-shot.y,shot.toX-shot.x),texture:sp.texture.key,frame:sp.frame.name,
          rotation:sp.rotation,scale:sp.scaleX,animation:a?.key,registered:a?.frames.length,observed:[...observed]};});
      const before=new Set(s.children.list),unit=__arrowUnits[0];
      s.spar(__arrowTroopers[0],unit,{x:unit.x+70,y:unit.y-50},undefined);
      const parade=s.children.list.filter(made=>!before.has(made)).map(made=>({texture:made.texture.key,frame:made.frame.name,rotation:made.rotation}));
      return {width:innerWidth,height:innerHeight,field:{width:W,height:H},archers:__arrowTroopers.map(t=>t.sprite.texture.key+":"+t.sprite.frame.name),shots:seen,parade};
    })()`);
    results.push(result);
    if (label !== "before") {
      for (const shot of list(at(result, "shots"))) {
        if (at(shot, "kind") === "rocket") {
          if (at(shot, "texture") !== "rocket" || at(shot, "animation") !== "rocket-flight" || at(shot, "registered") !== 3 || list(at(shot, "observed")).length !== 3)
            throw new Error(`Rocket flight changed: ${JSON.stringify(shot)}`);
          continue;
        }
        const turn = Math.round(Number(at(shot, "heading")) / (Math.PI / 8)) % 16;
        if (at(shot, "texture") !== "arrow" || at(shot, "frame") !== (turn + 16) % 16 || at(shot, "rotation") !== 0)
          throw new Error(`Arrow does not fly on its drawn frame: ${JSON.stringify(shot)}`);
      }
      for (const made of list(at(result, "parade")))
        if (at(made, "texture") !== "arrow") throw new Error(`Parade arrow is not the arrow sheet: ${JSON.stringify(made)}`);
    }
    await page.evaluate(frames);
    await page.shot(`${out}/${label}-${width}x${height}.png`);
    if (width === 390) {
      const zoom = await page.evaluate(`(()=>{
        const g=__arrowScene.game.canvas,x=Math.round(g.width*.08),y=Math.round(g.height*.22),w=Math.round(g.width*.88),h=Math.round(g.height*.5);
        const c=document.createElement("canvas");c.width=w*4;c.height=h*4;const pen=c.getContext("2d");pen.imageSmoothingEnabled=false;
        pen.drawImage(g,x,y,w,h,0,0,w*4,h*4);return c.toDataURL("image/png").split(",")[1];
      })()`);
      if (typeof zoom !== "string") throw new Error("Missing field zoom");
      await Bun.write(`${out}/${label}-field-x4.png`, Buffer.from(zoom, "base64"));
    }
    console.log(`ARROW_VIEWPORT_OK=${width}x${height}`);
  }
  await Bun.write(`${out}/${label}-runtime.json`, JSON.stringify({ results, errors: page.errors }, null, 2));
  if (page.errors.length) throw new Error(page.errors.join("\n"));
  console.log(`ARROW_REVIEW_RESULT=PASS label=${label}`);
} finally {
  page.view.close(); server.stop(true); await rm(profile, { recursive: true, force: true });
}
