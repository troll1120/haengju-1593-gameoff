// Measures where allied ground soldiers stand around the castle in the real survival loop.
// Run the same file in two checkouts to compare: bun scripts/ally-idle-ring-bench.ts OUTPUT.json [SECONDS]
import { strict as assert } from "node:assert";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { createBphRun } from "../src/bph-session";
import { projectBphSalary } from "../src/bph-account";
import { activeBphEffects } from "../src/bph-upgrades";
import { hitBphPack } from "../src/bph-combat";
import { buyBphRecruit } from "../src/bph-recruit";
import { restockBphRecruit } from "../src/bph-supply";
import { prepareBphFieldShop } from "../src/bph-shop-session";
import { bphConsumers, bphFxContext, bindBphConsumers, dispatchBphEffects, updateBphPointer } from "../src/bph-fx-dispatch";
import { advance, choose, chooseGeneral, contactReach, hitBphEnemy, useSkill } from "../src/rules";
import { ordinaryCard } from "../src/bots";
import { CENTER, contains, fortRect, setFieldSize, sideOf, SIDES } from "../src/geometry";
import type { Point, Rect } from "../src/geometry";
import { survivalFixture } from "./survival-fixtures";

/** Neighbours in one file: at most this far apart along the wall and this far off the file's line. */
const FILE = { along: 30, across: 8 } as const;
const [outputArgument, secondsArgument] = Bun.argv.slice(2);
assert(outputArgument, "usage: ally-idle-ring-bench.ts OUTPUT.json [SECONDS]");
const seconds = Number(secondsArgument ?? 180);
const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const marks = [60, 180];

/** The most soldiers standing one behind another along one wall. */
function longestFile(units: Point[], wall: Rect): number {
  let best = 0;
  for (const side of SIDES) {
    const along = side === "위" || side === "아래";
    const line = units.filter(unit => sideOf(wall, unit) === side).map(unit => ({ a: along ? unit.x : unit.y, p: along ? unit.y : unit.x })).sort((x, y) => x.a - y.a);
    const used = new Set<number>();
    for (let start = 0; start < line.length; start++) {
      if (used.has(start)) continue;
      let last = line[start], length = 1;
      used.add(start);
      for (let next = start + 1; next < line.length; next++) {
        if (used.has(next) || Math.abs(line[next].p - line[start].p) > FILE.across) continue;
        if (line[next].a - last.a > FILE.along) break;
        used.add(next); last = line[next]; length++;
      }
      best = Math.max(best, length);
    }
  }
  return best;
}
function sides(units: Point[], wall: Rect) {
  const counts = SIDES.map(side => units.filter(unit => sideOf(wall, unit) === side).length);
  const max = Math.max(...counts), others = (counts.reduce((sum, n) => sum + n, 0) - max) / 3;
  return { counts: Object.fromEntries(SIDES.map((side, i) => [side, counts[i]])), max, othersMean: others };
}

