import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { addBphProfile } from "./bph-combat";
import { bphFxContext } from "./bph-fx-dispatch";
import { rollBphKillCoin } from "./bph-coins";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

test("coin pity lowers chance after each coin and caps each hero independently", () => {
  const run = createBphRun(freshMeta(), { seed: 1, general: "권율", upgrades: [] });
  addBphProfile(run, { profileId: "Hero4_Duelist", copies: 2, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  const native = bphFxContext(run);
  if (!native) throw new Error("Missing BPH context");
  const context = { ...native, random: () => 0 };
  const [first, second] = run.squads[0].soldiers;
  const before = run.gold;
  for (let i = 0; i < 5; i++) rollBphKillCoin(context, first, .25);
  expect(run.gold - before).toBe(2);
  // The per-hero pity cap is independent of the shared time budget. Allow one token per attempt.
  for (let i = 0; i < 100; i++) {
    run.time += 1 / BPH_SURVIVAL_TABLE.killCoins.perSecond;
    rollBphKillCoin(context, first, .25);
  }
  expect(run.gold - before).toBe(5);
  rollBphKillCoin(context, second, .25);
  expect(run.gold - before).toBe(6);
});

test("a zero base chance never rolls or earns a coin", () => {
  const run = createBphRun(freshMeta(), { seed: 1, general: "권율", upgrades: [] });
  const native = bphFxContext(run);
  if (!native) throw new Error("Missing BPH context");
  const before = run.gold;
  const context = { ...native, random: () => { throw new Error("Unexpected roll"); } };
  rollBphKillCoin(context, run.squads[0], 0);
  expect(run.gold).toBe(before);
});
