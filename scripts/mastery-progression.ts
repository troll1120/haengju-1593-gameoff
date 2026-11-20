import type { BphSave } from "../src/bph-contract";
import { BPH_PROFILES, BPH_TOMES } from "../src/bph-data";
import { freshBphSave } from "../src/bph-save";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, bphNodeCost, bphPlacementIsUpgrade,
  buyBphNode, canBuyBphNode } from "../src/bph-upgrades";

const candidates = [...BPH_PLACEMENTS.values()].flatMap(placement => {
  const node = placement.nodeId ? BPH_UPGRADE_NODES[placement.nodeId] : undefined;
  return node && [0, 4, 6, 9].includes(node.type) ? [{ placement, node }] : [];
});

function purchasePath(save: BphSave, prioritizeGold = false) {
  const openingBalance = save.resources.mastery;
  let gross = 0, medalsNeeded = 0;
  const ranks = [];
  for (;;) {
    const next = candidates.filter(({ placement }) => canBuyBphNode(save, placement.id))
      .map(({ placement, node }) => ({
        placement, node, price: bphNodeCost(save, node, "mastery"),
        priority: prioritizeGold && node.source === "haengju:gold-economy" ? 0 : 1,
      }))
      .sort((a, b) => a.priority - b.priority || a.price - b.price ||
        a.placement.id.localeCompare(b.placement.id))[0];
    if (!next) break;
    medalsNeeded = Math.max(medalsNeeded, openingBalance - save.resources.mastery + next.price);
    if (!buyBphNode(save, next.placement.id)) throw new RangeError(next.placement.id);
    gross += next.price;
    if (bphPlacementIsUpgrade(next.placement.id)) ranks.push({
      nodeId: next.node.id, price: next.price, gross,
      credits: gross - (openingBalance - save.resources.mastery),
      net: openingBalance - save.resources.mastery, medalsNeeded,
    });
  }
  return { ranks, gross, credits: gross - (openingBalance - save.resources.mastery),
    net: openingBalance - save.resources.mastery, medalsNeeded };
}

export function measureMasteryProgression(firstRunMedals = 150, typicalRunMedals = 220) {
  if (!Number.isSafeInteger(firstRunMedals) || firstRunMedals < 0 ||
    !Number.isSafeInteger(typicalRunMedals) || typicalRunMedals <= 0) throw new RangeError("Invalid medal payouts");

  const starter = freshBphSave();
  starter.resources.mastery = firstRunMedals;
  const firstRun = purchasePath(starter);

  // Seed observations and resources other than mastery to isolate prices. The live purchase
  // checks still enforce connectors, unsupported quests, and which gates open after purchases.
  const progressed = freshBphSave();
  for (const resource of Object.keys(progressed.resources)) Object.assign(progressed.resources, { [resource]: 1e9 });
  progressed.discovered = [...Object.keys(BPH_PROFILES), ...Object.keys(BPH_TOMES)];
  for (const { placement, node } of candidates) {
    const threshold = node.thresholds.at(-1);
    if (threshold !== undefined) progressed.questProgress[placement.id] = threshold;
    if (node.refs.requiredPack) progressed.packs[node.refs.requiredPack] = {
      opened: 1, sinceNewHero: 0, sinceNewFoil: 0,
    };
  }
  const full = purchasePath(progressed, true);
  const runs = (medals: number) => 1 + Math.ceil(Math.max(0, medals - firstRunMedals) / typicalRunMedals);
  const milestones = [...new Set([50, Math.ceil(full.ranks.length / 2), 100, full.ranks.length])]
    .sort((a, b) => a - b).flatMap(count => {
      const rank = full.ranks[count - 1];
      if (!rank) return [];
      const cost = count === full.ranks.length ? full : rank;
      return [{ count, gross: cost.gross, credits: cost.credits, net: cost.net,
        medalsNeeded: cost.medalsNeeded, runs: runs(cost.medalsNeeded) }];
    });
  return { firstRunMedals, typicalRunMedals, firstRunRanks: firstRun.ranks, reachableRanks: full.ranks.length, milestones };
}

if (import.meta.main) {
  const [first, typical] = Bun.argv.slice(2);
  console.log(JSON.stringify(measureMasteryProgression(first === undefined ? undefined : Number(first),
    typical === undefined ? undefined : Number(typical)), null, 2));
}
