// usage: bun scripts/measure.ts [outDir=evidence/stage4] [seeds=100]
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { play, POLICIES } from "../src/bots";
const output = resolve(import.meta.dir, "..", process.argv[2] ?? "evidence/stage4"), seeds = Number(process.argv[3] ?? 100);
await mkdir(output, { recursive: true });
const describe = { idle: "필살기를 한 번도 누르지 않음 · 강화 안 삼", sloppy: "카드는 아무거나 · 필살기는 한참 늦게 · 강화 안 삼", mash: "충전되는 즉시 누름 · 골드가 모이면 강화", timed: "때를 보고 누름(뭉친 적·적 스킬·위험한 장수) · 골드가 모이면 강화" };
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = [], summary = [];
for (const name of Object.keys(POLICIES) as (keyof typeof POLICIES)[]) {
  const runs = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const run = play(POLICIES[name], seed), m = run.metrics;
    if (!["won", "lost"].includes(run.phase)) throw new Error(`Seed ${seed} did not finish`);
    runs.push({ policy: name, seed, outcome: run.phase, bossDeadline: run.lossCause === "deadline", lossCause: run.lossCause, bosses: m.bosses, bossDamage: m.bossDamage, time: run.time, score: run.score, kills: run.kills,
      killsPerMinute: run.kills / run.time * 60, minWallRatio: m.minWallRatio, level: run.level, skills: m.skills.reduce((a, b) => a + b, 0),
      generalDowns: m.downs.length, enemySkills: m.telegraphs, struckGeneral: m.generalsStruck, blocked: m.blockedCasts, interrupted: m.interrupts,
      evolutions: run.evolutions.length, merges: m.merges, chests: m.chests, finalBossAt: m.finalDefeatedAt, weather: run.weather });
  }
  rows.push(...runs);
  summary.push({ policy: name, description: describe[name], runs: runs.length, wins: runs.filter(r => r.outcome === "won").length,
    bossLosses: runs.filter(r => r.lossCause === "boss").length,
    bossContributedLosses: runs.filter(r => r.outcome === "lost" && r.bossDamage > 0).length,
    wallLosses: runs.filter(r => r.outcome === "lost" && !r.bossDeadline).length, bossDeadlineLosses: runs.filter(r => r.bossDeadline).length,
    lossBeforeEightMinutes: runs.filter(r => r.outcome === "lost" && r.time < 480).length,
    medianDeathSeconds: runs.some(r => r.outcome === "lost") ? median(runs.filter(r => r.outcome === "lost").map(r => r.time)) : null,
    medianEndSeconds: median(runs.map(r => r.time)), longestSeconds: Math.max(...runs.map(r => r.time)),
    killsPerMinuteMean: mean(runs.map(r => r.killsPerMinute)), minWallRatioMedian: median(runs.map(r => r.minWallRatio)),
    generalDownsMean: mean(runs.map(r => r.generalDowns)), struckGeneralMean: mean(runs.map(r => r.struckGeneral)), blockedMean: mean(runs.map(r => r.blocked)),
    interruptedMean: mean(runs.map(r => r.interrupted)), enemySkillsMean: mean(runs.map(r => r.enemySkills)), levelMean: mean(runs.map(r => r.level)), scoreMean: mean(runs.map(r => r.score)) });
}
await Bun.write(`${output}/100-runs.json`, JSON.stringify(rows, null, 2));
await Bun.write(`${output}/100-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 1));
