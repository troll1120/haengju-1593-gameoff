import { mkdir } from "node:fs/promises";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";
import { soldier } from "../src/rules";

const [label = "after", build = "review-dist", out = "review/ally-evidence", mode = "normal"] = Bun.argv.slice(2);
await mkdir(out, { recursive: true });
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: request => previewResponse(request, build) });
const phone = await launch("about:blank", `${out}/profile-${label}-${mode}`, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
const ready = (condition: string) => phone.evaluate(`new Promise((resolve,reject)=>{
  const end=performance.now()+60000;function check(){
    if(${condition})return resolve(true);
    if(performance.now()>end)return reject(new Error("State timeout"));
    requestAnimationFrame(check);
  }check();
})`);
try {
  await phone.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,motionOff:${mode === "motion-off"},flashesOff:${mode === "flashes-off"}}));
    let seed=42;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  ` });
  if (mode === "reduced") await phone.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await phone.view.navigate(`http://127.0.0.1:${server.port}`);
  await ready("window.castleSample && !document.querySelector('#start').disabled");
  await phone.tapElement("#start");
  await ready("document.querySelector('[data-bph-start]')");
  await phone.tapElement("[data-bph-start]");
  await ready("castleSample.snapshot().time>4 && castleSample.snapshot().enemyUnits.length>0");
  const fixture = await phone.evaluate(`(()=>{
    const s=castleSample.snapshot(),q=s.squads[0],e=s.enemyUnits[0],u=${JSON.stringify(soldier("spearman"))};
    const upper=s.field.height*.66,lower=s.field.height*.78;
    const points=[{x:90,y:upper,dx:24,dy:0},{x:270,y:upper,dx:-24,dy:0},{x:90,y:lower,dx:0,dy:-24},{x:270,y:lower,dx:0,dy:24}];
    q.hp=q.maxHp=1e9;q.clock=q.skillClock=1e9;
    q.soldiers=points.map((p,i)=>({...u,id:10000+i,x:p.x,y:p.y,clock:0,emerging:false,hp:1e9,maxHp:1e9,quarry:9000+i,aim:9000+i}));
    s.enemyUnits.splice(0,s.enemyUnits.length,...points.map((p,i)=>({...e,id:9000+i,x:p.x+p.dx,y:p.y+p.dy,
      hp:1e9,maxHp:1e9,speed:0,clock:1e9,skillClock:1e9,boss:false,elite:false,stun:0})));
    window.juiceFrames=[];let last=performance.now();window.juiceEnd=last+8000;
    requestAnimationFrame(function f(now){juiceFrames.push(now-last);last=now;if(now<juiceEnd)requestAnimationFrame(f);});
    return {seed:42,points,width:innerWidth,height:innerHeight,beforeSwings:s.feedback.swings};
  })()`);
  await ready("castleSample.snapshot().squads[0].soldiers.some(u=>u.strikeAt>0)");
  await phone.evaluate(`(()=>{
    window.juiceAttack=[];const canvas=document.querySelector("#arena canvas"),start=performance.now();
    requestAnimationFrame(function frame(now){
      juiceAttack.push({at:now-start,image:canvas.toDataURL("image/png")});
      if(juiceAttack.length<40)requestAnimationFrame(frame);
    });
  })()`);
  await ready("window.juiceAttack.length===40");
  const strip = await phone.evaluate(`(async()=>{
    const frames=juiceAttack.filter((_,i)=>i%3===0),c=document.createElement("canvas"),source=document.querySelector("#arena canvas");
    const height=Math.round(source.height/source.width*195),row=height+25;
    c.width=7*195;c.height=2*row;const ctx=c.getContext("2d");ctx.fillStyle="#262b44";ctx.fillRect(0,0,c.width,c.height);
    for(let i=0;i<frames.length;i++){
      const image=new Image();image.src=frames[i].image;await image.decode();
      const x=i%7*195,y=Math.floor(i/7)*row;ctx.drawImage(image,x,y,195,height);
      ctx.fillStyle="white";ctx.font="14px sans-serif";ctx.fillText(Math.round(frames[i].at)+"ms",x+6,y+height+18);
    }
    return {image:c.toDataURL("image/png").split(",")[1],times:juiceAttack.map(f=>f.at)};
  })()`);
  if (typeof strip !== "object" || strip === null || !("image" in strip) || typeof strip.image !== "string") throw new Error("Missing attack strip");
  await Bun.write(`${out}/${label}-${mode}-strip.png`, Buffer.from(strip.image, "base64"));
  await Bun.write(`${out}/${label}-${mode}-strip.json`, JSON.stringify(strip, (key, value: unknown) => key === "image" ? undefined : value));
  for (let frame = 0; frame < 20; frame++) {
    await phone.shot(`${out}/${label}-${mode}-${String(frame).padStart(2, "0")}.png`);
    await phone.evaluate("new Promise(resolve=>requestAnimationFrame(()=>resolve(true)))");
  }
  await phone.evaluate(`(()=>{
    window.juiceFrames=[];let last=performance.now();window.juiceEnd=last+8000;
    requestAnimationFrame(function f(now){juiceFrames.push(now-last);last=now;if(now<juiceEnd)requestAnimationFrame(f);});
  })()`);
  await ready("performance.now()>juiceEnd");
  const result = await phone.evaluate(`(()=>{
    const s=castleSample.snapshot(),f=[...juiceFrames].sort((a,b)=>a-b);
    return {p95:f[Math.floor(f.length*.95)],over50:f.filter(n=>n>50).length,samples:f.length,
      swings:s.feedback.swings,hits:s.feedback.hitFrames,units:s.squads[0].soldiers.map(u=>({x:u.x,y:u.y,hp:u.hp})),
      enemies:s.enemyUnits.map(e=>({id:e.id,hp:e.hp})),feedback:s.feedback};
  })()`);
  await Bun.write(`${out}/${label}-${mode}.json`, JSON.stringify({ fixture, result, errors: phone.errors }, null, 2));
  if (phone.errors.length) throw new Error(phone.errors.join("\n"));
  console.log(`JUICE_CAPTURE_EXIT=0 label=${label} mode=${mode}`);
} finally {
  phone.view.close(); server.stop(true);
}
