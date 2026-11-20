// Run against a built review directory. The clock drives the real game loop.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { FORT_TILES, TILE, WALL_RISE } from "../src/geometry";
import { BPH_TAP_STRIKE } from "../src/bph-tap-strike";

const [dist, output, mode, ...extra] = Bun.argv.slice(2);
const breach = mode === "--breach-audit";
const combat = mode === "--combat-audit" || breach;
const audit = mode === "--coin-audit" || combat;
if (!dist || !output || (mode !== undefined && mode !== "--ramp" && !audit) || extra.length)
  throw new Error("Usage: bun scripts/review-fort-defense.ts DIST OUTPUT [--ramp|--coin-audit|--combat-audit|--breach-audit]");
const ramp = mode === "--ramp" || audit;
const end = ramp ? 211 : 60;
const seed = 3759809611;
// A fresh account plays the normal first battle. Ramp spends earned gold as
// it becomes available, collects barracks draws, and aims charged volleys at
// visible groups near the walls. The default keeps its prior recruit schedule.
const recruitUntil = ramp ? end : 54;
const out = resolve(output), build = resolve(dist);
await mkdir(out, { recursive: true });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: req => previewResponse(req, build) });
const profile = await mkdtemp(`${tmpdir()}/fort-defense-`);
const phone = await launch("about:blank", profile, 390, 844,
  combat ? ["--single-process", "--no-zygote", "--disable-gpu", "--disable-extensions", "--disable-breakpad"] : []);
const { view, evaluate } = phone;
const ready = (condition: string) => evaluate(`new Promise((ok,fail)=>{
  const end=Date.now()+30000; function check(){if (${condition}) ok(true);
  else if(Date.now()>end) fail(Error("screen did not become ready"));else requestAnimationFrame(check)} check()})`);
