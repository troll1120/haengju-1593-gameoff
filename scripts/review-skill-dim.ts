import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { chaosArena, chaosEnemy } from "../src/chaos-test-fixture";

const output = resolve(process.argv[2]), variant = process.argv[3];
await mkdir(output, { recursive: true });
const phone = await launch("http://127.0.0.1:19589/?unitSandbox=1", await mkdtemp(`${output}/profile-${variant}-`), 390, 844,
  ["--single-process", "--no-zygote", "--disable-gpu"]);
const ready = (condition: string) => phone.evaluate(`new Promise((resolve, reject) => {
  const deadline = performance.now() + 30000;
  function check() { if (${condition}) resolve(true); else if (performance.now() > deadline) reject(new Error("not ready: " + ${JSON.stringify(condition)})); else requestAnimationFrame(check); }
  check();
})`);
try {
  await ready("window.castleSample?.sandbox && !document.querySelector('#start').disabled");
  console.log("browser loaded");
  await phone.evaluate('window.castleSample.sandbox.start("곽재우")');
  await ready('window.castleSample.sandbox.run()?.squads[0]?.state === "guard"');
  console.log("battle loaded");
  const fixture = chaosArena("곽재우", 20);
  if (!fixture.bph?.survival) throw new Error("survival fixture missing");
  fixture.squads[0].awakened = 2; fixture.squads[0].tier = 3;
  for (const [x, y] of [[190, 260], [135, 285], [245, 280]]) {
    const enemy = chaosEnemy(fixture, x, y); enemy.hp = enemy.maxHp = 1e9;
  }
  await phone.evaluate(`(() => {
    const run = window.castleSample.sandbox.run();
    run.chaos = ${JSON.stringify(fixture.chaos)};
    run.enemies = ${JSON.stringify(fixture.enemies)};
    run.bph.survival.cursor = ${fixture.bph.survival.cursor};
    run.time = 100; run.commandClock = run.arrowClock = run.hwachaClock = 1e9;
    const squad = run.squads[0];
    squad.awakened = 2; squad.tier = 3; squad.skillClock = 0; squad.clock = 1e9;
    squad.x = squad.homeX = squad.targetX = 190; squad.y = squad.homeY = squad.targetY = 400;
    window.__dim = { ms: 0, last: 0, running: false };
    window.castleSample.sandbox.step(0);
    return { phase: run.phase, general: squad.general, level: run.chaos.level };
  })()`);
  console.log("fixture loaded");
  await ready('!document.querySelector(".skill").disabled');
  console.log("skill ready");
  const button = await phone.rect(".skill");
  if (!button) throw new Error("skill control missing");
  // The ready glow can be replaced by the next HUD frame; do not wait on its cancelled animation.
  await phone.tap({ x: button.x + button.w / 2, y: button.y + button.h / 2 });
  console.log("skill tapped");
  await ready('window.castleSample.sandbox.run().chaosSkills.events.some(e => e.trigger === "manual")');
  console.log("cast started");
  const plan = await phone.evaluate(`(() => {
    const run = window.castleSample.sandbox.run(), events = run.chaosSkills.events.filter(e => e.trigger === "manual");
    const result = { endMs: Math.max(...events.map(e => e.untilTick)) * 1000 / 30, count: events.length };
    window.__dim.running = true;
    function drive(now) {
      if (!window.__dim.running) return;
      if (window.__dim.last) {
        const dt = Math.min(100, now - window.__dim.last);
        window.__dim.ms += dt; window.castleSample.sandbox.step(dt / 1000);
      }
      window.__dim.last = now; requestAnimationFrame(drive);
    }
    requestAnimationFrame(drive);
    return result;
  })()`);
  const frames: unknown[] = [];
  for (const ms of [300, 800, 2000, 6000, 12600, 13400]) {
    await ready(`window.__dim.ms >= ${ms}`);
    const frame = await phone.evaluate(`(() => {
      const run = window.castleSample.sandbox.run();
      if (!run.chaosSkills) throw new Error(JSON.stringify({ phase: run.phase, time: run.time, commander: run.commander, keys: Object.keys(run) }));
      return { ms: window.__dim.ms, tick: run.chaosSkills.tick,
        active: run.chaosSkills.events.filter(e => e.trigger === "manual").length };
    })()`);
    await phone.shot(`${output}/${variant}-${String(ms).padStart(5, "0")}.png`);
    frames.push(frame);
  }
  await phone.evaluate("window.__dim.running = false");
  const messages = Object.fromEntries([...new Set(phone.errors)].map(message => [message, phone.errors.filter(item => item === message).length]));
  await Bun.write(`${output}/${variant}-frames.json`, JSON.stringify({ width: 390, height: 844, plan, frames, messages }, null, 2));
  const errors = phone.errors.filter(message => !message.startsWith("warning:"));
  if (errors.length) throw new Error([...new Set(errors)].join("\n"));
  console.log(`DIM_CAPTURE_DONE ${variant}`);
} catch (error) {
  console.error("capture failed", error, phone.errors);
  throw error;
} finally {
  phone.view.close();
}
