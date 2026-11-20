// Records one survival commander casting his skill through the real phone UI. The page runs on a frame-stepped clock, so captured
// simulation steps stay one sixtieth of a second apart; normal captures may sample every step or every second step.
// The same seed, commander and taps replay the same battle regardless of the capture sampling rate.
// Usage: bun scripts/review-skill.ts <general> <label> <out dir> <dist dir | http url> [cast second] [normal|quick|reduced|echo|scout|fx] [caption] [frames] [army level] [capture fps: 30|60]
//        bun scripts/review-skill.ts compare <before-state.json> <after-state.json>
// Every run keeps playing to eight seconds after the cast and records the judgement there ("end"); compare checks that two builds
// agree on it to the tick. Only echo injects state: it awakens the general just before the tap so a second cast can be seen in a fresh run.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { BPH_GENERALS } from "../src/bph-commanders";
import { freshBphSave } from "../src/bph-save";
import { freshMeta } from "../src/meta";
import { BPH_ARMY_TRAINING } from "../src/bph-army-training";
import { activeBphEffects, buyBphNode, prepareBphUpgrades } from "../src/bph-upgrades";
import { skillUpgradeCount } from "../src/skill-growth";
import { launch } from "./review-browser";
import { captionPainter, type CaptionPicture } from "./review-caption";
import { previewResponse } from "./serve";

