import { mkdir, readFile } from "node:fs/promises";
import { BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES } from "../src/bph-upgrade-data";
import { upgradeName, upgradeDescription } from "../src/bph-upgrade-presentation";
import { implementedEffectDescription } from "../src/bph-upgrade-effects";
import { implementedQuestDescription } from "../src/bph-upgrade-quest-text";
import { BPH_PROFILE_UNCONFIRMED } from "../src/bph-fx-profiles";
import { stats, specialNames } from "../src/bph-upgrade-labels";
import { setLanguage } from "../src/i18n";
import type { BphEffect } from "../src/bph-contract";

const output = "review/p10/node-effects";
const schedules = {
  quests: { name: "과제 이벤트 집계·실제 보상 지급", shared: [20, 90, 45], perNode: [1, 3, 2] },
  spells: { name: "누락된 주문 실행·발사체·충돌", shared: [20, 120, 60], perNode: [2, 5, 5] },
  packs: { name: "모집 추첨·천장·개봉·추가 지급", shared: [15, 80, 40], perNode: [1, 5, 4] },
  shop: { name: "상점 상품·할인·갱신 보상", shared: [15, 90, 45], perNode: [1, 6, 4] },
  enemies: { name: "적 공세 배율·생성·변환", shared: [10, 45, 30], perNode: [1, 5, 4] },
  statuses: { name: "상태 부여·빙결·감염 의존 경계", shared: [15, 70, 40], perNode: [2, 6, 4] },
  buildings: { name: "건물 가동·유물 생산", shared: [15, 40, 30], perNode: [2, 10, 5] },
  profiles: { name: "병력 이벤트·동물 풀·조건부 강화", shared: [15, 60, 40], perNode: [1, 7, 5] },
  resources: { name: "숙련 증폭·수입·재화 정산", shared: [10, 30, 20], perNode: [1, 5, 4] },
} as const;
type Mechanism = keyof typeof schedules;
function mechanism(type: string): Mechanism {
  if (/Spell|Tome|ThiefBlade|CastCount/.test(type)) return "spells";
  if (/Shop|Roguelike/.test(type)) return "shop";
  if (/Frozen|IceCube|Infected|Status|Electrify|Revive/.test(type)) return "statuses";
  if (/Monster|WaveSpeed/.test(type)) return "enemies";
  if (/Building/.test(type)) return "buildings";
  if (/Pack|Booster|FoilChance/.test(type)) return "packs";
  if (/Mastery|Income|Salary/.test(type)) return "resources";
  return "profiles";
}
const sources = await Promise.all([
  "bph-fx-profiles.ts", "bph-fx-status.ts", "bph-fx-buildings.ts",
  "bph.ts", "bph-shop.ts", "bph-combat.ts", "bph-session.ts", "bph-upgrades.ts",
].map(async name => ({ name: `src/${name}`, text: await readFile(`src/${name}`, "utf8") })));
// A means the requested outcome and numeric rule are specified; B needs an owner/source decision.
// Estimates are per node, standalone, and include design / implementation / verification minutes.
const unclear: Readonly<Record<string, string>> = {
  HeroLowHpAttackSpeed: "저체력일수록 가속한다는 의도만 있고 HP 임계값·가속 곡선 없음",
  HeroExtraCopiesMultiplier: "복제 수의 가산·배율·소수 반올림 규칙 없음",
  HeroDeathBonusCoinChance: "코인당 확률 감소의 기준·정산 순서 없음",
  SpawnerHigherRaritySpawnWeight: "강화 후 희귀도별 풀·가중치 없음",
  BeastmasterFriendDeathRespawn: "재소환 풀·가중치·생애 승계 규칙 없음",
  BloodMageStackDamageOnConsume: "흡수 성장의 가산·복리 규칙 없음",
  BloodMageConsumeNearbyHeroDeathChance: "주변 시체 감지 반경 없음",
  BloodChalice: "충전량·임계값·거래 선택 실행 규칙 없음",
  TeleporterAoeKnockbackMultiplier: "기본 밀치기 힘·물리 적분식 없음",
  HeroMonsterPullRadius: "반경은 있으나 기본 흡인 속도·힘 없음",
  HeroMineChainDamageBonus: "연쇄 기폭·충전 보너스 계산 규칙 없음",
  HeroMineChargeTimeReductionSeconds: "기본 충전 시간이 없음",
  HeroMineAoeRadius: "원본 접촉·충전·기폭과 기존 폭탄의 관계 결정 필요",
  HeroPeriodicShockNearby: "충격 기본 주기·첫 적용 시점·표적 선택 없음",
  HeroPeriodicShockNearbyRange: "반경은 있지만 기본 충격 실행 주기 없음",
  StatusEffectPowerBonus: "value/effectPower와 설명의 25%가 서로 충돌",
  TeleporterAoeHitApplyStatusChance: "직렬화 50%와 설명 25% 충돌, 기본 감전 산식 없음",
  ElectrifyChainDamagePercent: "기본 감전 피해·전이 산식 없음",
  ElectrifyExtraChainJumps: "기본 감전 피해·전이 산식 없음",
  ThunderboltApplyStatus: "기본 감전 피해·전이 산식 없음",
  CursorDpsApplyStatusChance: "감전 value=0/effectPower 의미와 기본 피해·전이 산식 없음",
  HeroSpellCastApplyStatusChance: "광선 기본 피해 0의 적용 산식과 시전 변형 구분 없음",
  FrozenSlideMaxHpDamage: "속도별 충돌 피해 곡선 없음",
  FrozenSlideBossMaxHpDamage: "속도별 충돌 피해 곡선 없음",
  HeroDeathSummonSpectralChance: "혼령 기본 체력·복귀 형태·초당 소모식 없음",
  AstralFisherHookedKillSpectre: "혼령 수명·체력 소모·적 상태 승계 규칙 없음",
  SpectralHpDrainReduction: "혼령 기본 초당 체력 소모식 없음",
  SpectralPactHpLossReduction: "혼령 기본 초당 체력 소모식 없음",
  TomeExtraStacks: "기본 거대 단계별 배율·크기 공식 없음",
  SpellSurgeMasteryBonusPercent: "기본 증폭과 가산·곱산 및 정산 순서 없음",
  TomeCursorDpsCritChance: "치명타 판정 로그는 있으나 접촉 치명 피해 배율 없음",
  RoguelikeDailyDealWeightBonus: "추가 가중치 수치가 0이고 특별 병력 상품 추첨 풀 없음",
  FirstTargetSpawnAdditionalTome: "추가 책략의 원본 풀·분포 없음",
  PackMergeComponentHeroesWithTargetHero: "합성에 필요한 구성 병력·우선순위 계약 없음",
  HeroAttackPower: "변환 유물에 함께 저장된 공격력 보너스의 적용 조건 없음",
};
const unclearNodes: Readonly<Record<string, string>> = {
  Mod_Frostbite: "동상 중첩 증가 주기·빙결 임계값 없음",
  Mod_RiftInvasion: "침공 적의 풀·수량·간격·균열 연결 규칙 없음",
};
function evidence(effect: BphEffect) {
  return sources.flatMap(source => {
    const lines = source.text.split("\n");
    const index = lines.findIndex(line => line.includes(`"${effect.type}"`) || line.includes(`${effect.type}:`));
    return index < 0 ? [] : [`${source.name}:${index + 1}`];
  });
}
function missing(effect: BphEffect) {
  const zero = effect.value === 0 && effect.effectPower === 0;
  const references = evidence(effect);
  const reason = unclear[effect.type] ??
    (zero ? "효과 값·확률이 0이어서 실행 변화 없음" :
      BPH_PROFILE_UNCONFIRMED[effect.type] ??
      (effect.targets.targetSpell ? "수치는 있으나 대상 주문이 executeSpell 허용 목록에 없음" :
        "데이터는 있으나 해당 결과를 실행하는 소비 코드가 없음"));
  const ambiguous = zero || Object.hasOwn(unclear, effect.type) ||
    (effect.type === "HeroAttackApplyStatusChance" && effect.targets.targetStatus === "Electrify");
  return {
    type: effect.type, intended: stats[effect.type]?.[0] ?? specialNames[effect.type] ?? effect.type,
    value: effect.value, effectPower: effect.effectPower, stackCap: effect.stackCap, countStep: effect.countStep,
    targets: Object.fromEntries(Object.entries(effect.targets).filter(([key, value]) =>
      /^(target|secondTarget|replacement|heroSpawn|bonusPack)/.test(key) && !key.endsWith(".source") && value !== "0")),
    group: ambiguous ? "B" : "A", reason,
    code: BPH_PROFILE_UNCONFIRMED[effect.type] ? "경고 로그만 있음" :
      references.some(ref => ref.startsWith("src/bph-fx-status")) ? "소비 코드 있으나 미실행 분기·대상 주문/상태 의존" :
        references.length ? "관련 코드 있으나 이 노드 결과를 실행하지 않음" : "실행 소비자 없음",
    evidence: references,
  };
}
const rows = Object.values(BPH_UPGRADE_NODES).map(node => {
  setLanguage("ko");
  const name = upgradeName(node), descriptionKo = upgradeDescription(node);
  const active = node.effects.filter(effect => implementedEffectDescription(effect) !== null);
  const gaps = node.effects.filter(effect => implementedEffectDescription(effect) === null).map(missing);
  const structural = [1, 2, 3].includes(node.type);
  const quest = implementedQuestDescription(node);
  const grid = node.type === 6 && !!node.refs.riftSkillTreeGrid;
  const implemented = active.length > 0 || quest !== null || grid;
  const state = structural ? "connector" : implemented ? gaps.length ? "partial" : "implemented" : "no-effect";
  const group = gaps.some(gap => gap.group === "B") || Object.hasOwn(unclearNodes, node.id) ||
    (node.type === 9 || node.id === "Rift_ReturnToMain") ? "B" : "A";
  const sharedMechanism: Mechanism = node.type === 4 ? "quests" : mechanism(gaps[0]?.type ?? "");
  const positions = BPH_UPGRADE_GRIDS.flatMap(tree => tree.placements.filter(p => p.nodeId === node.id).map(p => ({
    tree: tree.id, x: p.x, y: p.y, placementId: p.id,
  })));
  const costs = Object.fromEntries(Object.entries(node.costs).filter(([, value]) => value !== 0));
  setLanguage("en");
  const descriptionEn = upgradeDescription(node);
  const [design, implementation, verification] = schedules[sharedMechanism].perNode;
  const estimate = state === "no-effect" || gaps.length ? group === "A"
    ? { design, implementation, verification, condition: "incremental per node after the shared mechanism is built" }
    : { design: 20, implementation: 40, verification: 20, condition: "owner/source decision required; provisional" } : null;
  return {
    id: node.id, name, sourceName: node.name, state, group, costs, positions,
    intended: node.description || (node.type === 4 ? `과제 ${node.thresholds.join("/")}회; ${JSON.stringify(node.refs)}` : node.name),
    questFields: node.type === 4 ? Object.fromEntries(Object.entries(node.values).filter(([key, value]) =>
      /^(quest|flatSkull)/.test(key) && value !== 0)) : undefined,
    refs: node.refs, descriptionKo, descriptionEn,
    activeEffects: active.map(effect => effect.type), missingEffects: gaps,
    code: unclearNodes[node.id] ?? (node.type === 4 && !implemented ? "bphQuestUnknowns로 집계 차단 또는 보상 지급 코드 없음" :
      node.type === 9 ? "doorPrestigeLevel hook만 생성; 소비자 없음" :
      node.id === "Rift_ReturnToMain" ? "기본 강화망 hook만 생성; 별도 이동 효과 없음" : undefined),
    sharedMechanism, estimateMinutes: estimate,
  };
});
setLanguage("ko");
const none = rows.filter(row => row.state === "no-effect");
const schedule = Object.entries(schedules).flatMap(([id, spec]) => {
  const members = none.filter(row => row.group === "A" && row.sharedMechanism === id);
  if (!members.length) return [];
  const incremental = spec.perNode.map(minutes => minutes * members.length);
  const total = spec.shared.map((minutes, index) => minutes + incremental[index]);
  return [{
    id, mechanism: spec.name, nodeCount: members.length, nodes: members.map(row => row.id),
    sharedMinutes: { design: spec.shared[0], implementation: spec.shared[1], verification: spec.shared[2] },
    perNodeMinutes: { design: spec.perNode[0], implementation: spec.perNode[1], verification: spec.perNode[2] },
    totalMinutes: { design: total[0], implementation: total[1], verification: total[2], all: total.reduce((a, b) => a + b, 0) },
  }];
});
const sumCosts = (placed: boolean) => Object.fromEntries(Object.keys(BPH_UPGRADE_NODES.FOIL_Archer.costs).map(key => [
  key, none.reduce((sum, row) => sum + (row.costs[key] ?? 0) * (placed ? row.positions.length : 1), 0),
]).filter(([, value]) => value !== 0));
const summary = {
  definitions: rows.length, implemented: rows.filter(row => row.state === "implemented").length,
  partial: rows.filter(row => row.state === "partial").length,
  connectors: rows.filter(row => row.state === "connector").length,
  noEffect: none.length, A: none.filter(row => row.group === "A").length, B: none.filter(row => row.group === "B").length,
  placedNoEffectDefinitions: none.filter(row => row.positions.length).length,
  placedNoEffectPurchases: none.reduce((sum, row) => sum + row.positions.length, 0),
  definitionCosts: sumCosts(false), placedCosts: sumCosts(true), goldCost: 0,
  note: "Tree costs use mastery/skull/coinIncome/etc.; there is no gold/coins purchase-cost field. coinIncome is income, not spendable gold.",
  AImplementationSchedule: {
    groups: schedule,
    totalMinutes: schedule.reduce((sum, entry) => sum + entry.totalMinutes.all, 0),
    assumptions: "Sequential engineering time including design, implementation and verification; shared infrastructure counted once. No B decisions, deployment or owner waiting. Add 20% contingency for unknown interactions. Primary mechanism owns mixed nodes; its shared budget includes adapters.",
  },
};
await mkdir(output, { recursive: true });
await Bun.write(`${output}/all-nodes.json`, JSON.stringify({ summary, nodes: rows }, null, 2) + "\n");
await Bun.write(`${output}/no-effect-nodes.json`, JSON.stringify({ summary, nodes: none }, null, 2) + "\n");
const sections = ["A", "B"].map(group => [
  `## ${group} (${none.filter(row => row.group === group).length})`,
  ...none.filter(row => row.group === group).map(row => [
    `### ${row.id} — ${row.name}`,
    `- 비용: ${JSON.stringify(row.costs)}; 위치: ${row.positions.map(p => `${p.tree} (${p.x},${p.y})`).join(", ") || "트리 배치 없음"}`,
    `- 원본 의도: ${row.intended}`,
    `- 공유 메커니즘: ${row.sharedMechanism} (${schedules[row.sharedMechanism].name})`,
    `- 코드: ${row.code ?? (row.missingEffects.map(gap => `${gap.type}: ${gap.code}; ${gap.reason}; ${gap.evidence.join(", ") || "실행 참조 없음"}`).join(" / ") || "효과 배열과 실행 소비자 없음")}`,
    `- 추정(분): 설계 ${row.estimateMinutes?.design}, 구현 ${row.estimateMinutes?.implementation}, 검증 ${row.estimateMinutes?.verification}${group === "B" ? " (결정 후 재산정)" : ""}`,
  ].join("\n")),
].join("\n\n")).join("\n\n");
await Bun.write(`${output}/no-effect-nodes.md`, `# 강화 효과 실행 감사\n\n기준: p10-bph ceae723. 배포하지 않음. 미구현 표시는 owner 결정 전까지 보류.\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\nA: 기존 시스템에서 의도·수치가 명확함. B: 적용 공식·우선순위·원본 실행 계약 결정 필요.\nA 시간은 공통 메커니즘 개발을 그룹당 1회 더하고 노드별 추가 시간을 합친 순차 작업량이다. 위 AImplementationSchedule에 설계·구현·검증별 그룹 소계와 전체 합계가 있다. 다중 효과 노드는 주 메커니즘에 배정했으며 공통 예산에 어댑터를 포함했다. 실제 구현 전 추정으로 상호작용 여유 20%를 별도로 권고한다. B 시간은 결정 후 조건부 추정이고 A 총합에서 제외했다.\n금화 비용은 0: 강화망은 금화가 아닌 mastery 등 재화를 차감한다. 위치별 합계는 모든 반복 배치를 각각 구입하는 명목 비용(할인 전)이다.\n과제는 활성화 로컬 집계 정책을 따르며, 실제 지급하지 않는 팩·유물 보상을 구현된 효과로 계산하지 않았다.\nall-nodes.json에 543개 전수 한·영 설명·적용/미적용 효과를 함께 저장했다. 원본 설명은 의도 근거이며 실행 증명이 아니다.\n\n${sections}\n`);
console.log(JSON.stringify(summary, null, 2));
