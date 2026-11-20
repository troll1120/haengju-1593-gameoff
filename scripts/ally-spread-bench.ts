// Measures how allied ground soldiers share space in the real survival loop.
// Run the same file in two checkouts to compare: bun scripts/ally-spread-bench.ts OUTPUT.json [SECONDS]
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
import { advance, choose, chooseGeneral, hitBphEnemy, useSkill } from "../src/rules";
import { ordinaryCard } from "../src/bots";
import { CENTER, setFieldSize } from "../src/geometry";
import { survivalFixture } from "./survival-fixtures";

/** Median opaque row width of the 32 px ally frames (spearman/archer/uibyeong 21, monk 17, cavalry 19). */
const BODY = 20;
const [outputArgument, secondsArgument] = Bun.argv.slice(2);
assert(outputArgument, "usage: ally-spread-bench.ts OUTPUT.json [SECONDS]");
const seconds = Number(secondsArgument ?? 180);
const seeds = [1, 2, 3, 4, 5];

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
  let frames = 0, overlapFrames = 0, stackFrames = 0, touchFrames = 0, unitShare = 0, spreadShare = 0, spreadFrames = 0, centroidGap = 0;
  const nearest: number[] = [];
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
    const ground = run.squads.flatMap(squad => squad.soldiers)
      .filter(unit => unit.hp > 0 && unit.kind !== "panokseon" && unit.perch === undefined);
    if (ground.length < 2) continue;
    frames++;
    const overlapping = new Set<number>();
    let stacked = false, touched = false;
    ground.forEach((unit, i) => {
      let closest = Infinity;
      ground.forEach((other, j) => {
        if (i === j) return;
        const gap = Math.hypot(unit.x - other.x, unit.y - other.y);
        closest = Math.min(closest, gap);
        // Two equal bodies overlap by more than half their width when centres are closer than BODY / 2.
        if (gap < BODY / 2) overlapping.add(i);
        if (gap < 1) stacked = true;
        if (gap < BODY) touched = true;
      });
      nearest.push(closest);
    });
    const middle = { x: ground.reduce((sum, unit) => sum + unit.x, 0) / ground.length, y: ground.reduce((sum, unit) => sum + unit.y, 0) / ground.length };
    centroidGap += ground.reduce((sum, unit) => sum + Math.hypot(unit.x - middle.x, unit.y - middle.y), 0) / ground.length;
    if (overlapping.size) overlapFrames++;
    if (stacked) stackFrames++;
    if (touched) touchFrames++;
    unitShare += overlapping.size / ground.length;
    const aimed = ground.filter(unit => unit.quarry !== undefined);
    if (aimed.length >= 2) { spreadFrames++; spreadShare += new Set(aimed.map(unit => unit.quarry)).size / aimed.length; }
  }
  nearest.sort((a, b) => a - b);
  const quantile = (q: number) => nearest[Math.min(nearest.length - 1, Math.floor(nearest.length * q))] ?? null;
  return { seed, chapter, frames, overlapFramePct: 100 * overlapFrames / Math.max(1, frames),
    fullStackFramePct: 100 * stackFrames / Math.max(1, frames), touchFramePct: 100 * touchFrames / Math.max(1, frames), overlappingUnitPct: 100 * unitShare / Math.max(1, frames),
    distinctTargetPct: 100 * spreadShare / Math.max(1, spreadFrames), centroidGapPx: centroidGap / Math.max(1, frames),
    nearestNeighbourPx: { p10: quantile(.1), p50: quantile(.5) }, kills: run.kills };
}

const rows: Awaited<ReturnType<typeof measure>>[] = [];
for (const chapter of [1, 4]) for (const seed of seeds) rows.push(await measure(seed, chapter));
const mean = (key: "overlapFramePct" | "fullStackFramePct" | "touchFramePct" | "overlappingUnitPct" | "distinctTargetPct" | "centroidGapPx") =>
  rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
const summary = { body: BODY, seconds, seeds, overlapFramePct: mean("overlapFramePct"), fullStackFramePct: mean("fullStackFramePct"), touchFramePct: mean("touchFramePct"),
  overlappingUnitPct: mean("overlappingUnitPct"), distinctTargetPct: mean("distinctTargetPct"), centroidGapPx: mean("centroidGapPx") };
await Bun.write(outputArgument, JSON.stringify({ summary, rows }, null, 2) + "\n");
console.log(`ALLY_SPREAD ${JSON.stringify(summary)}`);
