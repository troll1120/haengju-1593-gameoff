import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";

const [label = "before", out = `${import.meta.dir}/../review/facing`] = Bun.argv.slice(2);
await mkdir(out, { recursive: true });
const profile = await mkdtemp(`${out}/profile-`);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, `${import.meta.dir}/../review-dist`) });
const page = await launch(`http://127.0.0.1:${server.port}/?seed=7`, profile, 390, 844,
  ["--single-process", "--no-zygote", "--disable-gpu"]);
function field(value: unknown, ...keys: string[]): unknown {
  for (const key of keys) {
    if (!value || typeof value !== "object") throw new Error(`Missing ${key}`);
    value = Reflect.get(value, key);
  }
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Missing list");
  return value;
}
try {
  await page.evaluate(`new Promise((resolve,reject)=>{
    const deadline=performance.now()+30000;
    function check(){if(window.castleSample && !document.querySelector('#start').disabled)return resolve(true);
      if(performance.now()>deadline)return reject(new Error("Startup timeout"));requestAnimationFrame(check)}check();
  })`);
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
        functionDeclaration: "function(){if(this.scene&&this.scene.getScene&&this.canvas){globalThis.__game=this;return true}return false}" });
      if (field(result, "result", "value") === true) { bound = true; break; }
    }
    if (bound) break;
  }
  if (!bound) throw new Error("Game not found");
  await page.evaluate(`(()=>{
    window.__scene=__game.scene.getScene('castle');window.__samples=[];
    const s=__scene,pose=s.pose;
    s.pose=function(t,u,c,out,...rest){
      const x=t.sprite.x,y=t.sprite.y,now=performance.now(),last=t.__probe;
      pose.call(this,t,u,c,out,...rest);
      if(__samples.length<1200)__samples.push({actor:t.key,id:u.id,time:c.time,x:u.x,y:u.y,
        renderTime:now,vx:last?(u.x-last.x)/(now-last.time)*1000:0,
        renderDx:t.sprite.x-x,renderDy:t.sprite.y-y,flipX:t.sprite.flipX,
        faceLeft:t.faceLeft,sampledAt:t.motion.sampledAt,direction:t.motion.direction,animation:t.sprite.anims.currentAnim?.key});
      t.__probe={x:u.x,time:now};
    };
    return true;
  })()`);
  await page.evaluate(`new Promise(resolve=>{let n=0;function frame(){if(++n===90)return resolve(true);requestAnimationFrame(frame)}frame()})`);
  const natural = await page.evaluate("__samples");
  await page.evaluate(`(()=>{
    const s=__scene;s.update=()=>{};s.sys.sceneUpdate=()=>{};s.bars.clear();
    document.querySelector('#title').hidden=true;
    document.querySelector('#overlay').hidden=true;
    s.marchers.forEach(m=>{m.troop.leader.sprite.setVisible(false);m.troop.troopers.forEach(t=>t.sprite.setVisible(false))});
    const {feedback,sound,...simulation}=castleSample.snapshot();
    window.__current={...simulation,enemies:[],shots:[],telegraphs:[],time:10};
    window.__actors=[];
    const base=castleSample.snapshot().squads[0];
    for(const [i,key] of ["shin_rip","gwon_yul","jo_heon","joseon_cavalry","joseon_cavalry","ming_cavalry"].entries()){
      const u={...base,id:90000+i,kind:i<3?"general":"spearman",general:i===0?"신립":"권율",
        x:80+(i%3)*110,y:245+(i>=3?65:0),strikeAt:0,bph:undefined,soldiers:[],quarry:undefined,aim:undefined};
      const t=s.recruitTrooper(key,u);t.faceLeft=true;
      __actors.push({u,t});s.pose(t,u,__current,false);
    }
    window.__frame=0;return true;
  })()`);
  const controlled: unknown[] = [];
  for (let frame = 0; frame < 24; frame++) {
    controlled.push(await page.evaluate(`(()=>{
      const s=__scene,sign=${frame < 12 ? 1 : -1};
      // Title parade holds simulation time fixed while render time advances.
      __actors.forEach(({u,t})=>{u.x+=sign*2;
        const invariant=JSON.stringify([u,__current]);
        s.pose(t,u,__current,false,s.time.now/1000);
        if(JSON.stringify([u,__current])!==invariant)throw new Error("Renderer changed simulation state");
      });
      return __actors.map(({u,t})=>({actor:t.key,dx:sign*2,flipX:t.sprite.flipX,
        direction:t.motion.direction,animation:t.sprite.anims.currentAnim?.key}));
    })()`));
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await page.shot(`${out}/${label}-${String(frame).padStart(3, "0")}.png`);
  }
  await page.shot(`${out}/${label}.png`);
  const directions = await page.evaluate(`(()=>{
    const s=__scene,rows=[];
    for(const [dx,dy] of [[2,0],[-2,0],[0,2],[0,-2]]){
      const {u,t}=__actors[0];u.x+=dx;u.y+=dy;__current.time++;
      s.pose(t,u,__current,false);
      rows.push({actor:t.key,dx,dy,flipX:t.sprite.flipX,direction:t.motion.direction,animation:t.sprite.anims.currentAnim?.key});
    }
    const base=castleSample.snapshot().enemyUnits[0]??{hp:100,maxHp:100,stun:0,casting:0,strikeAt:0,appearedAt:0};
    for(const actor of ["yari","cavalry","ukita","konishi","kato_yoshiaki","kurushima","nabeshima","todo"]){
      const kind=["yari","cavalry","ukita"].includes(actor)?actor:"ukita";
      const e={...base,id:99000,kind,boss:kind==="ukita",bossArt:actor!==kind?actor:undefined,elite:false,x:90,y:400,casting:0,strikeAt:0,prey:undefined};
      __current.enemies=[e];s.syncFoes(__current);
      for(const dx of [-2,2]){e.x+=dx;__current.time++;s.syncFoes(__current);
        const sp=s.foes.get(e.id);rows.push({actor,dx,flipX:sp.flipX,animation:sp.anims.currentAnim?.key});}
      __current.enemies=[];s.syncFoes(__current);
    }
    for(const {u,t} of __actors)for(const dx of [-20,20]){
      const target={id:99999,x:u.x+dx,y:u.y};__current.enemies=[target];
      u.quarry=target.id;u.strikeAt=__current.time+1;
      s.pose(t,u,__current,false);
      rows.push({actor:t.key,dx,attacking:true,flipX:t.sprite.flipX,animation:t.sprite.anims.currentAnim?.key});
      u.strikeAt=0;
    }
    return rows;
  })()`);
  // Reproduce the owner's attack -> idle turn after walking upward first.
  // Every frame uses the real pose renderer; no simulation or RNG state may change.
  const attacks: unknown[] = [];
  await page.evaluate(`(()=>{
    const base=castleSample.snapshot().enemyUnits[0];
    window.__attackFoes=[-30,30,0].map((dx,i)=>({...base,id:98000+i,kind:"ukita",boss:true,elite:false,
      bossArt:"ukita",x:100+i*95,y:600,strikeAt:0,casting:0,stun:0,prey:undefined}));
    __current.enemies=__attackFoes;__scene.syncFoes(__current);
    __attackFoes.forEach(e=>e.y-=2);__current.time++;__scene.syncFoes(__current);
    return true;
  })()`);
  for (let frame = 0; frame < 24; frame++) {
    attacks.push(await page.evaluate(`(()=>{
      const s=__scene,rows=[],now=100000+${frame}*50;
      s.time.now=now;__current.time=100+${frame}/20;
      for(const [i,{u,t}] of __actors.entries()){
        const dx=i%3===0?-30:i%3===1?30:0,dy=i%3===2?-30:0;
        if(${frame}===0){
          u.y-=2;s.pose(t,u,__current,false);
          u.quarry=99999;t.hurtAt=-1e9;
        }
        const target={id:99999,x:u.x+dx,y:u.y+dy};__current.enemies=[target];
        u.strikeAt=${frame}<4?__current.time+.2:0;
        t.strikeAt=${frame}<4?-1e9:100200;
        const invariant=JSON.stringify([u,__current]);
        s.pose(t,u,__current,false);
        if(JSON.stringify([u,__current])!==invariant)throw new Error("Attack renderer changed simulation/RNG");
        rows.push({actor:t.key,id:u.id,frame:${frame},phase:${frame}<4?"windup":${frame}===4?"strike":${frame}<10?"recover":"idle",
          dx,dy,direction:t.motion.direction,faceLeft:t.faceLeft,flipX:t.sprite.flipX,
          animation:t.sprite.anims.currentAnim?.key,texture:t.sprite.texture.key,textureFrame:t.sprite.frame.name});
      }
      __current.enemies=__attackFoes;
      __attackFoes.forEach((e,i)=>{
        const sp=s.foes.get(e.id),dx=i===0?-30:i===1?30:0;
        e.strikeAt=${frame}<4?__current.time+.2:0;
        sp.setData("aimX",e.x+dx).setData("aimY",e.y+(i===2?-30:0)).setData("lungeAt",${frame}<4?-1e9:100200);
      });
      const invariant=JSON.stringify(__current);s.syncFoes(__current);
      if(JSON.stringify(__current)!==invariant)throw new Error("Enemy renderer changed simulation/RNG");
      __attackFoes.forEach((e,i)=>{
        const sp=s.foes.get(e.id);
        rows.push({actor:"ukita",id:e.id,frame:${frame},phase:${frame}<4?"windup":${frame}===4?"strike":${frame}<10?"recover":"idle",
          dx:i===0?-30:i===1?30:0,dy:i===2?-30:0,direction:sp.getData("direction"),flipX:sp.flipX,
          animation:sp.anims.currentAnim?.key,texture:sp.texture.key,textureFrame:sp.frame.name});
      });
      return rows;
    })()`));
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await page.shot(`${out}/${label}-attack-${String(frame).padStart(3, "0")}.png`);
  }
  await Bun.write(`${out}/${label}-runtime.json`, JSON.stringify({ natural, controlled, directions, attacks, errors: page.errors }, null, 2));
  if (label === "after") {
    let violations = 0;
    for (const row of attacks.flatMap(list)) {
      const actor = field(row, "actor"), dx = field(row, "dx"), phase = field(row, "phase");
      const animation = field(row, "animation");
      const direction = dx === 0 ? "back" : "side";
      if (phase === "idle" && typeof animation === "string" && (animation.includes("-full-") || actor === "ukita")
        && !animation.endsWith(`-${direction}-idle`)) violations++;
      if (dx !== 0 && field(row, "flipX") !== (actor === "joseon_cavalry" ? !(Number(dx) < 0) : Number(dx) < 0)) violations++;
    }
    if (violations) throw new Error(`Attack-to-idle facing violations: ${violations}`);
    console.log("ATTACK_IDLE_FACING violations=0 simulation/RNG unchanged");
    for (const row of [...controlled.flatMap(list), ...list(directions)]) {
      const actor = field(row, "actor"), dx = field(row, "dx");
      if (typeof dx !== "number" || !dx) continue;
      const flipped = field(row, "flipX");
      const left = actor === "cavalry" || actor === "joseon_cavalry" ? !flipped : flipped;
      if (left !== (dx < 0)) throw new Error(`Facing opposes travel/target: ${JSON.stringify(row)}`);
    }
    if (page.errors.length) throw new Error(page.errors.join("\n"));
    for (const name of ["before", "after"])
      await Bun.write(`${out}/${name}.png`, Bun.file(`${out}/${name}-attack-023.png`));
    const encoder = Bun.spawn(["ffmpeg", "-y", "-loglevel", "error",
      "-framerate", "8", "-i", `${out}/before-attack-%03d.png`,
      "-framerate", "8", "-i", `${out}/after-attack-%03d.png`,
      "-filter_complex_threads", "1", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p[v]",
      "-map", "[v]", "-c:v", "libx264", "-threads", "1", "-preset", "fast", "-crf", "22",
      "-t", "6", "-an", "-movflags", "+faststart", `${out}/before-after.mp4`],
    { env: process.env, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
    if (await encoder.exited !== 0) throw new Error("H.264 encoding failed");
  }
  console.log(`FACING_CAPTURE_OK ${label} ${out}`);
} finally {
  page.view.close(); server.stop(true); await rm(profile, { recursive: true, force: true });
}
