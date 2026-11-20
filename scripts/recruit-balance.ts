import { strict as assert } from "node:assert";
import { freshMeta } from "../src/meta";
import { createBphRun } from "../src/bph-session";
import { createBphShop } from "../src/bph-shop";
import { hitBphPack } from "../src/bph-combat";
import { BPH_PACKS, BPH_WAVES } from "../src/bph-data";
import { bphSpawnsBetween } from "../src/bph-waves";
import {
  BPH_RECRUIT_TABLE, bphRecruitMean, bphRecruitOfferPrice, bphRecruitPrice, buyBphRecruit,
} from "../src/bph-recruit";
import type { BphRecruitTable } from "../src/bph-recruit";
import { POLICIES, ordinaryCard, skillReason } from "../src/bots";
import { advance, choose, chooseGeneral, generalHandOpen, troopCap, useSkill } from "../src/rules";
import type { Run } from "../src/rules";
import { HEIGHT, WIDTH, setFieldSize } from "../src/geometry";
import { auditBalanceReceipts, fullTreeEffects, fullTreeInventory, observeBalanceRun, prepareBalanceUpgrades } from "./recruit-balance-audit";
import { writeBalanceReport } from "./recruit-balance-report";

const COMMAND = "taskpolicy -b nice -n 15 bun scripts/recruit-balance.ts";
const SINGLE = [{ count: 1, weight: 1 }] as const;
type Config = { readonly name: string; readonly table: BphRecruitTable };
type Purchase = {
  readonly time: number; readonly packId: string; readonly price: number;
  readonly multiplier: number; readonly units: number;
  readonly audit: ReturnType<typeof auditBalanceReceipts>;
};
type Row = {
  readonly config: string; readonly seed: number; readonly survival: number;
  readonly phase: Run["phase"]; readonly capped: boolean; readonly kills: number;
  readonly purchases: number; readonly unitsRecruited: number;
  readonly multipliers: readonly number[]; readonly goldSpent: number;
  readonly waveReached: number; readonly spawnsReached: number;
  readonly purchaseLog: readonly Purchase[];
  readonly maxTroops: number; readonly troopCap: number; readonly clippedPurchases: number;
  readonly blockedPurchaseAttempts: number; readonly activeEffects: number;
};
const configs: Config[] = [
  { name: "before", table: { multiplier: SINGLE, price: { every: 2, stepRatio: 0 } } },
  { name: "after", table: BPH_RECRUIT_TABLE },
  { name: "odds-only", table: { ...BPH_RECRUIT_TABLE, price: { every: 2, stepRatio: 0 } } },
  { name: "price-only", table: { multiplier: SINGLE, price: BPH_RECRUIT_TABLE.price } },
  { name: "after-fulltree", table: BPH_RECRUIT_TABLE },
];

function simulate(config: Config, seed: number): Row {
  const meta = freshMeta();
  const upgrades = config.name === "after-fulltree" ? fullTreeEffects(meta) : [];
  const run = createBphRun(meta, { seed, general: "권율", upgrades, startBattle: false });
  const observer = observeBalanceRun(run);
  const battle = run.bph;
  assert(battle, "createBphRun must supply BPH battle state");
  const shop = createBphShop(battle.save, battle.upgrades);
  const purchaseLog: Purchase[] = [];
  let blockedPurchaseAttempts = 0;
  let ticks = 0;
  while (run.phase !== "won" && run.phase !== "lost" && run.time < 600) {
    if (run.phase === "choice") {
      choose(run, ordinaryCard(run));
      continue;
    }
    if (generalHandOpen(run)) {
      chooseGeneral(run, run.generalOffers[0]);
      continue;
    }
    if (ticks % 4 === 0) {
      for (const squad of run.squads)
        if (skillReason(run, squad, POLICIES.timed)) useSkill(run, squad.id);
      const slot = shop.offers.findIndex(offer => !offer.sold);
      if (slot >= 0 && run.gold >= bphRecruitOfferPrice(run, shop, config.table)) {
        const gold = run.gold;
        const instance = buyBphRecruit(run, shop, slot, config.table);
        if (instance) {
          battle.packs.push({ ...instance, hp: 1, x: WIDTH / 2, y: HEIGHT / 2 + 70 });
          const firstId = run.nextId;
          const receipts = hitBphPack(run, instance.id);
          assert(receipts.length > 0, "Purchased pack must open immediately");
          const audit = auditBalanceReceipts(run, receipts, firstId);
          observer.sample();
          purchaseLog.push({
            time: run.time, packId: instance.packId, price: gold - run.gold,
            multiplier: instance.multiplier ?? 1, units: audit.units, audit,
          });
        } else blockedPurchaseAttempts++;
      }
    }
    advance(run, .05);
    observer.sample();
    ticks++;
  }
  return {
    config: config.name, seed, survival: run.time, phase: run.phase,
    capped: run.phase !== "won" && run.phase !== "lost", kills: run.kills,
    purchases: purchaseLog.length, unitsRecruited: purchaseLog.reduce((sum, p) => sum + p.units, 0),
    multipliers: purchaseLog.map(p => p.multiplier),
    goldSpent: purchaseLog.reduce((sum, p) => sum + p.price, 0),
    waveReached: BPH_WAVES[battle.waveId].filter(burst => burst.at <= run.time).length,
    spawnsReached: bphSpawnsBetween(battle.waveId, { after: 0, through: run.time }).length,
    purchaseLog,
    maxTroops: observer.maximum(), troopCap: troopCap(run),
    clippedPurchases: purchaseLog.filter(purchase => purchase.audit.clipped).length,
    blockedPurchaseAttempts,
    activeEffects: upgrades.length,
  };
}
function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}
function summarize(config: Config, rows: readonly Row[]) {
  const runs = rows.filter(row => row.config === config.name);
  assert.equal(runs.length, 30);
  assert.equal(new Set(runs.map(row => row.seed)).size, 30);
  return {
    config: config.name, table: config.table,
    medianSurvival: median(runs.map(row => row.survival)),
    meanSurvival: mean(runs.map(row => row.survival)),
    medianWave: median(runs.map(row => row.waveReached)),
    meanWave: mean(runs.map(row => row.waveReached)),
    wins: runs.filter(row => row.phase === "won").length,
    losses: runs.filter(row => row.phase === "lost").length,
    capped: runs.filter(row => row.capped).length,
    meanPurchases: mean(runs.map(row => row.purchases)),
    meanUnits: mean(runs.map(row => row.unitsRecruited)),
    maxTroops: Math.max(...runs.map(row => row.maxTroops)),
    clippedPurchases: runs.reduce((sum, row) => sum + row.clippedPurchases, 0),
  };
}

