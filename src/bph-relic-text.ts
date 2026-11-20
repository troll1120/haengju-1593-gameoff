import { language, t } from "./i18n";
import { BPH_UPGRADE_NODES, type BphUpgradeNode } from "./bph-upgrade-data";
import { implementedEffectDescription } from "./bph-upgrade-effects";
import { amount } from "./bph-upgrade-effect-text";
import { withHaengjuRelicClasses } from "./bph-relic-classes";

/** The complete text table stays separate so every imported relic must have an explicit entry. */
export function bphRelicDescriptions(node?: BphUpgradeNode): Readonly<Record<string, string>> {
  const effects = node?.effects ?? [];
  const value = (type: string) => effects.find(effect => effect.type === type)?.value ?? 0;
  const power = (type: string) => effects.find(effect => effect.type === type)?.effectPower ?? 0;
  const n = (type: string) => amount(value(type));
  const percent = (type: string) => amount(value(type) * 100);
  return {
    _REMOVERelic1_Flail: `전투 내내 화살비가 맞히는 범위가 ${percent("CursorDpsRadius")}% 넓어집니다.`,
    Relic1_CharmArcanist: `승병이 뽑힐 비중이 2배가 되고, 매 전투 첫 승병 ${n("FirstTargetSpawnAdditionalTome")}명은 나올 때 전술을 1개씩 즉시 씁니다.`,
    Relic1_CharmMystic: `승병이 뽑힐 비중이 2배가 되고, 매 전투 첫 승병 ${n("HeroFirstSpawnsApplyStatusToSelf")}명은 죽어도 체력 절반으로 1번 되살아납니다.`,
    Relic1_CharmOutcast: `의병이 뽑힐 비중이 2배가 되고, 죽으면 ${percent("HeroDeathBonusCoinChance")}% 확률로 코인 1개를 받으며, 매 전투 이렇게 받을 때마다 확률이 15%포인트씩 줄어듭니다.`,
    Relic1_CharmWarrior: `창병이 뽑힐 비중이 2배가 되고, 매 전투 첫 창병 ${n("FirstTargetRaritySpawnDuplicate")}명은 같은 병력 1명씩을 더 데려옵니다.`,
    Relic1_Club: `화살비를 ${n("CursorDpsEveryNthDamageMult")}번 쓸 때마다 피해가 ${amount(power("CursorDpsEveryNthDamageMult"))}배가 되고, 맞은 적이 ${amount(power("CursorDpsEveryNthApplyStatus"))}초간 멈춥니다.`,
    Relic1_FourLeafClover: `확률 효과가 ${amount(1 + value("GlobalChanceEffectMultiplier"))}배 잘 터지고, 일반 대비 희귀·영웅·전설이 뽑힐 비율이 기존의 ${amount(1 + value("PackRareWeightBoost"))}·${amount(1 + value("PackEpicWeightBoost"))}·${amount(1 + value("PackLegendaryWeightBoost"))}배가 됩니다.`,
    Relic1_GiantsMight: `병력이 나올 때 ${percent("HeroSpawnAsGiantChance")}% 확률로 거대해지고, 거대 병력의 피해가 ${percent("GiantDamageBonus")}% 늘어납니다.`,
    Relic1_Rapier: `모집할 때마다 ${n("OpenPackCursorTimedAttackSpeedDurationSeconds")}초간 화살비 충전이 ${percent("OpenPackCursorTimedAttackSpeedPercent")}% 빨라지며, 최대 ${amount(value("OpenPackCursorTimedAttackSpeedPercent") * value("OpenPackCursorTimedAttackSpeedMaxStacks") * 100)}%까지 늘어납니다.`,
    Relic1_Rare: `희귀 병력·전술이 뽑힐 비중이 ${amount(1 + value("PackRareWeightBoost"))}배가 되고, 희귀 병력의 공격은 ${amount(power("HeroAttackApplyStatusChance") * 100)}% 확률로 적을 감전시켜 피해 2와 0.4초 정지를 줍니다.`,
    Relic1_TomeDuration: `전술이 뽑힐 비중이 1.5배가 되고, 효과가 ${percent("TomeBuffDurationIncrease")}% 더 오래갑니다.`,
    Relic2_Nature_RingOfDuplication: `살아 있는 아군 병력이 없을 때 새 병력이 나오면 같은 병력 ${n("DuplicateHeroSpawnWhileNoHeroesAlive")}명이 더 나옵니다.`,
    Relic2_Nature_TalkingBeet: "병력이 강화 효과를 받으면 무작위 다른 아군 1명도 같은 효과를 받습니다.",
    Relic_HuntersAreOutcast: "궁수와 의병은 둘 중 더 높은 대장간 강화와 서로의 병종 전용 전투 유물 효과를 받습니다.",
    R_ArcanistTomePower: `승병이 뽑힐 비중이 2배가 되고, 강화 포인트 획득량 보너스의 ${percent("HeroAttackDamageScalesWithMasterySurgeBonus")}%만큼 승병 공격력이 늘어납니다.`,
    R_CharmHunter: `의병이 뽑힐 비중이 2배가 되고, 적을 처치하면 ${amount(power("HeroKillApplyStatusToSelfChance") * 100)}% 확률로 10초간 피해가 2배가 됩니다.`,
    R_Epic: `일반 대비 영웅 병력·전술이 뽑힐 비율이 기존의 ${amount(1 + value("PackEpicWeightBoost"))}배가 되고, 영웅 병력은 항상 거대하게 나옵니다.`,
    R_HeroMoveSpeed: `전투 내내 모든 병력이 ${percent("HeroMoveSpeed")}% 빨리 움직입니다.`,
    R_HeroSpawnTransformAllHeroes: `모든 병력의 피해가 ${percent("HeroAttackPower")}% 늘고, 병력이 나올 때 ${percent("HeroSpawnTransformAllHeroesChance")}% 확률로 다른 아군이 ${amount(power("HeroSpawnTransformAllHeroesChance"))}초간 같은 병력으로 바뀝니다.`,
    R_HunterPeriodicInvisibility: `궁수가 뽑힐 비중이 2배가 되고, 매 ${n("HeroPeriodicApplyStatus")}초마다 궁수는 5초간 적의 표적이 되지 않으며 공격 속도가 2배가 됩니다.`,
    R_MysticSpawnFortify: `창병이 뽑힐 비중이 2배가 되고, 나오면 자신을 포함한 창병 중 무작위 최대 ${amount(power("HeroSpawnApplyStatusToAllHeroes"))}명이 다음 피해를 1번 막습니다.`,
    R_QuestCompleteCoin: `과제를 달성할 때마다 코인을 ${n("QuestCompleteBonusCoin")}개 더 받습니다.`,
    R_WarriorAliveGiant: `창병이 뽑힐 비중이 2배가 되고, ${n("HeroAliveTimeBecomeGiant")}초 동안 살아남으면 거대해지고 체력을 모두 회복합니다.`,
    Relic_ArcanistsAreHunters: "승병과 궁수는 둘 중 더 높은 대장간 강화와 서로의 병종 전용 전투 유물 효과를 받습니다.",
    Relic_MilitiaAreMystics: "창병과 승병은 둘 중 더 높은 대장간 강화와 서로의 병종 전용 전투 유물 효과를 받습니다.",
    Relic_MysticsAreArcanists: "화차병과 승병은 둘 중 더 높은 대장간 강화와 서로의 병종 전용 전투 유물 효과를 받습니다.",
    Relic_OutcastsAreMilitia: "의병과 창병은 둘 중 더 높은 대장간 강화와 서로의 병종 전용 전투 유물 효과를 받습니다.",
    Relic4_Arctic_FrozenMace: `화살비가 ${n("CursorDpsEveryNthFreezeIntoIceCube")}번째로 적을 맞힐 때마다 맞은 적이 5초간 멈춥니다.`,
    _REMOVERelic3_Cursed_Lantern: "첫 모집에서 1명만 나오면 그 병력이 사라지고, 아군이 죽을 때마다 원혼 창병이 60%로 1명, 30%로 2명, 10%로 3명 나옵니다.",
    R_EpicAttacksEletrify_Demo: `영웅 병력·전술이 뽑힐 비중이 ${amount(1 + value("PackEpicWeightBoost"))}배가 되고, 영웅 병력은 공격할 때 ${percent("HeroPeriodicShockNearby")}% 확률로 주변 적에게 감전 피해 2와 0.4초 정지를 줍니다.`,
    R_AutomaticBallista: `내성의 최대 체력이 ${amount(1 + value("BonfireMaxHP"))}배가 되고, 피해를 받을 때마다 맞은 곳 1걸음 안의 적에게 화살비로 피해 1을 줍니다.`,
    R_EchoingBones: `전투 시작 때 재기 전술을 자동으로 ${n("DayStartGainTargetTome")}회 쓰며, 원혼 창병이 나올 때 ${amount(power("HeroSpawnExtraCopies") * 100)}% 확률로 ${n("HeroSpawnExtraCopies")}명이 더 나옵니다.`,
    R_FirstPackPortal: "매 전투 첫 모집에서는 원래 병력과 전술 대신 지원 판옥선 1척이 나옵니다.",
    R_ShockNeedle: `화살비에 맞은 적은 ${amount(power("CursorDpsApplyStatusChance") * 100)}% 확률로 감전되어 피해 2와 0.4초 정지를 받고, 1걸음 안의 다른 적 1명에게도 전해집니다.`,
    R_SunstrideBoots: `병력이 ${n("HeroMoveLightBeamDistance")}걸음 걸을 때마다 ${n("HeroMoveLightBeamRadius")}걸음 안의 적에게 피해 ${n("HeroMoveLightBeamDamage")}을 주고 0.25초간 멈춥니다.`,
    Relic3_Cursed_RitualDagger: `매 ${n("SacrificeHeroFromEveryNthPack")}번째 모집에서 1명만 나오면 그 병력이 사라지며, 아군이 죽을 때마다 화살비 피해가 ${percent("HeroDeathCursorDpsDamageBonus")}%, 범위가 ${percent("HeroDeathCursorDpsRadiusBonus")}% 늘어납니다.`,
    Relic2_Nature_LifeStaff: `전투 중 살아 있는 아군 병력 1명마다 화살비 피해가 ${percent("HeroAliveCursorDpsDamage")}% 늘어납니다.`,
    "R_HunterArrowBounce - Demo": `궁수가 뽑힐 비중이 2배가 되고, 공격할 때 ${percent("ArcherArrowBounceChance")}% 확률로 화살이 다른 적에게 1번 더 튕깁니다.`,
    _REMOVER_HeroSpawnInvisibility: `병력이 나오면 ${amount(5 * (1 + value("StatusEffectDurationBonus")))}초간 적의 표적이 되지 않으며 공격 속도가 2배가 됩니다.`,
    _REMOVERelic1_WarBanner: `한 전투에서 구매한 서로 다른 모집·상자 종류마다 강화 포인트 획득량이 ${percent("DifferentPackBoughtMasterySurgeBonus")}% 늘어납니다.`,
    R_BuildingsActivateFaster: `건물이 일할 때 ${percent("BuildingActivateGainCombatCoins")}% 확률로 코인 ${amount(power("BuildingActivateGainCombatCoins"))}개를 받고, 전투 코인 1개마다 무작위 건물의 대기가 ${n("CombatCoinReduceRandomBuildingCooldown")}초 줄어듭니다.`,
    R_CommonSacrificeRareFromPack: `일반 병력이 나오면 같은 모집에 희귀 병력이 있을 때 ${percent("HeroSpawnSacrificeChanceReplaceFromPack")}% 확률로 그중 1명으로 바뀝니다.`,
    R_FirstEpicSacrificeCommons: `매 전투 첫 영웅 병력은 같은 모집에 일반 병력이 있으면 그중 ${n("FirstHeroSpawnSacrificeReplaceFromPack")}명으로 바뀝니다.`,
    R_RareSacrificeGainPack: `희귀 병력이 ${n("HeroSpawnEveryNthSacrificeGainPack")}명 나올 때마다 마지막 병력이 사라지고, 그 병력을 뽑은 모집을 1개 받습니다.`,
    "R_WarriorsSpawnFortify - Demo": "승병이 뽑힐 비중이 2배가 되고, 나오면 자신을 포함한 모든 승병이 다음 피해를 1번 막습니다.",
  };
}

/** Describe executed effects, not the unused promises in the imported source descriptions. */
export function bphRelicEffect(relicId: string, node: BphUpgradeNode | undefined = BPH_UPGRADE_NODES[relicId]): string {
  if (language() !== "ko") {
    const lines = (node?.effects ?? []).map(withHaengjuRelicClasses)
      .flatMap(effect => implementedEffectDescription(effect) ?? []);
    return lines.length ? lines.join(" · ") : t("효과 미확인");
  }
  return bphRelicDescriptions(node)[relicId] ?? "현재 전투에 적용되는 효과가 없습니다.";
}
