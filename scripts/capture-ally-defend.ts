import { mkdir } from "node:fs/promises";
import { launch, passFirstBattleGuide } from "./review-browser";

const [folder, beforePath, afterPath] = Bun.argv.slice(2);
await mkdir(folder, { recursive: true });
const server = Bun.spawn(["bun", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "19793", "--strictPort"],
  { env: process.env, stdin: "ignore", stdout: "pipe", stderr: "inherit" });
let page: Awaited<ReturnType<typeof launch>> | undefined;
try {
  const reader = server.stdout.getReader();
  let ready = "";
  while (!ready.includes("19793")) {
    const part = await reader.read();
    if (part.done) throw new Error("Vite stopped before readiness");
    ready += new TextDecoder().decode(part.value);
  }
  page = await launch("about:blank", `${folder}/browser-profile`, 390, 844);
  await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source:
    'localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,firstBattleGuide:true}));' });
  await page.view.navigate("http://127.0.0.1:19793/?unitSandbox=1");
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
  await page.evaluate(`(()=>{
    const arena=document.querySelector('#arena');
    arena.style='position:fixed;left:0;top:0;width:390px;height:844px;z-index:9998';
    document.querySelector('#title').hidden=true;document.querySelector('#overlay').hidden=true;
    document.querySelector('#first-battle-guide')?.close();
  })()`);
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
      functionDeclaration: "function(){this(390,844);return true}" });
    const game = variables.result.find(p => (p.name === "game" || p.name === "arenaScene") && p.value?.objectId);
    if (!game) continue;
    await page.view.cdp("Runtime.callFunctionOn", { objectId: game.value!.objectId,
      functionDeclaration: "function(){globalThis.__defendGame=this.sys?.game??this;__defendGame.scale.setGameSize(390,844);return true}" });
    bound = true; break;
  }
  if (!bound) throw new Error("Game module binding not found");
  const before = await Bun.file(beforePath).json(), after = await Bun.file(afterPath).json();
  for (const [name, title, state] of [
    ["initial", "남문 공격 시작 · 북쪽 교전 중", after.initial],
    ["before", "수정 전 · 남문 공격 18초 후", before.frames.at(-1)],
    ["after", "수정 후 · 남문 지원군 도착", after.frames.at(-1)],
  ] as const) {
    await page.evaluate(`(()=>{
      const run=castleSample.sandbox.run();Object.assign(run,${JSON.stringify(state)});
      run.shieldUntil=0;
      const scene=__defendGame.scene.getScene('castle');scene.positions=new Map();scene.reset();scene.update(0,16);
      document.querySelector('#defend-label')?.remove();
      const label=document.createElement('div');label.id='defend-label';
      label.style='position:fixed;left:8px;top:8px;background:#111e;color:white;padding:8px;z-index:99999;font:14px sans-serif';
      label.textContent=${JSON.stringify(title)};document.body.append(label);
    })()`);
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await page.shot(`${folder}/${name}.png`);
  }
  if (page.errors.length) throw new Error(page.errors.join("\n"));
  await page.view.resize(780, 844);
  await page.view.cdp("Emulation.setDeviceMetricsOverride", { width: 780, height: 844, deviceScaleFactor: 1, mobile: true });
  const images = await Promise.all(["before", "after"].map(async label =>
    `data:image/png;base64,${Buffer.from(await Bun.file(`${folder}/${label}.png`).arrayBuffer()).toString("base64")}`));
  await page.evaluate(`(async()=>{
    document.body.innerHTML='';document.body.style='margin:0;width:780px;height:844px;display:flex;background:#111';
    for(const source of ${JSON.stringify(images)}){const image=new Image();image.src=source;image.style='width:390px;height:844px';
      document.body.append(image);await image.decode();}
  })()`);
  await page.shot(`${folder}/comparison.png`);
  console.log("CAPTURE_ALL images=4 width=390 comparison=780 errors=0");
} finally {
  page?.view.close();
  server.kill();
  await server.exited;
}
