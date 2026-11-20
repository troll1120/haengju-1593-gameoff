// Plays one run through the real phone UI (touch taps only, no state injection) and saves captures plus a log of every input.
// usage: bun scripts/review-play.ts <url> <outDir> [timed|mash|idle] [untilSeconds] [captureSecondsCsv] [metaFixture.json]
import { mkdir } from "node:fs/promises";
import { launch, sleep, passFirstBattleGuide } from "./review-browser";
import { ordinaryCard, POLICIES, skillReason } from "../src/bots";
import { cardText, covers, fielded, generalHandOpen, SOLDIERS, strength, upgradeCost } from "../src/rules";
import type { Run } from "../src/rules";
import { setFieldSize } from "../src/geometry";
import { buildings } from "../src/fortification";

const [url, out, policyName, until] = [process.argv[2], process.argv[3], (process.argv[4] ?? "timed") as keyof typeof POLICIES, Number(process.argv[5] ?? 1e9)];
if (!url || !out) throw new Error("usage: bun scripts/review-play.ts <url> <outDir> [policy] [untilSeconds] [captureSecondsCsv]");
const policy = POLICIES[policyName];
const marks = (process.argv[6] ?? "3,8,20,40,60,95,150,200,206,211,214,220,250,300,360,416,421,424,430,480,520,550,566").split(",").map(Number);
await mkdir(`${out}/frames`, { recursive: true });
const page = await launch(url, `${out}/chrome-profile`, 390, 844,
  ["--single-process", "--no-zygote", "--disable-gpu", "--disable-extensions", "--disable-breakpad"]);
const metaFixture = process.argv[7];
if (metaFixture) {
  const metadata: unknown = await Bun.file(metaFixture).json();
  await page.evaluate(`localStorage.setItem("haengju1593-meta", ${JSON.stringify(JSON.stringify(metadata))})`);
  await page.view.navigate(url);
}
type Snapshot = Run & { enemyUnits: Run["enemies"]; speed: number; field: { width: number; height: number }; feedback: Record<string, unknown> };
const read = async (): Promise<{ run: Run; feedback: Record<string, unknown>; speed: number } | null> => {
  const snap = await page.evaluate("window.castleSample.snapshot()") as Snapshot;
  return snap.phase as string === "ready" ? null : { run: { ...snap, enemies: snap.enemyUnits }, feedback: snap.feedback, speed: snap.speed };
};
const flashOpacity = () => page.evaluate(`(() => { const veil = document.getElementById("screen-flash"); return veil.hidden ? 0 : Number(getComputedStyle(veil).opacity); })()`) as Promise<number>;

