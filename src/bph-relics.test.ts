import { expect, test } from "bun:test";
import { grantBphRelic } from "./bph-account";
import { freshBphSave, parseBphSave } from "./bph-save";
import { bphRelicCards, bphRelicSlotView, takeBphRelicNotices, toggleBphRelic } from "./bph-relics";
import { activeBphEffects, BPH_PLACEMENTS, prepareBphUpgrades } from "./bph-upgrades";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";

test("a new account wears one relic, one slot swaps, and a gained slot holds a second until full", () => {
  const save = freshBphSave();
  for (const id of ["Relic1_Rapier", "Relic1_Club", "R_HeroMoveSpeed"]) grantBphRelic(save, id);
  expect(toggleBphRelic(save, "Relic1_Rapier")).toBe("equipped");
  expect(toggleBphRelic(save, "Relic1_Club")).toBe("equipped");
  expect(save.relicState.equipped).toEqual(["Relic1_Club"]);
  save.relicState.slots = 1;
  expect(toggleBphRelic(save, "Relic1_Rapier")).toBe("equipped");
  expect(toggleBphRelic(save, "R_HeroMoveSpeed")).toBe("full");
  expect(save.relicState.equipped).toEqual(["Relic1_Club", "Relic1_Rapier"]);
  expect(toggleBphRelic(save, "Relic1_Club")).toBe("unequipped");
  expect(save.relicState.equipped).toEqual(["Relic1_Rapier"]);
});
test("a save from before the relic tab opens one slot and loads its relic state unchanged", () => {
  const old = freshBphSave();
  grantBphRelic(old, "Relic1_Club");
  const loaded = parseBphSave(JSON.parse(JSON.stringify(old)));
  expect(loaded.relicState).toEqual(old.relicState);
  expect(bphRelicSlotView(loaded).open).toBe(1);
});
test("claiming a relic slot upgrade in battle moves one slot from locked to open", async () => {
  await prepareBphUpgrades();
  const meta = freshMeta(), save = freshBphSave(), before = bphRelicSlotView(save);
  const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === "SN_RelicSlotFoilium");
  if (!placement) throw new Error("missing relic slot upgrade");
  meta.bph = save; save.purchasedPlacements.push(placement.id);
  createBphRun(meta, { seed: 1593, general: "권율", upgrades: activeBphEffects(save) });
  expect(before.locked).toBeGreaterThan(0);
  expect(bphRelicSlotView(save)).toEqual({ open: before.open + 1, locked: before.locked - 1 });
});
test("each relic is announced once across a reload, and destroyed relics are never offered", () => {
  const save = freshBphSave();
  grantBphRelic(save, "Relic1_Club"); grantBphRelic(save, "R_ShockNeedle");
  expect(takeBphRelicNotices(save)).toEqual(["Relic1_Club", "R_ShockNeedle"]);
  expect(takeBphRelicNotices(save)).toEqual([]);
  const loaded = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(takeBphRelicNotices(loaded)).toEqual([]);
  grantBphRelic(loaded, "Relic1_Rapier"); loaded.relicState.destroyed.push("Relic1_Club");
  expect(takeBphRelicNotices(loaded)).toEqual(["Relic1_Rapier"]);
  expect(bphRelicCards(loaded).map(card => card.id)).toEqual(["R_ShockNeedle", "Relic1_Rapier"]);
});
