import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { soldier } from "../src/rules";
import { launch, passFirstBattleGuide } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";

// Run against two independently built bundles. Neither the simulation loop nor
// CastleScene.update is replaced. Only the browser's external RAF clock is owned.
// IMPACT_TIMING_BASELINE_DIST=... IMPACT_TIMING_CANDIDATE_DIST=...
// IMPACT_TIMING_OUT=... bun test ./scripts/impact-timing.test.ts --timeout 240000
type Capture = {
  readonly measurement: unknown;
  readonly signature: unknown;
  readonly valid: unknown;
  readonly errors: readonly string[];
};
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new TypeError(`Set ${name} to run the real-browser timing regression`);
  return resolve(value);
}
async function capture(bundle: string, label: string, out: string, targetHp: number, saturatedVisuals = false, boss = false): Promise<Capture> {
  const profile = await mkdtemp(`${tmpdir()}/castle-impact-${label}-`);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, bundle) });
  const phone = await launch(`http://127.0.0.1:${server.port}/?seed=1593`, profile, 390, 844,
    ["--renderer-process-limit=1", "--no-zygote", "--disable-gpu", "--disable-extensions", "--disable-breakpad"]);
  const until = (condition: string) => phone.evaluate(`new Promise((resolve,reject)=>{
    const deadline=Date.now()+30000;function check(){if(${condition})return resolve(true);
      if(Date.now()>deadline)return reject(new Error("Startup timeout: "+${JSON.stringify(condition)}));
      setTimeout(check,10);}check();})`);
  try {
    await until("window.castleSample && document.querySelector('#start') && !document.querySelector('#app').classList.contains('loading')");
    // Drain the one native callback already scheduled, using native RAF as the
    // synchronization barrier. No real-time sleep enters the measured interval.
    await phone.evaluate(`new Promise(resolve=>{
      const native=requestAnimationFrame.bind(window);window.__timingQueue=[];
      window.requestAnimationFrame=fn=>{window.__timingQueue.push(fn);return window.__timingQueue.length;};
      native(()=>native(()=>resolve(true)));
    })`);
    await phone.evaluate(`(()=>{
      window.__timingClock=1000000;window.__timingTick=0;
      Object.defineProperty(performance,"now",{configurable:true,value:()=>window.__timingClock});
      window.__timingStep=()=>{window.__timingTick++;window.__timingClock=1000000+window.__timingTick*1000/60;
        const queued=window.__timingQueue.splice(0);for(const fn of queued)fn(window.__timingClock);
        return queued.length;};
      for(let frame=0;frame<180;frame++)window.__timingStep();return true;
    })()`);
    await phone.evaluate("document.querySelector('#start').click()");
    await until("document.querySelector('[data-bph-start]')");
    await phone.evaluate("document.querySelector('[data-bph-start]').click()");
    await passFirstBattleGuide(phone);
    await until("castleSample.snapshot().phase==='playing' && !castleSample.snapshot().attract");
    const start = await phone.evaluate(`(()=>{
      const s=castleSample.snapshot();if(s.time!==0)throw new Error("Battle advanced before fixture: "+s.time);
      // At seed 1593, enemy 9010 wins both independent 10% kill rolls.
      const enemy={id:9010,kind:"yari",direction:"위",x:180,y:210,hp:${targetHp},maxHp:${targetHp},speed:0,
        elite:false,boss:${boss},wave:false,ladder:false,goalX:180,goalY:210,clock:1e6,strikeAt:0,
        prey:[0,0],stun:0,burn:0,burnClock:0,skillClock:1e6,casting:0,casts:0,
        bphProfileId:"Monster1_Caveling",shielded:false};
      const unit={...${JSON.stringify(soldier("spearman"))},id:8001,x:170,y:210,hp:5,maxHp:5,clock:.7,emerging:false,
        bph:{profileId:"Hero1_Squire3",birthProfileId:"Hero1_Squire3",packId:"Pack1_Basic",
          foil:false,giant:false,kills:0,stage:0,resultId:null,parentId:null,lifeId:1,cause:"pack"}};
      const q=s.squads[0];q.hp=q.maxHp=1e9;q.soldiers=[unit];
      s.enemyUnits.splice(0,s.enemyUnits.length,enemy);s.shots.splice(0);s.bph.packs.splice(0);s.bph.tomes.splice(0);
      // Isolate the target duel from automatic reinforcements, as in the general replay fixture.
      s.bph.supplyAt=Infinity;
      window.__timing={hits:0,damage:0,frames:0,callbacks:0,inputs:[],killTimes:[],lastKills:0,rngSequence:[s.rng],startClock:window.__timingClock};
      let hp=enemy.hp;
      Object.defineProperty(enemy,"hp",{enumerable:true,configurable:true,get:()=>hp,set:next=>{
        if(next<hp){window.__timing.hits++;window.__timing.damage+=hp-next;}hp=next;}});
      window.__timingEnemy=enemy;
      window.__timingInput=frame=>{
        const current=castleSample.snapshot(),b=current.bph;
        // Keep the isolated target encounter alive for the entire wall interval.
        // The same mutation precedes every frame in every compared bundle.
        for(let i=current.enemyUnits.length-1;i>=0;i--)
          if(current.enemyUnits[i].id!==enemy.id)current.enemyUnits.splice(i,1);
        const emit=effect=>{b.fxEvents.push(effect);
          window.__timing.inputs.push({frame,effect});};
        // Nonmajor requests just inside the old 2 s cadence must not steal the
        // next major slot. Critical cosmetic feedback must not share that budget.
        if([239,360,480,600,900].includes(frame))emit({kind:"expand",x:180,y:210,value:1});
        if([240,361,481,601,901].includes(frame))
          emit({kind:"hit",x:180,y:210,fromX:170,fromY:210,target:enemy.id,value:1,critical:true});
        if([120,241,362,482,602,906,1080,1260].includes(frame))
          emit({kind:"rout",x:180,y:210,value:35});
        if(frame%45===0)emit({kind:"hit",x:180,y:210,fromX:170,fromY:210,target:enemy.id,value:1,critical:false});
        if(${saturatedVisuals}&&[119,240,361,481,601,905].includes(frame))
          for(const kind of ["hit","hurt","devastate","swing","kill","blast"])
            for(let i=0;i<40;i++)emit({kind,x:180,y:210,fromX:170,fromY:210,value:kind==="kill"?0:1});
      };
      return {seed:s.seed,time:s.time,field:s.field,unit,enemy,clock:window.__timingClock};
    })()`);
    await Bun.write(`${out}/${label}-fixture.json`, JSON.stringify(start, null, 2));
    // Chunking only keeps CDP messages bounded; each callback still enters the
    // game's actual Phaser TimeStep and actual CastleScene.update.
    for (let second = 0; second < 60; second++) {
      await phone.evaluate(`(()=>{
        for(let frame=${second * 60 + 1};frame<=${(second + 1) * 60};frame++){
          window.__timingInput(frame);window.__timing.callbacks+=window.__timingStep();window.__timing.frames++;
          const s=castleSample.snapshot(),t=window.__timing;
          t.rngSequence.push(s.rng);
          if(s.kills!==t.lastKills){t.killTimes.push({frame,wallMs:window.__timingClock-t.startClock,time:s.time,kills:s.kills});t.lastKills=s.kills;}
        }return castleSample.snapshot().time;})()`);
    }
    const measurement = await phone.evaluate(`(()=>{
      const s=castleSample.snapshot(),t=window.__timing,e=window.__timingEnemy;
      const stopEvents=s.feedback.hitStopEvents??[],firstStop=stopEvents[0]?.at??0;
      return {seed:s.seed,controlledFrames:t.frames,controlledWallMs:window.__timingClock-t.startClock,
        nativeRafCallbacks:t.callbacks,simulationSeconds:s.time,hits:t.hits,damage:t.damage,enemyHp:e.hp,
        phase:s.phase,metricsDamage:s.metrics.damage,kills:s.kills,killTimes:t.killTimes,score:s.score,gold:s.gold,earned:s.earned,
        units:s.squads.flatMap(q=>q.soldiers.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp}))),
         target:{id:e.id,x:e.x,y:e.y,hp:e.hp},medals:s.bph.killMedals??0,
        stopMs:s.feedback.hitStops,stopIntervals:stopEvents.map(event=>Math.round((event.at-firstStop)*1000)/1000),
        rngSequence:t.rngSequence,saturatedVisuals:${saturatedVisuals},bossTarget:${boss},inputs:t.inputs};})()`);
    const signature = await phone.evaluate(`(()=>{
      const s=castleSample.snapshot(),t=window.__timing,e=window.__timingEnemy,events=s.feedback.hitStopEvents??[];
      return {simulationSeconds:s.time,hits:t.hits,damage:t.damage,enemyHp:e.hp,metricsDamage:s.metrics.damage,
        kills:s.kills,killTimes:t.killTimes,rngSequence:t.rngSequence,score:s.score,gold:s.gold,earned:s.earned,medals:s.bph.killMedals??0,
        units:s.squads.flatMap(q=>q.soldiers.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp}))),
        stopMs:s.feedback.hitStops,
        stopIntervals:events.map(event=>Math.round((event.at-events[0].at)*1000)/1000)};
    })()`);
    const valid = await phone.evaluate(`(()=>{
      const s=castleSample.snapshot(),t=window.__timing;
      return {startedAtZero:${JSON.stringify(start)}.time===0,seed:s.seed,frames:t.frames,
        wallMs:window.__timingClock-t.startClock,nativeDamage:t.hits>0&&t.damage>0,
        majorStops:s.feedback.hitStops.length>0,playing:s.phase==="playing",
        positiveKillReward:s.kills>0&&s.earned>0&&s.bph.killMedals>0,
        observedRngSequence:t.rngSequence.length===3601&&t.rngSequence.every(Number.isSafeInteger)
          &&t.rngSequence.some(value=>value!==t.rngSequence[0])};
    })()`);
    const result = { measurement, signature, valid, errors: [...phone.errors] };
    await Bun.write(`${out}/${label}-timing.json`, JSON.stringify(result, null, 2));
    await phone.shot(`${out}/${label}-60-wall-seconds.png`);
    console.log(`IMPACT_TIMING_CAPTURE ${label} ${JSON.stringify(measurement)}`);
    return result;
  } finally {
    server.stop(true);
    await closeBrowser(phone.view, profile);
  }
}

