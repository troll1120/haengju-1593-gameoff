// Measures how enemy troops unloaded from a landing transport share space, right at the landing and 5 s later.
// Run the same file in two checkouts to compare: bun scripts/enemy-landing-bench.ts OUTPUT.json [SECONDS]
import { strict as assert } from "node:assert";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { createBphRun } from "../src/bph-session";
import { projectBphSalary } from "../src/bph-account";
import { activeBphEffects } from "../src/bph-upgrades";
import { bphConsumers, bphFxContext, bindBphConsumers, dispatchBphEffects } from "../src/bph-fx-dispatch";
import { advance, choose, chooseGeneral } from "../src/rules";
import type { Run } from "../src/rules";
import { ordinaryCard } from "../src/bots";
import { setFieldSize } from "../src/geometry";
import { survivalFixture } from "./survival-fixtures";

/** Enemy foot soldiers use the same 32 px unit frames as allies; their median opaque body is about 20 px wide. */
const BODY = 20, LATER = 5, STEP = .05;
const [outputArgument, secondsArgument] = Bun.argv.slice(2);
assert(outputArgument, "usage: enemy-landing-bench.ts OUTPUT.json [SECONDS]");
const seconds = Number(secondsArgument ?? 300);
const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Tally = { troops: number; stacked: number; overlapping: number; touching: number; landings: number; stackedLandings: number; nearest: number[] };
const tally = (): Tally => ({ troops: 0, stacked: 0, overlapping: 0, touching: 0, landings: 0, stackedLandings: 0, nearest: [] });

/** Counts each landed troop whose nearest other ground enemy is closer than 1 px (full stack) or BODY / 2 (over half overlapping). */
function sample(run: Run, ids: number[], into: Tally): void {
  const ground = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && !enemy.cargo);
  const troops = ground.filter(enemy => ids.includes(enemy.id));
  if (!troops.length) return;
  let anyStack = false;
  for (const troop of troops) {
    let closest = Infinity;
    for (const other of ground) if (other !== troop) closest = Math.min(closest, Math.hypot(troop.x - other.x, troop.y - other.y));
    into.troops++; into.nearest.push(closest);
    if (closest < BODY) into.touching++;
    if (closest < 1) { into.stacked++; anyStack = true; }
    if (closest < BODY / 2) into.overlapping++;
  }
  into.landings++;
  if (anyStack) into.stackedLandings++;
}

async function measure(seed: number, chapter: number) {
  const fixture = await survivalFixture("full163");
  setFieldSize(370, 800);
  const meta = freshMeta(), save = freshBphSave(seed);
  meta.bph = save; save.chapter = chapter - 1; save.purchasedPlacements = [...fixture.purchasedPlacements];
  const effects = activeBphEffects(save);
  projectBphSalary(save, effects);
  const run = createBphRun(meta, { seed, general: "권율", upgrades: effects, startBattle: false });
  const context = bphFxContext(run);
  assert(run.bph && context);
  bindBphConsumers(context, bphConsumers(), false);
  dispatchBphEffects(run, { kind: "run-start" });
  const landing = tally(), later = tally(), pending: { at: number; ids: number[] }[] = [];
  for (let steps = 0; steps < seconds / STEP && run.phase !== "won" && run.phase !== "lost";) {
    if (run.phase === "choice") { choose(run, ordinaryCard(run)); continue; }
    if (run.phase === "general") { chooseGeneral(run, run.generalOffers[0]!); continue; }
    const aboard = new Map(run.enemies.filter(enemy => enemy.cargo?.length).map(boat => [boat.id, boat.cargo!.map(troop => troop.id)]));
    advance(run, STEP); steps++;
    run.bph.fxEvents.length = 0;
    for (const [boat, ids] of aboard) {
      if (run.enemies.some(enemy => enemy.id === boat && enemy.cargo?.length)) continue;
      const ashore = ids.filter(id => run.enemies.some(enemy => enemy.id === id));
      if (!ashore.length) continue;
      sample(run, ashore, landing);
      pending.push({ at: run.time + LATER, ids: ashore });
    }
    for (const due of pending.filter(item => run.time >= item.at - 1e-9)) { sample(run, due.ids, later); pending.splice(pending.indexOf(due), 1); }
  }
  return { seed, chapter, landing, later, kills: run.kills, time: Math.round(run.time), phase: run.phase };
}

const rows: Awaited<ReturnType<typeof measure>>[] = [];
for (const chapter of [1, 4]) for (const seed of seeds) rows.push(await measure(seed, chapter));
const total = (key: "landing" | "later") => rows.reduce((sum, row) => {
  for (const field of ["troops", "stacked", "overlapping", "touching", "landings", "stackedLandings"] as const) sum[field] += row[key][field];
  sum.nearest.push(...row[key].nearest);
  return sum;
}, tally());
const pct = (part: number, whole: number) => Math.round(1000 * part / Math.max(1, whole)) / 10;
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return Math.round(10 * (sorted[Math.floor(sorted.length / 2)] ?? 0)) / 10; };
const shape = ({ nearest, ...t }: Tally) => ({ ...t, fullStackTroopPct: pct(t.stacked, t.troops), over50TroopPct: pct(t.overlapping, t.troops),
  anyOverlapTroopPct: pct(t.touching, t.troops), fullStackLandingPct: pct(t.stackedLandings, t.landings), nearestP50Px: median(nearest) });
const summary = { body: BODY, seconds, seeds, landing: shape(total("landing")), after5s: shape(total("later")) };
const brief = rows.map(({ landing, later, ...row }) => ({ ...row, landing: shape(landing), later: shape(later) }));
await Bun.write(outputArgument, JSON.stringify({ summary, rows: brief }, null, 2) + "\n");
console.log(`ENEMY_LANDING ${JSON.stringify(summary)}`);