setFieldSize(370, 800);
await prepareBalanceUpgrades();
const rows: Row[] = [];
function measure(config: Config) {
  for (let seed = 1; seed <= 30; seed++) rows.push(simulate(config, seed));
  const summary = summarize(config, rows);
  console.log("CONFIG_COMPLETE", JSON.stringify(summary));
  return summary;
}
const summaries = configs.map(measure);
const baseline = summaries[0].medianSurvival;
const afterRatio = summaries[1].medianSurvival / baseline;
const acceptable = (survival: number) => survival / baseline >= .85 && survival / baseline <= 1.15;
let recommendation = configs[1];
if (!acceptable(summaries[1].medianSurvival)) {
  const candidates: Config[] = [.75, 1].map(stepRatio => ({
    name: `after-price-${stepRatio}`,
    table: { ...BPH_RECRUIT_TABLE, price: { every: 2, stepRatio } },
  }));
  for (let shift = 5; shift <= 25; shift += 5) candidates.push({
    name: `after-price-1-odds-${60 + shift}-${25 - shift}`,
    table: {
      multiplier: BPH_RECRUIT_TABLE.multiplier.map(entry => ({
        count: entry.count,
        weight: entry.weight + (entry.count === 1 ? shift : entry.count === 2 ? -shift : 0),
      })),
      price: { every: 2, stepRatio: 1 },
    },
  });
  for (const config of candidates) {
    configs.push(config);
    const summary = measure(config);
    summaries.push(summary);
    recommendation = config;
    if (acceptable(summary.medianSurvival)) break;
  }
}
const recommended = summaries.find(summary => summary.config === recommendation.name);
assert(recommended);
const satisfiesTarget = acceptable(recommended.medianSurvival);
const basic = BPH_PACKS.Pack1_Basic;
const economics = configs.map(config => {
  const prices = [0, 1, 2].map(bought => bphRecruitPrice(basic.price, bought, config.table));
  const expectedDraws = 3 * bphRecruitMean(config.table), coins = prices.reduce((sum, p) => sum + p, 0);
  return { config: config.name, prices, expectedDraws, coins, expectedUnitsPerCoin: expectedDraws / coins };
});
const report = {
  command: COMMAND, seeds: { first: 1, last: 30 }, dt: .05, decisionInterval: .2, cap: 600,
  general: "권율", upgrades: "none except after-fulltree", fullTree: fullTreeInventory(),
  field: { width: 370, height: 800 },
  afterBeforeMedianRatio: afterRatio,
  recommendedBeforeMedianRatio: recommended.medianSurvival / baseline,
  recommendation: { ...recommendation, satisfiesTarget },
  summaries, economics, rows,
};
await writeBalanceReport(report);
console.log("BALANCE_COMPLETE", JSON.stringify({
  rows: rows.length, afterRatio, recommendation: report.recommendation,
  before: summaries[0], after: summaries[1], recommended,
}));
export type BalanceReport = typeof report;
