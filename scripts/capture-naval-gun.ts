// Phone captures of the panokseon deck cannon (owner DM 1794903782): a fixed sandbox scene stepped 1/30 s at a time, one page
// screenshot per step. Usage: bun scripts/capture-naval-gun.ts <dev-server-url> [out]. Needs the Vite dev server (unitSandbox is DEV only).
import { mkdir } from "node:fs/promises";
import { launch } from "./review-browser";
import { createRun, soldier } from "../src/rules";
import { CENTER, fortRect, setFieldSize } from "../src/geometry";
import { riverBank, riverLane } from "../src/river";

const [base = "http://127.0.0.1:19611", out = "review/naval-gun"] = Bun.argv.slice(2);
await mkdir(out, { recursive: true });
const phone = await launch("about:blank", `${out}/profile`, 390, 844, ["--disable-gpu", "--disable-frame-rate-limit"]);
const frame = () => phone.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))");
const ready = (condition: string) => phone.evaluate(`new Promise((resolve,reject)=>{const end=performance.now()+60000;
  (function check(){if(${condition})return resolve(true);if(performance.now()>end)return reject(new Error("State timeout"));requestAnimationFrame(check);})();})`);
try {
  await phone.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,firstBattleGuide:true}));
    let seed=42;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};` });
  await phone.view.navigate(`${base}/?unitSandbox=1`);
  await ready("window.castleSample && window.castleSample.sandbox && !document.querySelector('#start').disabled");
  await phone.tapElement("#start");
  await ready("document.querySelector('[data-bph-start]')");
  await phone.tapElement("[data-bph-start]");
  await ready("castleSample.sandbox.run() && castleSample.sandbox.run().phase==='playing' && !castleSample.snapshot().attract");
  if (await phone.evaluate("!!document.querySelector('#first-guide-skip')")) await phone.tapElement("#first-guide-skip");
  const field = await phone.evaluate("castleSample.snapshot().field") as { width: number; height: number };
  setFieldSize(field.width, field.height);
  const wall = fortRect(0), bank = riverBank(), lane = riverLane(), foe = createRun(9).enemies[0];
  const ship = { ...soldier("panokseon", 1, { x: CENTER.x - 56, y: lane }, 1), clock: 1e9, hp: 1e9, maxHp: 1e9 };
  const scenes = {
    land: [{ x: CENTER.x - 40, y: wall.bottom + 10 }, { x: CENTER.x + 34, y: wall.bottom + 28 }, { x: CENTER.x - 110, y: bank - 18 }]
      .map((at, i) => ({ ...foe, id: 9100 + i, ...at, speed: 0, clock: 1e9, skillClock: 1e9, hp: 1e9, maxHp: 1e9 })),
    transport: [
      { ...foe, id: 9200, kind: "ship", shipArt: "kobaya", direction: "아래", sailing: true, speed: 14, hp: 1e9, maxHp: 1e9,
        x: CENTER.x + 40, y: bank + 120, cargo: Array.from({ length: 5 }, (_, i) => ({ ...foe, id: 9300 + i })) },
      { ...foe, id: 9201, x: CENTER.x - 40, y: wall.bottom + 10, speed: 0, clock: 1e9, skillClock: 1e9, hp: 1e9, maxHp: 1e9 },
    ],
  };
  const log: Record<string, unknown[]> = {};
  for (const [name, enemies] of Object.entries(scenes)) {
    await phone.evaluate(`(()=>{const run=castleSample.sandbox.run(),q=run.squads[0];
      run.enemies=${JSON.stringify(enemies)};run.shots=[];run.xp=-1e9;run.spawnBudget=-1e9;
      run.nextElite=run.nextBoss=run.nextWave=run.nextRiverWave=1e9;q.clock=q.skillClock=1e9;q.hp=q.maxHp=1e9;
      q.soldiers=[{...${JSON.stringify(ship)},id:9000,gunAt:run.time+.2}];})()`);
    log[name] = [];
    for (let step = 0; step < 75; step++) {
      await phone.evaluate("castleSample.sandbox.step(1/30)");
      await frame();
      const state = await phone.evaluate(`(()=>{const run=castleSample.sandbox.run();return {time:run.time,
        shells:run.shots.filter(s=>s.kind==='shell').map(s=>({x:s.x,y:s.y,toX:s.toX,toY:s.toY,target:s.target})),
        ship:{x:run.squads[0].soldiers[0].x,y:run.squads[0].soldiers[0].y},enemies:run.enemies.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp}))};})()`);
      const landed = (log[name].at(-1) as { shells: unknown[] } | undefined)?.shells.length && !(state as { shells: unknown[] }).shells.length;
      log[name].push(state);
      if (landed) {
        // The burst plays in real time (about 125 ms), faster than a page screenshot, so the field canvas is read on each of the next frames.
        const frames = await phone.evaluate(`new Promise(resolve=>{const canvas=document.querySelector("#arena canvas"),shots=[];
          requestAnimationFrame(function grab(){shots.push(canvas.toDataURL("image/png"));if(shots.length<8)requestAnimationFrame(grab);else resolve(shots);});})`) as string[];
        for (const [index, image] of frames.entries())
          await Bun.write(`${out}/${name}-${String(step).padStart(2, "0")}-burst-${index}.png`, Buffer.from(image.split(",")[1], "base64"));
      }
      await phone.shot(`${out}/${name}-${String(step).padStart(2, "0")}.png`);
    }
  }
  await Bun.write(`${out}/log.json`, JSON.stringify({ field, wall, bank, lane, log, errors: phone.errors }, null, 1));
  if (phone.errors.length) throw new Error(phone.errors.join("\n"));
} finally {
  await phone.view.close?.();
}
