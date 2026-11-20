import { mkdir } from "node:fs/promises";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";

const label = Bun.argv[2] ?? "after";
const out = process.env["JUICE_EVIDENCE"] ?? `${import.meta.dir}/../review/audio-camera`;
const buildRoot = process.env["JUICE_BUILD_ROOT"] ?? `${import.meta.dir}/../review-dist`;
await mkdir(out, { recursive: true });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, buildRoot) });
const cases: readonly (readonly [number, string])[] = label === "before" ? [[390, "normal"], [1440, "normal"]] :
  [[390, "normal"], [1440, "normal"], [390, "reduced"], [1440, "reduced"], [390, "motion-off"]];
for (const [width, mode] of cases) {
  const stamp = `${label}-${width}-${mode}`;
  const phone = await launch(`http://127.0.0.1:${server.port}/?seed=1593`, `${process.env["TMPDIR"] ?? "/tmp"}/juice-${crypto.randomUUID()}`, width, width === 390 ? 844 : 900,
    ["--single-process", "--no-zygote", "--disable-gpu", "--disable-extensions", "--disable-breakpad"]);
  const ready = (condition: string) => phone.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+45000;
    requestAnimationFrame(function f(){if(${condition})resolve(true);
      else if(performance.now()>end)reject(new Error("Timeout: "+${JSON.stringify(condition)}));
      else requestAnimationFrame(f);});
  })`);
  try {
    await phone.evaluate(`(()=>{
      localStorage.setItem("haengju1593-meta",${JSON.stringify(JSON.stringify(freshMeta()))});
      localStorage.setItem("haengju1593",JSON.stringify({motionOff:${mode === "motion-off"},flashesOff:${mode === "motion-off"}}));
    })()`);
    await phone.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: mode === "reduced" ? "reduce" : "no-preference" }] });
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=1593`);
    await ready("window.castleSample?.snapshot().field && !document.querySelector('#start').disabled");
    await phone.evaluate(`(()=>{
      window.juiceAudio={events:[],frames:[]};
      const connect=AudioNode.prototype.connect, start=OscillatorNode.prototype.start;
      AudioNode.prototype.connect=function(target,...args){
        const result=Reflect.apply(connect,this,[target,...args]);
        if(target===this.context.destination && this.context.createMediaStreamDestination){
          const dest=this.context.createMediaStreamDestination();
          Reflect.apply(connect,this,[dest]);
          juiceAudio.dest=dest;juiceAudio.context=this.context;
        }
        return result;
      };
      OscillatorNode.prototype.start=function(at){
        juiceAudio.events.push({at,now:this.context.currentTime,frame:document.timeline.currentTime,
          wall:performance.now(),hz:this.frequency.value});
        return Reflect.apply(start,this,[at]);
      };
      requestAnimationFrame(function f(t){
        const s=castleSample.snapshot();
        juiceAudio.frames.push({t,audio:juiceAudio.context?.currentTime,numbers:s.feedback?.numbers,
          topples:s.feedback?.topples,phase:s.phase});
        requestAnimationFrame(f);
      });
    })()`);
    await phone.tapElement("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await phone.tapElement("[data-bph-start]");
    await passFirstBattleGuide(phone);
    await ready("castleSample.snapshot().time>2 && castleSample.snapshot().enemyUnits.length");
    await phone.shot(`${out}/${stamp}-battle.png`);
    await phone.evaluate(`(()=>{
      const stream=document.querySelector("#arena canvas").captureStream(60);
      juiceAudio.dest.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
      juiceAudio.chunks=[];
      juiceAudio.recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp8,opus"});
      juiceAudio.recorder.ondataavailable=e=>{if(e.data.size)juiceAudio.chunks.push(e.data);};
      juiceAudio.recorder.start();
    })()`);
    await phone.evaluate(`(()=>{
      const s=castleSample.snapshot(), e=s.enemyUnits[0], q=s.squads[0];
      q.hp=q.maxHp=1e8;
      s.enemyUnits.splice(0,s.enemyUnits.length,{...e,id:90001,boss:true,bossArt:"konishi",
        kind:"ukita",x:q.x+25,y:q.y+5,hp:1e7,maxHp:1e7,speed:0,clock:1e6,skillClock:1e6});
    })()`);
    await ready("castleSample.snapshot().enemyUnits.some(e=>e.id===90001)");
    await phone.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    await phone.shot(`${out}/${stamp}-boss-before.png`);
    await phone.evaluate(`(()=>{
      const s=castleSample.snapshot(), e=s.enemyUnits.find(e=>e.id===90001);
      e.hp=.01; e.shielded=false;
      for(const q of s.squads){q.clock=0;for(const u of q.soldiers)u.clock=0;}
    })()`);
    await ready("!castleSample.snapshot().enemyUnits.some(e=>e.id===90001)");
    await phone.shot(`${out}/${stamp}-boss-contact.png`);
    await phone.evaluate("new Promise(r=>{const end=performance.now()+120;requestAnimationFrame(function f(t){if(t>=end)r(true);else requestAnimationFrame(f);});})");
    await phone.shot(`${out}/${stamp}-boss-peak.png`);
    await phone.evaluate("new Promise(r=>{const end=performance.now()+400;requestAnimationFrame(function f(t){if(t>=end)r(true);else requestAnimationFrame(f);});})");
    await phone.shot(`${out}/${stamp}-boss-settled.png`);
    await phone.evaluate(`(()=>{
      window.rewardFrames=[];
      requestAnimationFrame(function f(t){
        setTimeout(()=>{
        const flip=document.querySelector(${JSON.stringify(label === "before" ? "#result-flip" : "#result-unlock-modal[open]")});
        if (!flip) return;
        const cs=getComputedStyle(flip),veil=document.querySelector(".result-reward-veil");
        rewardFrames.push({t,cls:flip.className,visible:${label === "before" ? 'flip.classList.contains("revealed")' : "flip.open"},
          transform:cs.transform,rect:flip.getBoundingClientRect().toJSON(),motion:flip.getAnimations({subtree:true}).length,
          dim:veil?Number(getComputedStyle(veil).opacity):0,rays:getComputedStyle(flip,"::before").display,
          flash:document.querySelector("#screen-flash").hidden?0:Number(getComputedStyle(document.querySelector("#screen-flash")).opacity)});
        },0);
        requestAnimationFrame(f);
      });
    })()`);
    await phone.evaluate(`(()=>{
      const s=castleSample.snapshot();
      s.enemyUnits.length=0;
      s.metrics.bosses.push({kind:"ukita",at:s.time,fallen:s.time});
    })()`);
    await ready("castleSample.snapshot().phase==='won'");
    console.log("RESULT_FIXTURE", JSON.stringify(await phone.evaluate(`(()=>{
      const s=castleSample.snapshot();
      return {settled:s.bph.settled,unlocked:s.bph.save.unlockedGenerals,
        runs:JSON.parse(localStorage.getItem("haengju1593-meta")).runs};
    })()`)));
    await phone.shot(`${out}/${stamp}-result-start.png`);
    await ready(label === "before" ? "document.querySelector('#result-flip.revealed')" : "document.querySelector('#result-unlock-modal[open]')");
    await phone.shot(`${out}/${stamp}-result-reveal.png`);
    await phone.evaluate("new Promise(r=>{const end=performance.now()+180;requestAnimationFrame(function f(t){if(t>=end)r(true);else requestAnimationFrame(f);});})");
    await phone.shot(`${out}/${stamp}-result-peak.png`);
    await phone.evaluate("new Promise(r=>{const end=performance.now()+1700;requestAnimationFrame(function f(t){if(t>=end)r(true);else requestAnimationFrame(f);});})");
    await phone.shot(`${out}/${stamp}-result-settled.png`);
    const clip = await phone.evaluate(`new Promise(resolve=>{
      juiceAudio.recorder.onstop=async()=>{
        const bytes=new Uint8Array(await new Blob(juiceAudio.chunks).arrayBuffer());
        let text="";for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.slice(i,i+16384));
        resolve(btoa(text));
      };juiceAudio.recorder.stop();
    })`);
    if (typeof clip !== "string") throw new Error("Audio/video capture did not return bytes");
    await Bun.write(`${out}/${stamp}-boss.webm`, Buffer.from(clip, "base64"));
    const measurements = await phone.evaluate(`(()=>{
      const frames=rewardFrames.filter(f=>f.visible),scale=f=>f.transform==="none"?1:Number(f.transform.slice(7).split(",")[0]);
      return {mode:${JSON.stringify(mode)},maxScale:Math.max(...frames.map(scale)),maxDim:Math.max(...rewardFrames.map(f=>f.dim)),
        rewardFrameDeltaMs:Math.min(...juiceAudio.events.filter(e=>Math.abs(e.at-e.now)<.00001).map(e=>Math.abs(e.frame-frames[0].t))),
        maxFlash:Math.max(...rewardFrames.map(f=>f.flash)),stationary:frames.every(f=>f.motion===0&&scale(f)===1),
        overflow:document.querySelector("#result").scrollWidth>document.querySelector("#result").clientWidth,
        events:juiceAudio.events,frames:juiceAudio.frames,rewardFrames};
    })()`);
    await Bun.write(`${out}/${stamp}.json`, JSON.stringify({ errors: phone.errors, measurements,
      result: await phone.evaluate(`({phase:castleSample.snapshot().phase,
        flip:document.querySelector(${JSON.stringify(label === "before" ? "#result-flip" : "#result-unlock-modal")}).getBoundingClientRect().toJSON(),
        sound:castleSample.snapshot().sound})`) }, null, 2));
    if (label !== "before") {
      await phone.evaluate(`(()=>{
        const frames=rewardFrames.filter(f=>f.visible),scale=f=>f.transform==="none"?1:Number(f.transform.slice(7).split(",")[0]);
        if(!frames.length||frames.some(f=>scale(f)!==1||f.motion!==0))throw new Error("Unlock card must remain stationary");
        if(frames.some(f=>Math.abs(f.rect.x+f.rect.width/2-innerWidth/2)>1||
          Math.abs(f.rect.y+f.rect.height/2-innerHeight/2)>1))throw new Error("Unlock card is not centered");
        const delta=Math.min(...juiceAudio.events.filter(e=>Math.abs(e.at-e.now)<.00001).map(e=>Math.abs(e.frame-frames[0].t)));
        if(delta>.1)throw new Error("Reward audio and paint frame differ by "+delta+" ms");
        if(document.querySelector("#result").scrollWidth>document.querySelector("#result").clientWidth)throw new Error("Reward overflow");
        if(document.querySelector(".result-reward-veil"))throw new Error("Reward dim did not clean up");
        if(rewardFrames.some(f=>f.flash>0))throw new Error("Unlock added a screen flash");
      })()`);
    }
    if (phone.errors.length) throw new Error(phone.errors.join("\n"));
  } finally {
    phone.view.close();
  }
}
server.stop(true);
console.log(`AUDIO_CAMERA_CAPTURE_EXIT=0 label=${label}`);
