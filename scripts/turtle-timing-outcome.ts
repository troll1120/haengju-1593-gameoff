// Compare serialized simulation state AND effect streams, not just final score.
import { createHash } from "node:crypto";
import { createBphRun } from "../src/bph-session";
import { chaosState } from "../src/chaos-state";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { advance, useSkill } from "../src/rules";
import { setFieldSize } from "../src/geometry";
import { simulateSurvival } from "./survival-sim";

setFieldSize(370, 800);
const traces = [];
for (const seed of [1, 7, 1593]) for (const legacy of [false, true]) {
  const run = createBphRun(freshMeta(), { seed, general: "이순신", upgrades: [] });
  if (legacy) chaosState(run)!.level = 0;
  const hash = createHash("sha256");
  let hits = 0, deaths = 0;
  for (let tick = 0; tick < 90 * 30 && run.phase === "playing"; tick++) {
    const effects = [...(tick % 360 === 0 ? useSkill(run, 0) : []), ...advance(run, 1 / 30)];
    hits += effects.filter(effect => effect.kind === "hit").length;
    deaths += effects.filter(effect => effect.kind === "kill").length;
    hash.update(JSON.stringify({ run, effects }));
  }
  traces.push({ seed, legacy, hash: hash.digest("hex"), time: run.time, phase: run.phase,
    rng: run.rng, kills: run.kills, hits, deaths, xp: run.chaos?.xp, metrics: run.metrics });
}
const rounds = [];
for (const seed of [1, 7, 1593])
  rounds.push(await simulateSurvival({ seed, chapter: 1, general: "이순신", state: "none", policy: "active2Hz",
    account: { meta: freshMeta(), save: freshBphSave(seed) } }));
const result = { traces, rounds };
await Bun.write(Bun.argv[2], JSON.stringify(result, null, 2));
if (Bun.argv[3]) {
  const baseline = await Bun.file(Bun.argv[3]).json();
  // The original probe called the caller-supplied fresh account "RAW0"; the typed fixture name is "none".
  const judged = (value: typeof result) => ({ ...value, rounds: value.rounds.map(row => ({ ...row, state: "none" })) });
  if (JSON.stringify(judged(baseline)) !== JSON.stringify(judged(result))) throw new Error("TURTLE_OUTCOME_CHANGED");
}
console.log("TURTLE_OUTCOME_OK", JSON.stringify({
  traces: traces.map(({ seed, legacy, hash, hits, deaths }) => ({ seed, legacy, hash, hits, deaths })),
  rounds: rounds.map(({ seed, phase, survival, kills, capped }) => ({ seed, phase, survival, kills, capped })),
}));
