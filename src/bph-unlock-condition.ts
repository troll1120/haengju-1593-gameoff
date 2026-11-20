import { bphGeneralProgress } from "./bph-commanders";
import type { BphGeneral, BphMilestones } from "./bph-commanders";
import type { BphSave } from "./bph-contract";
import type { BphUpgradeNode } from "./bph-upgrade-data";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { adjacentBphPlacements } from "./bph-upgrade-graph";
import type { BphPlacement } from "./bph-upgrade-data";
import { BPH_UNKNOWN_NAME, bphOwnUnlockPacks } from "./bph-locked-identity";
import { questRewardPack } from "./bph-quests";
import { BPH_BARRACKS_BUILDINGS, BPH_BUILDING_RECRUITS } from "./bph-fx-buildings";
import { bphPrepPlacementGroup, bphPrepTabLabel } from "./bph-prep-card-groups";
import { BPH_FOREST_RECRUIT_GATE, BPH_PACK_NAMES, BPH_RIFT_NODE_TYPE, bphUnlockedPacks } from "./bph-shop";
import { recruitment } from "./bph-upgrade-labels";
import { bphDrawPool } from "./bph-tome-availability";
import { phrase } from "./bph-upgrade-effect-text";
import { upgradeName } from "./bph-upgrade-presentation";
import { questRequirement } from "./bph-upgrade-quest-text";
import { activeBphEffects, BPH_PLACEMENTS, BPH_UPGRADE_NODES, prepareBphUpgrades } from "./bph-upgrades";
import { language, t } from "./i18n";
import { unitDisplayName } from "./unit-codex-i18n";

await prepareBphUpgrades();

const line = (condition: string) => phrase(`해금 방법: ${condition}`, `How to unlock: ${condition}`);
const unavailable = () => phrase("현재 빌드에서 획득할 수 없음", "Unavailable in this build");

export function bphLockedGeneralCondition(save: BphSave, milestones: BphMilestones, general: BphGeneral) {
  const progress = bphGeneralProgress(save, milestones, general);
  return progress && { icon: progress.icon, line: line(progress.line) };
}

function packQuestRequirement(quest: (typeof BPH_UPGRADE_NODES)[string]) {
  const count = quest.thresholds[0];
  return quest.values.questHeroDeaths ? phrase(`아군 ${count}명 전사`, `Lose ${count} allies`)
    : quest.values.questBreakIceCubes ? phrase(`얼음 ${count}개 파괴`, `Break ${count} ice cubes`)
    : questRequirement(quest, String(count));
}

type PackRoute = { readonly text: string; readonly inBattle: boolean };

const refersTo = (node: BphUpgradeNode, packId: string) => Object.values(node.refs).includes(packId)
  || node.effects.some(({ targets }) => Object.values(targets).includes(packId));

/** Whether a gate cell can be bought before its pack exists. Inside the gate's grid, walking from the grid's
 * entrances, a cell that needs the pack is a wall: a quest on that pack, or a priced cell the pack keeps concealed
 * (concealed cells offer no buy button; only a free one is claimed by its tap). The forest building sits behind
 * "open 3 forest packs", the only route to forest packs, so it never opens. */
function reachableWithout(gate: BphPlacement, packId: string): boolean {
  const wall = (p: BphPlacement) => {
    const node = p.nodeId ? BPH_UPGRADE_NODES[p.nodeId] : undefined;
    return !node || node.refs.questPack === packId || refersTo(node, packId) && !bphOwnUnlockPacks(node).has(packId)
      && Object.values(node.costs).some(amount => amount > 0);
  };
  const queue = [...BPH_PLACEMENTS.values()].filter(p => p.gridId === gate.gridId && p.start && !wall(p));
  const seen = new Set(queue.map(p => p.id));
  for (let i = 0; i < queue.length; i++) {
    if (queue[i].id === gate.id) return true;
    for (const next of adjacentBphPlacements(queue[i])) {
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      if (next.id === gate.id || !wall(next)) queue.push(next);
    }
  }
  return false;
}

