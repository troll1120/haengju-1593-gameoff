import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { SurvivalOptions } from "./survival-sim";

const [source, output, seedText = "1", capText = "600.1"] = Bun.argv.slice(2);
if (!source || !output) throw new TypeError("Usage: profile-survival.ts SOURCE OUTPUT SEED CAP");
const options: SurvivalOptions = {
  seed: Number(seedText), chapter: 1, general: "권율", state: "typical", policy: "cursor0", capSeconds: Number(capText),
};
const simulation: typeof import("./survival-sim") = await import(resolve(source, "scripts/survival-sim.ts"));
const started = performance.now(), cpu = process.cpuUsage();
const row = await simulation.simulateSurvival(options);
const bytes = JSON.stringify(row), elapsed = (performance.now() - started) / 1000;
await mkdir(output, { recursive: true });
await Bun.write(resolve(output, `seed-${options.seed}.json`), bytes + "\n");
const measurement = {
  source, options, elapsed, cpu: process.cpuUsage(cpu), hash: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
  phase: row.phase, survival: row.survival, kills: row.kills, maxEnemies: row.maxEnemies,
  totalSpawned: "totalSpawned" in row ? row.totalSpawned : null,
  peakAlive: "peakAlive" in row ? row.peakAlive : null,
};
await Bun.write(resolve(output, `seed-${options.seed}-timing.json`), JSON.stringify(measurement, null, 2) + "\n");
console.log("PROFILE_RESULT", JSON.stringify(measurement));
