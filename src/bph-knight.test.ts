import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { addBphProfile } from "./bph-combat";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { createBphRun } from "./bph-session";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { freshMeta } from "./meta";
import { createRun } from "./rules";

function battle(upgrades: readonly BphEffect[] = []) {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades });
  addBphProfile(run, { profileId: "Hero2_Knight", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic", position: { x: 70, y: 100 } });
  const unit = run.squads[0].soldiers[0];
  const target = { ...createRun(4).enemies[0], id: run.nextId++, x: 90, y: 100,
    hp: 100, maxHp: 100, speed: 0, clock: 1000, shielded: false, stun: 0 };
  run.enemies = [target];
  const context = bphFxContext(run);
  if (!context) throw new RangeError("Expected a production battle context");
  return { run, unit, target, context };
}

test.each([false, true])("Knight never stuns periodically without a block, unlock=%s", unlocked => {
  const { run, target } = battle(unlocked ? BPH_UPGRADE_NODES["SN_PaladinAbility 1"].effects : []);
  run.time = 2;

  dispatchBphEffects(run, { kind: "step", dt: 2 });

  expect(target.stun).toBe(0);
});

test("Knight's unlocked shield bash fires only after a fully blocked hit", () => {
  const { run, unit, target, context } = battle(BPH_UPGRADE_NODES["SN_PaladinAbility 1"].effects);

  dispatchBphEffects(run, { kind: "damage-dealt", side: "ally", target: unit,
    source: target, attempted: 3, blocked: 3, dealt: 0, overkill: 0, critical: false });
  dispatchBphEffects(run, { kind: "step", dt: 0 });

  expect(target.stun).toBe(1.5);
  expect(context.state.spells).toHaveLength(0);
});
