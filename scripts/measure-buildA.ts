import { mkdir } from "node:fs/promises";
import { advance, choose, createRun, soldierHp, SOLDIERS, upgradeClass, useSkill } from "../src/rules";
import type { SoldierKind } from "../src/rules";
import { ordinaryCard, POLICIES, skillReason } from "../src/bots";
import { BOSS_IDS, BOSSES } from "../src/bosses";
import type { BossId } from "../src/bosses";
import { setFieldSize } from "../src/geometry";

const [scenario = "timed", countText = "20", out = "evidence/buildA", bossText = "random", startText = "1"] = process.argv.slice(2);
const count = Number(countText), start = Number(startText);
const pure: SoldierKind | undefined = SOLDIERS.find(kind => scenario === `pure-${kind}`);
const policy = scenario === "idle" ? POLICIES.idle : scenario === "sloppy" ? POLICIES.sloppy : POLICIES.timed;
const fixedBoss: BossId | undefined = BOSS_IDS.find(id => id === bossText);
setFieldSize(370, 800);
if (!Number.isInteger(count) || count < 1 || count > 1000 || (!pure && !["idle", "sloppy", "timed"].includes(scenario)) || (bossText !== "random" && !fixedBoss))
  throw new Error("usage: measure-buildA.ts <idle|sloppy|timed|pure-class> <count> <out> [random|boss] [start]");

const rows = [];
const sourceHashes = Object.fromEntries(await Promise.all(["rules", "bots", "geometry", "bosses", "fortification"].map(async name =>
  [name, new Bun.CryptoHasher("sha256").update(await Bun.file(`${import.meta.dir}/../src/${name}.ts`).bytes()).digest("hex")])));
for (let seed = start; seed < start + count; seed++) {
  const run = createRun(seed);
  if (fixedBoss) {
    const at = run.bossRoster.slice(0, 4).findIndex(id => BOSSES[id].resist === BOSSES[fixedBoss].resist), replaced = run.bossRoster[at];
    run.bossRoster[at] = fixedBoss;
    [run.bossRoster[0], run.bossRoster[at]] = [run.bossRoster[at], run.bossRoster[0]];
    if (run.bossRoster[4] === fixedBoss) run.bossRoster[4] = replaced;
  } else if (pure) {
    const attack = pure === "archer" ? "arrow" : pure === "hwacha" ? "artillery" : "melee";
    if (BOSSES[run.bossRoster[0]].resist === attack) {
      const safe = run.bossRoster.slice(0, 4).findIndex(id => BOSSES[id].resist !== attack);
      [run.bossRoster[0], run.bossRoster[safe]] = [run.bossRoster[safe], run.bossRoster[0]];
    }
  }
  run.bossOrder = run.bossRoster.slice(0, 4).map(id => BOSSES[id].pattern);
  let nextLook = 0, decisions = seed >>> 0;
  for (let tick = 0; tick < 16000 && run.phase !== "won" && run.phase !== "lost"; tick++) {
    if (pure) for (const squad of run.squads) for (const unit of squad.soldiers) if (unit.kind !== pure) {
      const share = unit.hp / unit.maxHp;
      unit.kind = pure; unit.maxHp = soldierHp(pure, unit.tier, run.level); unit.hp = unit.maxHp * share;
      delete unit.perch;
    }
    if (run.phase === "choice" && policy.cards !== "none") {
      decisions = (Math.imul(decisions, 1664525) + 1013904223) >>> 0;
      const hero = run.offers.find(card => card.startsWith("hero-"));
      const classCard = run.offers.find(card => card === `recruit-${pure}`);
      choose(run, policy.cards === "random" ? run.offers[decisions % run.offers.length] : hero ?? classCard ?? ordinaryCard(run));
    }
    if (run.time >= nextLook) {
      nextLook = run.time + .2;
      for (const squad of run.squads) if (skillReason(run, squad, policy)) useSkill(run, squad.id);
      if (policy.spend) for (const kind of SOLDIERS) if (!pure || kind === pure) upgradeClass(run, kind);
    }
    advance(run, .05);
  }
  if (run.phase !== "won" && run.phase !== "lost") throw new Error(`Unfinished ${scenario} seed ${seed}`);
  rows.push({ seed, outcome: run.phase, time: run.time, cause: run.lossCause, level: run.level, cards: run.metrics.cards,
    bosses: run.metrics.bosses, bossDamage: run.metrics.bossDamage, heroDowns: run.metrics.downs.length });
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? null;
const finalSeconds = rows.flatMap(row => row.bosses.filter(boss => boss.final && boss.fallen !== null).map(boss => Number(boss.fallen) - boss.appeared));
const summary = { scenario, field: [370, 800], fixture: fixedBoss ? `first-boss:${fixedBoss}` : pure ? "pure-class conversion with safe first boss" : "unmodified",
  count, wins: rows.filter(row => row.outcome === "won").length,
  medianDeath: median(rows.filter(row => row.outcome === "lost").map(row => row.time)),
  minTime: Math.min(...rows.map(row => row.time)), maxTime: Math.max(...rows.map(row => row.time)),
  bossLosses: rows.filter(row => row.cause === "boss").length,
  bossContributedLosses: rows.filter(row => row.outcome === "lost" && row.bossDamage > 0).length,
  finalFightMedian: median(finalSeconds), finalFightMin: finalSeconds.length ? Math.min(...finalSeconds) : null,
  finalFightMax: finalSeconds.length ? Math.max(...finalSeconds) : null };
await mkdir(out, { recursive: true });
await Bun.write(`${out}/${scenario}-${bossText}-${start}.json`, JSON.stringify({ sourceHashes, summary, rows }, null, 2));
console.log(JSON.stringify(summary));