/** The ways bphUnlockedPacks can come to hold a locked pack: a quest claim, the forest building on purchase, or
 * a non-barracks building whose battle activation grants the pack (barracks only draw already unlocked packs).
 * A shop-unlock upgrade is not a route: it references its own pack, so it stays concealed and unbuyable until
 * the pack is already open. */
function packUnlockRoutes(packId: string): PackRoute[] {
  const nodes = Object.values(BPH_UPGRADE_NODES).filter(node => !BPH_HIDDEN_UPGRADES.has(node.id));
  const routes: PackRoute[] = [];
  const quest = nodes.find(node => questRewardPack(node) === packId), target = quest && packQuestRequirement(quest);
  if (target) routes.push({ text: phrase(`${target} 후 퀘스트 보상 수령`, `${target}, then claim the quest reward`), inBattle: false });
  const gates = nodes.flatMap(node => {
    const rift = node.type === BPH_RIFT_NODE_TYPE && node.refs.targetPack === packId;
    return [...rift ? [{ node, onPurchase: true }] : [], ...node.effects.flatMap(({ type, targets: { targetBuilding, targetPack } }) => {
      const shop = type === "ShopUnlockTargetPack" && targetPack === packId;
      if (!shop && (type !== "UnlockBuilding" || !targetBuilding || BPH_BUILDING_RECRUITS[targetBuilding]?.pack !== packId)) return [];
      const onPurchase = shop || packId === BPH_FOREST_RECRUIT_GATE.pack && targetBuilding === BPH_FOREST_RECRUIT_GATE.building;
      return !onPurchase && BPH_BARRACKS_BUILDINGS.includes(targetBuilding ?? "") ? [] : [{ node, onPurchase }];
    })];
  });
  for (const { node, onPurchase } of gates) {
    const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === node.id);
    if (!placement || !reachableWithout(placement, packId)) continue;
    const tab = bphPrepTabLabel(bphPrepPlacementGroup(placement.id).tab), name = upgradeName(node);
    const buy = phrase(`강화 ${tab} 탭에서 ${name} 구입`, `Buy ${name} in Upgrades (${tab} tab)`);
    routes.push(onPurchase ? { text: buy, inBattle: false }
      : { text: phrase(`${buy} 후 전투에서 건물 가동`, `${buy}, then let the building activate in battle`), inBattle: true });
  }
  return routes;
}

export function bphLockedPackCondition(packId: string) {
  const name = t(BPH_PACK_NAMES[packId] ?? recruitment[packId] ?? "병력 모집"), routes = packUnlockRoutes(packId);
  return line(routes.length
    ? phrase(`${routes.map(route => route.text).join(" 또는 ")} → ${name} 해금`, `${routes.map(route => route.text).join(" or ")} → unlocks ${name}`)
    : `${name} — ${unavailable()}`);
}