test.each([["enduring target", 1e9, false], ["positive kill reward and saturated visuals", 3, false],
  ["boss kill and saturated visuals", 3, true]] as const)(
  "real main.update preserves 60-second combat timing with interleaved impacts: %s", async (scenario, targetHp, boss) => {
  const baselineDist = required("IMPACT_TIMING_BASELINE_DIST");
  const candidateDist = required("IMPACT_TIMING_CANDIDATE_DIST");
  const out = resolve(required("IMPACT_TIMING_OUT"), scenario.replaceAll(" ", "-"));
  await mkdir(out, { recursive: true });
  const baseline = await capture(baselineDist, "baseline", out, targetHp, targetHp === 3, boss);
  const candidate = await capture(candidateDist, "candidate", out, targetHp, targetHp === 3, boss);
  const controls = targetHp === 3 ? [await capture(candidateDist, "unsaturated-control", out, targetHp, false, boss)] : [];
  for (const result of [baseline, candidate, ...controls]) {
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual({ startedAtZero: true, seed: 1593, frames: 3600,
      wallMs: 60000, nativeDamage: true, majorStops: true, playing: true, positiveKillReward: targetHp === 3,
      observedRngSequence: true });
  }
  // Historical baseline is independent of the candidate. Old a03cf21 must fail
  // here when its presentation freeze lets combat advance during major stops.
  expect(candidate.signature).toEqual(baseline.signature);
  for (const control of controls) expect(candidate.signature).toEqual(control.signature);
}, 240000);
