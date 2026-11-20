import { expect, test } from "bun:test";
import { bindBphConsumers, bphFxContext, bphRegisteredKinds } from "./bph-fx-dispatch";
import { createBphRun } from "./bph-session";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { freshMeta } from "./meta";
import { advance } from "./rules";

test.each([
  ["SN_BeastmasterAddBear", "BeastmasterAddTargetHeroToPool"],
  ["Mod_RiftUpgradeWaveSpeed", "WaveSpeedPerRiftUpgrades"],
])("%s delegates once without changing an unrelated chapter or hero", (nodeId, kind) => {
  const active = createBphRun(freshMeta(), { seed: 1593, general: "권율", upgrades: [] });
  const plain = createBphRun(freshMeta(), { seed: 1593, general: "권율", upgrades: [] });
  const enabled = bphFxContext(active), control = bphFxContext(plain);
  if (!enabled || !control) throw new Error("Expected production contexts");
  bindBphConsumers({ ...enabled, effects: BPH_UPGRADE_NODES[nodeId].effects });
  bindBphConsumers(control);
  enabled.spawnProfile("Hero1_Squire", 1);
  control.spawnProfile("Hero1_Squire", 1);

  advance(active, .1);
  advance(plain, .1);

  expect(bphRegisteredKinds().filter(type => type === kind)).toHaveLength(1);
  expect(active).toEqual(plain);
});
