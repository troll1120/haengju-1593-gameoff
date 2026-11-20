import { expect, test } from "bun:test";
import type { BphResource } from "../src/bph-contract";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { bphReachabilityTargets } from "../src/bph-reachability-targets";
import { activeBphEffects, BPH_PLACEMENTS, BPH_UPGRADE_NODES, bphNodeBlockers } from "../src/bph-upgrades";
import { chooseReachabilityPurchase, manageReachabilityAccount } from "./reachability-campaign-management";
import type { ReachabilityCandidate } from "./reachability-campaign-management";

const ADVANCED = "_SkillTreeMain_Demo:18:32";
const free = Object.fromEntries(Object.keys(freshBphSave().resources).map(key => [key, 0])) as Record<BphResource, number>;
const row = (placementId: string, nodeId: string, extra: Partial<ReachabilityCandidate> = {}): ReachabilityCandidate =>
  ({ placementId, nodeId, quest: false, training: false, costs: free, blockers: [], ...extra });

function account(purchased: readonly string[], mastery: number, income: number) {
  const meta = freshMeta(), save = freshBphSave(1593);
  meta.bph = save;
  save.purchasedPlacements = [...purchased];
  save.resources.mastery = mastery;
  save.income = income;
  save.salaryApplied = activeBphEffects(save).filter(e => e.type === "SalaryFlatBonus").reduce((sum, e) => sum + e.value, 0);
  return { meta, save };
}

test("claims quests by ASCII id first, then Basic, investment, training and the cheapest remaining target", () => {
  const cost = (mastery: number, foilium = 0) => ({ costs: { ...free, mastery, foilium } });
  const rows = [
    row("g:9", "SN_Cheap", cost(1)),
    row("g:8", "HJ_ArmyTraining02", { ...cost(5), training: true }),
    row("g:7", "SN_Building_Magic_Unlock", cost(5000)),
    row("g:6", "SN_Building_Basic_Unlock", cost(9000)),
    row("g:5", "Q_Late", { ...cost(50), quest: true }),
    row("g:4", "Q_Early", { ...cost(90), quest: true }),
    row("g:0", "Q_Blocked", { quest: true, blockers: ["퀘스트 진행 부족"] }),
  ];
  const order: string[] = [];
  for (let left = [...rows]; ;) {
    const chosen = chooseReachabilityPurchase(left);
    if (!chosen) break;
    order.push(chosen.nodeId);
    left = left.filter(candidate => candidate !== chosen);
  }
  expect(order).toEqual(["Q_Early", "Q_Late", "SN_Building_Basic_Unlock", "SN_Building_Magic_Unlock", "HJ_ArmyTraining02", "SN_Cheap"]);
  expect(chooseReachabilityPurchase([row("g:2", "B", cost(10, 2)), row("g:3", "A", cost(10, 1)), row("g:1", "C", cost(10, 1))])?.nodeId).toBe("C");
});

test("entry binds account events to current effects before buying", () => {
  const { meta, save } = account(["_SkillTreeMain_Demo:19:5"], 1000, 3);
  const result = manageReachabilityAccount({ meta, save });
  expect(save.lifecycle.claimed).toEqual(expect.arrayContaining(["campaign:1", "improvements:1", "mastery:buildings:interest:1"]));
  expect(result.entered.resources.mastery).toBe(1250);
});

test.each([[4, false], [5, true]] as const)("net income %d decides the Advanced investment", (income, bought) => {
  const { meta, save } = account(["_SkillTreeMain_Demo:23:15", "_SkillTreeMain_Demo:19:32"], 750, income);
  expect(bphNodeBlockers(save, ADVANCED)).toEqual([]);
  const result = manageReachabilityAccount({ meta, save });
  expect(save.purchasedPlacements.includes(ADVANCED)).toBe(bought);
  if (bought) expect(result.purchases[0]).toMatchObject({ placementId: ADVANCED, before: { income: 5 }, after: { income: 3 } });
  else expect(result.blocks.find(block => block.placementId === ADVANCED)?.reasons).toContain("policy: investment must leave income >= 3");
});

test("candidates are rebuilt after each purchase and stay inside the reachability targets", () => {
  const { meta, save } = account([], 1e9, 1e9);
  for (const resource of Object.keys(save.resources)) Object.assign(save.resources, { [resource]: 1e9 });
  const result = manageReachabilityAccount({ meta, save });
  const targets = bphReachabilityTargets(), allowed = new Set(targets.survival);
  expect(bphNodeBlockers(freshBphSave(), result.purchases[1].placementId)).toContain("연결된 선행 노드 필요");
  for (const { placementId } of result.purchases) {
    const node = BPH_UPGRADE_NODES[BPH_PLACEMENTS.get(placementId)?.nodeId ?? ""];
    expect(allowed.has(placementId) || node?.type === 4).toBe(true);
  }
  expect(save.purchasedPlacements.filter(id => targets.future74.includes(id) || targets.laterShop.includes(id))).toEqual([]);
  expect(save.purchasedNodes).not.toContain("Rift_Graveyard");
  expect(save.purchasedNodes).not.toContain("Rift_Frozen");
  expect(result.progress.core).toBeGreaterThan(25);
});
