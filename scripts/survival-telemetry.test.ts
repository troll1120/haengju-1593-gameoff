import { expect, test } from "bun:test";
import { freshMeta } from "../src/meta";
import { createBphRun } from "../src/bph-session";
import { simulateSurvival } from "./survival-sim";
import { survivalTelemetry } from "./survival-telemetry";

test("optional telemetry preserves replay bytes and partitions actual kills", async () => {
  const options = { seed: 7, chapter: 1, general: "권율", state: "typical", policy: "active2Hz", capSeconds: 90 } as const;
  const baseline = await simulateSurvival(options);
  const { telemetry, ...observed } = await simulateSurvival({ ...options, telemetry: true });
  expect(JSON.stringify(observed)).toBe(JSON.stringify(baseline));
  if (!telemetry) throw new TypeError("Missing opt-in telemetry");
  const { bySource, enemyHpLost, kills } = telemetry.combat;
  expect(bySource.generalAttack.hp).toBeGreaterThan(0);
  expect(bySource.cursor.hp).toBeGreaterThan(0);
  expect(Object.values(bySource).reduce((sum, source) => sum + source.hp, 0)).toBeCloseTo(enemyHpLost, 6);
  expect(Object.values(bySource).reduce((sum, source) => sum + source.kills, 0)).toBe(kills);
  expect(kills).toBe(baseline.kills);
  expect(telemetry.generalCheckpoints).toEqual([]);
});

test("a win within float tolerance of 900 seconds reaches the last checkpoint", () => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  const telemetry = survivalTelemetry(run);
  telemetry.sample();
  for (const time of [180, 300, 600]) {
    run.time = time;
    telemetry.sample();
  }
  run.time = 900 - 1e-8;
  run.phase = "won";
  telemetry.sample();
  expect(telemetry.result().generalCheckpoints.map(snapshot => snapshot.checkpoint)).toEqual([180, 300, 600, 900]);
  expect(telemetry.result().generalCheckpoints.at(-1)?.lead).toMatchObject({ general: "권율", joinedAt: 0 });
});
