import * as current from "../src/rules";
import { freshMeta } from "../src/meta";
import { createBphRun } from "../src/bph-session";
import { setFieldSize } from "../src/geometry";
import type { Run } from "../src/rules";

const baseline = process.argv[2];
if (!baseline) throw new Error("Usage: bun scripts/palisade-invariance.ts BASELINE_ROOT");
const old: typeof current = await import(`${baseline}/src/rules.ts`);
const oldMeta: typeof import("../src/meta") = await import(`${baseline}/src/meta.ts`);
const oldSession: typeof import("../src/bph-session") = await import(`${baseline}/src/bph-session.ts`);
const oldGeometry: typeof import("../src/geometry") = await import(`${baseline}/src/geometry.ts`);
setFieldSize(390, 800);
oldGeometry.setFieldSize(390, 800);
let checkpoints = 0, rngChecks = 0;
const results: unknown[] = [];
for (const mode of ["legacy", "survival"] as const) for (const seed of [1, 42, 1593, 20261116]) {
  const before = mode === "legacy" ? old.createRun(seed)
    : oldSession.createBphRun(oldMeta.freshMeta(), { seed, general: "권율", upgrades: [] });
  const after = mode === "legacy" ? current.createRun(seed)
    : createBphRun(freshMeta(), { seed, general: "권율", upgrades: [] });
  const check = (tick: number) => {
    const left = JSON.stringify(before), right = JSON.stringify(after);
    if (left !== right) throw new Error(`Run bytes differ: ${mode} seed${seed} tick${tick}`);
    checkpoints++;
  };
  const tickRun = (rules: typeof current, run: Run, tick: number) => {
    const effects = rules.advance(run, 1 / 30);
    if (run.phase === "choice") effects.push(...rules.choose(run, rules.autoCard(run)));
    if (run.generalOffers.length && (run.phase === "general" || run.phase === "playing")) effects.push(...rules.chooseGeneral(run, run.generalOffers[0]));
    if (tick % 30 === 0) effects.push(...rules.useSkill(run, 0));
    return JSON.stringify(effects);
  };
  check(0);
  for (let tick = 1; tick <= 3600; tick++) {
    const left = tickRun(old, before, tick), right = tickRun(current, after, tick);
    if (left !== right) throw new Error(`Effects differ: ${mode} seed${seed} tick${tick}`);
    if (before.rng !== after.rng) throw new Error(`RNG differs: ${mode} seed${seed} tick${tick}`);
    rngChecks++;
    if (tick % 30 === 0) check(tick);
  }
  results.push({ mode, seed, phase: after.phase, time: after.time, rng: after.rng,
    bytes: JSON.stringify(after).length,
    sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(after)).digest("hex") });
}
console.log("PALISADE_INVARIANCE_PASS", JSON.stringify({ checkpoints, rngChecks, results }));
