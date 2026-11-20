import { expect, test } from "bun:test";
import { freshBphSave, parseBphSave } from "./bph-save";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { bphGoldUpgradeEffects } from "./bph-upgrade-gold";
import { upgradeDescription, upgradeName, upgradeRank } from "./bph-upgrade-presentation";
import { activeBphEffects, BPH_PLACEMENTS, BPH_UPGRADE_NODES, buyBphNode, visibleBphPlacements } from "./bph-upgrades";
import { language, setLanguage } from "./i18n";

const tile = (x: number, y: number) => `${BPH_DEFAULT_GRID}:${x}:${y}`;
const castle = tile(23, 15);
const gain = [tile(24, 14), tile(24, 13), tile(24, 12)];
const pouch = [tile(25, 17), tile(25, 18)];

test("gold branches reveal from the castle and ranks must be bought in order", () => {
  const save = freshBphSave();
  save.resources.mastery = 300;
  expect(buyBphNode(save, gain[0])).toBe(false);
  expect(buyBphNode(save, castle)).toBe(true);
  const visible = visibleBphPlacements(save, BPH_DEFAULT_GRID).map(p => p.id);
  expect([...gain, ...pouch].filter(id => visible.includes(id))).toEqual([gain[0], pouch[0]]);
  expect(buyBphNode(save, gain[2])).toBe(false);
  expect(buyBphNode(save, pouch[1])).toBe(false);

  for (const id of [...gain, ...pouch]) expect(buyBphNode(save, id)).toBe(true);
  expect(buyBphNode(save, gain[0])).toBe(false);
  expect(save.resources.mastery).toBe(114);
  expect(bphGoldUpgradeEffects(activeBphEffects(save))).toEqual({
    goldGainMultiplier: 1.6, goldPouchSpawnChanceMultiplier: 2,
  });
});

test("a version-one save keeps old purchases and round-trips the new ranks through placement IDs", () => {
  const legacy = parseBphSave({
    version: 1, resources: { mastery: 14400 }, purchasedPlacements: [castle], purchasedNodes: ["SN_TowerHP"],
  });
  expect(legacy.purchasedPlacements).toEqual([castle]);
  expect(bphGoldUpgradeEffects(activeBphEffects(legacy))).toEqual({
    goldGainMultiplier: 1, goldPouchSpawnChanceMultiplier: 1,
  });
  expect(buyBphNode(legacy, gain[0])).toBe(true);
  expect(buyBphNode(legacy, pouch[0])).toBe(true);

  const restored = parseBphSave(JSON.parse(JSON.stringify(legacy)));
  expect(restored.purchasedPlacements).toEqual([castle, gain[0], pouch[0]]);
  expect(restored.resources.mastery).toBe(75);
  expect(bphGoldUpgradeEffects(activeBphEffects(restored))).toEqual({
    goldGainMultiplier: 1.2, goldPouchSpawnChanceMultiplier: 1.5,
  });
});

test.each([
  [gain[0], 3, "금화 획득 증가", "Increased Gold Gain", "20%"],
  [pouch[0], 2, "금화 주머니 적 출현 증가", "Increased Gold Pouch Enemy Spawn Chance", "50%"],
] as const)("the web presents a localized title, effect and rank count at %s", (id, max, ko, en, bonus) => {
  const placement = BPH_PLACEMENTS.get(id);
  const node = placement?.nodeId ? BPH_UPGRADE_NODES[placement.nodeId] : undefined;
  if (!placement || !node) throw new RangeError(id);
  const previous = language();
  try {
    setLanguage("ko");
    expect(upgradeName(node)).toBe(ko);
    expect(upgradeDescription(node)).toContain(bonus);
    setLanguage("en");
    expect(upgradeName(node)).toBe(en);
    expect(upgradeDescription(node)).toContain(bonus);
    expect(upgradeRank(freshBphSave(), placement)).toEqual({ bought: 0, max });
  } finally {
    setLanguage(previous);
  }
});
