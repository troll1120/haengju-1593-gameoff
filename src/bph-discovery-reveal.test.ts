import { expect, test } from "bun:test";
import { bphDiscoveryHolds, bphDiscoveryRay, bphDiscoveryStage, bphDiscoveryTag, BPH_DISCOVERY_HITS } from "./bph-discovery-reveal";
import type { BphDrawResult } from "./bph-contract";
import { freshBphSave, parseBphSave } from "./bph-save";
import { openBphPack } from "./bph";

type BphDrawCard = BphDrawResult["cards"][number];

const card = (over: Partial<BphDrawCard> = {}): BphDrawCard => ({ profileId: "Hero1_Squire", foil: false, copies: 1, discovered: false, ...over });
const draw = (over: Partial<BphDrawCard> = {}): BphDrawResult => ({
  id: 1, packId: "DeliveryBox", ordinal: 1, cards: [card(over)], frenzy: false, reason: "opening",
});

test("a first discovery or legacy unit/tome foil holds; a repeat plain pull shows immediately", () => {
  expect(bphDiscoveryHolds(draw({ discovered: true }))).toBe(true);
  expect(bphDiscoveryHolds(draw({ foil: true }))).toBe(true);
  expect(bphDiscoveryHolds(draw({ profileId: "Tome_Thunderstorm", foil: true }))).toBe(true);
  expect(bphDiscoveryHolds(draw())).toBe(false);
});

test("the card cracks open over exactly three hits, stacking one ray each", () => {
  expect(BPH_DISCOVERY_HITS).toBe(3);
  expect(bphDiscoveryStage(0)).toEqual({ hits: 0, rays: [], revealed: false });
  expect(bphDiscoveryStage(2).revealed).toBe(false);
  expect(bphDiscoveryStage(3).rays).toHaveLength(3);
  expect(bphDiscoveryStage(3).revealed).toBe(true);
  expect(bphDiscoveryStage(4).hits).toBe(3);
});

test("repeat unit and tome foils show immediately; first and legacy pending foils still crack", () => {
  for (const profileId of ["Hero1_Squire", "Tome_Thunderstorm"]) {
    expect(bphDiscoveryHolds(draw({ profileId, foil: true, foilDiscovered: false }))).toBe(false);
    expect(bphDiscoveryHolds(draw({ profileId, foil: true, foilDiscovered: true }))).toBe(true);
    expect(bphDiscoveryHolds(draw({ profileId, foil: true }))).toBe(true);
  }
  expect(bphDiscoveryHolds(draw({ discovered: true, foilDiscovered: false }))).toBe(true);
  expect(bphDiscoveryHolds(draw({ profileId: "Monster1_Caveling", foil: true, foilDiscovered: true }))).toBe(false);
});

test("draw snapshots foil discovery before ownership changes and preserves it across reloads", () => {
  const save = freshBphSave(7);
  save.packs.Pack1_Basic = { opened: 26, sinceNewHero: 0, sinceNewFoil: 0 };
  const first = openBphPack(save, { packId: "Pack1_Basic", effects: [] });
  expect(first.cards[0]).toMatchObject({ profileId: "Hero1_Squire", foil: true, foilDiscovered: true });
  expect(bphDiscoveryHolds(first)).toBe(true);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(restored.pendingResults[0].cards[0].foilDiscovered).toBe(true);
  restored.packs.Pack1_Basic = { opened: 0, sinceNewHero: 0, sinceNewFoil: 0 };
  const repeat = openBphPack(restored, { packId: "Pack1_Basic",
    effects: [{ nodeId: "test-foil", type: "OpenTargetPackFoilChance", value: 1,
      effectPower: 1, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: { targetPack: "Pack1_Basic" } }] });
  expect(repeat.cards[0]).toMatchObject({ profileId: "Hero1_Squire", foil: true, foilDiscovered: false });
  expect(bphDiscoveryHolds(repeat)).toBe(false);
  const next = parseBphSave(JSON.parse(JSON.stringify(restored)));
  expect(bphDiscoveryHolds(next.pendingResults[1])).toBe(false);
  const legacy = JSON.parse(JSON.stringify(save));
  delete legacy.pendingResults[0].cards[0].foilDiscovered;
  expect(bphDiscoveryHolds(parseBphSave(legacy).pendingResults[0])).toBe(true);
  expect(next.foils).toEqual(save.foils);
});

test("rays are card-scale still frames of the burst sheet, rainbow only on a foil", () => {
  const scales = [0, 1, 2].map(index => Number(/--ray:([\d.]+)/.exec(bphDiscoveryRay(index, false))?.[1]));
  expect(scales[0]).toBeGreaterThan(1);
  expect(scales[1]).toBeGreaterThan(scales[0]);
  expect(scales[2]).toBeGreaterThan(scales[1]);
  expect(scales[2]).toBeLessThan(2);
  expect(bphDiscoveryRay(0, true)).toContain('class="bph-discovery-ray r1 foil"');
  expect(bphDiscoveryRay(0, false)).toContain('class="bph-discovery-ray r1"');
});

test("a first discovery announces 새 발견!, an owned card's foil announces 무지개", () => {
  expect(bphDiscoveryTag(card({ discovered: true }))).toBe("새 발견!");
  expect(bphDiscoveryTag(card({ foil: true }))).toBe("무지개");
  expect(bphDiscoveryTag(card({ foil: true, discovered: true }))).toBe("새 발견!");
});
