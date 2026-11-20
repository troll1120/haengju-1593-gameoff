import type { BphEffect } from "./bph-contract";
import { stats } from "./bph-upgrade-labels";
import { t } from "./i18n";
import { amount, effectSubject, effectTome, EXECUTED_SPELLS, phrase, signed, tomeWorks } from "./bph-upgrade-effect-text";

// Only effects read by executable consumers belong here. Data presence is not implementation.
const SIMPLE = new Set([
  "BonfireMaxHP", "BonfireStartShieldPercent", "HeroDuration", "FoilHeroHp", "TargetPackHeroHp",
  "HeroAttackPower", "FoilHeroAttackPower", "TargetPackHeroDamage", "HeroAttackSpeed",
  "FoilHeroAttackSpeed", "HeroAttackRange", "FireMageAttackSpeed", "ArcherFireRate",
  "HeroBlockChance", "HeroCritChance", "HeroCritDamage", "HeroAreaAttack", "ArcherRange",
  "ArcherArrowBounce", "RogueDashCount", "HeroDashKillGainDashCount", "HeroKillHealPercent",
  "HeroKillBonusCoinChance", "HeroCritChancePerCombatCoin", "HeroKillMasteryFlat",
  "HeroMasteryMultiplier", "HeroMoveSpeed", "CursorDpsDamage", "CursorDpsRadius",
  "CursorDpsIntervalReduction", "TargetSpellDamageBonus", "ThunderboltDamageBonus",
  "TargetSpellRadius", "SpellAoeRadius", "SpellDuration", "PaladinTauntArea",
  "TomeCursorDpsAreaBonus", "TomeCursorDpsAttackSpeedBonus",
  "TomeBuffDurationIncrease", "FoilHeroAliveMasterySurgeBonus", "MasterySurgeBonus",
  "MasteryInterest", "SalaryFlatBonus", "StartingFoilium", "GainRelicSlot",
  "NodeMasteryCostReduction", "BuildingReduceActivationCooldownFlatSeconds",
  "BuildingActivateTwiceChance", "BuildingSpawnedPackGiantChance", "BuildingSpawnedPackFoilChance",
  "ShopRerollCostReduction", "RoguelikeShopSlotBonus", "GlobalChanceEffectMultiplier",
  "GiantDamageBonus", "HeroSpawnAsGiantChance", "HeroDamageReduction", "HeroSpawnShieldPercent",
  "StunnedEnemyDamageBonus", "HeroReflectDamagePercent", "HeroDeathAttackPowerBonusDay",
  "HeroDeathAttackSpeedBonusDay", "HeroDeathMoveSpeedBonusDay", "HeroHpPerPackOpened",
  "HeroDamagePerPurchasedUpgrade", "HeroProjectileCount", "RotatingSwordCount",
  "RotatingSwordSizeBonus", "RotatingSwordSpeedBonus", "AstralFisherExtraLines",
  "AstralFisherPullSpeedPercent", "DinoDashDistance", "DinoDashRepeatChance",
  "BloodMageLifestealBonus", "BloodMageConsumeHealPercent", "BloodMageConsumeOnKillChance",
  "TreantSpawnSeedCount", "HeroWheelModeDurationSeconds", "HeroWheelModeEdgeHitMoveSpeedMultiplier",
  "TargetSpellHitStunSeconds", "CursorDamagePerHeroDeath", "CursorDamagePerPurchasedUpgrade",
  "CursorDamagePerFoilMonsterInCollection", "HeroDeathCursorDpsDamageBonus",
  "HeroDeathCursorDpsRadiusBonus", "HeroAliveCursorDpsDamage",
  "CombatCoinReduceRandomBuildingCooldown", "BuildingActivationSpeedPerUnopenedPack",
  "OnHeroDeathReduceBuildingActivationSeconds", "WavePackSpawnExtraTargetPackChance",
  "OpenPackCursorTimedAttackSpeedDurationSeconds", "OpenPackCursorTimedAttackSpeedPercent",
  "OpenPackCursorTimedAttackSpeedMaxStacks", "QuestCompleteBonusCoin",
]);
export function statDescription(effect: BphEffect): string | null {
  const kind = effect.type;
  if (!SIMPLE.has(kind) || effect.value === 0) return null;
  if (effect.nodeId === "R_HeroSpawnTransformAllHeroes" && kind === "HeroAttackPower") return null;
  const book = effectTome(effect);
  if (book && !tomeWorks(book)) return null;
  if (effect.targets.targetBuilding === "Building_XRelics") return null;
  if (["SpellAoeRadius", "SpellDuration", "TargetSpellRadius", "TargetSpellDamageBonus"].includes(kind) &&
    effect.targets.targetSpell && !EXECUTED_SPELLS.has(effect.targets.targetSpell)) return null;
  const stat = stats[kind];
  if (!stat) return null;
  const subject = effectSubject(effect);
  const prefix = subject ? `${subject} ` : "";
  const percent = amount(effect.value * 100);
  const cap = effect.stackCap > 0 ? phrase(` (최대 ${amount(effect.stackCap * 100)}%)`, ` (max ${amount(effect.stackCap * 100)}%)`) : "";
  switch (kind) {
    case "HeroHpPerPackOpened":
      return phrase(`${prefix}누적 모집 ${effect.countStep}회마다 체력 +${percent}%${cap}`, `${prefix}HP +${percent}% per ${effect.countStep} packs opened${cap}`);
    case "HeroDamagePerPurchasedUpgrade": case "CursorDamagePerPurchasedUpgrade":
      return phrase(`${prefix}강화 ${effect.countStep}개 구입마다 ${kind === "HeroDamagePerPurchasedUpgrade" ? "병력 공격력" : "접촉 피해"} +${percent}%`,
        `${prefix}${kind === "HeroDamagePerPurchasedUpgrade" ? "Troop damage" : "Touch damage"} +${percent}% per ${effect.countStep} upgrades bought`);
    case "CursorDamagePerHeroDeath":
      return phrase(`누적 아군 사망 ${effect.countStep}명마다 접촉 피해 +${percent}%${cap}`, `Touch damage +${percent}% per ${effect.countStep} lifetime troop deaths${cap}`);
    case "BuildingActivationSpeedPerUnopenedPack":
      return phrase(`${prefix}미개봉 모집 1개당 가동 속도 +${percent}% (최대 50%)`, `${prefix}activation speed +${percent}% per unopened pack (max 50%)`);
    case "BloodMageLifestealBonus":
      return phrase(`${prefix}준 피해의 ${percent}%만큼 추가 회복`, `${prefix}heal an extra ${percent}% of damage dealt`);
    case "BloodMageConsumeHealPercent": case "HeroKillHealPercent":
      return phrase(`${prefix}${kind === "HeroKillHealPercent" ? "처치" : "시체 흡수"} 시 최대 체력의 ${percent}% 추가 회복`,
        `${prefix}heal an extra ${percent}% max HP on ${kind === "HeroKillHealPercent" ? "kill" : "corpse consumption"}`);
    case "HeroWheelModeEdgeHitMoveSpeedMultiplier":
      return phrase(`${prefix}화면 가장자리 충돌마다 회전 이동 속도 +${percent}%`, `${prefix}wheel speed +${percent}% per screen-edge hit`);
    case "HeroReflectDamagePercent":
      return phrase(`${prefix}받거나 막은 피해의 ${percent}% 반사`, `${prefix}reflect ${percent}% of received and blocked damage`);
    case "HeroDeathCursorDpsDamageBonus": case "HeroDeathCursorDpsRadiusBonus":
      return phrase(`아군 병력 사망 1명당 접촉 ${kind === "HeroDeathCursorDpsDamageBonus" ? "공격력" : "범위"} +${percent}%`,
        `Touch ${kind === "HeroDeathCursorDpsDamageBonus" ? "damage" : "radius"} +${percent}% per allied troop death`);
    case "TomeBuffDurationIncrease":
      return phrase(`${prefix}책략 유지 시간 +${percent}%`, `${prefix}active duration +${percent}%`);
    case "HeroDeathAttackPowerBonusDay": case "HeroDeathAttackSpeedBonusDay": case "HeroDeathMoveSpeedBonusDay":
      return phrase(`이번 전투 아군 사망 1명당 ${stat[0].replace("사망 후 아군 ", "")} +${percent}%${cap}`,
        `${t(stat[0])} +${percent}% per troop death this battle${cap}`);
    case "HeroKillBonusCoinChance": case "HeroBlockChance": case "HeroCritChance":
    case "HeroCritChancePerCombatCoin": case "BloodMageConsumeOnKillChance":
    case "BuildingSpawnedPackFoilChance": case "BuildingSpawnedPackGiantChance":
      return `${prefix}${t(stat[0])} ${signed(effect.value * 100)}${phrase("퍼센트포인트", " percentage points")}${cap}`;
    default: {
      const unit = stat[1] === "seconds" ? phrase("초", "s") : stat[1] === "percent" ? "%" : "";
      return `${prefix}${t(stat[0])} ${signed(effect.value * (stat[1] === "percent" ? 100 : 1))}${unit}${cap}`;
    }
  }
}
