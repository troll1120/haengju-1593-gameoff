import { mkdir } from "node:fs/promises";
import { launch, passFirstBattleGuide } from "./review-browser";

const [folder, label = "before", port = "19796"] = Bun.argv.slice(2);
await mkdir(`${folder}/frames`, { recursive: true });
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
  page = await launch("about:blank", `${folder}/${label}-browser`, 390, 844,
    ["--single-process", "--no-zygote", "--disable-gpu"]);
  await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source:
    'localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,firstBattleGuide:true}));' });
  await page.view.navigate(`http://127.0.0.1:${port}/`);
  const wait = (condition: string) => page!.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+60000;function frame(){if(${condition})return resolve(true);
    if(performance.now()>end)return reject(new Error('Capture timeout'));requestAnimationFrame(frame)}frame()})`);
  await wait("window.castleSample && !document.querySelector('#start').disabled");
  await page.tapElement("#start");
  await wait("document.querySelector('[data-bph-start]')");
  await page.tapElement("[data-bph-start]");
  await wait("castleSample.snapshot().phase==='playing' && !castleSample.snapshot().attract");
  await passFirstBattleGuide(page);
  await wait("!castleSample.snapshot().paused");
  await page.shot(`${folder}/${label}-first-round.png`);
  type Property = { name: string; value?: { objectId?: string } };
  const properties = (objectId: string) => page!.view.cdp("Runtime.getProperties", { objectId, ownProperties: true }) as Promise<{
    result: Property[]; internalProperties?: Property[];
  }>;
  const snapshot = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" }) as { result: { objectId: string } };
  const fn = await properties(snapshot.result.objectId);
  const scopes = await properties(fn.internalProperties!.find(p => p.name === "[[Scopes]]")!.value!.objectId!);
  for (const scope of scopes.result) if (scope.value?.objectId) {
    const variables = await properties(scope.value.objectId);
    for (const [name, global] of [["run", "__targetRun"], ["arenaScene", "__targetScene"]]) {
      const id = variables.result.find(p => p.name === name)?.value?.objectId;
      if (id) await page.view.cdp("Runtime.callFunctionOn", { objectId: id,
        functionDeclaration: `function(){globalThis.${global}=this;return true}`, returnByValue: true });
    }
  }
  await page.evaluate(`(async()=>{
    const {addBphProfile}=await import('/src/bph-combat.ts');
    const {createRun}=await import('/src/rules.ts');
    const {CENTER,WIDTH,fortRect}=await import('/src/geometry.ts');
    const run=globalThis.__targetRun;
    run.enemies=[];run.spawnBudget=run.xp=-1e9;
    run.nextElite=run.nextBoss=run.nextWave=run.nextRiverWave=1e9;
    run.bph.survival.cursor=run.bph.survival.nextDeparture=run.bph.supplyAt=1e9;
    const squad=run.squads[0];squad.clock=squad.skillClock=1e9;squad.state='down';squad.downUntil=1e9;
    addBphProfile(run,{profileId:'Hero1_Squire',copies:8,foil:false,discovered:false},{packId:'Pack1_Basic'});
    addBphProfile(run,{profileId:'Hero1_Barbarian',copies:8,foil:false,discovered:false},{packId:'Pack1_Basic'});
    const wall=fortRect(run.fort);
    squad.soldiers.forEach((u,i)=>Object.assign(u,{x:wall.right+25+i%2*22,
      y:wall.top-65+Math.floor(i/2)*18,emerging:false,clock:0,strikeAt:0}));
    for(const [x,y] of [[WIDTH-35,wall.top-50],[WIDTH-35,wall.top-18],[25,wall.top-25]]){
      run.enemies.push({...createRun(144).enemies[0],id:run.nextId++,kind:'yari',x,y,goalX:x,goalY:y,
        hp:1e9,maxHp:1e9,speed:0,elite:false,boss:false,wave:false,clock:1e9,strikeAt:0,prey:null,stun:1e9,skillClock:1e9});
    }
    globalThis.__targetRows=[];globalThis.__targetStart=run.time;
    // Isolate the distance boundary: two living foes move around one soldier,
    // alternately 3 px nearer. This removes death, crowd pushing and retaliation.
    const focal=squad.soldiers[0];
    Object.assign(focal,{x:CENTER.x,y:wall.top-70,clock:1e9});
    squad.soldiers.slice(1).forEach(u=>{u.hp=0;u.downUntil=1e9});
    run.enemies=run.enemies.slice(0,2);
    const observe=()=>{
      const t=run.time-globalThis.__targetStart;
      const shift=Math.floor(t/.45)%2 ? 3 : -3;
      run.enemies[0].x=focal.x-26+shift;run.enemies[1].x=focal.x+26+shift;
      run.enemies.forEach(e=>{e.y=focal.y;e.goalX=e.x;e.goalY=e.y});
      globalThis.__targetRows.push({time:t,units:squad.soldiers.map(u=>({id:u.id,x:u.x,y:u.y,quarry:u.quarry})),
        foes:run.enemies.map(e=>({id:e.id,x:e.x,y:e.y}))});
      if(t<4)requestAnimationFrame(observe);
    };requestAnimationFrame(observe);
  })()`);
  for (let i = 0; i <= 16; i++) {
    await wait(`globalThis.__targetRun.time-globalThis.__targetStart>=${i * .25}`);
    await page.shot(`${folder}/frames/${label}-${String(i).padStart(2,"0")}.png`);
  }
  const result = await page.evaluate(`({rows:globalThis.__targetRows,field:castleSample.snapshot().field,
    phase:castleSample.snapshot().phase,errors:[],assigned:globalThis.__targetRun.squads[0].soldiers.map(u=>u.flank)})`);
  await Bun.write(`${folder}/${label}.json`, JSON.stringify(result));
  if (page.errors.length) throw new Error(page.errors.join("\\n"));
  console.log(`CAPTURE_READY ${label}`);
} finally {
  page?.view.close();
  server.kill();
  await server.exited;
}
