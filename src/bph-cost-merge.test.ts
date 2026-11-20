import { expect, test } from "bun:test";
import { BPH_UPGRADE_NODES as SOURCE } from "./bph-upgrade-data";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, bphNodeCost } from "./bph-upgrades";
import { BPH_MERGED_RATES, bphMergedReward, foldBphMergedBalances } from "./bph-cost-merge";
import type { BphMergedResource } from "./bph-cost-merge";
import { freshBphSave } from "./bph-save";
import { freshMeta, keepMeta, loadMeta } from "./meta";

const merged = Object.keys(BPH_MERGED_RATES) as BphMergedResource[];

test("no placed node costs a merged currency; each moves into mastery at its rate with effects untouched", () => {
  const save = freshBphSave();
  for (const p of BPH_PLACEMENTS.values()) {
    const node = p.nodeId ? BPH_UPGRADE_NODES[p.nodeId] : undefined, source = p.nodeId ? SOURCE[p.nodeId] : undefined;
    if (!node || !source) continue;
    for (const resource of merged) expect(bphNodeCost(save, node, resource)).toBe(0);
    const moved = merged.reduce((sum, resource) => sum + source.costs[resource] * BPH_MERGED_RATES[resource], 0);
    expect(node.costs.mastery).toBe(source.costs.mastery + moved);
    expect(node.effects).toEqual(source.effects);
  }
  expect(BPH_UPGRADE_NODES.SN_Building_Advanced_Unlock.costs.mastery).toBe(750 + 2 * 375);
  expect(BPH_UPGRADE_NODES.SN_Building_Death_Unlock.costs.mastery).toBe(50 * 45 + 4 * 375);
});

test("rewards and held balances in a merged currency become mastery once", () => {
  expect(bphMergedReward("skull", 50)).toEqual({ resource: "mastery", amount: 2250 });
  expect(bphMergedReward("zenith", 50)).toEqual({ resource: "zenith", amount: 50 });
  const save = freshBphSave();
  save.resources.mastery = 10; save.resources.fruit = 2; save.resources.prestigePoint = 1; save.income = 7;
  foldBphMergedBalances(save); foldBphMergedBalances(save);
  expect([save.resources.mastery, save.resources.fruit, save.resources.prestigePoint, save.income]).toEqual([10 + 76 + 1500, 0, 0, 7]);
});

test("a save written before 790dd7b converts its merged balances once and keeps them across reloads", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  try {
    const legacy = freshMeta(), bph = freshBphSave();
    Object.assign(bph.resources, { mastery: 500, skull: 33, shard: 11, fruit: 40, prestigePoint: 2, zenith: 7, ink: 3 });
    bph.income = 4;
    legacy.version = 4; legacy.bph = bph;
    storage.set("haengju1593-meta", JSON.stringify(legacy));
    const expected = { mastery: 500 + 33 * 45 + 11 * 136 + 40 * 38 + 2 * 1500, skull: 0, shard: 0, fruit: 0, prestigePoint: 0, zenith: 7, ink: 3 };
    const first = loadMeta();
    expect(first.bph?.resources).toMatchObject(expected);
    expect(first.bph?.income).toBe(4);
    keepMeta(first);
    const written = storage.get("haengju1593-meta");
    for (let reload = 0; reload < 3; reload++) {
      const again = loadMeta();
      expect(again.bph?.resources).toMatchObject(expected);
      keepMeta(again);
      expect(storage.get("haengju1593-meta")).toBe(written);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