async function measure(seed: number, chapter: number) {
  const fixture = await survivalFixture("full163");
  setFieldSize(370, 800);
  const meta = freshMeta(), save = freshBphSave(seed);
  meta.bph = save; save.chapter = chapter - 1; save.purchasedPlacements = [...fixture.purchasedPlacements];
  const effects = activeBphEffects(save);
  projectBphSalary(save, effects);
  const run = createBphRun(meta, { seed, general: "권율", upgrades: effects, startBattle: false });
  const battle = run.bph, context = bphFxContext(run);
  assert(battle && context);
  bindBphConsumers(context, bphConsumers(), false);
  dispatchBphEffects(run, { kind: "run-start" });
  prepareBphFieldShop(run);
  const snapshots: Record<string, unknown> = {};
  let idleSamples = 0, idleMaxShare = 0, idleFile = 0, idleFileMax = 0, idleMaxSide = 0, shotStill = 0, calmFor = 0;
  let settledSamples = 0, settledMaxShare = 0, settledFile = 0, settledFileMax = 0;
  const before = new Map<number, { x: number; y: number; hp: number }>();
  for (let steps = 0; steps < seconds / .05 && run.phase !== "won" && run.phase !== "lost";) {
    if (run.phase === "choice") { choose(run, ordinaryCard(run)); continue; }
    if (run.phase === "general") { chooseGeneral(run, run.generalOffers[0]!); continue; }
    if (steps % 10 === 0) {
      for (const squad of run.squads) useSkill(run, squad.id);
      const shop = restockBphRecruit(run), slot = shop.offers.findIndex(offer => !offer.sold);
      const pack = slot >= 0 ? buyBphRecruit(run, shop, slot) : null;
      if (pack) battle.packs.push({ ...pack, hp: 2, x: CENTER.x, y: CENTER.y + 70 });
      for (const open of [...battle.packs]) { hitBphPack(run, open.id); hitBphPack(run, open.id); }
    }
    const target = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship").sort((a, b) =>
      Number(Boolean(b.breach)) - Number(Boolean(a.breach)) || Number(b.boss) - Number(a.boss)
      || Math.hypot(a.x - CENTER.x, a.y - CENTER.y) - Math.hypot(b.x - CENTER.x, b.y - CENTER.y) || a.id - b.id)[0];
    if (target) { updateBphPointer(run, target); if (steps % 10 === 0) hitBphEnemy(run, target.id); }
    advance(run, .05); steps++;
    battle.fxEvents.length = 0;
    // Unit-seconds a melee soldier lost hp without moving while no foe stood within its contact reach (+16 px).
    for (const unit of run.squads.flatMap(squad => squad.soldiers)) {
      if (unit.kind === "panokseon" || unit.kind === "archer" || unit.kind === "hwacha" || unit.perch !== undefined) continue;
      const last = before.get(unit.id);
      before.set(unit.id, { x: unit.x, y: unit.y, hp: unit.hp });
      if (!last || unit.hp <= 0 || unit.hp >= last.hp || Math.hypot(unit.x - last.x, unit.y - last.y) >= .5) continue;
      const reach = contactReach(run, unit) + 16;
      if (!run.enemies.some(enemy => enemy.hp > 0 && Math.hypot(enemy.x - unit.x, enemy.y - unit.y) <= reach)) shotStill += .05;
    }
    if (steps % 20 !== 0) continue;
    const wall = fortRect(run.fort);
    const ground = run.squads.flatMap(squad => squad.soldiers).filter(unit => unit.hp > 0 && unit.kind !== "panokseon" && unit.perch === undefined && !contains(wall, unit));
    const at = Math.round(steps * .05);
    const view = { soldiers: ground.length, idle: ground.filter(unit => unit.quarry === undefined).length, ...sides(ground, wall), longestFile: longestFile(ground, wall) };
    if (marks.includes(at)) snapshots[`t${at}`] = view;
    // A sample counts as idle when at least four soldiers stand outside and none has a foe in reach.
    calmFor = ground.length >= 4 && view.idle === ground.length ? calmFor + 1 : 0;
    // Settled: idle for five sampled seconds in a row, so walkers have reached their posts.
    if (calmFor >= 5) {
      settledSamples++; settledMaxShare += view.max / ground.length; settledFile += view.longestFile; settledFileMax = Math.max(settledFileMax, view.longestFile);
    }
    if (ground.length >= 4 && view.idle === ground.length) {
      idleSamples++; idleMaxShare += view.max / ground.length; idleFile += view.longestFile;
      idleFileMax = Math.max(idleFileMax, view.longestFile); idleMaxSide = Math.max(idleMaxSide, view.max);
    }
  }
  return { seed, chapter, snapshots, idleSamples, idleMaxSidePct: 100 * idleMaxShare / Math.max(1, idleSamples),
    idleLongestFileMean: idleFile / Math.max(1, idleSamples), idleLongestFileMax: idleFileMax, idleMaxSideCount: idleMaxSide, settledSamples, settledMaxSidePct: 100 * settledMaxShare / Math.max(1, settledSamples),
    settledLongestFileMean: settledFile / Math.max(1, settledSamples), settledLongestFileMax: settledFileMax, shotStillSeconds: shotStill, kills: run.kills, phase: run.phase };
}

const rows: Awaited<ReturnType<typeof measure>>[] = [];
for (const chapter of [1, 4]) for (const seed of seeds) rows.push(await measure(seed, chapter));
const mean = (key: "idleMaxSidePct" | "idleLongestFileMean" | "idleLongestFileMax" | "settledMaxSidePct" | "settledLongestFileMean" | "shotStillSeconds" | "kills") => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
const summary = { seconds, seeds, idleSamples: rows.reduce((sum, row) => sum + row.idleSamples, 0), idleMaxSidePct: mean("idleMaxSidePct"),
  idleLongestFileMean: mean("idleLongestFileMean"), shotStillSeconds: mean("shotStillSeconds"), settledSamples: rows.reduce((sum, row) => sum + row.settledSamples, 0),
  settledMaxSidePct: mean("settledMaxSidePct"), settledLongestFileMean: mean("settledLongestFileMean"), settledLongestFileMax: Math.max(...rows.map(row => row.settledLongestFileMax)), idleLongestFileMax: Math.max(...rows.map(row => row.idleLongestFileMax)), kills: mean("kills") };
await Bun.write(outputArgument, JSON.stringify({ summary, rows }, null, 2) + "\n");
console.log(`ALLY_RING ${JSON.stringify(summary)}`);
