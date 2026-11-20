import { mkdir } from "node:fs/promises";
import { launch, passFirstBattleGuide } from "./review-browser";

const [folder, label = "after", port = "19841"] = Bun.argv.slice(2);
if (!folder) throw new Error("Evidence folder required");
await mkdir(folder, { recursive: true });
const server = Bun.spawn(["bun", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { env: process.env, stdin: "ignore", stdout: "pipe", stderr: "inherit" });
let page: Awaited<ReturnType<typeof launch>> | undefined;
try {
  const reader = server.stdout.getReader();
  let ready = "";
  while (!ready.includes(port)) {
    const part = await reader.read();
    if (part.done) throw new Error("Vite stopped");
    ready += new TextDecoder().decode(part.value);
  }
  page = await launch("about:blank", `${folder}/${label}-profile`, 390, 844,
    ["--single-process", "--no-zygote", "--disable-gpu"]);
  const wait = (condition: string) => page!.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+45000;function frame(){if(${condition})return resolve(true);
    if(performance.now()>end)return reject(new Error("Timed out: "+${JSON.stringify(condition)}));
    requestAnimationFrame(frame)}frame()})`);
  await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source:
    'localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,firstBattleGuide:true}));' });
  await page.view.navigate(`http://127.0.0.1:${port}/?seed=42`);
  await wait("window.castleSample && !document.querySelector('#start').disabled");
  await page.tapElement("#start");
  await wait("document.querySelector('[data-bph-start]')");
  await page.tapElement("[data-bph-start]");
  await wait("castleSample.snapshot().phase==='playing' && !castleSample.snapshot().attract");
  await passFirstBattleGuide(page);
  await wait("!castleSample.snapshot().paused && castleSample.snapshot().time>2");
  await page.shot(`${folder}/${label}-first-round.png`);
  // Only arrange the encounter. The real RAF loop and enemy damage own the death transition.
  await page.evaluate(`(()=>{
    const s=castleSample.snapshot(),q=s.squads[0];
    q.hp=1;q.safeUntil=0;q.hurtAt=s.time;q.skillClock=5;q.clock=1e9;
    q.soldiers.forEach(u=>u.clock=1e9);
    s.enemyUnits.splice(0,s.enemyUnits.length,{
      id:900001,kind:'yari',direction:'위',x:q.x+14,y:q.y,hp:1e9,maxHp:1e9,
      speed:0,elite:false,boss:false,goalX:q.x,goalY:q.y,clock:0,strikeAt:0,
      prey:[0,-1],stun:0,burn:0,burnClock:0,skillClock:1e9,casting:0,casts:0
    });
  })()`);
  await wait("castleSample.snapshot().squads[0].state==='down'");
  await wait("document.querySelector('#skills button').disabled");
  const state = () => page!.evaluate(`(()=>{
    const s=castleSample.snapshot(),q=s.squads[0],b=document.querySelector('#skills button');
    return {time:s.time,hp:q.hp,state:q.state,downUntil:q.downUntil,clock:q.skillClock,
      downs:s.metrics.downs,casts:s.metrics.skills,button:{hidden:b.hidden,disabled:b.disabled,
        visible:b.getBoundingClientRect().width>0,ready:b.classList.contains('ready'),fill:b.style.getPropertyValue('--fill')}};
  })()`);
  const down = await state();
  await page.evaluate("globalThis.__deadAt=castleSample.snapshot().time");
  await wait("castleSample.snapshot().time>globalThis.__deadAt+1");
  const later = await state();
  await page.shot(`${folder}/${label}-dead.png`);
  // Even an event dispatched directly to a hidden/disabled button must not cast.
  const rejected = await page.evaluate(`(async()=>{
    const {useSkill}=await import('/src/rules.ts'),s=castleSample.snapshot(),q=s.squads[0];
    const before=s.metrics.skills[0];q.skillClock=0;
    document.querySelector('#skills button').dispatchEvent(new Event('click',{bubbles:true}));
    return {effects:useSkill(s,0).length,before,after:s.metrics.skills[0]};
  })()`);
  await page.evaluate(`(()=>{const s=castleSample.snapshot(),q=s.squads[0];
    s.enemyUnits.splice(0);q.downUntil=s.time+.2;q.skillClock=0;})()`);
  await wait("castleSample.snapshot().squads[0].state!=='down' && !document.querySelector('#skills button').disabled");
  await page.shot(`${folder}/${label}-revived.png`);
  const revived = await state();
  await page.tapElement("#skills button");
  const castAfterRevive = await state();
  await page.view.resize(1200, 844);
  await page.view.cdp("Emulation.setDeviceMetricsOverride", { width: 1200, height: 844, deviceScaleFactor: 1, mobile: false });
  await page.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  await page.shot(`${folder}/${label}-desktop.png`);
  const result = { label, down, later, rejected, revived, castAfterRevive, errors: page.errors };
  await Bun.write(`${folder}/${label}-browser.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (page.errors.length) throw new Error(page.errors.join("\n"));
  if (label === "after") {
    const d = down as { clock: number; button: { hidden: boolean; disabled: boolean } };
    const l = later as { clock: number };
    if (!d.button.hidden || !d.button.disabled || d.clock !== l.clock) throw new Error("Dead skill remains active");
    const r = rejected as { effects: number; before: number; after: number };
    if (r.effects || r.before !== r.after) throw new Error("Dead general cast");
    const v = revived as { button: { hidden: boolean } };
    const c = castAfterRevive as { casts: number[] };
    if (v.button.hidden || c.casts[0] !== r.after + 1) throw new Error("Revived skill did not return");
  }
} finally {
  page?.view.close();
  server.kill();
  await server.exited;
}
