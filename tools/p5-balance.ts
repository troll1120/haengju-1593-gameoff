// P5 (e)(f)(g), before account limits from (k).
// bun tools/p5-balance.ts <core|weapon|naval> <seeds per commander> <output.json>
import { advance, ARMS, BALANCE, choose, createRun, might, recruit, toughness, upgradeClass, useSkill } from "../src/rules";
import type { CardId, General, Run } from "../src/rules";
import { ARMY_KINDS } from "../src/roster";
import { ordinaryCard, POLICIES, skillReason } from "../src/bots";
import { setFieldSize } from "../src/geometry";
import { riverBank } from "../src/river";
import { synergy } from "../src/synergy";

const mode = process.argv[2] ?? "core", count = Number(process.argv[3] ?? 12), output = process.argv[4] ?? "evidence/p5-balance.json";
if (!["core", "weapon", "naval"].includes(mode) || !Number.isInteger(count) || count < 1) throw new Error("Invalid P5 balance arguments");
setFieldSize(370, 800);
const median = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;
const percentile = (values: number[], portion: number) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * portion))] : null;
type Interval = { at: number; influx: number; kills: number; wallDamage: number; baseDamage: number; cards: CardId[]; firstEvolution: number | null };
function select(run: Run): CardId | undefined {
  if (mode === "naval") {
    const offers = run.offers.filter(card => !card.includes("panokseon"));
    return offers.length ? ordinaryCard({ ...run, offers }) : undefined;
  }
  if (mode === "weapon") {
    const priority: CardId[] = ["hwacha", "powder", "arrow", "quiver"];
    return run.offers.find(card => card.startsWith("hero-")) ?? priority.find(card => run.offers.includes(card)) ?? ordinaryCard(run);
  }
  return ordinaryCard(run);
}
function trial(seed: number, general: General, idle: boolean, navalStars = 0) {
  const run = createRun(seed, general, undefined, ["권율", "김시민", "곽재우", "황진"]);
  if (mode === "naval" && navalStars) {
    recruit(run, "panokseon");
    run.gold = 1600;
    for (let star = 1; star < navalStars; star++) upgradeClass(run, "panokseon");
    run.gold = 0;
  }
  let nextLook = 0, reactionAt = Infinity, nextLog = 30, lastKills = 0, lastWall = run.wall, lastBase = run.base, lastCards = 0, influx = 8;
  let goldAtNine: number | null = null, southAtThree: number | null = null, navalAtThree = { ...run.metrics.naval }, navalAtFive = { ...run.metrics.naval };
  let landInWaterTicks = 0, southWalkSpawns = 0;
  const seen = new Set<number>(run.enemies.map(enemy => enemy.id)), intervals: Interval[] = [];
  const breakpoints: { at: number; level: number; hits: number[] }[] = [];
  for (let tick = 0; tick < 13000 && run.phase !== "won" && run.phase !== "lost"; tick++) {
    if (!idle && run.phase === "choice") {
      if (reactionAt === Infinity) reactionAt = run.time + 1.3;
      if (run.time >= reactionAt && run.offers.length) {
        const card = select(run);
        if (card) choose(run, card);
        reactionAt = Infinity;
      }
    } else reactionAt = Infinity;
    if (!idle && run.time >= nextLook) {
      nextLook = run.time + .2;
      for (const squad of run.squads) if (skillReason(run, squad, POLICIES.timed)) useSkill(run, squad.id);
      for (const kind of ARMY_KINDS) if (mode !== "naval" || kind !== "panokseon") upgradeClass(run, kind);
    }
    advance(run, .05);
    for (const squad of run.squads) for (const unit of [squad, ...squad.soldiers])
      if (unit.kind !== "panokseon" && unit.y > riverBank() - 8 + 1e-8) landInWaterTicks++;
    for (const enemy of run.enemies) {
      if (enemy.kind !== "ship" && enemy.y > riverBank() - 8 + 1e-8) landInWaterTicks++;
      for (const unit of enemy.cargo ?? [enemy])
        if (!seen.has(unit.id)) {
          seen.add(unit.id); influx++;
          if (!enemy.cargo && unit.direction === "아래" && unit.kind !== "ship" && unit.y > riverBank()) southWalkSpawns++;
        }
    }
    if (run.time >= 180 && southAtThree === null) { southAtThree = run.walls.아래; navalAtThree = { ...run.metrics.naval }; }
    if (run.time < 300) navalAtFive = { ...run.metrics.naval };
    if (run.time >= 540 && goldAtNine === null) goldAtNine = run.gold;
    if (breakpoints.length < 9 && run.time >= (breakpoints.length + 1) * 60) {
      const at = (breakpoints.length + 1) * 60, hp = BALANCE.enemyHp * toughness(at);
      const hits = [0, 1, 2].map(star => Math.ceil(hp / (might(run) * ARMS.spearman.power
        * synergy({ ...run, drill: { ...run.drill, spearman: star } }, "spearman").power)));
      breakpoints.push({ at, level: run.level, hits });
    }
    if (run.time >= nextLog) {
      intervals.push({ at: nextLog, influx, kills: run.kills - lastKills, wallDamage: lastWall - run.wall, baseDamage: lastBase - run.base,
        cards: run.metrics.cards.slice(lastCards), firstEvolution: run.metrics.evolutionTimes[0] ?? null });
      influx = 0; lastKills = run.kills; lastWall = run.wall; lastBase = run.base; lastCards = run.metrics.cards.length; nextLog += 30;
    }
  }
  if (!["won", "lost"].includes(run.phase)) throw new Error(`Unfinished ${general} seed ${seed}`);
  intervals.push({ at: run.time, influx, kills: run.kills - lastKills, wallDamage: lastWall - run.wall, baseDamage: lastBase - run.base,
    cards: run.metrics.cards.slice(lastCards), firstEvolution: run.metrics.evolutionTimes[0] ?? null });
  const final = run.metrics.bosses.find(boss => boss.final);
  const tail = intervals.at(-1);
  const cause = run.lossCause === "deadline" ? "내구" : tail && tail.influx > tail.kills * 1.5 ? "밀도"
    : Object.values(run.walls).some(hp => hp <= 0) ? "공간" : "내구";
  return { seed, general, idle, navalStars, outcome: run.phase, time: run.time, cause, level: run.level,
    goldAtNine, firstEvolution: run.metrics.evolutionTimes[0] ?? null,
    finalFight: final?.fallen ? final.fallen - final.appeared : null, heroDowns: run.metrics.downs.length,
    navalWindow: { launched: navalAtFive.launched - navalAtThree.launched, sunk: navalAtFive.sunk - navalAtThree.sunk, landed: navalAtFive.landed - navalAtThree.landed },
    southAtThree, southFinal: run.walls.아래, landInWaterTicks, southWalkSpawns, naval: run.metrics.naval,
    lossCause: run.lossCause, bosses: run.metrics.bosses, breakpoints, intervals };
}
const rows: ReturnType<typeof trial>[] = [];
const generals: readonly General[] = mode === "weapon" ? ["권율"] : ["권율", "김시민", "곽재우", "황진"];
for (const idle of mode === "core" ? [false, true] : [false]) for (const general of generals)
  for (let seed = 1; seed <= count; seed++) for (const stars of mode === "naval" ? [0, 1, 2] : [0]) {
    rows.push(trial(seed, general, idle, stars));
    if (seed % 4 === 0) console.log(`PROGRESS ${mode} ${general} ${idle ? "idle" : "timed"} seed ${seed}`);
  }