if (Bun.argv[2] === "compare") {
  const [before, after] = await Promise.all(Bun.argv.slice(3, 5).map(path => Bun.file(path).json() as Promise<{ before: Record<string, unknown>; end: Record<string, unknown> }>));
  const judged = (state: { before: Record<string, unknown>; end: Record<string, unknown> }) => JSON.stringify({
    cast: { ...state.before, frame: undefined }, end: { ...state.end, frame: undefined } });
  if (judged(before) !== judged(after)) {
    console.error(`SKILL_INVARIANCE_FAIL\nbefore ${judged(before)}\nafter  ${judged(after)}`);
    process.exit(1);
  }
  console.log(`SKILL_INVARIANCE_OK time=${String(after.end["time"])} rng=${String(after.end["rng"])} kills=${String(after.end["kills"])} gold=${String(after.end["gold"])} enemies=${String(after.end["enemies"])}`);
  process.exit(0);
}
const root = `${import.meta.dir}/..`;
const [general = "권율", label = "after", out = `${root}/review/skill-show`, source = `${root}/review-dist`, castSecond = "9", mode = "normal", caption = "", frameCount = "180", armyLevel = "0", captureFps = "60"] = Bun.argv.slice(2);
const commander = BPH_GENERALS.findIndex(name => name === general);
const chosenGeneral = BPH_GENERALS.find(name => name === general);
if (!chosenGeneral) throw new Error(`Not a survival commander: ${general}`);
const FRAMES = Number(frameCount), CAST_FRAME = 30, SEED = 7, AFTER_SECONDS = 8;
/** PREVIEW ONLY (owner choice clip): CASTLE_PV=spin|rockets appends ?pv=… so one committed build can stage both sides. */
const PV = process.env.CASTLE_PV ? `&pv=${process.env.CASTLE_PV}` : "";
const CAPTURE_FPS = Number(captureFps);
if (CAPTURE_FPS !== 30 && CAPTURE_FPS !== 60) throw new TypeError(`Unsupported capture fps: ${captureFps}`);
const FRAME_STRIDE = mode === "normal" ? 60 / CAPTURE_FPS : 1;
const LEVEL = Number(armyLevel);
if (!Number.isInteger(LEVEL) || LEVEL < 0 || LEVEL > 20) throw new Error(`Invalid army level: ${armyLevel}`);
// The same normal purchased training placements seed both builds; no live battle state is injected.
const save = freshBphSave();
save.unlockedGenerals = [...BPH_GENERALS];
await prepareBphUpgrades();
if (LEVEL > 0) {
  save.resources.mastery = 2901;
  for (const id of ["_SkillTreeMain_Demo:23:15", ...BPH_ARMY_TRAINING.slice(0, LEVEL).map(p => p.id)])
    if (!buyBphNode(save, id)) throw new Error(`Training purchase failed: ${id}`);
}
const fixtureLevel = skillUpgradeCount(chosenGeneral, activeBphEffects(save));
if (fixtureLevel !== LEVEL) throw new Error(`Fixture army level is ${fixtureLevel}, not ${LEVEL}`);
const FIXTURE = JSON.stringify({ ...freshMeta(), version: 4, bph: save });
// Installed before any page script: animation frames, timers, performance.now and running CSS/Web animations advance only when stepped.
const CLOCK = `(() => {
  const realTimeout = window.setTimeout.bind(window);
  let now = 0, frame = 0, serial = 1;
  const frames = new Map(), timers = new Map(), stepped = new WeakSet();
  const report = error => console.error(error && error.stack || String(error));
  performance.now = () => now;
  const epoch = Date.now(); Date.now = () => epoch + Math.round(now);
  window.requestAnimationFrame = callback => { frames.set(serial, callback); return serial++; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  const schedule = repeats => (callback, delay, ...args) => {
    const wait = Math.max(repeats ? 1 : 0, Number(delay) || 0);
    timers.set(serial, { at: now + wait, every: repeats ? wait : 0, callback, args }); return serial++;
  };
  window.setTimeout = schedule(false); window.setInterval = schedule(true);
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  function step(count = 1) {
    for (let turn = 0; turn < count; turn++) {
      now += 1000 / 60; frame++;
      for (const [id, timer] of [...timers]) {
        if (timer.at > now || !timers.has(id)) continue;
        if (timer.every) timer.at += timer.every; else timers.delete(id);
        try { if (typeof timer.callback === "function") timer.callback(...timer.args); } catch (error) { report(error); }
      }
      const due = [...frames.values()]; frames.clear();
      for (const callback of due) try { callback(now); } catch (error) { report(error); }
      for (const animation of document.getAnimations()) {
        if (animation.playState === "finished" || animation.playState === "idle") continue;
        if (!stepped.has(animation)) { stepped.add(animation); animation.pause(); animation.currentTime = 0; continue; }
        const end = animation.effect ? animation.effect.getComputedTiming().endTime : 0, next = Number(animation.currentTime || 0) + 1000 / 60;
        if (Number.isFinite(end) && next >= end) animation.finish(); else animation.currentTime = next;
      }
    }
    return frame;
  }
  const channel = new MessageChannel(); let wake = null;
  channel.port1.onmessage = () => { const resume = wake; wake = null; if (resume) resume(); };
  const breathe = pause => new Promise(resolve => { if (pause) realTimeout(resolve, pause); else { wake = resolve; channel.port2.postMessage(0); } });
  async function until(test, limit = 3600, pause = 0) {
    for (let used = 0; used <= limit; used++) { if (test()) return used; step(); await breathe(pause); }
    throw new Error("Clock limit reached: " + test);
  }
  window.__clock = { step, until, frame: () => frame };
})()`;
const STATE = `(() => {
  const s = castleSample.snapshot(), q = s.squads[0], near = e => s.enemyUnits.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < 80).length;
  const c = s.chaos, point = p => [Math.round(p.x * 100), Math.round(p.y * 100)];
  const entities = rows => ({ count: rows.length, positions: rows });
  return { frame: __clock.frame(), time: s.time, phase: s.phase, level: s.level, rng: s.rng, kills: s.kills, gold: s.gold, wall: s.wall, base: s.base,
    chaos: c ? { level: c.level, tick: c.tick,
      pools: entities(c.pools.map(p => [p.id, ...point(p)])),
      rings: entities(c.rings.map(p => [p.id, ...point(p)])),
      trails: entities(c.trails.map(p => [p.id, ...point(p.from), ...point(p.to)])),
      militia: entities(c.militia.map(p => [p.id, ...point(p), Math.round(p.aimX * 100), Math.round(p.aimY * 100)])),
      fleet: entities(c.fleet.map(p => [p.id, Math.round(p.lane * 100), p.dueTick, p.untilTick, p.resolved])),
      stomps: entities(c.stomps.map(p => [...point(p.at), p.dueTick])) } : null,
    skills: s.chaosSkills ? { tick: s.chaosSkills.tick,
      events: s.chaosSkills.events.filter(e => e.startedTick <= s.chaosSkills.tick && s.chaosSkills.tick < e.untilTick)
        .map(e => ({ id: e.id, kind: e.kind, wave: e.wave, ordinal: e.ordinal, from: point(e.from), to: point(e.to),
          at: point(e), radius: e.currentRadius, startedTick: e.startedTick, impactTick: e.impactTick,
          untilTick: e.untilTick, resolved: e.resolved })) } : null,
    general: q.general, skillClock: q.skillClock, enemies: s.enemyUnits.length, cluster: Math.max(0, ...s.enemyUnits.map(near)),
    foes: s.enemyUnits.map(e => [e.id, e.kind, Math.round(e.x * 100), Math.round(e.y * 100), Math.round(e.hp * 100)]),
    squads: s.squads.map(u => [u.general, Math.round(u.x * 100), Math.round(u.y * 100), Math.round(u.hp * 100)]) };
})()`;

