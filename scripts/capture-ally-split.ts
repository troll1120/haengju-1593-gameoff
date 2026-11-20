import { mkdir } from "node:fs/promises";
import { launch, passFirstBattleGuide } from "./review-browser";

const [folder, label = "after", port = "19793"] = Bun.argv.slice(2);
if (!folder) throw new Error("An evidence folder is required");
await mkdir(`${folder}/frames`, { recursive: true });
const server = Bun.spawn(["bun", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { env: process.env, stdin: "ignore", stdout: "pipe", stderr: "inherit" });
let page: Awaited<ReturnType<typeof launch>> | undefined;
try {
  const reader = server.stdout.getReader();
  let ready = "";
  while (!ready.includes(port)) {
    const part = await reader.read();
    if (part.done) throw new Error("Vite stopped before readiness");
    ready += new TextDecoder().decode(part.value);
  }
  page = await launch("about:blank", `${folder}/${label}-browser`, 390, 844,
    ["--single-process", "--no-zygote", "--disable-gpu"]);
  await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source:
    'localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,firstBattleGuide:true}));' });
  // Normal game loop, native phone layout. Never override field, canvas or arena dimensions.
  await page.view.navigate(`http://127.0.0.1:${port}/`);
  const wait = (condition: string) => page!.evaluate(`new Promise((resolve,reject)=>{
    const deadline=performance.now()+60000;function frame(){if(${condition})return resolve(true);
    if(performance.now()>deadline)return reject(new Error("Capture timeout: "+JSON.stringify({
      phase:castleSample.snapshot().phase,paused:castleSample.snapshot().paused,
      time:castleSample.snapshot().time,controlled:globalThis.__splitRun?.time})));requestAnimationFrame(frame)}frame()})`);
  await wait("window.castleSample && !document.querySelector('#start').disabled");
  await page.tapElement("#start");
  await wait("document.querySelector('[data-bph-start]')");
  await page.tapElement("[data-bph-start]");
  await wait("castleSample.snapshot().phase==='playing' && !castleSample.snapshot().attract");
  await passFirstBattleGuide(page);
  await wait("!castleSample.snapshot().paused");

  type Property = { name: string; value?: { objectId?: string } };
  const properties = (objectId: string) => page!.view.cdp("Runtime.getProperties", { objectId, ownProperties: true }) as Promise<{
    result: Property[]; internalProperties?: Property[];
  }>;
  const snapshot = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" }) as { result: { objectId: string } };
  const fn = await properties(snapshot.result.objectId);
  const scopes = await properties(fn.internalProperties!.find(p => p.name === "[[Scopes]]")!.value!.objectId!);
  let moduleScope: string | undefined, begin: string | undefined;
  for (const scope of scopes.result) if (scope.value?.objectId) {
    const variables = await properties(scope.value.objectId);
    begin = variables.result.find(p => p.name === "begin")?.value?.objectId;
    if (begin) {
      moduleScope = scope.value.objectId;
      const scene = variables.result.find(p => p.name === "arenaScene")?.value?.objectId;
      if (!scene) throw new Error("Renderer binding not found");
      await page.view.cdp("Runtime.callFunctionOn", { objectId: scene,
        functionDeclaration: "function(){globalThis.__splitScene=this;return true}", returnByValue: true });
      break;
    }
  }
  if (!moduleScope || !begin) throw new Error("Game entry binding not found");
  const summaries = [];
  for (const kind of ["idle", "two-sides", "gate-exit", "wall-pack"]) {
    await page.evaluate("globalThis.__splitScene.sys.game.loop.wake()");
    await page.view.cdp("Runtime.callFunctionOn", { objectId: begin,
      functionDeclaration: "function(){this(144,false);return true}", returnByValue: true });
    // DevTools scope mirrors retain the old variable values. Re-read the scopes after begin replaces run.
    const currentFn = await properties(snapshot.result.objectId);
    const currentScopes = await properties(currentFn.internalProperties!.find(p => p.name === "[[Scopes]]")!.value!.objectId!);
    let live: string | undefined;
    for (const scope of currentScopes.result) if (scope.value?.objectId) {
      const variables = await properties(scope.value.objectId);
      live = variables.result.find(p => p.name === "run")?.value?.objectId;
      if (live) break;
    }
    if (!live) throw new Error("Live battle binding not found");
    await page.view.cdp("Runtime.callFunctionOn", { objectId: live,
      functionDeclaration: "function(){globalThis.__splitRun=this;return true}", returnByValue: true });
    await page.evaluate(`(async()=>{
      const {addBphProfile}=await import('/src/bph-combat.ts');
      const {createRun}=await import('/src/rules.ts');
      const {CENTER,WIDTH,fortRect}=await import('/src/geometry.ts');
      const run=globalThis.__splitRun;
      run.enemies=[];run.spawnBudget=run.xp=-1e9;
      run.nextElite=run.nextBoss=run.nextWave=run.nextRiverWave=1e9;
      run.bph.survival.cursor=run.bph.survival.nextDeparture=1e9;
      run.bph.supplyAt=1e9;
      const squad=run.squads[0];
      squad.clock=squad.skillClock=1e9;squad.state='down';squad.downUntil=1e9;
      squad.x=CENTER.x;squad.y=CENTER.y;
      addBphProfile(run,{profileId:'Hero1_Squire',copies:8,foil:false,discovered:false},{packId:'Pack1_Basic'});
      addBphProfile(run,{profileId:'Hero1_Barbarian',copies:8,foil:false,discovered:false},{packId:'Pack1_Basic'});
      const wall=fortRect(run.fort);
      squad.soldiers.forEach((unit,i)=>Object.assign(unit,{
        x:wall.right+26+i%2*22,y:CENTER.y-110+Math.floor(i/2)*22,
        emerging:false,clock:1e9,strikeAt:0
      }));
      if(${JSON.stringify(kind)}==='gate-exit')squad.soldiers.forEach(unit=>
        Object.assign(unit,{x:CENTER.x,y:CENTER.y,emerging:true}));
      if(${JSON.stringify(kind)}==='wall-pack')squad.soldiers.forEach((unit,i)=>
        Object.assign(unit,{x:wall.right+10+i%2*12,y:CENTER.y-70+Math.floor(i/2)*22,emerging:false}));
      if(${JSON.stringify(kind)}==='two-sides'){
        for(const [x,y] of [[28,CENTER.y],[WIDTH-28,CENTER.y-90],[WIDTH-28,CENTER.y],[WIDTH-28,CENTER.y+90]]){
          run.enemies.push({...createRun(144).enemies[0],id:run.nextId++,kind:'yari',x,y,
            goalX:x,goalY:y,hp:1e9,maxHp:1e9,speed:0,elite:false,boss:false,wave:false,
            clock:1e9,strikeAt:0,prey:null,stun:1e9,skillClock:1e9});
        }
      }
      globalThis.__splitStart=run.time;
      if(castleSample.snapshot().squads[0]!==run.squads[0])throw new Error('Capture bound a stale battle');
    })()`);
    for (let frame = 0; frame < 25; frame++) {
      await wait(`globalThis.__splitRun.time>=globalThis.__splitStart+${frame * .5}`);
      // Freeze only after the last real rendered frame, then read JSON from that exact frame.
      if (frame === 24) await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>{globalThis.__splitScene.sys.game.loop.sleep();resolve(true)}))");
      await page.shot(`${folder}/frames/${label}-${kind}-${String(frame).padStart(3, "0")}.png`);
    }
    const summary = await page.evaluate(`(()=>{
      const snapshot=castleSample.snapshot(),run=globalThis.__splitRun,units=run.squads[0].soldiers;
      return {kind:${JSON.stringify(kind)},time:run.time,field:snapshot.field,paused:snapshot.paused,
        sandbox:!!castleSample.sandbox,left:units.filter(u=>u.x<snapshot.field.width/2).length,
        right:units.filter(u=>u.x>=snapshot.field.width/2).length,
        assignedLeft:units.filter(u=>u.flank==='left').length,
        assignedRight:units.filter(u=>u.flank==='right').length,
        frame:${JSON.stringify(`frames/${label}-${kind}-024.png`)},
        units:units.map(u=>{
          const scene=globalThis.__splitScene,camera=scene.cameras.main;
          const troop=scene.troops.flatMap(t=>t.troopers).find(t=>t.unitId===u.id);
          const sprite=troop.sprite,box=sprite.getBounds(),canvas=scene.sys.game.canvas.getBoundingClientRect();
          const screen=p=>({x:canvas.x+(camera.x+(p.x-camera.scrollX)*camera.zoom)*canvas.width/snapshot.field.width,
            y:canvas.y+(camera.y+(p.y-camera.scrollY)*camera.zoom)*canvas.height/snapshot.field.height});
          return {id:u.id,x:u.x,y:u.y,flank:u.flank,quarry:u.quarry,
            rendered:{unitId:troop.unitId,visible:sprite.visible,alpha:sprite.alpha,x:sprite.x,y:sprite.y,
              screen:screen(sprite),bounds:{start:screen(box),end:screen({x:box.right,y:box.bottom})}}};
        })};
    })()`);
    summaries.push(summary);
    console.log("LIVE_CAPTURE", JSON.stringify(summary));
  }
  await page.evaluate("globalThis.__splitScene.sys.game.loop.wake()");
  await page.view.resize(1200, 844);
  await page.view.cdp("Emulation.setDeviceMetricsOverride", { width: 1200, height: 844, deviceScaleFactor: 1, mobile: false });
  await page.view.cdp("Runtime.callFunctionOn", { objectId: begin,
    functionDeclaration: "function(){this(144,false);return true}", returnByValue: true });
  await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  await page.shot(`${folder}/${label}-desktop-native.png`);
  await Bun.write(`${folder}/${label}-capture.json`, JSON.stringify({ summaries, errors: page.errors }, null, 2));
  if (page.errors.length) throw new Error(page.errors.join("\n"));
} catch (error) {
  await Bun.write(`${folder}/${label}-capture-failure.json`, JSON.stringify({ error: String(error), errors: page?.errors }, null, 2));
  console.error("CAPTURE_FAILED", JSON.stringify({ error: String(error), errors: page?.errors }));
  throw error;
} finally {
  page?.view.close();
  server.kill();
  await server.exited;
}