await page.evaluate(`new Promise((resolve, reject) => {
  const deadline = performance.now() + 30000;
  const ready = () => {
    const state = window.castleSample?.snapshot();
    if (state?.field && !document.getElementById("app")?.classList.contains("loading")) resolve(true);
    else if (performance.now() > deadline) reject(new Error("The battlefield did not finish loading"));
    else requestAnimationFrame(ready);
  };
  ready();
})`);
await page.shot(`${out}/frames/000-intro.png`);
await page.evaluate("(() => { window.__frames = 0; const tick = () => { window.__frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 1; })()");
await page.tapElement("#start"); await sleep(200); await page.tapElement("#story"); await sleep(200);
if (!await page.tapElement('[data-start-general="권율"]')) throw new Error("Starting hero selection is not visible");
await passFirstBattleGuide(page);
for (let i = 0; i < 100 && await page.evaluate("window.castleSample.snapshot().attract"); i++) await sleep(50);
await sleep(250);
const field = (await page.evaluate("window.castleSample.snapshot().field") as Snapshot["field"]);
setFieldSize(field.width, field.height);
const toView = await page.fieldMapper(field.width, field.height);
const started = Date.now();
const samples: Record<string, unknown>[] = [], captures: { file: string; time: number; note: string; enemies: number }[] = [];
const inputs: { time: number; kind: "skill" | "card" | "general" | "upgrade"; what: string; why: string }[] = [];
const flashed = new Set<string>();
const reactionSeconds = .12;
const seen = new Set<string>();
let nextMark = 0, lastSample = -100, levelUps = 0, flashShots = 0, knownDowns = 0;
let last: Awaited<ReturnType<typeof read>> = null;
const stamp = (time: number) => String(Math.floor(time)).padStart(3, "0");
async function capture(run: Run, note: string): Promise<void> {
  const file = `frames/${stamp(run.time)}-${note}.png`;
  await page.shot(`${out}/${file}`); captures.push({ file, time: +run.time.toFixed(2), note, enemies: run.enemies.length });
}
const once = async (key: string, run: Run, note = key) => { if (!seen.has(key)) { seen.add(key); await capture(run, note); } };
for (let guard = 0; guard < 400000; guard++) {
  const state = await read();
  if (!state) { await sleep(60); continue; }
  const { run } = state; last = state;
  if (await page.evaluate("window.castleSample.snapshot().paused")) {
    await page.tapElement("#resume");
    continue;
  }
  if (run.time - lastSample >= 5) {
    lastSample = run.time;
    samples.push({ time: +run.time.toFixed(1), phase: run.phase, wall: Math.round(run.wall), maxWall: run.maxWall, fort: run.fort, kills: run.kills, enemies: run.enemies.length,
      level: run.level, squads: run.squads.map(s => ({ general: s.general, state: s.state, post: s.post, x: Math.round(s.x), y: Math.round(s.y), hp: Math.round(s.hp), maxHp: s.maxHp,
        soldiers: s.soldiers.length, strength: strength(s) })) });
  }
  if (run.phase === "won" || run.phase === "lost" || run.time >= until) {
    await sleep(700); await capture(run, `result-${run.phase}`); break;
  }
  if (run.phase === "choice") {
    if (!await page.rect("#cards .card")) { await sleep(60); continue; }
    levelUps++;
    if (levelUps === 1 || levelUps === 6 || levelUps === 12) { await sleep(1500); await capture(run, "level-up"); } else await sleep(1400);
    const card = ordinaryCard(run), text = cardText(run, card);
    inputs.push({ time: +run.time.toFixed(1), kind: "card", what: text.name, why: `${text.line} (보기: ${run.offers.map(offer => cardText(run, offer).name).join(", ")})` });
    await page.tapElement(`#cards .card[data-card="${card}"]`); await sleep(620); continue;
  }
  if (run.enemies.some(enemy => enemy.bossArt)) await once("boss-entrance", run);
  if (run.enemies.some(enemy => enemy.enraged)) await once("boss-phase2", run);
  if (generalHandOpen(run)) {
    await sleep(1100); await once("general", run);
    inputs.push({ time: +run.time.toFixed(1), kind: "general", what: run.generalOffers[0], why: `합류 장수 고르기 (보기: ${run.generalOffers.join(", ")})` });
    await page.tapElement(`#cards .card[data-general="${run.generalOffers[0]}"]`); await sleep(620); continue;
  }
  if (run.roulette) {
    const reward = run.roulette;
    if (reward.evolution && !flashed.has(reward.evolution)) {
      flashed.add(reward.evolution);
      await once("evolution-chest", run);
      for (const deadline = Date.now() + 1400; Date.now() < deadline;) {
        const opacity = await flashOpacity();
        if (opacity < .2) { await sleep(6); continue; }
        const file = `frames/${stamp(run.time)}-evolution-flash-${flashShots++}.png`;
        await page.shot(`${out}/${file}`);
        captures.push({ file, time: +run.time.toFixed(2), note: `evolution-flash opacity ${opacity.toFixed(2)}`, enemies: run.enemies.length });
        if (flashShots % 4 === 0) break;
      }
      await capture(run, "evolution-after");
      continue;
    }
    if (!reward.evolution) await once("reel", run);
  }
  if (policy.spend) for (const kind of SOLDIERS) {
    const cost = upgradeCost(run, kind);
    if (cost === null || run.gold < cost) continue;
    if (!await page.rect(`#drills button[data-kind="${kind}"]`)) await page.tap(toView(buildings().forge));
    if (!await page.tapElement(`#drills button[data-kind="${kind}"]`)) continue;
    inputs.push({ time: +run.time.toFixed(1), kind: "upgrade", what: kind, why: `골드 ${cost}` });
    await once("upgrade", run);
    await page.tap(toView({ x: 25, y: field.height / 2 }));
    break;
  }
  if (nextMark < marks.length && run.time >= marks[nextMark]) { await capture(run, "play"); nextMark++; }
  for (const squad of run.squads) {
    const why = skillReason(run, squad, policy, reactionSeconds * state.speed);
    if (!why) continue;
    inputs.push({ time: +run.time.toFixed(1), kind: "skill", what: squad.general, why });
    await page.tapElement(`#skills .skill[data-general="${squad.general}"]`);
    if (!seen.has(`skill-${squad.id}`)) { await sleep(110); await once(`skill-${squad.id}`, run, `skill-${["volley", "shield", "charge"][["권율", "김시민", "곽재우"].indexOf(squad.general)]}`); }
  }
  const threat = run.telegraphs.find(mark => run.squads.some(squad => fielded(squad) && covers(mark, squad)));
  if (threat && run.shieldUntil <= run.time && !seen.has(`warn-${threat.skill}`)) {
    await once(`warn-${threat.skill}`, run, `telegraph-${threat.skill}`);
    for (const deadline = Date.now() + 2500; Date.now() < deadline;) {
      const now = (await read())?.run;
      if (!now || now.phase !== "playing") break;
      if (!now.telegraphs.some(mark => mark.id === threat.id)) { await capture(now, `telegraph-${threat.skill}-landed`); break; }
      for (const squad of now.squads) {
        const why = skillReason(now, squad, policy, reactionSeconds * state.speed);
        if (why) { inputs.push({ time: +now.time.toFixed(1), kind: "skill", what: squad.general, why }); await page.tapElement(`#skills .skill[data-general="${squad.general}"]`); }
      }
      await sleep(8);
    }
    continue;
  }
  if (run.metrics.downs.length > knownDowns) { knownDowns = run.metrics.downs.length; await once("down", run, "general-down"); }
  if (run.squads.some(squad => squad.state === "retreat")) await once("retreat", run, "general-retreat");
  if (run.shieldUntil > run.time && run.telegraphs.length) await once("blocked", run, "shield-over-telegraph");
  const chief = run.enemies.find(enemy => enemy.kind === "ukita");
  if (chief) await once("chief", run, "final-boss");
  if (run.rout) { await once("rout", run); await sleep(140); await once("rout-wave", run); }
  await sleep(60);
}
const frames = await page.evaluate("window.__frames") as number, wallMs = Date.now() - started;
const final = last!, m = final.run.metrics;
const motion = Object.fromEntries(["steps", "foeSteps", "strikePoses", "strikeFrames", "topples"].map(key => [key, Number(final.feedback[key] ?? 0)]));
const still = Object.entries(motion).filter(([, count]) => count <= 0).map(([key]) => key);
const log = {
  stage: "4b-fable", url, policy: policyName, metaFixture: metaFixture ?? null, viewport: [390, 844], field, speed: final.speed, seed: final.run.seed, wallMs, framesPerSecond: +(frames / wallMs * 1000).toFixed(1),
  outcome: final.run.phase, seconds: +final.run.time.toFixed(2), kills: final.run.kills, killsPerMinute: +(final.run.kills / final.run.time * 60).toFixed(1), score: final.run.score,
  level: final.run.level, fort: final.run.fort, wall: Math.round(final.run.wall), maxWall: final.run.maxWall, minWallRatio: +m.minWallRatio.toFixed(3),
  weapons: { arrow: final.run.arrow, hwacha: final.run.hwacha, quiver: final.run.quiver, powder: final.run.powder, fire: final.run.fire, evolutions: final.run.evolutions },
  squads: final.run.squads.map(s => ({ general: s.general, awakened: s.awakened, downs: s.downs, soldiers: s.soldiers.map(u => `${u.kind}${u.tier}`), strength: strength(s) })),
  cards: m.cards, levelTimes: m.levelTimes.map(t => +t.toFixed(1)), generalTimes: m.generalTimes.map(t => +t.toFixed(1)), evolutionTimes: m.evolutionTimes.map(t => +t.toFixed(1)),
  finalBossDefeatedAt: m.finalDefeatedAt, waves: m.waves, waveWarnings: m.waveWarnings, assaultShifts: m.assaultShifts,
  quietSegmentsOverThreeSeconds: m.quietSegments, maxQuietSeconds: +m.maxQuietSeconds.toFixed(2), maxEventGap: +m.maxEventGap.toFixed(1),
  skills: m.skills, downs: m.downs.map(d => ({ time: +d.time.toFixed(1), general: final.run.squads[d.squad].general })), soldierDowns: m.soldierDowns,
  enemySkills: { cast: m.telegraphs, landed: m.landed, struckGeneral: m.generalsStruck, blocked: m.blockedCasts, interrupted: m.interrupts },
  taken: m.taken.map(Math.round), blocked: Math.round(m.blocked), redeploys: m.redeploys, retreats: m.retreats,
  merges: m.merges, chests: m.chests, chestBonuses: m.bonuses, minuteKills: m.minuteKills,
  damage: { squads: m.damage.squads.map(Math.round), weapon: Math.round(m.damage.weapon), skill: Math.round(m.damage.skill) },
  inputCounts: { skill: inputs.filter(i => i.kind === "skill").length, card: inputs.filter(i => i.kind === "card").length, general: inputs.filter(i => i.kind === "general").length, upgrade: inputs.filter(i => i.kind === "upgrade").length },
  motion, feedback: final.feedback, jsErrors: page.errors, bosses: m.bosses, bossDamage: m.bossDamage, lossCause: final.run.lossCause, base: final.run.base, walls: final.run.walls,
  density: m.density, events: m.eventLabels.map((label, i) => ({ time: +m.eventTimes[i].toFixed(1), label })),
  inputs, samples, captures,
};
await Bun.write(`${out}/play-log.json`, JSON.stringify(log, null, 1));
console.log(`REVIEW_DONE ${log.outcome} t=${log.seconds} kills=${log.kills} minWall=${log.minWallRatio} downs=${log.downs.length} inputs=${inputs.length} errors=${page.errors.length} fps=${log.framesPerSecond} wallMs=${wallMs} motion=${JSON.stringify(motion)}`);
page.view.close();
if (final.run.time >= 20 && still.length) { console.error(`MOTION_MISSING ${still.join(",")}: units were drawn without walking or striking`); process.exit(1); }
process.exit(0);
