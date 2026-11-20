import { mkdir } from "node:fs/promises";
import { simulateSurvival } from "./survival-sim";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_DEFAULT_GRID, BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES } from "../src/bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "../src/bph-hidden-upgrades";
import { prepareBphUpgrades } from "../src/bph-upgrades";

const [folder, label = "before", upgrades = "none", seeds = "5"] = Bun.argv.slice(2);
await mkdir(folder, { recursive: true });
await prepareBphUpgrades();
const rows = [];
for (const chapter of [1, 4]) for (let seed = 1; seed <= Number(seeds); seed++) {
  const meta = freshMeta(), save = freshBphSave(seed);
  save.chapter = chapter - 1;
  if (upgrades === "full144") save.purchasedPlacements = BPH_UPGRADE_GRIDS.find(grid => grid.id === BPH_DEFAULT_GRID)!
    .placements.filter(p => p.nodeId && BPH_UPGRADE_NODES[p.nodeId]?.type === 0 && !BPH_HIDDEN_UPGRADES.has(p.nodeId)
      && p.prestigeLock === 0 && (BPH_UPGRADE_NODES[p.nodeId]?.values.prestigeLock ?? 0) === 0).map(p => p.id);
  const row = await simulateSurvival({ seed, chapter, general: "권율",
    state: "none", policy: "cursor0", account: { meta, save } });
  rows.push({ chapter, seed, upgrades, phase: row.phase, seconds: row.survival,
    castleFallTime: row.castleFallTime, kills: row.kills });
}
await Bun.write(`${folder}/${label}-balance.json`, JSON.stringify(rows, null, 2));
console.log("BALANCE_READY", JSON.stringify(rows));