const summaries = (mode === "naval" ? [0, 1, 2] : [0]).flatMap(stars => (mode === "core" ? [false, true] : [false]).map(idle => {
  const group = rows.filter(row => row.idle === idle && row.navalStars === stars);
  const evolution = group.flatMap(row => row.firstEvolution === null ? [] : [row.firstEvolution]);
  const gold = group.flatMap(row => row.goldAtNine === null ? [] : [row.goldAtNine]);
  return { idle, stars, count: group.length, wins: group.filter(row => row.outcome === "won").length,
    deathMedian: median(group.filter(row => row.outcome === "lost").map(row => row.time)),
    minTime: Math.min(...group.map(row => row.time)), maxTime: Math.max(...group.map(row => row.time)),
    finalFightMedian: median(group.flatMap(row => row.finalFight === null ? [] : [row.finalFight])),
    goldAtNineMean: gold.length ? gold.reduce((a, b) => a + b, 0) / gold.length : null,
    evolutionByEight: evolution.filter(at => at <= 480).length, evolutionMedian: median(evolution), evolutionP90: percentile(evolution, .9),
    transports: group.reduce((sum, row) => sum + row.navalWindow.launched, 0),
    sunk: group.reduce((sum, row) => sum + row.navalWindow.sunk, 0), causes: Object.fromEntries(["밀도", "내구", "속도", "공간", "보상 부족"].map(cause => [cause, group.filter(row => row.outcome === "lost" && row.cause === cause).length])) };
}));
await Bun.write(output, JSON.stringify({ mode, count, field: [370, 800], balance: { lateHp: BALANCE.lateHp }, summaries, rows }, null, 2));
console.log(JSON.stringify(summaries));