await mkdir(out, { recursive: true });
const profile = await mkdtemp(`${out}/profile-`);
const server = source.startsWith("http") ? undefined : Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, source) });
const base = server ? `http://127.0.0.1:${server.port}` : source;
const page = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
const until = (test: string, limit = 3600, pause = 0) => page.evaluate(`__clock.until(() => ${test}, ${limit}, ${pause})`);
const state = () => page.evaluate(STATE) as Promise<Record<string, unknown>>;
async function press(selector: string): Promise<void> {
  await until(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false;
    const box = node.getBoundingClientRect(); if (!box.width || !box.height) return false;
    for (let at = node; at; at = at.parentElement)
      if (at.getAnimations().some(a => a.playState !== "finished" && a.effect && a.effect.getComputedTiming().endTime !== Infinity)) return false;
    return true; })()`, 3600, 2);
  const box = await page.rect(selector);
  if (!box) throw new Error(`Cannot press ${selector}`);
  await page.tap({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
}
try {
  await page.view.cdp("Page.enable");
  await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK });
  if (mode === "reduced") await page.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const target = new URL(base);
  target.searchParams.set("seed", String(SEED));
  if (PV) target.searchParams.set("pv", PV.slice(4));
  await page.view.navigate(target.href);
  await until("Boolean(window.castleSample)", 36000, 5);
  await page.evaluate(`(() => { localStorage.setItem("haengju1593-lang", "ko"); localStorage.setItem("haengju1593-meta", ${JSON.stringify(FIXTURE)}); return true; })()`);
  await page.view.navigate(target.href);
  await until("window.castleSample && !document.querySelector('#start').disabled", 36000, 5);
  await press("#start");
  await press(`.bph-commanders button:nth-child(${commander + 1})`);
  await press("[data-bph-start]");
  await until("document.querySelector('#first-battle-guide[open]') || (!castleSample.snapshot().attract && castleSample.snapshot().time > 0)", 3600, 2);
  if (await page.evaluate("Boolean(document.querySelector('#first-battle-guide[open]'))")) await press("#first-guide-skip");
  await until("(() => { const s = castleSample.snapshot(); return !s.attract && !s.paused && s.phase === 'playing' && s.time > 0; })()", 3600, 2);
  const fielded = await page.evaluate("castleSample.snapshot().squads[0].general");
  if (fielded !== general) throw new Error(`Fielded ${String(fielded)} instead of ${general}`);
  const actualLevel = await page.evaluate("castleSample.snapshot().chaos?.level ?? 0");
  const hasChaos = await page.evaluate("Boolean(castleSample.snapshot().chaos)");
  if (mode === "fx") {
    if (!hasChaos || actualLevel !== 1 || LEVEL !== 0) throw new Error(`Expected untrained survival at Lv1, got ${String(actualLevel)}`);
  } else if (actualLevel !== LEVEL || (LEVEL === 0 && hasChaos)) throw new Error(`Army level is ${String(actualLevel)}, not ${LEVEL}`);
  if (mode === "fx") {
    await until(`castleSample.snapshot().time >= ${Number(castSecond)} || castleSample.snapshot().phase !== "playing"`, 7200);
    const before = await state();
    if (before["phase"] !== "playing" || before["general"] !== general || Number(before["skillClock"]) > 0) {
      throw new Error(`Skill is not ready: ${JSON.stringify(before)}`);
    }
    const probe = () => page.evaluate(`(() => {
      const s = castleSample.snapshot();
      return { casts: s.metrics.skills[0], bursts: s.feedback.skillBursts, rings: s.feedback.rings,
        active: s.chaosSkills?.events.filter(e => e.trigger === "manual" && e.general === s.squads[0].general
          && e.startedTick <= s.chaosSkills.tick && s.chaosSkills.tick < e.untilTick).length ?? 0,
        hitsPerShell: s.chaosSkills?.events.filter(e => e.trigger === "manual" && e.general === s.squads[0].general && e.resolved)
          .map(e => e.hits?.length ?? 0) ?? [] };
    })()`) as Promise<{ casts: number; bursts: number; rings: number; active: number; hitsPerShell: number[] }>;
    const baseline = await probe();
    await page.shot(`${out}/${label}-before.png`);
    await press(`#skills .skill[data-general="${general}"]`);
    let previous = 0;
    const frames = [];
    for (const frame of [4, 9, 18, 30, 45, 60, 84]) {
      await page.evaluate(`__clock.step(${frame - previous})`);
      previous = frame;
      const observed = await probe();
      if (observed.casts !== baseline.casts + 1 || observed.bursts <= baseline.bursts) {
        throw new Error(`No full skill reached the scene: ${JSON.stringify({ general, baseline, observed })}`);
      }
      const file = `${label}-${String(frame).padStart(3, "0")}.png`;
      await page.shot(`${out}/${file}`);
      frames.push({ file, frameAfterTap: frame, ...observed, state: await state() });
    }
    await Bun.write(`${out}/${label}-state.json`, JSON.stringify({ general, url: target.href, viewport: [390, 844],
      fixtureLevel: LEVEL, baseline, before, frames, errors: page.errors }, null, 2) + "\n");
  } else if (mode === "scout") {
    const rows: Record<string, unknown>[] = [];
    for (let second = 1; second <= Number(castSecond); second++) {
      await until(`castleSample.snapshot().time >= ${second} || castleSample.snapshot().phase !== "playing"`, 1200);
      const row = await state();
      rows.push({ ...row, foes: undefined, squads: undefined });
      console.log(JSON.stringify(rows.at(-1)));
      if (second % 5 === 0 || row["phase"] !== "playing") await page.shot(`${out}/scout-${String(second).padStart(3, "0")}.png`);
      if (row["phase"] !== "playing") break;
    }
    await Bun.write(`${out}/scout.json`, JSON.stringify({ rows, errors: page.errors }, null, 2));
  } else {
    await until(`castleSample.snapshot().time >= ${Number(castSecond) - CAST_FRAME / 60} || castleSample.snapshot().phase !== "playing"`, 7200);
    let before: Record<string, unknown> | undefined;
    const timeline: Record<string, unknown>[] = [];
    const quick = mode === "quick" || mode === "reduced" || mode === "echo", planned = Number(castSecond);
    for (let frame = 0; frame < (quick ? CAST_FRAME + 66 : FRAMES); frame++) {
      // The tap waits for the game's own clock to reach the planned second, not for a frame count, so every build casts on one tick.
      if (!before && await page.evaluate(`castleSample.snapshot().time >= ${planned} - 1e-6`)) {
        before = await state();
        if (Math.abs(Number(before["time"]) - planned) > 1e-6) throw new Error(`Cast tick missed: the run is at ${before["time"]} s, not the planned ${planned} s`);
        if (before["phase"] !== "playing" || before["general"] !== general || Number(before["skillClock"]) > 0) throw new Error(`Skill is not ready: ${JSON.stringify({ ...before, foes: undefined })}`);
        if (mode === "echo") await page.evaluate("castleSample.snapshot().squads[0].awakened = 1");
        await press(`#skills .skill[data-general="${general}"]`);
        if (!await page.evaluate("castleSample.snapshot().squads[0].skillClock > 0")) throw new Error("The tap did not cast the skill");
      }
      await page.evaluate(`__clock.step(${FRAME_STRIDE})`);
      if (frame % (CAPTURE_FPS / 2) === 0) {
        const observed = await state();
        timeline.push({ ...observed, foes: undefined, squads: undefined });
      }
      if (!quick || frame >= CAST_FRAME - 2) await page.shot(`${out}/${label}-${String(frame).padStart(3, "0")}.png`);
    }
    if (!before) throw new Error(`The run never reached the planned cast second ${planned}`);
    const after = await state(), castAt = Number(before["time"]);
    await until(`castleSample.snapshot().time >= ${castAt + AFTER_SECONDS} || castleSample.snapshot().phase !== "playing"`, 7200);
    await Bun.write(`${out}/${label}-state.json`, JSON.stringify({
      general, captureFps: 60 / FRAME_STRIDE, before, after, end: await state(), timeline, errors: page.errors,
    }, null, 2));
  }
  if (caption) {
    const picture = await page.evaluate(captionPainter(caption)) as CaptionPicture | undefined;
    if (typeof picture?.png !== "string") throw new Error("Missing caption picture");
    await Bun.write(`${out}/${label}-caption.png`, Buffer.from(picture.png, "base64"));
  }
  const failures = page.errors.filter(line => line.startsWith("exception"));
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`SKILL_CAPTURE_OK general=${general} label=${label} mode=${mode} out=${out}`);
} finally {
  page.view.close(); server?.stop(true); await rm(profile, { recursive: true, force: true });
}
