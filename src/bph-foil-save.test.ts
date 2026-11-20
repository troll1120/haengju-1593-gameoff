import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphRun, settleBphRun } from "./bph-session";
import { advance } from "./rules";
import { bphSurvivalPlan } from "./bph-survival";
import { prepareBphManagementShop } from "./bph-shop-session";
import { buyBphOffer, rerollBphShop } from "./bph-shop";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { BPH_PLACEMENTS } from "./bph-upgrades";
import { claimQuestRewards } from "./bph-quests";

test("run start activates reachable quests without clearing saved progress", () => {
  const save = freshBphSave();
  const quest = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === "Q_HeroSquire");
  if (!quest) throw new TypeError("Expected Squire quest");
  save.dimension = 2;
  save.purchasedPlacements = [...BPH_PLACEMENTS.values()].filter(p => p.id !== quest.id).map(p => p.id);
  save.questProgress[quest.id] = 7;
  const meta = freshMeta();
  meta.bph = save;

  createBphRun(meta, { seed: 7, general: "권율", upgrades: [] });

  expect(save.questActivatedAt[quest.id]).toBe(0);
  expect(save.questProgress[quest.id]).toBe(7);
});

test("save migration records paid quest income without paying it again", () => {
  const save = freshBphSave();
  const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === "Q_HeroSquire");
  if (!placement) throw new TypeError("Expected Squire quest");
  const node = BPH_UPGRADE_NODES.Q_HeroSquire;
  save.questProgress[`claims:${placement.id}`] = 1;
  save.income = 7;
  save.salaryApplied = 2;
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));

  claimQuestRewards(restored, placement, node, {
    placementId: placement.id, nodeId: node.id, claim: 1, receiptId: `quest:${placement.id}:1`,
  });

  expect(restored.income).toBe(7);
  expect(restored.salaryApplied).toBe(2);
  expect(restored.lifecycle.claimed).toContain(`reward:quest:${placement.id}:1`);
});

test.each([
  { chapter: 2, phase: "won", time: 600, foil: 10, highest: 3 },
  { chapter: 2, phase: "won", time: 599.95, foil: 0, highest: 3 },
  { chapter: 2, phase: "lost", time: 600, foil: 0, highest: 2 },
  { chapter: 1, phase: "won", time: 600, foil: 0, highest: 2 },
  { chapter: 3, phase: "won", time: 600, foil: 0, highest: 4 },
] as const)("foil grant follows actual chapter, duration and outcome: %j", row => {
  const meta = freshMeta();
  meta.bph = freshBphSave();
  meta.bph.chapter = row.chapter;
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: [] });
  run.phase = row.phase;
  run.time = row.time;

  settleBphRun(meta, run);
  settleBphRun(meta, run);

  expect(meta.bph.resources.foilium).toBe(row.foil);
  expect(meta.bph.chapter).toBe(row.highest);
  expect(meta.runs).toBe(1);
  expect(meta.bph.lifecycle.managementVisit).toBe(2);
});

test("a real C3 deadline win pays once across settlement replay, spending and reload", () => {
  const meta = freshMeta();
  meta.bph = freshBphSave();
  meta.bph.chapter = 2;
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: [] });
  const battle = run.bph;
  if (!battle?.survival) throw new TypeError("Expected survival battle");
  run.time = 899.95;
  battle.pendingMastery = 1632;
  battle.survival.cursor = bphSurvivalPlan(battle.waveId).length;
  advance(run, .1);
  expect(run.phase).toBe("won");
  expect(run.time).toBe(900);

  settleBphRun(meta, run);
  settleBphRun(meta, run);
  expect(meta.bph.resources.foilium).toBe(10);
  expect(meta.bph.resources.mastery).toBe(17);
  expect(meta.bph.lifecycle.claimed.filter(id => id === "reachability:v1:foil:C3")).toHaveLength(1);
  meta.bph.resources.foilium -= 10;
  meta.bph = parseBphSave(JSON.parse(JSON.stringify(meta.bph)));
  expect(meta.bph.resources.foilium).toBe(0);
  const next = createBphRun(meta, { seed: 8, general: "권율", upgrades: [] });
  expect(next.bph?.waveId).toBe("WaveChapter4");
  next.phase = "won";
  next.time = 900;
  settleBphRun(meta, next);
  expect(meta.bph.resources.foilium).toBe(0);
  expect(meta.bph.chapter).toBe(4);
});

test.each([
  { chapter: 0, foil: 1 }, { chapter: 1, foil: 1 }, { chapter: 2, foil: 1 },
  { chapter: 3, foil: 11 }, { chapter: 40, foil: 11 },
])("legacy chapter %s retains progression and receives eligible foil only once", row => {
  const legacy = freshBphSave(37);
  legacy.chapter = row.chapter;
  legacy.resources.foilium = 1;
  legacy.lifecycle.claimed.push("existing:receipt");
  legacy.questProgress["unobserved-kill"] = 4;

  const restored = parseBphSave(legacy);

  expect(restored.chapter).toBe(row.chapter);
  expect(restored.resources.foilium).toBe(row.foil);
  expect(restored.lifecycle.claimed).toContain("existing:receipt");
  expect(restored.questProgress).toEqual(legacy.questProgress);
  expect(parseBphSave(JSON.parse(JSON.stringify(restored)))).toEqual(restored);
});

test("legacy C4 foil migration preserves saved shop, RNG, salary and lifecycle", () => {
  const legacy = freshBphSave(13);
  legacy.chapter = 3;
  legacy.income = 12;
  legacy.salaryApplied = 9;
  legacy.coins = 100;
  legacy.resources.coinIncome = 5;
  const effects = [...BPH_UPGRADE_NODES.SN_RoguelikeDiscountChance.effects,
    ...BPH_UPGRADE_NODES.SN_ShopRerollUnlock.effects];
  const shop = prepareBphManagementShop(legacy, effects);
  if (!shop) throw new TypeError("Expected management shop");
  expect(rerollBphShop(legacy, shop, effects)).toBe(true);
  expect(buyBphOffer(legacy, shop, 0)).toBe(true);
  const before = structuredClone(legacy);

  const restored = parseBphSave(JSON.parse(JSON.stringify(legacy)));
  const meta = freshMeta();
  meta.bph = restored;
  const run = createBphRun(meta, { seed: 19, general: "권율", upgrades: effects, startBattle: false });
  prepareBphManagementShop(restored, effects);

  expect(restored.shop).toEqual(before.shop);
  expect(restored.rng).toBe(before.rng);
  expect(restored.income).toBe(before.income);
  expect(restored.salaryApplied).toBe(before.salaryApplied);
  expect(restored.coins).toBe(before.coins);
  expect(run.gold).toBe(before.coins);
  expect(restored.resources.coinIncome).toBe(5);
  expect(restored.inventory).toEqual(before.inventory);
  expect(restored.lifecycle.campaignAttempt).toBe(before.lifecycle.campaignAttempt);
  expect(restored.lifecycle.managementVisit).toBe(before.lifecycle.managementVisit);
  expect(restored.resources.foilium).toBe(before.resources.foilium + 10);
});
