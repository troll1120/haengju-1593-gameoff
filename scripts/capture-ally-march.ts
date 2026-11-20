import { mkdir } from "node:fs/promises";
import { launch, passFirstBattleGuide } from "./review-browser";

const [folder = "evidence"] = Bun.argv.slice(2);
const labels = Bun.argv.slice(3);
await mkdir(`${folder}/frames`, { recursive: true });
const server = Bun.spawn(["bun", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "19791", "--strictPort"],
  { env: process.env, stdin: "ignore", stdout: "pipe", stderr: "inherit" });
let page: Awaited<ReturnType<typeof launch>> | undefined;
try {
  const reader = server.stdout.getReader();
  let ready = "";
  while (!ready.includes("19791")) {
    const part = await reader.read();
    if (part.done) throw new Error("Vite stopped before readiness");
    ready += new TextDecoder().decode(part.value);
  }
  page = await launch("about:blank", `${folder}/browser-profile`, 1000, 1000, ["--single-process", "--no-zygote", "--disable-gpu"]);
  await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source:
    'localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,firstBattleGuide:true}));' });
  await page.view.navigate("http://127.0.0.1:19791/?unitSandbox=1");
  const wait = (condition: string) => page!.evaluate(`new Promise((resolve,reject)=>{
    const deadline=performance.now()+60000;function frame(){if(${condition})return resolve(true);
    if(performance.now()>deadline)return reject(new Error("Startup timeout"));requestAnimationFrame(frame)}frame()})`);
  await wait("window.castleSample?.sandbox && !document.querySelector('#start').disabled");
  await page.tapElement("#start");
  await wait("document.querySelector('[data-bph-start]')");
  await page.tapElement("[data-bph-start]");
  await wait("castleSample.sandbox.run()?.phase==='playing' && !castleSample.snapshot().attract");
  await passFirstBattleGuide(page);
  await wait("!castleSample.snapshot().paused");
  // Use the game's real sandbox and sprite renderer. Only deterministic simulation positions are replayed.
  await page.evaluate(`(async()=>{
    const arena=document.querySelector('#arena');arena.style.width='780px';arena.style.height='844px';
    document.querySelector('#title').hidden=true;
    document.querySelector('#overlay').hidden=true;
    document.querySelector('#first-battle-guide')?.close();
  })()`);
  // Read only the named game binding, not every object in the module or global scope.
  type Property = { name: string; value?: { objectId?: string } };
  const properties = (objectId: string) => page!.view.cdp("Runtime.getProperties", { objectId, ownProperties: true }) as Promise<{
    result: Property[]; internalProperties?: Property[];
  }>;
  const snapshot = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" }) as { result: { objectId: string } };
  const fn = await properties(snapshot.result.objectId);
  const scopes = await properties(fn.internalProperties!.find(p => p.name === "[[Scopes]]")!.value!.objectId!);
  let bound = false;
  for (const scope of scopes.result) if (scope.value?.objectId) {
    const variables = await properties(scope.value.objectId);
    const setter = variables.result.find(p => p.name === "setFieldSize" && p.value?.objectId);
    if (setter) await page.view.cdp("Runtime.callFunctionOn", { objectId: setter.value!.objectId,
      functionDeclaration: "function(){this(780,844);return true}" });
    const game = variables.result.find(p => (p.name === "game" || p.name === "arenaScene") && p.value?.objectId);
    if (!game) continue;
    const binding = await page.view.cdp("Runtime.callFunctionOn", { objectId: game.value!.objectId, returnByValue: true,
      functionDeclaration: `function(){globalThis.__marchGame=this.sys?.game??this;
        __marchGame.scale.setGameSize(780,844);return true}` });
    console.log("GAME_BINDING", JSON.stringify(binding));
    bound = true; break;
  }
  if (!bound) throw new Error("Game module binding not found");
  await page.evaluate('(()=>{if (!globalThis.__marchGame) throw new Error("Game binding failed"); return true})()');
  const field = await page.evaluate("castleSample.snapshot().field");
  console.log("FIELD", JSON.stringify(field));
  if ((field as { width: number; height: number }).width !== 780 || (field as { height: number }).height !== 844)
    throw new Error("Replay field size does not match the measured simulation");
  console.log("GAME_READY");
  for (const label of labels.length ? labels : ["before", "after"]) for (const kind of ["far", "crowd", "idle"]) {
    const data = await Bun.file(`${folder}/${label}-${kind}.json`).json();
    await page.evaluate(`(()=>{
      const run=castleSample.sandbox.run();Object.assign(run,${JSON.stringify(data.initial)});
      run.shieldUntil=0; // The stunned fixture foe cannot attack; omit the test's artificial invulnerability glow.
      const scene=__marchGame.scene.getScene('castle');scene.positions=new Map();scene.reset();
      document.querySelector('#march-label')?.remove();
      const label=document.createElement('div');label.id='march-label';
      label.style='position:fixed;left:20px;top:15px;background:#111;color:white;padding:12px;z-index:9999;font:18px sans-serif';
      label.textContent=${JSON.stringify(`${label === "before" ? "수정 전" : "수정 후"} · ${kind} · 실제 게임 렌더러 / 시드 144`)};document.body.append(label);
    })()`);
    // Sample a six-second continuous segment; crowd/idle start after their initial deployment.
    const start = kind === "far" ? 0 : 30;
    for (let frame = 0; frame < 60; frame++) {
      const state = data.frames[start + frame];
      await page.evaluate(`(()=>{
        const run=castleSample.sandbox.run();run.time=${state.time};
        const states=${JSON.stringify(state.soldiers)};
        run.squads[0].soldiers.forEach(u=>Object.assign(u,states.find(s=>s.id===u.id)));
        __marchGame.scene.getScene('castle').update(0,16);
      })()`);
      await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      if (frame === 0) console.log("REPLAY", JSON.stringify(await page.evaluate(`(()=>{
        const scene=__marchGame.scene.getScene('castle'),run=castleSample.sandbox.run();
        return {time:run.time,units:run.squads[0].soldiers.length,rendered:scene.troops[0]?.troopers.length,paused:castleSample.snapshot().paused};
      })()`)));
      await page.shot(`${folder}/frames/${label}-${kind}-${String(frame).padStart(3, "0")}.png`);
    }
    console.log(`CAPTURE ${label}-${kind} frames=60`);
  }
  await Bun.write(`${folder}/capture-errors.json`, JSON.stringify(page.errors, null, 2));
  if (page.errors.length) throw new Error(page.errors.join("\n"));
} finally {
  page?.view.close();
  server.kill();
  await server.exited;
}
