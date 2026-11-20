import { expect, test } from "bun:test";
import { BPH_GENERALS } from "./bph-commanders";
import { addBphProfile } from "./bph-combat";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { choose, createRun, generalHp } from "./rules";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

test.each(BPH_GENERALS)("BPH %s starts with normalized HP while legacy HP is unchanged", general => {
  const run = createBphRun(freshMeta(), { seed: 7, general, upgrades: [] });
  const legacy = createRun(7, general);

  expect(run.squads[0].maxHp).toBeCloseTo(generalHp(general, 1) * BPH_SURVIVAL_TABLE.generalHpScale, 8);
  expect(run.squads[0].hp).toBe(run.squads[0].maxHp);
  expect(legacy.squads[0].maxHp).toBe(generalHp(general, 1));
});

test.each(["promote-권율", "awaken-권율"] as const)("%s retains normalized HP and existing damage", card => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  const squad = run.squads[0];
  squad.hp -= 2;
  run.phase = "choice"; run.offers = [card];

  choose(run, card);

  expect(squad.maxHp).toBeCloseTo(generalHp("권율", 1, 2) * BPH_SURVIVAL_TABLE.generalHpScale, 8);
  expect(squad.maxHp - squad.hp).toBeCloseTo(2, 8);
});

test("normalizing a general leaves original recruited profile HP intact", () => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });

  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic" });

  expect(run.squads[0].soldiers[0].maxHp).toBe(4);
});
