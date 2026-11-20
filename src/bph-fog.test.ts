import { expect, test } from "bun:test";
import { addBphProfile } from "./bph-combat";
import { createBphRun } from "./bph-session";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { freshMeta } from "./meta";
import { advance } from "./rules";
import type { Effect } from "./rules";

test("R1 combat and RNG reproduce across silent, ordinary and saturated visual output", () => {
  const snapshots = ["silent", "ordinary", "saturated"].map(mode => {
    const run = createBphRun(freshMeta(), { seed: 8128, general: "권율",
      upgrades: ["SN_BeastmasterAddBear", "SN_BeastmasterAddJaguar", "SN_BeastmasterAddMonkey"]
        .flatMap(id => BPH_UPGRADE_NODES[id].effects), startBattle: false });
    const output: Effect[] = [];
    if (!run.bph) throw new Error("Expected survival battle");
    if (mode === "saturated") {
      for (let i = 0; i < 2048; i++) run.bph.fxEvents.push({ kind: "hit", x: i, y: i, value: 0 });
    }

    addBphProfile(run, { profileId: "Hero5_Beastmaster", copies: 1, foil: false, discovered: false },
      { packId: "Pack1_Basic", resultId: 33, cause: "pack" });
    for (let i = 0; i < 120; i++) {
      output.push(...advance(run, 1 / 30));
      if (mode === "silent") {
        output.length = 0;
        run.bph.fxEvents.length = 0;
      }
    }

    expect(run.squads[0].soldiers.filter(unit => unit.bph?.cause === "summon")
      .map(unit => unit.bph?.profileId)).toEqual(["Hero_Bear", "Hero_Jaguar", "Hero_Monkey", "Hero_Rat"]);
    const { fxEvents, ...battle } = run.bph;
    return { ...run, bph: battle };
  });

  expect(snapshots[1]).toEqual(snapshots[0]);
  expect(snapshots[2]).toEqual(snapshots[0]);
});
