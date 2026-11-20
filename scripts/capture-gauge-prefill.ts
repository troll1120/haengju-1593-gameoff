import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { reviewBrowserSession } from "./review-browser";

const out = resolve(Bun.argv[2] ?? "evidence/gauge-prefill");
await mkdir(out, { recursive: true });
// Replay the exact pre-fix gate from 8e0da00 without needing .git in a copied capture job.
const current = await Bun.file("src/attack-preparation.ts").text();
const baseline = current.replace("if (!cycle.struck && strikeAt > 0 && !cycle.ready) return windup;",
  "if (!cycle.struck) return strikeAt > 0 ? windup : null;");
if (baseline === current) throw new Error("Prefill condition not found");
const browser = reviewBrowserSession();
const observations: unknown[] = [];
try {
  for (const phase of ["before", "after"] as const) {
    const server = await createServer({
      server: { host: "127.0.0.1", port: 0 },
      plugins: phase === "before" ? [{
        name: "baseline-attack-gauge",
        enforce: "pre",
        load(id) { if (id.endsWith("/src/attack-preparation.ts")) return baseline; },
      }] : [],
    });
    try {
      await server.listen();
      const address = server.httpServer!.address();
      if (!address || typeof address === "string") throw new Error("No preview address");
      for (const [width, height] of [[390, 844]]) {
        const page = await browser.open(width, height);
        await page.view.navigate(`http://127.0.0.1:${address.port}/?unitSandbox=1`);
        await page.evaluate(`new Promise((resolve,reject)=>{
          const end=performance.now()+30000;function frame(){
            if(window.castleSample?.sandbox&&!document.querySelector("#start").disabled)return resolve(true);
            if(performance.now()>end)return reject(new Error("Sandbox did not load"));
            requestAnimationFrame(frame);
          }frame();
        })`);
        const observation = await page.evaluate(`(async()=>{
          const sandbox=castleSample.sandbox;sandbox.start("권율");
          const run=sandbox.run();run.enemies=[];run.riftClock=1e9;
          if(run.bph?.survival)run.bph.survival.cursor=Number.MAX_SAFE_INTEGER;
          run.squads[0].clock=1.2;run.squads[0].strikeAt=0;
          sandbox.step(5);
          // The display hides the leader's bar during its 1100 ms entrance, independently of simulation time.
          await new Promise(resolve=>setTimeout(resolve,1500));
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const {attackCycle,attackShare}=await import("/src/attack-preparation.ts");
          const share=attackShare(attackCycle(),run.squads[0].clock,0,run.time,220);
          return {phase:${JSON.stringify(phase)},time:run.time,enemies:run.enemies.length,
            clock:run.squads[0].clock,strikeAt:run.squads[0].strikeAt,share,
            viewport:[innerWidth,innerHeight]};
        })()`);
        await page.shot(`${out}/${phase}-${width}x${height}.png`);
        observations.push({ observation, errors: [...page.errors] });
        if (page.errors.length) throw new Error(page.errors.join("\n"));
        await browser.reset();
      }
    } finally { await server.close(); }
  }
  await Bun.write(`${out}/observations.json`, JSON.stringify(observations, null, 2));
} finally { await browser.close(); }
console.log("CAPTURE_ALL exit=0");
