import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { freshMeta } from "../src/meta";
import { createBphRun } from "../src/bph-session";
import { createBphShop } from "../src/bph-shop";
import { BPH_RECRUIT_TABLE, buyBphRecruit } from "../src/bph-recruit";
import { hitBphPack } from "../src/bph-combat";
import { advance } from "../src/rules";
import { CENTER, setFieldSize } from "../src/geometry";
import { simulateSurvival } from "./survival-sim";
import type { SurvivalRow } from "./survival-sim";

// Use this same script in both checkouts. The fixture never overrides a combat stat.
const [mode, directory, chapterArgument, seedArgument] = Bun.argv.slice(2);
assert(directory && (mode === "n0" || mode === "balance"), "usage: unit-range-regression.ts n0|balance OUTPUT");
const chapters = chapterArgument ? [Number(chapterArgument)] : [1, 2, 3, 4];
assert(chapters.every(chapter => Number.isInteger(chapter) && chapter >= 1 && chapter <= 4), "chapter must be 1..4");
const seeds = seedArgument ? [Number(seedArgument)] : Array.from({ length: 11 }, (_, index) => index + 1);
assert(seeds.every(seed => Number.isInteger(seed) && seed >= 1 && seed <= 11), "seed must be 1..11");
const output = resolve(directory);
await mkdir(output, { recursive: true });
if (mode === "n0") {
  setFieldSize(370, 800);
  const hashes: Record<string, string> = {};
  const summaries = [];
  for (let seed = 1; seed <= 12; seed++) {
    const run = createBphRun(freshMeta(), { seed, general: "권율", upgrades: [] });
    const battle = run.bph;
    assert(battle);
    const shop = createBphShop(battle.save, battle.upgrades);
    for (let tick = 0; tick < 20; tick++) advance(run, .05);
    const pack = buyBphRecruit(run, shop, 0, {
      multiplier: [{ count: 1, weight: 1 }], price: BPH_RECRUIT_TABLE.price,
    });
    assert(pack);
    battle.packs.push({ ...pack, hp: 1, x: CENTER.x, y: CENTER.y + 70 });
    hitBphPack(run, pack.id);
    for (let tick = 0; tick < 600; tick++) advance(run, .05);
    const bytes = JSON.stringify({ ...run, bph: { ...run.bph, bought: undefined } });
    hashes[seed] = createHash("sha256").update(bytes).digest("hex");
    summaries.push({ seed, time: run.time, kills: run.kills, rng: run.rng,
      units: run.squads.flatMap(squad => squad.soldiers.map(unit => ({
        id: unit.id, profile: unit.bph?.profileId, x: unit.x, y: unit.y, hp: unit.hp,
      }))) });
    await Bun.write(resolve(output, `n0-${seed}.json`), bytes + "\n");
  }
  await Bun.write(resolve(output, "n0-hashes.json"), JSON.stringify(hashes, null, 2) + "\n");
  await Bun.write(resolve(output, "n0-summary.json"), JSON.stringify(summaries, null, 2) + "\n");
} else {
  const rows: SurvivalRow[] = [];
  for (const chapter of chapters) {
    for (const seed of seeds) {
      const destination = resolve(output, `c${chapter}-${seed}.json`);
      // Each output directory belongs to one immutable source checkout. This lets
      // a resource-limited run resume completed seeds without simulating them twice.
      if (await Bun.file(destination).exists()) {
        const cached: SurvivalRow = await Bun.file(destination).json();
        assert(cached.chapter === chapter && cached.seed === seed && cached.general === "권율"
          && cached.state === "full163" && cached.policy === "active2Hz", "cached scenario mismatch");
        rows.push(cached);
        continue;
      }
      const row = await simulateSurvival({
        chapter, seed, general: "권율", state: "full163", policy: "active2Hz",
      });
      rows.push(row);
      await Bun.write(destination, JSON.stringify(row) + "\n");
    }
  }
  const summaries = chapters.map(chapter => {
    const group = rows.filter(row => row.chapter === chapter);
    const seconds = group.map(row => row.survival).sort((a, b) => a - b);
    return { chapter, seeds: group.length, wins: group.filter(row => row.phase === "won").length,
      medianSeconds: seconds[Math.floor(seconds.length / 2)], meanSeconds: seconds.reduce((sum, value) => sum + value, 0) / group.length,
      meanKills: group.reduce((sum, row) => sum + row.kills, 0) / group.length,
      generalFalls: group.reduce((sum, row) => sum + row.generalFalls, 0) };
  });
  const suffix = chapterArgument ? `-c${chapterArgument}${seedArgument ? `-s${seedArgument}` : ""}` : "";
  await Bun.write(resolve(output, `balance${suffix}.json`), JSON.stringify({
    policy: "권율/full163/active2Hz; seeds 1..11; production 600s deadline; no combat overrides",
    summaries, rows,
  }, null, 2) + "\n");
}
console.log(`RANGE_REGRESSION_DONE mode=${mode} output=${output}`);
