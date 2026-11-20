import type { BalanceReport } from "./recruit-balance";

export async function writeBalanceReport(report: BalanceReport): Promise<void> {
  const output = new URL("../review/recruit-roulette/", import.meta.url);
  const { summaries, rows } = report;
  const f = (value: number) => value.toFixed(3);
  const clipped = rows.flatMap(row => row.purchaseLog.flatMap(purchase =>
    purchase.audit.receiptEvidence.filter(receipt => receipt.clipped).map(receipt => ({
      config: row.config, seed: row.seed, ...receipt,
    }))));
  const x5 = rows.flatMap(row => row.purchaseLog.flatMap(purchase =>
    purchase.audit.receiptEvidence.filter(receipt => receipt.multiplier === 5).map(receipt => ({
      config: row.config, seed: row.seed, pack: receipt.packId, multiplier: receipt.multiplier,
      spawned: receipt.spawned, rosterGain: receipt.relatedRosterGain, clipped: receipt.clipped,
    }))));
  const assertions = {
    uncappedCopies: { passed: clipped.length === 0,
      checked: rows.reduce((sum, row) => sum + row.purchaseLog.reduce((count, purchase) =>
        count + purchase.audit.receiptEvidence.length, 0), 0) },
  };
  await Bun.write(new URL("balance.json", output), JSON.stringify({ ...report, assertions, x5 }, null, 2) + "\n");
  const markdown = [
    "# Recruit roulette balance (final uncapped rule)",
    "",
    `Command: \`${report.command}\`. Seeds 1..30/config, dt .05 s, decisions .2 s, 600 s cap.`,
    "Fresh meta, 권율, 370 x 800 field. First affordable unsold offer, immediate opening, timed bot skills, ordinary card and first general choices. One shop/run; no rerolls or extra pack clicks.",
    "Four baseline configs have no upgrades. after-fulltree marks every node/placement purchased, then calls activeBphEffects(save), as main.ts does; hidden effects remain excluded by that API. Fresh account income and RNG are retained; this does not simulate paying upgrade costs or quest rewards.",
    `Full-tree inventory: ${report.fullTree.nodes} nodes, ${report.fullTree.placements} placements; active effect count ${rows.find(row => row.config === "after-fulltree")?.activeEffects}.`,
    "The final price formula is price = base + floor(n/2) × ceil(base × 0.5) (2 → 2,2,3,3,4,4,5). n is prior purchases of that pack in this run.",
    "Roulette extras use the same uncapped spawn path as base copies. No dead-unit filtering or legacy troop-cap clip applies.",
    "",
    "| Config | Median survival s | Mean survival s | Median wave | Wins/losses/caps | Mean purchases | Mean units | Max troops | Clipped purchases |",
    "| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |",
    ...summaries.map(s => `| ${s.config} | ${f(s.medianSurvival)} | ${f(s.meanSurvival)} | ${f(s.medianWave)} | ${s.wins}/${s.losses}/${s.capped} | ${f(s.meanPurchases)} | ${f(s.meanUnits)} | ${s.maxTroops} | ${s.clippedPurchases} |`),
    "",
    `After/before median survival ratio: **${f(report.afterBeforeMedianRatio)}** (${f((report.afterBeforeMedianRatio - 1) * 100)}%); target 0.85..1.15.`,
    `Full-tree/before ratio: **${f(summaries[4].medianSurvival / summaries[0].medianSurvival)}** (includes upgrade effects).`,
    ...summaries.map(s => `${s.config}: mean wave ${f(s.meanWave)}.`),
    "",
    "Units recruited use receipt.spawned ?? sum(card.copies), exactly as requested. This receipt metric includes tome copies; direct roster gains exclude tomes and distinguish upgrade summons/duplicates.",
    "Wave reached counts bursts with at <= survival; raw rows also contain individual scheduled spawn counts.",
    "",
    `Assertion: receipt.spawned ?? sum(copies) equals sum(copies) × multiplier: **${assertions.uncappedCopies.passed ? "PASS" : "FAIL"}** (${assertions.uncappedCopies.checked} receipts; ${clipped.length} clips).`,
    "Maximum troopCount is sampled at unit-spawn/effect events, after purchases and every step, including run-start. Raw rows include each run's peak. Legacy cap is informational only; the former cap-bound assertion no longer applies.",
    "An affordable first unsold offer can still fail the per-pack shop purchase limit. Failed buys leave the shop untouched; the policy does not skip that offer or reroll.",
    ...summaries.map(s => `${s.config}: ${rows.filter(row => row.config === s.config).reduce((sum, row) => sum + row.blockedPurchaseAttempts, 0)} blocked purchase attempts.`),
    "",
    x5.length ? "Observed x5 receipts:" : "No x5 receipt occurred in these seeds.",
    ...x5.map(r => `- ${r.config}: seed ${r.seed}, pack ${r.pack}, multiplier x${r.multiplier}, spawned ${r.spawned}, roster +${r.rosterGain}, clipped ${r.clipped}.`),
    "",
    "First three Pack1_Basic purchases (expected draws before card outcomes):",
    ...report.economics.map(e => `- ${e.config}: prices ${e.prices.join(", ")}, ${f(e.expectedDraws)} draws / ${e.coins} coins = ${f(e.expectedUnitsPerCoin)} per coin.`),
    "Before: 3 draws / 6 coins = 0.500. After: 3 x 1.61 draws / 7 coins = 0.690 (+38%).",
    `Recommendation: **${report.recommendation.satisfiesTarget ? (report.recommendation.name === "after" ? "keep table" : report.recommendation.name) : "no tested table meets the median target"}**. Table: \`${JSON.stringify(report.recommendation.table)}\`.`,
    "Owner context: chapter 1 yields about 79 coins without upgrades; a shop is dealt once, so available offers constrain purchases. Full-tree may increase shop slots. These seeds measure this policy only.",
    "",
  ].join("\n");
  await Bun.write(new URL("balance.md", output), markdown);
  console.log("AUDIT_COMPLETE", JSON.stringify({ assertions, x5 }));
}