/** Use the same pack membership, reward references and promotion thresholds as gameplay. */
export function bphLockedCardCondition(save: BphSave, id: string): string {
  const effects = activeBphEffects(save), unlocked = bphUnlockedPacks(save, effects);
  const nodes = Object.values(BPH_UPGRADE_NODES).filter(node => !BPH_HIDDEN_UPGRADES.has(node.id));
  const troop = (profile: string) => save.discovered.includes(profile)
    ? unitDisplayName(profile, language()) ?? t(BPH_PROFILES[profile].name) : BPH_UNKNOWN_NAME;
  const packRoutes = Object.values(BPH_PACKS).flatMap(pack => {
    if (!bphDrawPool(pack).some(row => row.id === id && row.weight > 0)
      && !pack.opening.some(opening => opening.dimension === save.dimension && opening.ids.includes(id))) return [];
    if (unlocked.has(pack.id)) {
      const name = t(BPH_PACK_NAMES[pack.id] ?? "병력 모집");
      return [phrase(`전투에서 ${name} 열기`, `Open ${name} in battle`)];
    }
    return packUnlockRoutes(pack.id).map(({ text, inBattle }) => inBattle
      ? phrase(`${text} 후 해당 모집 열기`, `${text}, then open that recruit pack`)
      : phrase(`${text} 후 전투에서 해당 모집 열기`, `${text}, then open its recruit pack in battle`));
  });
  const promotions = Object.values(BPH_PROFILES).flatMap(base => base.evolution.flatMap((step, index) => {
    if (step.profileId !== id || !nodes.some(node => node.effects.some(effect =>
      effect.type === "HeroKillUpgradeUnlock" && effect.targets.targetHero === base.id))) return [];
    const route = phrase(`${troop(base.id)} 처치 진급 ${index + 1}단계를 해금하고 같은 병력으로 ${step.kills}회 처치`,
      `Unlock promotion rank ${index + 1} for ${troop(base.id)}, then get ${step.kills} kills with that troop`);
    return [step.become ? route : phrase(`${route} (전투 중 일시 진급)`, `${route} (temporary battle promotion)`)];
  }));
  const summons = nodes.flatMap(node => node.effects.flatMap(({ type, targets }) => {
    if (type === "BeastmasterAddTargetHeroToPool" && targets.targetHero === id) {
      return [phrase(`동물 지원병 강화를 구입하고 전투에서 ${troop("Hero5_Beastmaster")} 모집`,
        `Buy the companion upgrade, then recruit ${troop("Hero5_Beastmaster")} in battle`)];
    }
    if (type === "OnHeroDeathSpawn" && targets.heroSpawnOnHeroDeath === id) {
      return [phrase(`소환 강화를 구입한 뒤 전투에서 ${troop(targets.targetHero)} 전사`,
        `Buy the summon upgrade, then let ${troop(targets.targetHero)} fall in battle`)];
    }
    if (type === "InfectedDeathSpawnTargetHero" && targets.heroSpawnOnHeroDeath === id) {
      return [phrase("소환 강화를 구입한 뒤 전투에서 감염된 적 처치",
        "Buy the summon upgrade, then defeat an infected enemy in battle")];
    }
    return [];
  }));
  if (id === "Hero_Rat") {
    const scout = troop("Hero5_Beastmaster");
    summons.push(phrase(`전투에서 ${scout} 모집 시 기본 동반 병력으로 등장`,
      `Appears as a default companion when ${scout} is recruited in battle`));
  }
  const routes = [...new Set([...packRoutes, ...promotions, ...summons])];
  return line(routes.join(phrase(" 또는 ", " or ")) || unavailable());
}

export const bphEnemyCondition = () => line(phrase("전투에서 처음 마주치기", "Encounter in battle for the first time"));

/** Why a concealed (???) upgrade is still undiscovered, reusing the regular unlock-condition sources (castle ledger 1043-1045). */
export function bphConcealmentConditions(save: BphSave, node: BphUpgradeNode): readonly string[] {
  const effects = activeBphEffects(save), unlocked = bphUnlockedPacks(save, effects);
  const own = bphOwnUnlockPacks(node);
  const locked = (id: string) =>
    (Object.hasOwn(BPH_PROFILES, id) || Object.hasOwn(BPH_TOMES, id)) && !save.discovered.includes(id)
    || Object.hasOwn(BPH_PACKS, id) && !unlocked.has(id) && !own.has(id);
  const lines: string[] = [];
  const route = (id: string) => lines.push(Object.hasOwn(BPH_PACKS, id)
    ? bphLockedPackCondition(id) : bphLockedCardCondition(save, id));
  if (node.type === 5 && !save.relicState.owned.includes(node.id))
    lines.push(line(phrase("유물 획득", "Obtain the relic")));
  for (const [key, id] of Object.entries(node.refs)) {
    if (key === "questRelicPackReward" || !id || !locked(id)) continue;
    route(id);
  }
  for (const { targets } of node.effects) {
    if (targets.targetRelic && !save.relicState.owned.includes(targets.targetRelic))
      lines.push(line(phrase("유물 획득", "Obtain the relic")));
    for (const id of Object.values(targets)) if (id && typeof id === "string" && locked(id)) route(id);
  }
  return [...new Set(lines)];
}
