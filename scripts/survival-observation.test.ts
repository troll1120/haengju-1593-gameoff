import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { simulateSurvival } from "./survival-sim";
import { observeSurvival } from "./survival-observation";
import { createBphRun } from "../src/bph-session";
import { addBphProfile } from "../src/bph-combat";
import { freshMeta } from "../src/meta";
import type { SurvivalState } from "./survival-fixtures";

// Recorded on 80261f7 before optional observation existed, with the options below. none and typical
// re-recorded when recruited troops began entering at the reveal stop (BPH_ARRIVAL, owner DM 1794884349);
// with hitBphPack(..., "now") the simulator still reproduces 490bc429… and 278bf6f4… exactly.
const disabledBaseline: Readonly<Record<Exclude<SurvivalState, "full143" | "full163">, string>> = {
  none: "78a2ecbf24c7cdf2d181e6659690c0291f0253e4cacdaafb610090f7dc9f6154",
  typical: "e23823edc7ece40b244d33389ad0990bd9122b461bdb08ebc22c66324f047a56",
  full144: "a61ca6f616934b564bb8d3a938933276477b09e49e2879642ff1be12694a6004",
  FULL218: "e109505f0223ead42ad081a9fc1592fd9f18b73e1c2a8cd80c5e803909eaf2b3",
};
test.each(["none", "typical", "full144", "FULL218"] as const)("%s sampling preserves the pre-observation default bytes and outcomes", async state => {
  const options = { seed: 7, chapter: 1, general: "권율", state, policy: "cursor0", capSeconds: 3 } as const;

  const disabled = await simulateSurvival(options);
  const { timeSeries, ...sampled } = await simulateSurvival({ ...options, sampleEvery: .5 });

  // The separately approved metrics revision renames the historical retained
  // roster count and adds peakAlive. These short fixtures remove no roster IDs.
  // The field-crate logs (crateTaps, crateMissed) came later; these 3 s cursor0 runs tap and miss none.
  // skillTaps (portrait-tap events, owner DM 1794902302.558399) is a later readout; the default timely taps are the old actions.
  // strikeTaps (tap-strike volleys) is a later readout too; cursor0 never taps the field.
  const previousShape = Object.fromEntries(Object.entries(disabled).flatMap(([key, value]) =>
    ["peakAlive", "crateTaps", "crateMissed", "skillTaps", "strikeTaps"].includes(key) ? [] : [[key === "totalSpawned" ? "maxTroops" : key, value]]));
  expect([disabled.crateTaps, disabled.crateMissed]).toEqual([[], 0]);
  expect(createHash("sha256").update(JSON.stringify(previousShape)).digest("hex")).toBe(disabledBaseline[state]);
  expect(sampled).toEqual(disabled);
  expect(timeSeries).toHaveLength(7);
  for (const [index, sample] of (timeSeries ?? []).entries()) expect(sample.time).toBeCloseTo(index * .5, 8);
});
test("EHP separates immortal units and DPS excludes cooldown-zero profiles", () => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [{
    nodeId: "observation-shield", type: "HeroDamageReduction", value: 1, effectPower: 0,
    effectPowerScale: 0, stackCap: 0, countStep: 0, targets: { targetHero: "Hero1_Squire" },
  }] });
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  addBphProfile(run, { profileId: "Hero3_Illusionist", copies: 1, foil: false, discovered: false }, { packId: "Pack3_Magic" });

  const sample = observeSurvival(run, 2);

  expect(sample.infiniteEhpUnits).toBe(1);
  expect(Number.isFinite(sample.finiteEhp)).toBe(true);
  expect(Number.isFinite(sample.baseAttackDps)).toBe(true);
  expect(sample.baseAttackDps).toBeCloseTo(1 / .8999999761581421, 8);
  expect(sample.generals[0].maxHp).toBe(run.squads[0].maxHp);
  expect(sample.cumulativeRecruits).toBe(2);
});
test("dead bodies contribute neither living unit count, DPS nor EHP", () => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 2, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  run.squads[0].soldiers[0].hp = 0;

  const sample = observeSurvival(run, 2);

  expect(sample.unitCount).toBe(1);
  expect(sample.finiteEhp).toBe(4);
  expect(sample.baseAttackDps).toBeCloseTo(1 / .8999999761581421, 8);
});
