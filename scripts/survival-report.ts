import { strict as assert } from "node:assert";
import { parseArgs } from "node:util";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { BPH_GENERALS } from "../src/bph-commanders";
import { BPH_SURVIVAL_TABLE } from "../src/bph-survival-data";
import { SURVIVAL_STATES } from "./survival-fixtures";
import { SURVIVAL_POLICIES } from "./survival-sim";
import type { simulateSurvival, SurvivalRow, SURVIVAL_POLICY } from "./survival-sim";

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export async function runSurvivalCli(simulate: typeof simulateSurvival, policyDescription: typeof SURVIVAL_POLICY): Promise<void> {
  const { values } = parseArgs({ options: {
    outputdir: { type: "string" }, chapter: { type: "string", default: "1" },
    general: { type: "string", default: "권율" }, policy: { type: "string", default: "cursor0" },
    state: { type: "string" }, taps: { type: "string", default: "timely" },
    telemetry: { type: "boolean" },
  }, strict: true });
  const taps = values.taps;
  assert(taps === "timely" || taps === "never", "--taps must be timely or never");
  assert(values.outputdir, "--outputdir is required");
  const general = BPH_GENERALS.find(name => name === values.general);
  assert(general, "unknown --general");
  const policy = SURVIVAL_POLICIES.find(name => name === values.policy);
  assert(policy, `--policy must be one of ${SURVIVAL_POLICIES.join(", ")}`);
  const duration = BPH_SURVIVAL_TABLE.duration;
  const states = values.state ? SURVIVAL_STATES.filter(state => state === values.state) : SURVIVAL_STATES;
  assert(states.length, "unknown --state");
  const chapter = Number(values.chapter);
  assert(Number.isInteger(chapter) && chapter >= 1 && chapter <= 4, "--chapter must be 1..4");
  const directory = resolve(values.outputdir);
  await mkdir(directory, { recursive: true });
  const rows: SurvivalRow[] = [];
  for (const state of states) {
    for (let seed = 1; seed <= 30; seed++) {
      const row = await simulate({ seed, chapter, general, state, policy, taps, telemetry: values.telemetry === true });
      rows.push(row);
      // Preserve completed work even when a later cohort is interrupted.
      await Bun.write(resolve(directory, `${state}-${seed}.json`), JSON.stringify(row) + "\n");
    }
    console.log(`STATE_COMPLETE state=${state} rows=${rows.length}`);
  }
  const summaries = states.map(state => {
    const group = rows.filter(row => row.state === state);
    return { state, n: group.length, won: group.filter(row => row.phase === "won").length,
      lost: group.filter(row => row.phase === "lost").length, capped: group.filter(row => row.capped).length,
      medianSurvival: median(group.map(row => row.survival)),
      medianCastleFallAmongLosses: median(group.flatMap(row => row.castleFallTime === null ? [] : [row.castleFallTime])),
      generalFalls: group.reduce((sum, row) => sum + row.generalFalls, 0),
      runsWithGeneralFalls: group.filter(row => row.generalFalls > 0).length,
      meanSurvival: group.reduce((sum, row) => sum + row.survival, 0) / group.length };
  });
  await Bun.write(resolve(directory, "survival.json"), JSON.stringify({ policy: policyDescription, summaries, rows }, null, 2) + "\n");
  const columns = ["state", "seed", "chapter", "general", "policy", "survival", "phase", "capped", "castleFallTime",
    "generalFalls", "firstGeneralFall", "kills", "totalSpawned", "peakAlive", "purchases"] as const;
  const csv = [columns.join(","), ...rows.map(row => columns.map(key => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
  await Bun.write(resolve(directory, "survival.csv"), csv + "\n");
  await Bun.write(resolve(directory, "survival.md"), [
    "# Survival simulation", "", `Chapter ${chapter}, ${general}, ${policy}, portrait taps ${taps}, production duration ${duration}s; seeds 1..30/state.`,
    policyDescription.actions, policyDescription.targeting, policyDescription.settlement,
    "FULL218 is diagnostic. full144 excludes future74. Typical22 is synthetic progression, not telemetry.",
    "Unattributed direct income is retained explicitly; it is never silently assigned to combat or discovery.",
    "Castle-fall median includes losses only; wins remain right-censored at the deadline.",
    "totalSpawned counts unique troop identities, including summons. peakAlive counts living troops, excluding generals.",
    "", "| State | Runs | Won | Lost | Capped | Median seconds | Castle-fall median | General falls | Runs with falls |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...summaries.map(s => `| ${s.state} | ${s.n} | ${s.won} | ${s.lost} | ${s.capped} | ${s.medianSurvival?.toFixed(3) ?? "-"} | ${s.medianCastleFallAmongLosses?.toFixed(3) ?? "-"} | ${s.generalFalls} | ${s.runsWithGeneralFalls} |`), "",
  ].join("\n"));
  console.log(`RESULT_READY rows=${rows.length} outputdir=${directory}`);
}