async function tap(selector: string) {
  if (!await phone.tapElement(selector)) throw new Error(`Missing control ${selector}`);
}
try {
  await view.navigate(server.url.href);
  await ready(`window.castleSample?.snapshot().attract && document.querySelector("#start")?.offsetWidth`);
  await tap("#start");
  await ready(`document.querySelector("[data-bph-start]")?.offsetWidth`);
  await evaluate(`(() => {
    const original=crypto.getRandomValues;
    crypto.getRandomValues=function(a){if(a instanceof Uint32Array && a.length===1){
      crypto.getRandomValues=original; a[0]=${seed}; return a}return original.call(this,a)};
    return true;
  })()`);
  await tap("[data-bph-start]");
  await ready(`!castleSample.snapshot().attract`);
  if (!ramp) await passFirstBattleGuide(phone);
  await evaluate(`(async()=>{
    const resource=performance.getEntriesByType("resource").find(r=>/\\/phaser-[^/]+\\.js$/.test(new URL(r.name).pathname));
    const values=Object.values(await import(resource.name));
    const phaser=values.find(v=>typeof v==="function" && v.length===0)();
    const proto=phaser.Renderer.Canvas.CanvasRenderer.prototype, render=proto.render;
    const log=window.battleLog={attacks:[],inside:[],intactTicks:0,maxInside:0,recruits:0,
      recruitInputs:[],fieldInputs:[],skillInputs:[],samples:[],acquisitions:[],regularSpawns:[],checkpoints:[],minWalls:{}};
    window.battleObserver={previous:new Map(),seen:new Set(),inserted:[],lastTick:-1,lastSecond:-1,lastBoundary:0,
      spawnOffset:0,observedTicks:0,missedTicks:0,firstTick:null};
    if(${combat}) {
      const combat=log.combat={edgeBandPx:40,fights:[],allyHpLoss:[],crowding:[],intactIntrusions:[],
        enemyWindups:0,enemyPositions:new Map(),enemyPopulation:[]};
      window.edgeDistance=(s,x,y)=>{
        if(!Number.isFinite(x)||!Number.isFinite(y))return null;
        const w=s.field.width,h=s.field.height, cx=Math.max(0,Math.min(w,x)),cy=Math.max(0,Math.min(h,y));
        return x===cx&&y===cy?Math.min(x,y,w-x,h-y):Math.hypot(x-cx,y-cy);
      };
      window.observeAllyHp=(s)=>{
        const restore=[];
        for(const q of s.squads)for(const u of [q,...q.soldiers]){
          const descriptor=Object.getOwnPropertyDescriptor(u,"hp");
          if(!descriptor?.writable||!descriptor.configurable)throw Error("Unobservable ally HP property");
          let hp=descriptor.value;
          Object.defineProperty(u,"hp",{configurable:true,enumerable:descriptor.enumerable,get:()=>hp,set(next){
            const lost=Math.max(0,hp)-Math.max(0,next);
            if(lost>0)combat.allyHpLoss.push({t:castleSample.snapshot().time,squad:q.id,unit:u.id,
              role:u===q?"general":"soldier",x:u.x,y:u.y,before:hp,after:Math.max(0,next),lost,lethal:next<=0});
            hp=next;
          }});
          restore.push(()=>Object.defineProperty(u,"hp",{...descriptor,value:hp}));
        }
        return ()=>{for(const f of restore)f()};
      };
    }
    if(${audit}) {
      battleObserver.auditThreatRefs=new Map();
      const a=log.coinAudit={transactions:[],boundaries:{},last:null,
        threats:{},hits:[],targeting:[],crowd:[],kills:[],bossEntries:[]};
      window.auditThreat=(e,s)=>{
        if(!e.miniboss&&!e.boss&&!e.wave&&!e.commanderEscort&&!e.elite)return;
        const entry=a.bossEntries.find(b=>b.id===e.id);
        const boss=entry??s.metrics.bosses.find(b=>e.boss&&b.appeared===e.appearedAt&&b.art===e.bossArt);
        return a.threats[e.id]??={id:e.id,spawnTime:s.time,spawnMaxHP:e.maxHp,firstObservedHP:e.hp,
          profile:e.bphProfileId,kind:e.kind,skill:e.miniboss,art:e.bossArt,authoredTime:e.appearedAt,
          category:e.boss?(boss?.final?"final-boss":"scheduled-commander"):e.miniboss?"scheduled-miniboss":
            e.commanderEscort?"commander-escort":e.wave?"rush":"elite"};
      };
      window.auditUnit=(q,u)=>({side:u===q?"general":"soldier",unit:u.id,kind:u.kind,
        profile:u.bph?.profileId,general:q.general});
      window.auditTargets=new Map();
      window.auditGold=(s,stage,spent=0)=>{
        const {time:t,gold,earned}=s, tick=Math.round(t*30), prev=a.last;
        const delta=prev ? gold-prev.gold : 0;
        if(prev&&(delta||spent||earned!==prev.earned))
          a.transactions.push({t,tick,stage,before:prev.gold,after:gold,spent,
            gained:Math.max(0,delta+spent),otherOutflow:Math.max(0,-delta-spent),nativeEarnedDelta:earned-prev.earned});
        a.last={t,tick,gold,earned};
      };
    }
    await new Promise(ok=>{
      proto.render=function(scene,children,camera,...rest){
        if(scene.sys.settings.key==="castle" && scene.cameras.main===camera){
          proto.render=render;
          const present=scene.decoration.effect;
          scene.decoration.effect=function(e,...args){
            if(${audit}&&(e.kind==="hit"||e.kind==="kill"||e.kind==="boss-enter")&&e.target!==undefined){
              const a=log.coinAudit,s=castleSample.snapshot();
              if(e.kind==="boss-enter")a.bossEntries.push({id:e.target,t:s.time,final:e.value===3});
              const target=a.threats[e.target]??auditThreat(
                battleObserver.inserted.find(({e:u})=>u.id===e.target)?.e??
                s.enemyUnits.find(u=>u.id===e.target)??{},s);
              if(target?.category?.startsWith("scheduled-")||target?.category==="final-boss"){
                if(e.kind==="kill")a.kills.push({id:e.target,t:s.time});
                if(e.kind==="hit"){
                  const q=s.squads.find(q=>q.id===e.squad);
                  const matches=q?[q,...q.soldiers].filter(u=>u.x===e.fromX&&u.y===e.fromY)
                    .map(u=>auditUnit(q,u)):[];
                  a.hits.push({id:e.target,presentedAt:s.time,shownDamage:e.value,squad:e.squad,
                    projectile:e.projectile,positionCandidates:matches});
                }
              }
            }
            if((e.kind==="swing"||e.kind==="shot") && !e.hostile && e.index>=0){
              const s=castleSample.snapshot(), u=s.squads.find(q=>q.id===e.squad)?.soldiers[e.index];
              if(u) log.attacks.push({t:s.time,unit:u.id,kind:e.kind,target:u.aim});
            }
            if(${combat}){
              // In the production rules, a lunge is the telegraph for a targeted ally strike.
              if(e.kind==="lunge")log.combat.enemyWindups++;
              const attack=(e.kind==="swing"||e.kind==="shot")&&!e.hostile&&e.squad!==undefined&&e.index!==undefined;
              const enemyHit=e.kind==="hurt"&&e.target!==undefined;
              if(attack||enemyHit){
                const s=castleSample.snapshot();
                const foe=enemyHit?(s.enemyUnits.find(u=>u.id===e.target)??log.combat.enemyPositions.get(e.target)):e;
                const distance=foe?edgeDistance(s,foe.x,foe.y):null;
                log.combat.fights.push({t:s.time,side:attack?"ally":"enemy",kind:e.kind,squad:e.squad,index:e.index,
                  enemy:enemyHit?e.target:undefined,x:foe?.x,y:foe?.y,distance,
                  edge:distance===null?null:distance<=log.combat.edgeBandPx});
              }
            }
            return present.call(this,e,...args);
          };
          window.battleCamera=camera;
          ok(true);
        }
        return render.call(this,scene,children,camera,...rest);
      };
    });
    const raf=requestAnimationFrame.bind(window), cancel=cancelAnimationFrame.bind(window), now=performance.now.bind(performance);
    const c=window.battleClock={queue:new Map(),id:-1,time:now()};
    window.requestAnimationFrame=cb=>{const id=c.id--;c.queue.set(id,cb);return id};
    window.cancelAnimationFrame=id=>id<0?c.queue.delete(id):cancel(id);
    await new Promise(ok=>raf(()=>raf(()=>{c.time=now();Object.defineProperty(performance,"now",{configurable:true,value:()=>c.time});ok(true)})));
    return true;
  })()`);
  if (ramp) await passFirstBattleGuide(phone);
  async function advanceTo(target: number) {
    const capture = ramp && (target === 30 || target === 90 || target === 210);
    const clockLabel = `${String(Math.floor(target / 60)).padStart(2, "0")}:${String(target % 60).padStart(2, "0")}`;
    return await evaluate(`(()=>{
    const c=battleClock,l=battleLog,o=battleObserver;
    for(let i=0;i<4000;i++){
      const s=castleSample.snapshot(), t=s.time;
      const tick=Math.round(t*30), sec=Math.floor(t+1e-7);
      if(${audit}){
        auditGold(s,"frame");
        if([0,1800,3600,5400,6300,6330].includes(tick))
          l.coinAudit.boundaries[tick]??=l.coinAudit.last;
      }
      const [nx,ny]=${JSON.stringify(FORT_TILES)}[s.fort], hx=nx*${TILE}/2,hy=ny*${TILE}/2;
      const cx=s.field.width/2,cy=s.field.height/2, rect={left:cx-hx,right:cx+hx,top:cy-hy-${WALL_RISE},bottom:cy+hy};
      if(${breach} && tick===6000 && !l.breach){
        l.breach={tick,side:"위",before:s.base,wallsBefore:{...s.walls},firstBaseHit:null,lowestBase:s.base,
          withdrawn:s.squads.reduce((n,q)=>n+q.soldiers.length+1,0)};
        s.walls["위"]=0;
        // Isolate a clear breach path for the last eleven seconds of this separate drill.
        for(const q of s.squads){q.soldiers.splice(0);q.hp=0;q.state="down";q.downUntil=Infinity}
      }
      if(l.breach && s.base<l.breach.lowestBase){
        l.breach.lowestBase=s.base;
        l.breach.firstBaseHit??={tick,time:t,base:s.base};
      }
      const intact=Object.values(s.walls).every(hp=>hp>0);
      if(tick!==o.lastTick){
        if(o.lastTick>=0) o.missedTicks+=Math.max(0,tick-o.lastTick-1);
        o.firstTick??=tick; o.lastTick=tick; o.observedTicks++;
        for(const [side,hp] of Object.entries(s.walls)) l.minWalls[side]=Math.min(l.minWalls[side]??hp,hp);
        // Read the inserted objects after the tick, once the spawner has populated
        // their flags. Counts include same-tick casualties and embarked passengers.
        if(${ramp}) for(const {e,reinforcement} of o.inserted){
          if(o.seen.has(e.id)) continue;
          o.seen.add(e.id);
          if(${audit}&&auditThreat(e,s)&&(e.miniboss||e.boss))o.auditThreatRefs.set(e.id,e);
          // Ladders belong to the regular grid, rushes and escorts have their own.
          if(e.bphProfileId&&e.kind!=="ship"&&!reinforcement&&!e.boss&&!e.elite&&!e.wave&&!e.miniboss&&!e.commanderEscort)
            l.regularSpawns.push({t,id:e.id,profile:e.bphProfileId,weight:e.infantryRewardShare??1,embarked:Boolean(e.aboard)});
        }
        o.inserted.length=0;
        if(intact){
          l.intactTicks++;
          const inside=s.enemyUnits.filter(e=>e.hp>0&&e.kind!=="ship"&&e.x>rect.left&&e.x<rect.right&&e.y>rect.top&&e.y<rect.bottom);
          l.maxInside=Math.max(l.maxInside,inside.length);
          if(inside.length&&l.inside.length<8) l.inside.push({t,ids:inside.slice(0,10).map(e=>e.id)});
          if(${combat}&&inside.length)l.combat.intactIntrusions.push({tick,t,ids:inside.map(e=>e.id)});
        }
        if(${combat}&&tick<=95*30){
          const counts={total:0,top:0,bottom:0,left:0,right:0};
          for(const e of s.enemyUnits)if(e.hp>0&&!e.aboard&&e.kind!=="ship"&&edgeDistance(s,e.x,e.y)<=l.combat.edgeBandPx){
            counts.total++;
            const sides=[Math.abs(e.y),Math.abs(s.field.height-e.y),Math.abs(e.x),Math.abs(s.field.width-e.x)];
            counts[["top","bottom","left","right"][sides.indexOf(Math.min(...sides))]]++;
          }
          l.combat.crowding.push({tick,t,...counts});
        }
        if(${combat}){
          const live=s.enemyUnits.filter(e=>e.hp>0), all=new Map(live.filter(e=>e.kind!=="ship").map(e=>[e.id,e]));
          for(const e of live)for(const p of e.cargo??[])if(p.hp>0)all.set(p.id,p);
          const population=[...all.values()];
          const queue=s.bph?.survival?.spawnQueue;
          l.combat.enemyPopulation.push({tick,t,all:population.length,active:live.length,
            regular:population.filter(e=>!e.miniboss&&!e.boss).length,
            waiting:queue?queue.bodies.length-queue.head:null,totalQueued:queue?.totalQueued??null});
        }
        for(const q of s.squads)for(const u of q.soldiers){
          if(u.quarry&&u.quarry!==o.previous.get(u.id))l.acquisitions.push({t,unit:u.id,target:u.quarry});
          o.previous.set(u.id,u.quarry);
        }
      }
      const alive=s.enemyUnits.filter(e=>e.hp>0);
      const stopped=s.phase!=="playing"||s.paused;
      const cam=battleCamera, canvas=cam.scene.sys.game.canvas,box=canvas.getBoundingClientRect(),v=cam.worldView;
      const px=(x)=>box.left+(cam.x+(x-v.x)*cam.zoom)*box.width/canvas.width;
      const py=(y)=>box.top+(cam.y+(y-v.y)*cam.zoom)*box.height/canvas.height;
      if(${audit}&&tick!==o.auditTick){
        const a=l.coinAudit;
        o.auditTick=tick;
        // Include same-step removals through retained spawn references. Track deaths by HP,
        // independently of the timing of the presentation queue.
        for(const e of s.enemyUnits)if((e.miniboss||e.boss)&&!o.auditThreatRefs.has(e.id)){
          auditThreat(e,s);
          o.auditThreatRefs.set(e.id,e);
        }
        for(const [id,e] of o.auditThreatRefs){
          const record=a.threats[id];
          if(e.hp<=0)record.deathTime??=t;
          record.lastObservedHP=e.hp;
        }
        const tracked=s.enemyUnits.filter(e=>e.hp>0&&
          (e.miniboss||e.boss)&&a.threats[e.id]);
        if(tracked.length){
          const ids=new Set(tracked.map(e=>e.id)), active=new Map();
          for(const q of s.squads)for(const u of [q,...q.soldiers])if(u.hp>0){
            for(const [signal,id] of [["quarry",u.quarry],["aim",u.aim],["specialAim",u===q?u.specialAttack?.aim:null]]){
              if(!ids.has(id))continue;
              const key=[q.id,u===q?"general":u.id,signal].join("/");
              active.set(key,id);
              if(auditTargets.get(key)!==id)a.targeting.push({t,id,signal,...auditUnit(q,u)});
            }
          }
          window.auditTargets=active;
          for(const e of tracked){
            const record=a.threats[e.id];
            if(tick%30!==0&&record.spawnTime!==t)continue;
            const visible=u=>document.elementFromPoint(px(u.x),py(u.y))===canvas;
            const near=alive.filter(u=>u.id!==e.id&&!u.aboard&&u.kind!=="ship"&&Math.hypot(u.x-e.x,u.y-e.y)<=64);
            a.crowd.push({t,id:e.id,hp:e.hp,x:e.x,y:e.y,bossCenterOnUncoveredCanvas:visible(e),
              within64:near.length,nearbyCentersOnUncoveredCanvas:near.filter(visible).length,
              nearbyRegular:near.filter(u=>!u.elite&&!u.boss&&!u.miniboss&&!u.wave&&!u.commanderEscort).length,
              nearbyRush:near.filter(u=>u.wave).length,nearbyEscorts:near.filter(u=>u.commanderEscort).length});
          }
        }else window.auditTargets.clear();
      }
      const fieldTap=(kind,x,y)=>{
        const clientX=px(x),clientY=py(y);
        if(document.elementFromPoint(clientX,clientY)!==canvas)return;
        const touch=new Touch({identifier:1,target:canvas,clientX,clientY,pageX:clientX+scrollX,pageY:clientY+scrollY});
        const charges=castleSample.snapshot().bph.fx.counters["tap:charges"];
        const before=castleSample.snapshot().bph.receipts.length;
        canvas.dispatchEvent(new TouchEvent("touchstart",{bubbles:true,cancelable:true,touches:[touch],targetTouches:[touch],changedTouches:[touch]}));
        canvas.dispatchEvent(new TouchEvent("touchend",{bubbles:true,cancelable:true,changedTouches:[touch]}));
        if(${audit})auditGold(castleSample.snapshot(),kind);
        const state=castleSample.snapshot().bph;
        const spent=charges>(state.fx.counters["tap:charges"]??charges);
        if(spent||state.receipts.length!==before) l.fieldInputs.push({t,kind,x,y,spent,
          ... (spent ? {land:state.fx.strikes.at(-1)} : {})});
      };
      const recruit=()=>{
        const btn=document.querySelector(".bph-recruit-cell");
        if(!btn?.offsetWidth||btn.disabled)return;
        const before=castleSample.snapshot();
        const bought=s=>Object.values(s.bph.bought).reduce((a,b)=>a+b,0);
        const ordinal=${audit}?bought(before):0;
        const price=${audit}?Number(btn.querySelector(".bph-price")?.textContent.trim()):0;
        btn.click();
        const after=castleSample.snapshot();
        l.recruits++; l.recruitInputs.push({t,goldBefore:before.gold,goldAfter:after.gold});
        if(${audit}) {
          const purchase=bought(after)>ordinal;
          if(purchase&&(!Number.isSafeInteger(price)||price<=0))throw Error("Unreadable recruit price");
          auditGold(after,"recruit",purchase?price:0);
        }
      };
      if(${ramp}&&!l.breach&&!stopped&&tick!==o.actionTick&&tick%15===0&&t>0&&t<${end}){
        o.actionTick=tick;
        recruit();
        if((s.bph?.fx.counters["barracks:readyAt"]??-1)>=0)fieldTap("barracks",cx,cy-12);
        for(const button of document.querySelectorAll("button.skill.ready")){
          if(!button.offsetWidth||button.disabled)continue;
          const q=s.squads.find(q=>q.general===button.dataset.general), before=q?.skillClock;
          button.click();
          if(${audit})auditGold(castleSample.snapshot(),"skill");
          if(q?.skillClock>before) l.skillInputs.push({t,general:q.general});
        }
        const charges=s.bph?.fx.counters["tap:charges"]??0;
        const radius=${BPH_TAP_STRIKE.radius};
        const foes=alive.filter(e=>Math.hypot(Math.max(rect.left-e.x,0,e.x-rect.right),
            Math.max(rect.top-e.y,0,e.y-rect.bottom))<radius*2);
        if(charges&&foes.length){
          let target, best=0;
          for(const e of foes){
            if(Math.hypot(e.x-cx,e.y-(cy-12))<32||document.elementFromPoint(px(e.x),py(e.y))!==canvas)continue;
            let score=0;
            for(const f of foes) if((e.x-f.x)**2+(e.y-f.y)**2<=radius**2)
              score+= (f.ladder?3:f.cargo?.length?Math.min(10,1+f.cargo.length/5):1)
                * (f.y<rect.top&&s.walls["위"]<35?2:1);
            if(score>best){best=score;target=e}
          }
          if(target&&(best>=3||charges>=3))fieldTap("strike",target.x,target.y);
        }
      }
      if(sec!==o.lastSecond){o.lastSecond=sec;
        l.samples.push({t,enemies:s.enemies,alive:alive.length,walls:{...s.walls}});
        if(${ramp}&&sec>0&&(sec%60===0||sec===${end})){
          const spawns=l.regularSpawns.slice(o.spawnOffset);
          l.checkpoints.push({from:o.lastBoundary,through:sec,t,regularBodies:spawns.length,
            regularWeighted:spawns.reduce((sum,e)=>sum+e.weight,0),alive:alive.length,
            aliveShips:alive.filter(e=>e.kind==="ship").length,
            aliveEmbarked:alive.reduce((sum,e)=>sum+(e.cargo?.filter(p=>p.hp>0).length??0),0),
            attackEvents:l.attacks.length,walls:{...s.walls}});
          o.lastBoundary=sec; o.spawnOffset=l.regularSpawns.length;
        }
        if(!${ramp}&&!stopped&&sec>0&&sec<${recruitUntil}&&sec%4===0) recruit();
      }
      const hudClock=document.querySelector("#clock")?.textContent;
      // The HUD refreshes every fifth frame. Let it catch up at capture points.
      if(stopped||(t>=${target}${capture ? "" : "-1e-7"}&&(!${capture}||hudClock===${JSON.stringify(clockLabel)}))){
        const x=Math.max(0,px(rect.left-15)),y=Math.max(0,py(rect.top-20));
        return {time:t,hudClock,seed:s.seed,stopped,phase:s.phase,enemies:s.enemies,alive:alive.length,
          attackEvents:l.attacks.length,acquisitions:l.acquisitions.length,intactTicks:l.intactTicks,
          observedTicks:o.observedTicks,firstTick:o.firstTick,missedTicks:o.missedTicks,
          maxInside:l.maxInside,intact,walls:s.walls,minWalls:l.minWalls,checkpoints:l.checkpoints,
          recruitInputs:l.recruitInputs.length,fieldInputs:l.fieldInputs.length,skillInputs:l.skillInputs.length,rect,clip:{x,y,width:Math.min(innerWidth,px(rect.right+15))-x,
          height:Math.min(innerHeight,py(rect.bottom+15))-y,scale:2}};
      }
      c.time+=1000/60;const callbacks=[...c.queue.values()];c.queue.clear();
      // Watch only this run's live enemy array while the real frame executes.
      // The native push is forwarded unchanged and the probe removed before the next frame.
      const enemies=s.enemyUnits, push=enemies.push;
      // The spawner consumes queued commander ladder reinforcements before the regular grid.
      let reinforcements=s.bph?.survival?.reinforcements?.length??0;
      if(${ramp}) Object.defineProperty(enemies,"push",{configurable:true,value:function(...entries){
        const length=push.apply(this,entries);
        for(const e of entries) o.inserted.push({e,reinforcement:reinforcements-->0});
        return length;
      }});
      if(${combat}) for(const e of enemies) l.combat.enemyPositions.set(e.id,{x:e.x,y:e.y});
      const restoreHp=${combat}?observeAllyHp(s):null;
      try{for(const f of callbacks)f(c.time)}finally{restoreHp?.(); if(${ramp}) delete enemies.push}
    }throw Error("Did not reach "+${target}+" seconds")
  })()`) as { time: number; hudClock: string; seed: number; stopped: boolean; enemies: number; attackEvents: number; intactTicks: number;
      observedTicks: number; firstTick: number; missedTicks: number; checkpoints: {through:number;regularBodies:number}[];
      maxInside: number; intact: boolean; clip: {x:number;y:number;width:number;height:number;scale:number} };
  }
  const captures: { second: number; time: number; hudClock: string }[] = [];
  let summary;
  // Bound each CDP call while keeping one frozen game clock and browser session.
  for (const second of combat ? [30, 60, 85, 90, 95, 120, 150, 180, 210, end] : ramp ? [30, 60, 90, 120, 150, 180, 210, end] : [end]) {
    summary = await advanceTo(second);
    if (summary.stopped) break;
    if (!ramp || second === 30 || second === 90 || second === 210 || combat && second === end) {
      await phone.shot(`${out}/battle-${second}s.png`);
      const crop = await view.cdp("Page.captureScreenshot", {format:"png", clip:summary.clip}) as {data:string};
      await Bun.write(`${out}/fort-${second}s.png`, Buffer.from(crop.data, "base64"));
      captures.push({second, time:summary.time, hudClock:summary.hudClock});
    }
  }
  if (!summary) throw new Error("No battle summary");
  const errors = phone.errors.filter(message=>/^(exception|error):/.test(message));
  if(combat) {
    const result=await evaluate(`(()=>{
      const c=battleLog.combat;
      const loss=c.allyHpLoss.reduce((sum,e)=>sum+e.lost,0), lethals=c.allyHpLoss.filter(e=>e.lethal);
      const fraction=events=>{
        const edge=events.filter(e=>e.edge===true).length, unknown=events.filter(e=>e.edge===null).length;
        return {edge,total:events.length,unknown,fraction:events.length?edge/events.length:null};
      };
      const windows=(from,through)=>{
        const w=c.crowding.filter(e=>e.tick>=from*30&&e.tick<=through*30);
        return {from,through,ticks:w.length,peak:w.reduce((best,e)=>!best||e.total>best.total?e:best,null)};
      };
      const allies=c.fights.filter(e=>e.side==="ally"), enemies=c.fights.filter(e=>e.side==="enemy");
      return {viewport:{width:innerWidth,height:innerHeight},field:castleSample.snapshot().field,edgeBandPx:c.edgeBandPx,
        edgeBasis:"Euclidean world-pixel distance to nearest battlefield boundary, including outside points",
        crowdingPopulation:"Live, disembarked land enemies; nearest side only at corners",
        fightBasis:"One event per ally swing/shot effect with a roster source, or enemy-sourced ally hurt effect; edge classified at enemy endpoint",
        allyAttackEvents:allies.length,enemyHitsOnAllies:enemies.length,enemyAllyStrikeWindups:c.enemyWindups,
        edgeFights:fraction(c.fights),allyEdgeFights:fraction(allies),enemyEdgeFights:fraction(enemies),
        hpLossBasis:"Every downward live ally HP write during a game frame, clamped at zero; lethal writes retained",
        allyHpLoss:{total:loss,hpLossWrites:c.allyHpLoss.length,lethalWrites:lethals.length,
          lossOnLethalWrites:lethals.reduce((sum,e)=>sum+e.lost,0)},
        edgeCrowding:[windows(0,90),windows(85,90),windows(85,95)],
        crowdingAt90:c.crowding.find(e=>e.tick===2700)??null,
        intactIntrusions:{ticks:c.intactIntrusions.length,uniqueEnemies:new Set(c.intactIntrusions.flatMap(e=>e.ids)).size},
        enemyPopulation:{peakRegular:c.enemyPopulation.reduce((a,b)=>!a||b.regular>a.regular?b:a,null),
          peakAll:c.enemyPopulation.reduce((a,b)=>!a||b.all>a.all?b:a,null),
          queueObserved:c.enemyPopulation.some(e=>e.waiting!==null),
          peakWaiting:c.enemyPopulation.filter(e=>e.waiting!==null).reduce((a,b)=>!a||b.waiting>a.waiting?b:a,null),
          totalEverQueued:c.enemyPopulation.at(-1)?.totalQueued??null,
          remainingAtEnd:c.enemyPopulation.at(-1)?.waiting??null,
          final:c.enemyPopulation.at(-1)}};
    })()`);
    await Bun.write(`${out}/combat-audit.json`, JSON.stringify(result,null,2));
  }
  await Bun.write(`${out}/battle-events.json`, JSON.stringify(await evaluate("battleLog")));
  if(audit) {
    const result=await evaluate(`(()=>{
      const a=battleLog.coinAudit, ends=[0,60,120,180,210,211];
      const intervals=ends.slice(1).map((through,i)=>{
        const from=ends[i], open=a.boundaries[from*30], close=a.boundaries[through*30];
        if(!open)return {from,through,status:"unobserved"};
        const cutoff=close??a.last;
        const entries=a.transactions.filter(e=>(e.tick>open.tick||e.tick===open.tick&&e.stage!=="frame")
          &&(e.tick<cutoff.tick||e.tick===cutoff.tick&&(!close||e.stage==="frame")));
        const sum=key=>entries.reduce((n,e)=>n+e[key],0);
        const gained=sum("gained"),spent=sum("spent"),otherOutflow=sum("otherOutflow");
        return {from,through,status:close?"complete":"right-censored",observedThrough:cutoff.t,
          openingBalance:open.gold,closingBalance:cutoff.gold,gained,spent,otherOutflow,
          nativeEarnedDelta:sum("nativeEarnedDelta"),
          balanceResidual:cutoff.gold-open.gold-gained+spent+otherOutflow};
      });
      const counts={};
      for(const e of Object.values(a.threats))counts[e.category]=(counts[e.category]??0)+1;
      const minibosses=Object.values(a.threats).filter(e=>e.category.startsWith("scheduled-")||e.category==="final-boss").map(e=>{
        const crowd=a.crowd.filter(c=>c.id===e.id), targeting=a.targeting.filter(c=>c.id===e.id), hits=a.hits.filter(c=>c.id===e.id);
        return {...e,status:e.deathTime!==undefined?"dead":"right-censored",
          observedThrough:e.deathTime??a.last.t,crowd,targeting,hits};
      });
      const reference=[427,729,1023,1434];
      const checkpointComparison=intervals.slice(0,4).map((v,i)=>{
        const scaled=v.status==="complete"?v.gained*60/(v.through-v.from):null;
        return {from:v.from,through:v.through,gained:v.gained,coinsPerMinute:scaled,referencePerMinute:reference[i],
          deltaPercent:scaled===null?null:100*(scaled/reference[i]-1)};
      });
      return {intervals,checkpointComparison,observedThreatCounts:counts,minibosses,
        firstTick:battleObserver.firstTick,missedTicks:battleObserver.missedTicks};
    })()`);
    await Bun.write(`${out}/coin-audit.json`, JSON.stringify(result,null,2));
  }
  const regularSpawnsPerMinute = (summary.checkpoints as {from:number;through:number;regularBodies:number;regularWeighted:number}[])
    .map(c=>({from:c.from,through:c.through,bodies:c.regularBodies,weighted:c.regularWeighted,
      bodiesPerMinute:c.regularBodies*60/(c.through-c.from)}));
  const breachResult = breach ? await evaluate("({...battleLog.breach, endBase:castleSample.snapshot().base})") as {before:number; lowestBase:number; firstBaseHit:unknown} : undefined;
  await Bun.write(`${out}/summary.json`, JSON.stringify({ ...summary, mode:breach?"breach-audit":combat?"combat-audit":audit?"coin-audit":ramp?"ramp":"default", breachResult, captures, regularSpawnsPerMinute,
    fixture:{seed, profile:"fresh", recruitEverySeconds:ramp?.5:4, recruitUntilExclusive:recruitUntil,
      ...(ramp ? {barracks:"collect when ready", skills:"use ready portraits",
        strikes:"charged volleys aimed at nearby clusters"} : {})},
    errors, browserMessages:phone.errors }, null, 2));
  console.log(JSON.stringify(summary));
  if (summary.stopped || Math.abs(summary.time-end)>1e-6 || summary.seed!==seed || !summary.enemies || !summary.attackEvents ||
    (ramp && (summary.firstTick!==0 || summary.missedTicks || !breach && summary.intactTicks!==summary.observedTicks || captures.length!==(combat?4:3) ||
      captures.some(c=>c.time<c.second-1e-6||c.time-c.second>.15) ||
      summary.checkpoints.map(c=>c.through).join(",")!=="60,120,180,211" ||
      summary.checkpoints.some(c=>!c.regularBodies))) ||
    (!breach ? !summary.intact : !breachResult?.firstBaseHit || !(breachResult.lowestBase < breachResult.before)) ||
    summary.intactTicks<1000 || summary.maxInside || errors.length)
    throw new Error("Battle checks failed, see summary.json");
} finally {
  view.close(); server.stop(true); await rm(profile, {recursive:true, force:true});
}
