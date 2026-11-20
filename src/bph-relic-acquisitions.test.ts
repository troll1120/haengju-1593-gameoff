import { expect, test } from "bun:test";
import { claimBphRelic, enterBphImprovements, takeBphRelicAcquisitions } from "./bph-account";
import { BPH_CODEX_CLASS_REWARDS, discoverBphCodex } from "./bph-codex-rewards";
import type { BphEffect } from "./bph-contract";
import { openBphPack } from "./bph";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphRun, ensureBphSave } from "./bph-session";
import { freshMeta } from "./meta";

test("a Basic pack unlocks the spearman relic and only its first claim reports ownership", () => {
  const save = freshBphSave();

  openBphPack(save, { packId: "Pack1_Basic", effects: [] });

  const id = BPH_CODEX_CLASS_REWARDS.spearman;
  expect(save.relicState.discovered).toContain(id);
  expect(save.relicState.owned).not.toContain(id);
  expect(takeBphRelicAcquisitions(save)).toEqual([]);
  expect(claimBphRelic(save, id)).toBe(true);
  expect(save.relicState.owned).toContain(id);
  expect(takeBphRelicAcquisitions(save)).toEqual([{ relicId: id }]);
  discoverBphCodex(save, "Hero1_Squire");
  expect(claimBphRelic(save, id)).toBe(false);
  expect(takeBphRelicAcquisitions(save)).toEqual([]);
});

test("a battle upgrade unlocks the relic and reports it only on claim", () => {
  const meta = freshMeta(), save = ensureBphSave(meta);
  const upgrade: BphEffect = { type: "DiscoverTargetRelic", value: 1, nodeId: "test-relic",
    effectPower: 1, effectPowerScale: 1, stackCap: 1, countStep: 1,
    targets: { targetRelic: "R_ShockNeedle" } };
  const entry = { seed: 1593, general: "권율", upgrades: [upgrade] } as const;
  createBphRun(meta, { ...entry, startBattle: false });
  expect(takeBphRelicAcquisitions(save)).toEqual([]);

  enterBphImprovements(save);
  createBphRun(meta, entry);

  expect(save.relicState.discovered).toContain("R_ShockNeedle");
  expect(save.relicState.owned).not.toContain("R_ShockNeedle");
  expect(takeBphRelicAcquisitions(save)).toEqual([]);
  expect(claimBphRelic(save, "R_ShockNeedle")).toBe(true);
  expect(save.relicState.owned).toContain("R_ShockNeedle");
  expect(takeBphRelicAcquisitions(save)).toEqual([{ relicId: "R_ShockNeedle" }]);
  expect(takeBphRelicAcquisitions(save)).toEqual([]);
});

test("loading a legacy discovery makes its relic claimable without reporting ownership", () => {
  const legacy = freshBphSave();
  legacy.discovered.push("Hero1_Squire");

  const loaded = parseBphSave(legacy);

  const id = BPH_CODEX_CLASS_REWARDS.spearman;
  expect(loaded.relicState.discovered).toContain(id);
  expect(loaded.relicState.owned).not.toContain(id);
  expect(takeBphRelicAcquisitions(loaded)).toEqual([]);
  expect(claimBphRelic(loaded, id)).toBe(true);
  expect(takeBphRelicAcquisitions(loaded)).toEqual([{ relicId: id }]);
  expect(takeBphRelicAcquisitions(parseBphSave(loaded))).toEqual([]);
});
