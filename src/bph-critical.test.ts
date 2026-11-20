import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { addBphProfile } from "./bph-combat";
import { createBphRun } from "./bph-session";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { freshMeta } from "./meta";
import { advance, createRun } from "./rules";

function battle(profileId: string, upgrades: readonly BphEffect[] = []) {
  // Kim has no archer follow-up, so this isolates the weapon's own critical damage.
  const run = createBphRun(freshMeta(), { seed: 144, general: "김시민", upgrades });
  addBphProfile(run, { profileId, copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic", position: { x: 70, y: 100 } });
  const unit = run.squads[0].soldiers[0];
  const target = { ...createRun(4).enemies[0], id: run.nextId++, x: 90, y: 100,
    hp: 100, maxHp: 100, speed: 0, clock: 1000, shielded: false, stun: 0 };
  run.enemies = [target];
  run.squads[0].clock = 1000;
  return { run, unit, target };
}

test.each([0, .5])("Demon Slayer critical arrows retain base damage with bonus %s", bonus => {
  const crit: BphEffect = { nodeId: "critical-fixture", type: "HeroCritChance", value: 1,
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
    targets: { targetHero: "Hero3_DemonSlayer" } };
  const upgrades = bonus ? [crit, ...BPH_UPGRADE_NODES.SN_ThiefCritDmg.effects] : [crit];
  const { run, unit, target } = battle("Hero3_DemonSlayer", upgrades);
  unit.strikeAt = .001; unit.aim = target.id; unit.clock = 1000;

  for (let frame = 0; frame < 10; frame++) advance(run, .05);

  expect(target.hp).toBeCloseTo(100 - 5 * (2 + bonus), 8);
});

