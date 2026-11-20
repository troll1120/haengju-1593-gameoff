import type { BphActor, BphEffect, BphEffectConsumer, BphFxContext, BphFxEvent, BphFxState } from "./bph-contract";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { BPH_PACKS, BPH_PROFILES } from "./bph-data";
import { bphStats, BPH_CLASS_BODY } from "./bph-combat";
import { bphPlacementIsUpgrade } from "./bph-upgrades";
import { grantBphMastery } from "./bph-account";
import { beginBphCast } from "./bph-effects-entry";
import type { BphObservation } from "./bph-effects-entry";
import { HEIGHT, WIDTH } from "./geometry";
import type { Point } from "./geometry";
import type { Enemy, Unit } from "./rules";
import { rollBphKillCoin } from "./bph-coins";
import { chaosAfterAttack } from "./chaos";
import { chaosActive } from "./chaos-state";
import { BPH_EXECUTABLE_SPELLS } from "./bph-fx-status";
// Exact HeroDefinition.foilNode references; original intrinsic effects, not collection ownership.
const INTRINSIC_FOIL: Readonly<Record<string, readonly BphEffect[]>> = {"Hero1_Archer":[{"nodeId":"FOIL_Archer","type":"FoilHeroHp","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Archer","type":"FoilHeroAttackSpeed","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero1_Barbarian":[{"nodeId":"FOIL_Barbarian","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Barbarian","type":"HeroAreaAttack","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero1_Squire":[{"nodeId":"FOIL_Squire","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Squire","type":"FoilHeroAttackPower","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero2_Knight":[{"nodeId":"FOIL_Knight","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Knight","type":"HeroBlockChance","value":0.05999999865889549,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero2_Monk":[{"nodeId":"FOIL_Monk","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Monk","type":"FoilHeroAttackSpeed","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Monk","type":"HeroMoveSpeed","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero2_Pyromancer":[{"nodeId":"FOIL_Pyromancer","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Pyromancer","type":"HeroCastCount","value":2.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero3_DemonSlayer":[{"nodeId":"FOIL_DemonSlayer","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_DemonSlayer","type":"HeroCritChance","value":0.02500000037252903,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero3_Illusionist":[{"nodeId":"FOIL_Illusionist","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Illusionist","type":"HeroExtraCopiesMultiplier","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero3_Portal":[{"nodeId":"FOIL_Portal","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero3_WitchDoctor":[{"nodeId":"FOIL_WitchDoctor","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_WitchDoctor","type":"HeroCastCount","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero4_Bannerman":[{"nodeId":"FOIL_Bannerman","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Bannerman","type":"BannermanAttackExtraChargeCount","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero4_Duelist":[{"nodeId":"FOIL_Duelist","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Duelist","type":"HeroAttackRange","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero4_Stormcaller":[{"nodeId":"FOIL_Stormcaller","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Stormcaller","type":"HeroCastCount","value":2.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero9_BlackHole":[{"nodeId":"FOIL_BlackHole","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_BlackHole","type":"TeleporterExtraTeleportOnAttack","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero9_Quasar":[{"nodeId":"FOIL_Quasar","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Quasar","type":"HeroCastCount","value":2.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero9_Supernova":[{"nodeId":"FOIL_Supernova","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Supernova","type":"HeroCastCount","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero_Skeleton":[{"nodeId":"FOIL_Skeleton","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero5_Beastmaster":[{"nodeId":"FOIL_Beastmaster","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero5_Dino":[{"nodeId":"FOIL_Dino","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Dino","type":"FoilHeroAttackPower","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero5_DinoRider":[{"nodeId":"FOIL_DinoRider","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_DinoRider","type":"FoilHeroAttackPower","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero5_Rider":[{"nodeId":"FOIL_Rider","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Rider","type":"FoilHeroAttackSpeed","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero5_Treant":[{"nodeId":"FOIL_Treant","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Treant","type":"TreantSeedBounce","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero6_BloodMage":[{"nodeId":"FOIL_BloodMage","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_BloodMage","type":"BloodMageLifestealBonus","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero6_Shotgun":[{"nodeId":"FOIL_Shotgun","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Shotgun","type":"HeroProjectileCount","value":2.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Shotgun","type":"HeroAttackRange","value":0.10000000149011612,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero6_Skelewheel":[{"nodeId":"FOIL_Skelewheel","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Skelewheel","type":"HeroMoveSpeed","value":0.5,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero7_AstralFisher":[{"nodeId":"FOIL_AstralFisher","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_AstralFisher","type":"AstralFisherExtraLines","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero7_Icebourne":[{"nodeId":"FOIL_Icebourne","type":"FoilHeroHp","value":1.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}},{"nodeId":"FOIL_Icebourne","type":"RotatingSwordCount","value":2.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}],"Hero7_Warlord":[{"nodeId":"FOIL_Warlord","type":"FoilHeroHp","value":2.0,"effectPower":0.0,"effectPowerScale":0.0,"stackCap":0.0,"countStep":0,"targets":{"targetClass":"0","secondTargetClass":"0","useTargetRarity":"0","targetRarity":"0","replacementRarity":"0","deathCoinChanceLossPerCoin":"0.0"}}]};

/**
 * Original percentages operate on unscaled profile stats. Same-stat bonuses add;
 * the independent collection multiplier applies after those percentages.
 * Runtime provenance that the shared contract does not expose is never inferred
 * from discovery, binderSourcePack, appearance, or the last opened pack.
 */
const STAT_KINDS = [
  "ArcherFireRate", "ArcherRange", "FireMageAttackSpeed", "HeroAreaAttack",
  "HeroAttackPower", "HeroAttackRange", "HeroAttackSpeed", "HeroBlockChance",
  "HeroCritChance", "HeroCritChancePerCombatCoin", "HeroCritDamage",
  "HeroDamageReduction", "HeroDeathAttackPowerBonusDay",
  "HeroDeathAttackSpeedBonusDay", "HeroDeathMoveSpeedBonusDay", "HeroDuration",
  "HeroHpPerPackOpened", "HeroMoveSpeed", "HeroStatsPerFoilHeroInCollection",
  "FoilHeroHp", "FoilHeroAttackPower", "FoilHeroAttackSpeed",
  "TargetPackHeroDamage", "TargetPackHeroHp", "GiantDamageBonus",
  "HeroDamagePerPurchasedUpgrade",
] as const;

const EVENT_KINDS = [
  "ArcherArrowBounce", "ArcherArrowBounceChance",
  "DuplicateHeroSpawnWhileNoHeroesAlive", "FirstTargetRaritySpawnDuplicate",
  "HeroClassAlsoCountsAs", "HeroDeathSpawnBonusPackChance",
  "HeroKillBonusCoinChance", "HeroKillHealChance", "HeroKillHealPercent",
  "HeroKillMasteryFlat", "HeroProjectileCount", "HeroSpawnExtraCopies",
  "HeroSpawnShieldPercent", "TargetHeroExtraProjectilesDouble",
  "BloodMageConsumeHealPercent", "BloodMageConsumeOnKillChance", "BloodMageLifestealBonus",
  "HeroBuffShareToRandomHero", "HeroCastCount", "HeroMasteryMultiplier", "HeroReflectDamagePercent",
  "AstralFisherExtraLines", "AstralFisherHookedDoubleDamage", "AstralFisherImmuneWhilePulling",
  "AstralFisherPathStun", "AstralFisherPullSpeedPercent",
  "BannermanAttackExtraChargeCount", "BannermanDeathChargeCount", "BannermanSpawnChargeCount",
  "DinoDashDistance", "DinoDashRepeatChance", "RogueDashCount",
  "FirstHeroSpawnSacrificeReplaceFromPack", "HeroAliveTimeBecomeGiant", "HeroDashKillGainDashCount",
  "HeroMoveLightBeamDamage", "HeroMoveLightBeamDistance", "HeroMoveLightBeamRadius",
  "HeroSkillTreeVisualUpgrade", "HeroSpawnAsGiantChance", "HeroSpawnEveryNthSacrificeGainPack",
  "HeroSpawnSacrificeChanceReplaceFromPack", "HeroSpawnTransformAllHeroesChance",
  "HeroWheelModeDurationSeconds", "HeroWheelModeEdgeHitMoveSpeedMultiplier",
  "HeroWheelModeWheelingMoveSpeedMultiplierRamp", "OnHeroDeathSpawn", "PaladinTauntArea",
  "RotatingSwordCount", "RotatingSwordSizeBonus", "RotatingSwordSpeedBonus",
  "SacrificeHeroFromEveryNthPack", "SacrificeHeroFromFirstPacksCount",
  "TeleporterDepartDamageEnabled", "TeleporterExtraTeleportOnAttack",
  "TreantSeedBounce", "TreantSpawnSeedCount", "WavePackSpawnExtraTargetPackChance",
  "WaveTargetPackSpawnIntervalReduction",
] as const;

/** Unregistered kinds remain explicitly unconfirmed, including the second half. */
export const BPH_PROFILE_UNCONFIRMED: Readonly<Record<string, string>> = {
  AstralFisherHookedKillSpectre: "템플릿은 확인했지만 Spectre 수명·HP drain·원본 적 상태 승계 계약 미확인",
  BeastmasterFriendDeathRespawn: "부모·생애·위치는 제공됐지만 원본 재생성 동물 풀·가중치·회차 승계 규칙 미확인",
  BloodChalice: "성배 충전량·임계값·거래 선택 실행 미확인",
  DinoRiderDashFireArrow: "기수 arrow 개수·간격은 있지만 원본 화살 속도/종류 실행과 riderPiercerSpell 참조가 0이라 미확인",
  BloodMageConsumeNearbyHeroDeathChance: "주변 아군 시체 검사 반경의 BloodMage 전용 원본 필드·실행 근거 미확인",
  BloodMageStackDamageOnConsume: "성장 누적이 가산·복리 중 어느 공식인지 데이터만으로 미확인",
  FoilMonsterKillBonusCoin: "8ea089e Enemy에는 여전히 실제 적 foil 정보가 없음",
  HeroBlizzardDamageReduction: "damage-dealt에는 spellId가 있지만 피해 전 before-unit-damage에는 없음",
  HeroDeathBonusCoinChance: "deathCoinChanceLossPerCoin=0.15000000596046448의 차감 기준·누적 공식 미확인",
  HeroExtraCopiesMultiplier: "환영 개수·부모·복제 반올림 공식 미확인",
  HeroLowHpAttackSpeed: "저체력→공격 속도 곡선 미확인",
  HeroMineAoeRadius: "Spell_Mine에는 폭발 반경만 있고 원본 접촉·충전·기폭 조건은 직렬화되지 않음",
  HeroMineChainDamageBonus: "ColossusMineSpell 직렬화에 원본 연쇄 기폭 조건·충전 보너스 공식이 없음",
  HeroMineChargeTimeReductionSeconds: "원본 충전 기준 시간 미확인; tickRate/duration을 충전 시간으로 추정하지 않음",
  HeroMonsterPullRadius: "반경 3은 확인했지만 BlackHole의 기본 흡인 속도·힘 공식 미확인",
  HeroPeriodicShockNearby: "원본 충격 주기·첫 적용 시점과 표적 선택 공식 미확인",
  HeroPeriodicShockNearbyRange: "반경1과 공간 환산은 확인했지만 기본 충격 발생 주기는 미확인",
  MonsterKillTransformRandomAlive: "적 변환 API와 대체 적 추첨 풀·분포 미확인",
  SpawnerHigherRaritySpawnWeight: "소환 풀과 강화 후 희귀도별 가중치 미확인",
  TeleporterAoeKnockbackMultiplier: "원본 기본 순간이동 밀치기 힘·충격량 미확인",
  ThiefBladeCount: "spellCast 사건에 적용된 power/발사체 인스턴스가 없어 추가 칼의 실제 위력 승계 미확인",
};

function placement(effect: BphEffect): string {
  return effect.targets.placementId ?? effect.nodeId;
}

function forUnit(context: BphFxContext, unit: Unit): readonly BphEffect[] {
  const info = context.unitInfo(unit);
  return [
    ...context.effects.filter(effect => !effect.nodeId.startsWith("FOIL_")),
    ...(info?.foil ? INTRINSIC_FOIL[unit.bph?.birthProfileId ?? info.profileId] ?? [] : []),
  ];
}

function matches(context: BphFxContext, effect: BphEffect, id: string, unit?: Unit): boolean {
  const profile = BPH_PROFILES[id];
  if (!profile) return false;
  if (effect.targets.targetHero && effect.targets.targetHero !== id
    && !(profile.raw.isSkillTreeVisualVariant === 1 && unit?.bph?.birthProfileId === effect.targets.targetHero)) return false;
  const info = unit && (effect.nodeId.startsWith("FOIL_") || effect.type.startsWith("FoilHero") || effect.type.startsWith("TargetPackHero")) ? context.unitInfo(unit) : null;
  if (effect.nodeId.startsWith("FOIL_")
    && (!info?.foil || !(INTRINSIC_FOIL[unit?.bph?.birthProfileId ?? id] ?? []).some(e => e.nodeId === effect.nodeId))) return false;
  if (effect.type.startsWith("FoilHero") && !info?.foil) return false;
  if (effect.type.startsWith("TargetPackHero") && info?.packId !== effect.targets.targetPack) return false;
  const heroClass = Number(effect.targets.targetClass ?? 0);
  if (heroClass > 0 && !(unit ? context.originalClasses(unit) : [Number(profile.raw.heroClass)]).includes(heroClass)) return false;
  if (effect.targets.useTargetRarity === "1"
    && profile.rarity !== Number(effect.targets.targetRarity)) return false;
  return true;
}

function unconfirmed(context: BphFxContext, effect: BphEffect, reason: string): void {
  const key = `profiles:unconfirmed:${placement(effect)}:${effect.type}`;
  if (context.state.counters[key]) return;
  context.state.counters[key] = 1;
  context.emit({ kind: "event", x: 0, y: 0, value: 0,
    label: `미확인 ${effect.type} (${effect.nodeId}): ${reason}` });
}

function copy(context: BphFxContext, unit: Unit, copies: number): void {
  // spawnProfile synchronously dispatches unit-spawn. Generated copies must not
  // recursively duplicate themselves or spend a first-spawn relic's budget.
  const key = "profiles:copy-depth";
  context.state.counters[key] = (context.state.counters[key] ?? 0) + 1;
  const info = context.unitInfo(unit);
  if (!info) { context.state.counters[key]--; return; }
  try { context.spawnProfile(info.profileId, copies, {
    packId: info.packId, ...(info.resultId === null ? {} : { resultId: info.resultId }),
    parentId: unit.id, cause: "duplicate", foil: info.foil, giant: info.giant,
    position: { x: unit.x, y: unit.y },
  }); }
  finally { context.state.counters[key]--; }
}

function stats(context: BphFxContext, event: Extract<BphFxEvent, { kind: "unit-stats" }>): void {
  let hp = 0, damage = 0, speed = 0, range = 0, area = 0, move = 0;
  let collection = 0, openedHpMultiplier = 0, upgradeDamageMultiplier = 0;
  const deaths = context.state.counters["profiles:deaths"] ?? 0;
  const coins = context.state.counters["profiles:coins"] ?? 0;
  for (const effect of forUnit(context, event.unit)) {
    if (!matches(context, effect, event.profileId, event.unit)) continue;
    const v = effect.value;
    const deathBonus = Math.min(deaths * v, effect.stackCap);
    switch (effect.type) {
      case "HeroDuration": case "FoilHeroHp": case "TargetPackHeroHp": hp += v; break;
      case "FoilHeroAttackPower": case "TargetPackHeroDamage": damage += v; break;
      case "FoilHeroAttackSpeed": speed += v; break;
      case "GiantDamageBonus": if (context.unitInfo(event.unit)?.giant) damage += v; break;
      case "HeroAttackPower":
        if (effect.nodeId !== "R_HeroSpawnTransformAllHeroes") damage += v;
        break;
      case "HeroAttackSpeed": case "ArcherFireRate": case "FireMageAttackSpeed": speed += v; break;
      case "HeroAttackRange": case "ArcherRange": range += v; break;
      case "HeroAreaAttack": area += v; break;
      case "HeroMoveSpeed": move += v; break;
      case "HeroBlockChance": event.stats.blockChance += v; break;
      case "HeroCritChance": event.stats.critChance += v; break;
      case "HeroCritDamage": event.stats.critDamage += v; break;
      case "HeroDamageReduction": event.stats.damageReduction += v; break;
      case "HeroCritChancePerCombatCoin": event.stats.critChance += Math.min(coins * v, effect.stackCap); break;
      case "HeroDeathAttackPowerBonusDay": damage += deathBonus; break;
      case "HeroDeathAttackSpeedBonusDay": speed += deathBonus; break;
      case "HeroDeathMoveSpeedBonusDay": move += deathBonus; break;
      case "HeroHpPerPackOpened":
        if (effect.countStep > 0) openedHpMultiplier += Math.min(Math.floor(context.save.totalOpened / effect.countStep) * v, effect.stackCap);
        break;
      case "HeroStatsPerFoilHeroInCollection":
        collection += new Set(context.save.foils.filter(id => BPH_PROFILES[id]?.collectible)).size * v;
        break;
      case "HeroDamagePerPurchasedUpgrade": {
        const upgrades = new Set(context.save.purchasedPlacements.filter(bphPlacementIsUpgrade)).size;
        upgradeDamageMultiplier += Math.floor(upgrades / effect.countStep) * v;
        break;
      }
    }
  }
  event.stats.hp *= (1 + hp) * (1 + openedHpMultiplier) * (1 + collection);
  event.stats.damage *= (1 + damage) * (1 + collection) * (1 + upgradeDamageMultiplier);
  event.stats.cooldown /= 1 + speed;
  event.stats.range *= 1 + range;
  event.stats.area *= 1 + area;
  event.stats.moveSpeed *= 1 + move;
}

function beforeAttack(context: BphFxContext, event: Extract<BphFxEvent, { kind: "before-attack" }>): void {
  const id = context.profileId(event.unit);
  if (!id) return;
  let projectiles = 0, double = false, bounceChance = 0;
  for (const effect of forUnit(context, event.unit)) {
    if (!matches(context, effect, id, event.unit)) continue;
    switch (effect.type) {
      case "HeroProjectileCount": projectiles += effect.value; break;
      case "TargetHeroExtraProjectilesDouble": if (effect.value > 0) double = true; break;
      case "ArcherArrowBounce": event.attack.bounces += effect.value; break;
      case "ArcherArrowBounceChance": bounceChance += effect.value; break;
    }
  }
  if (bounceChance > 0 && context.random() < context.chance(bounceChance)) event.attack.bounces++;
  event.attack.extraProjectiles += projectiles * (double ? 2 : 1);
}

function aliveUnits(context: BphFxContext): Unit[] {
  return context.run.squads.flatMap(squad => [squad, ...squad.soldiers])
    .filter(unit => unit.hp > 0 && context.unitInfo(unit) !== null);
}

function total(context: BphFxContext, unit: Unit, kind: string): number {
  const id = context.profileId(unit);
  return id ? forUnit(context, unit).filter(e => e.type === kind && matches(context, e, id, unit))
    .reduce((sum, e) => sum + e.value, 0) : 0;
}

// Native endConsume needs the real corpse even after the battlefield removes it.
// The weak key is the canonical battle state: references never cross battles.
const pendingConsumes = new WeakMap<BphFxState, { source: Unit; target: Enemy; until: number }[]>();
export const BPH_PROFILE_ATTACK_SPELLS: Readonly<Record<string, string>> = {
  Hero2_Pyromancer: "Spell_Fireball", Hero3_WitchDoctor: "Spell_InfectionBomb",
  Hero4_Stormcaller: "Spell_Tornado", Hero9_Quasar: "Spell_Quasar", Hero9_Supernova: "Spell_Mine",
};
const BUFFS = ["Strength", "Fortify", "Regenerate", "Thorns", "Momentum", "Haste",
  "Revive", "Charge", "Invisibility", "RankUp"] as const;

const PROFILE_IDS = Object.keys(BPH_PROFILES);
// Verified components: Hero.screenClampMargin and OrbitingSwordsAttack.hitRadius.
const EDGE_MARGIN = 0.6000000238418579 * BPH_WORLD_TO_PX;
const SWORD_HIT_RADIUS = 0.2800000011920929 * BPH_WORLD_TO_PX;
const forms = new WeakMap<BphFxState, {
  unit: Unit; profileId: string; temporaryId: string; until: number; lifeId: number;
}[]>();
const gap = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
function segmentGap(point: Point, from: Point, to: Point): number {
  const x = to.x - from.x, y = to.y - from.y, length = x * x + y * y;
  const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * x + (point.y - from.y) * y) / length)) : 0;
  return Math.hypot(point.x - from.x - t * x, point.y - from.y - t * y);
}
function unitById(context: BphFxContext, id: number): Unit | undefined {
  return context.run.squads.flatMap(s => [s, ...s.soldiers]).find(unit => unit.id === id);
}
function actor(context: BphFxContext, owner: Unit, kind: BphActor["kind"], to: Point, until: number): BphActor {
  const info = context.unitInfo(owner);
  const result: BphActor = {
    id: context.run.nextId++, ownerId: owner.id, kind, x: owner.x, y: owner.y,
    toX: to.x, toY: to.y, startedAt: context.run.time, until,
    power: bphStats(owner, context.run)?.damage ?? 0, radius: 0, targets: [],
    data: { profiles: 1, lifeId: info?.lifeId ?? 0, profile: PROFILE_IDS.indexOf(info?.profileId ?? "") },
  };
  context.state.actors.push(result);
  return result;
}
function owned(context: BphFxContext, unit: Unit, kind?: BphActor["kind"]): BphActor[] {
  return context.state.actors.filter(a => a.data.profiles === 1 && a.ownerId === unit.id
    && a.until > context.run.time && (!kind || a.kind === kind));
}
function setProfile(context: BphFxContext, unit: Unit, id: string): void {
  if (!unit.bph) return;
  const ratio = unit.hp / unit.maxHp;
  unit.bph.profileId = id;
  unit.kind = BPH_CLASS_BODY[BPH_PROFILES[id].classId];
  const next = bphStats(unit, context.run);
  if (next) { unit.maxHp = next.hp; unit.hp = next.hp * ratio; }
  for (const a of owned(context, unit)) a.until = context.run.time;
}
function sacrifice(context: BphFxContext, unit: Unit, reason: Extract<BphObservation, { kind: "unit-sacrificed" }>["reason"]): void {
  if (unit.hp <= 0) return;
  unit.hp = 0; unit.strikeAt = 0; unit.downUntil = Infinity;
  context.emit({ kind: "down", x: unit.x, y: unit.y, value: 0, target: unit.id });
  context.emitEvent({ kind: "unitKilled", side: "ally", unit, source: null,
    critical: false, origin: "effect", position: { x: unit.x, y: unit.y } });
  context.emitEvent({ kind: "unit-death", unit, killer: null });
  const info = context.unitInfo(unit);
  if (info) context.emitEvent({ kind: "unit-sacrificed", reason,
    life: { unitId: unit.id, lifeId: info.lifeId, profileId: info.profileId,
      parentId: info.parentId, cause: info.cause } });
}
function replaceFromPack(context: BphFxContext, unit: Unit, rarity: number, copies: number): void {
  const info = context.unitInfo(unit), pack = info && BPH_PACKS[info.packId];
  if (!info || !pack) return;
  const pool = pack.pool.filter(row => BPH_PROFILES[row.id]?.rarity === rarity && row.weight > 0);
  if (!pool.length) return;
  const weight = pool.reduce((sum, row) => sum + row.weight, 0);
  sacrifice(context, unit, "pack-replacement");
  for (let n = 0; n < copies; n++) {
    let roll = context.random() * weight;
    for (const row of pool) {
      roll -= row.weight;
      if (roll >= 0) continue;
      context.spawnProfile(row.id, 1, { packId: info.packId, parentId: unit.id, cause: "effect",
        ...(info.resultId === null ? {} : { resultId: info.resultId }),
        position: { x: unit.x, y: unit.y }, foil: info.foil, giant: info.giant });
      break;
    }
  }
}
function charge(context: BphFxContext, source: Unit, count: number): void {
  const raw = BPH_PROFILES.Hero4_Bannerman.raw;
  const candidates = aliveUnits(context).filter(unit => unit !== source);
  for (let n = 0; n < count && candidates.length; n++) {
    const index = Math.floor(context.random() * candidates.length), target = candidates.splice(index, 1)[0];
    context.applyBuff({ target, source, side: "ally", id: "Charge",
      duration: Number(raw.bannermanChargeDuration), power: 100, stacks: 1 });
  }
}
function startDash(context: BphFxContext, unit: Unit, target: Enemy, remaining?: number): BphActor {
  const id = context.profileId(unit) ?? "", raw = BPH_PROFILES[id].raw;
  const angle = Math.atan2(target.y - unit.y, target.x - unit.x);
  const max = Number(raw.dashMaxDistance) * (1 + total(context, unit, "DinoDashDistance")) * BPH_WORLD_TO_PX;
  // A zero authored max is unrestricted; the authored minimum still applies.
  const distance = Math.max(Number(raw.dashMinDistance) * BPH_WORLD_TO_PX, Math.min(gap(unit, target), max || Infinity));
  const speed = (bphStats(unit, context.run)?.moveSpeed ?? 0) * Number(raw.chargeMoveSpeedMultiplier) * BPH_WORLD_TO_PX;
  const a = actor(context, unit, "dash",
    { x: unit.x + Math.cos(angle) * distance, y: unit.y + Math.sin(angle) * distance }, context.run.time + distance / speed);
  a.radius = Number(raw.dashHitRadius) * BPH_WORLD_TO_PX;
  a.power = Number(raw.chargeAttackDamage) * (bphStats(unit, context.run)?.damage ?? 0) / BPH_PROFILES[id].damage;
  Object.assign(a.data, { fromX: unit.x, fromY: unit.y, speed, remaining: remaining ??
    (id === "Hero2_Monk" ? 3 + total(context, unit, "RogueDashCount") : 1), chain: 1,
    arrowAt: context.run.time + Number(raw.riderArrowInterval) });
  unit.strikeAt = a.until; unit.aim = target.id;
  return a;
}
function startHook(context: BphFxContext, unit: Unit, target: Enemy): void {
  const raw = BPH_PROFILES.Hero7_AstralFisher.raw;
  const a = actor(context, unit, "hook", target, Infinity);
  a.targets = [target.id];
  a.radius = Number(raw.astralFisherPathStunRadius) * BPH_WORLD_TO_PX;
  a.data.phase = 0;
}
function startWheel(context: BphFxContext, unit: Unit, target: Enemy): void {
  const raw = BPH_PROFILES.Hero6_Skelewheel.raw;
  const a = actor(context, unit, "wheel", target, context.run.time
    + Number(raw.wheelModeDurationSeconds) + total(context, unit, "HeroWheelModeDurationSeconds"));
  a.radius = BPH_PROFILES.Hero6_Skelewheel.range * BPH_WORLD_TO_PX;
  Object.assign(a.data, { angle: Math.atan2(target.y - unit.y, target.x - unit.x),
    bonus: 0, rampTicks: 0, base: Number(raw.wheelModeMoveSpeedMultiplier) });
  unit.x = a.x = Math.max(EDGE_MARGIN, Math.min(WIDTH - EDGE_MARGIN, unit.x));
  unit.y = a.y = Math.max(EDGE_MARGIN, Math.min(HEIGHT - EDGE_MARGIN, unit.y));
  unit.strikeAt = a.until;
}
function startSwords(context: BphFxContext, unit: Unit): void {
  const raw = BPH_PROFILES.Hero7_Icebourne.raw;
  const count = Number(raw.rotatingSwordCount) + total(context, unit, "RotatingSwordCount");
  for (let n = 0; n < count; n++) {
    const a = actor(context, unit, "blade", unit, context.run.time + Number(raw.rotatingSwordDuration));
    a.radius = SWORD_HIT_RADIUS * (1 + total(context, unit, "RotatingSwordSizeBonus"));
    Object.assign(a.data, { angle: n * Math.PI * 2 / count,
      angular: Number(raw.rotatingSwordAngularSpeed) * Math.PI / 180 * (1 + total(context, unit, "RotatingSwordSpeedBonus")),
      orbit: Number(raw.rotatingSwordRadius) * BPH_WORLD_TO_PX });
    a.x = unit.x + Math.cos(a.data.angle) * a.data.orbit;
    a.y = unit.y + Math.sin(a.data.angle) * a.data.orbit;
  }
}
function startSeed(context: BphFxContext, unit: Unit, count: number): void {
  const raw = BPH_PROFILES.Hero5_Treant.raw;
  const candidates = aliveUnits(context).filter(other => other !== unit && gap(unit, other) <= Number(raw.seedRange) * BPH_WORLD_TO_PX);
  for (let n = 0; n < count && candidates.length; n++) {
    const target = candidates[Math.floor(context.random() * candidates.length)];
    const a = actor(context, unit, "seed", target, context.run.time + 0.800000011920929);
    a.targets = [target.id];
    const effects = forUnit(context, unit).filter(e => e.type === "TreantSeedBounce");
    Object.assign(a.data, { bounces: effects.reduce((sum, e) => sum + e.value, 0),
      guaranteed: effects.filter(e => e.nodeId.startsWith("FOIL_")).reduce((sum, e) => sum + e.value, 0),
      chance: Math.max(0, ...effects.map(e => e.effectPower)) });
  }
}

function tickHook(context: BphFxContext, a: BphActor, unit: Unit, dt: number): void {
  const target = context.run.enemies.find(e => e.id === a.targets[0]);
  if (!target || target.hp <= 0) {
    if (target) context.emitEvent({ kind: "hook-pull", actor: a, phase: "end", target });
    a.until = context.run.time;
    return;
  }
  const raw = BPH_PROFILES.Hero7_AstralFisher.raw;
  if (a.data.phase === 0) {
    const distance = gap(a, target), travel = Number(raw.astralFisherProjectileSpeed) * BPH_WORLD_TO_PX * dt;
    a.toX = target.x; a.toY = target.y;
    if (travel < distance) {
      a.x += (target.x - a.x) / distance * travel; a.y += (target.y - a.y) / distance * travel;
      return;
    }
    a.x = target.x; a.y = target.y; a.data.phase = 1;
    a.data.pullAt = context.run.time;
    a.until = context.run.time + Number(raw.astralFisherPullDuration) /
      (1 + total(context, unit, "AstralFisherPullSpeedPercent"));
    a.data.fromX = target.x; a.data.fromY = target.y;
    const distanceToOwner = gap(unit, target);
    const pull = Math.min(Number(raw.astralFisherPullDistance) * BPH_WORLD_TO_PX, distanceToOwner);
    a.data.goalX = target.x + (unit.x - target.x) / (distanceToOwner || 1) * pull;
    a.data.goalY = target.y + (unit.y - target.y) / (distanceToOwner || 1) * pull;
    target.stun = Math.max(target.stun, Number(raw.astralFisherHitStunDuration));
    context.emitEvent({ kind: "hook-pull", actor: a, phase: "start", target });
    context.emitEvent({ kind: "hook-pull", actor: a, phase: "hit", target });
  }
  if (total(context, unit, "AstralFisherPathStun") > 0)
    for (const enemy of context.run.enemies)
      if (enemy.hp > 0 && segmentGap(enemy, unit, target) <= a.radius) enemy.stun = Math.max(enemy.stun, 3);
  const steps = Number(raw.astralFisherPullStepCount);
  const elapsed = Math.min(1, (context.run.time - a.data.pullAt) / (a.until - a.data.pullAt));
  const progress = elapsed * steps, whole = Math.floor(progress);
  const fraction = Math.min(1, (progress - whole) / (1 - Number(raw.astralFisherPullStepPauseFraction)));
  const t = Math.min(1, (whole + fraction) / steps);
  target.x = a.x = a.data.fromX + (a.data.goalX - a.data.fromX) * t;
  target.y = a.y = a.data.fromY + (a.data.goalY - a.data.fromY) * t;
  if (elapsed >= 1) {
    const multiplier = total(context, unit, "AstralFisherHookedDoubleDamage") > 0 ? 2 : 1;
    context.applyDamage({ target, source: unit, amount: a.power * multiplier, attackId: a.attackId });
    context.emitEvent({ kind: "hook-pull", actor: a, phase: "end", target });
    a.until = context.run.time;
  }
}

function tickDash(context: BphFxContext, a: BphActor, unit: Unit, dt: number): void {
  if (context.run.time <= a.startedAt) return;
  const from = { x: a.x, y: a.y }, distance = gap(a, { x: a.toX, y: a.toY });
  const travel = Math.min(distance, a.data.speed * dt);
  if (distance > 0) {
    a.x += (a.toX - a.x) / distance * travel; a.y += (a.toY - a.y) / distance * travel;
  }
  unit.x = a.x; unit.y = a.y;
  const raw = BPH_PROFILES[PROFILE_IDS[a.data.profile]].raw;
  for (const enemy of context.run.enemies) {
    if (enemy.hp <= 0 || a.targets.includes(enemy.id) || segmentGap(enemy, from, a) > a.radius) continue;
    a.targets.push(enemy.id);
    enemy.stun = Math.max(enemy.stun, Number(raw.dashHitStunDuration));
    a.data.executing = 1;
    context.applyDamage({ target: enemy, source: unit, amount: a.power, attackId: a.attackId });
    a.data.executing = 0;
  }
  if (travel < distance) { a.until = Math.max(a.until, context.run.time + (distance - travel) / a.data.speed); return; }
  context.emitEvent({ kind: "dash-end", unit, from: { x: a.data.fromX, y: a.data.fromY },
    to: { x: unit.x, y: unit.y }, returning: false });
  let remaining = a.data.remaining - 1;
  const repeat = total(context, unit, "DinoDashRepeatChance");
  if (repeat > 0 && a.data.chain < Number(raw.dashRepeatMaxChain)
    && context.random() < context.chance(repeat)) remaining++;
  a.until = context.run.time;
  const targets = context.run.enemies.filter(e => e.hp > 0).sort((first, second) => gap(unit, first) - gap(unit, second));
  if (remaining > 0 && targets.length) {
    const next = startDash(context, unit, targets[0], remaining);
    const delay = Number(raw.dashRepeatDelay);
    next.startedAt += delay; next.until += delay; next.data.chain = a.data.chain + 1;
    unit.strikeAt = next.until;
  } else { unit.strikeAt = 0; unit.clock = BPH_PROFILES[PROFILE_IDS[a.data.profile]].cooldown; }
}

function tickWheel(context: BphFxContext, a: BphActor, unit: Unit, dt: number): void {
  const ticks = Math.floor((context.run.time - a.startedAt) / 0.1);
  a.data.bonus += (ticks - a.data.rampTicks) * total(context, unit, "HeroWheelModeWheelingMoveSpeedMultiplierRamp");
  a.data.rampTicks = ticks;
  let time = Math.min(dt, a.until - (context.run.time - dt));
  const contacts = new Set<number>();
  while (time > 0) {
    const speed = (bphStats(unit, context.run)?.moveSpeed ?? 0) * BPH_WORLD_TO_PX * a.data.base * (1 + a.data.bonus);
    const cos = Math.cos(a.data.angle), sin = Math.sin(a.data.angle);
    const edgeX = cos > 0 ? (WIDTH - EDGE_MARGIN - a.x) / cos : cos < 0 ? (EDGE_MARGIN - a.x) / cos : Infinity;
    const edgeY = sin > 0 ? (HEIGHT - EDGE_MARGIN - a.y) / sin : sin < 0 ? (EDGE_MARGIN - a.y) / sin : Infinity;
    const travel = Math.max(0, Math.min(speed * time, edgeX, edgeY));
    const from = { x: a.x, y: a.y };
    a.x += cos * travel; a.y += sin * travel;
    a.x = Math.max(EDGE_MARGIN, Math.min(WIDTH - EDGE_MARGIN, a.x));
    a.y = Math.max(EDGE_MARGIN, Math.min(HEIGHT - EDGE_MARGIN, a.y));
    time -= travel / speed;
    for (const enemy of context.run.enemies) if (enemy.hp > 0 && segmentGap(enemy, from, a) <= a.radius) {
      contacts.add(enemy.id);
      if (!a.targets.includes(enemy.id)) context.applyDamage({ target: enemy, source: unit, amount: a.power, attackId: a.attackId });
    }
    if (travel === edgeX) {
      a.data.angle = Math.PI - a.data.angle;
      a.data.bonus += total(context, unit, "HeroWheelModeEdgeHitMoveSpeedMultiplier");
      context.emitEvent({ kind: "wheel-edge", actor: a, side: cos > 0 ? "우" : "좌" });
    }
    if (travel === edgeY) {
      a.data.angle = -a.data.angle;
      a.data.bonus += total(context, unit, "HeroWheelModeEdgeHitMoveSpeedMultiplier");
      context.emitEvent({ kind: "wheel-edge", actor: a, side: sin > 0 ? "아래" : "위" });
    }
    if (travel < Math.min(edgeX, edgeY)) break;
  }
  a.targets = [...contacts]; unit.x = a.x; unit.y = a.y;
  if (context.run.time >= a.until) {
    unit.strikeAt = 0; unit.clock = BPH_PROFILES.Hero6_Skelewheel.cooldown;
  }
}

function tickSword(context: BphFxContext, a: BphActor, unit: Unit, dt: number): void {
  const from = { x: a.x, y: a.y };
  a.data.angle += a.data.angular * dt;
  a.x = unit.x + Math.cos(a.data.angle) * a.data.orbit;
  a.y = unit.y + Math.sin(a.data.angle) * a.data.orbit;
  const contacts = context.run.enemies.filter(enemy => enemy.hp > 0 && segmentGap(enemy, from, a) <= a.radius);
  for (const enemy of contacts) if (!a.targets.includes(enemy.id))
    context.applyDamage({ target: enemy, source: unit, amount: a.power, attackId: a.attackId });
  a.targets = contacts.map(enemy => enemy.id);
}

function tickSeed(context: BphFxContext, a: BphActor, unit: Unit, dt: number): void {
  const target = unitById(context, a.targets[a.targets.length - 1]);
  if (!target || target.hp <= 0) { a.until = context.run.time; return; }
  const distance = gap(a, target), travel = 10 * BPH_WORLD_TO_PX * dt;
  if (travel < distance) {
    a.x += (target.x - a.x) / distance * travel; a.y += (target.y - a.y) / distance * travel;
    return;
  }
  a.x = target.x; a.y = target.y;
  context.applyBuff({ target, source: unit, side: "ally", id: "Fortify",
    duration: Number(BPH_PROFILES.Hero5_Treant.raw.seedStatusDuration), power: 0, stacks: 1 });
  if (a.data.bounces > 0 && (a.data.guaranteed > 0 || context.random() < context.chance(a.data.chance))) {
    a.data.bounces--; a.data.guaranteed--;
    const candidates = aliveUnits(context).filter(other => !a.targets.includes(other.id)
      && other !== unit && gap(target, other) <= Number(BPH_PROFILES.Hero5_Treant.raw.seedRange) * BPH_WORLD_TO_PX);
    if (candidates.length) {
      const next = candidates[Math.floor(context.random() * candidates.length)];
      a.targets.push(next.id); a.toX = next.x; a.toY = next.y;
      a.until = context.run.time + 0.800000011920929;
      return;
    }
  }
  a.until = context.run.time;
}

function tickActors(context: BphFxContext, dt: number): void {
  for (const a of [...context.state.actors]) {
    if (a.data.profiles !== 1) continue;
    const unit = unitById(context, a.ownerId), info = unit && context.unitInfo(unit);
    if (!unit || unit.hp <= 0 || !info || info.lifeId !== a.data.lifeId
      || info.profileId !== PROFILE_IDS[a.data.profile]) { a.until = context.run.time; continue; }
    if (a.kind !== "dash" && a.kind !== "hook" && a.until < context.run.time - dt) continue;
    switch (a.kind) {
      case "hook": tickHook(context, a, unit, dt); break;
      case "dash": tickDash(context, a, unit, dt); break;
      case "wheel": tickWheel(context, a, unit, dt); break;
      case "blade": tickSword(context, a, unit, dt); break;
      case "seed": tickSeed(context, a, unit, dt); break;
    }
  }
  context.state.actors = context.state.actors.filter(a => a.data.profiles !== 1 || a.until > context.run.time);
}

function walkBeam(context: BphFxContext, unit: Unit): void {
  const key = `profiles:walk:${unit.id}`, step = total(context, unit, "HeroMoveLightBeamDistance");
  const previousX = context.state.counters[`${key}:x`], previousY = context.state.counters[`${key}:y`];
  context.state.counters[`${key}:x`] = unit.x; context.state.counters[`${key}:y`] = unit.y;
  if (!(step > 0) || previousX === undefined || previousY === undefined || owned(context, unit).some(a => a.kind === "dash" || a.kind === "wheel")) return;
  let walked = (context.state.counters[key] ?? 0) + Math.hypot(unit.x - previousX, unit.y - previousY) / BPH_WORLD_TO_PX;
  while (walked >= step) {
    walked -= step;
    const a = actor(context, unit, "beam", unit, context.run.time);
    a.radius = total(context, unit, "HeroMoveLightBeamRadius") * BPH_WORLD_TO_PX;
    a.power = total(context, unit, "HeroMoveLightBeamDamage");
    a.cast = beginBphCast(context, { spellId: "Spell_BeamOfLight", source: unit, target: null,
      position: { x: unit.x, y: unit.y }, foil: context.unitInfo(unit)?.foil ?? false, power: a.power });
    for (const enemy of context.run.enemies.filter(e => e.hp > 0 && gap(e, unit) <= a.radius)) {
      a.targets.push(enemy.id); enemy.stun = Math.max(enemy.stun, 0.25);
      context.applyDamage({ target: enemy, source: unit, amount: a.power, spellId: "Spell_BeamOfLight", cast: a.cast });
    }
    context.emit({ kind: "blast", x: unit.x, y: unit.y, value: a.radius });
  }
  context.state.counters[key] = walked;
}

function naturePacks(context: BphFxContext): void {
  if (context.run.bph?.waveId !== "WaveRiftNature") return;
  const key = "profiles:wave:WaveRiftNature";
  const reduction = context.effects.filter(e => e.type === "WaveTargetPackSpawnIntervalReduction"
    && e.targets.targetWaveConfig === "WaveRiftNature" && e.targets.targetPack === "Pack6_Bush")
    .reduce((sum, e) => sum + e.value, 0);
  const spawn = () => context.grantPack("Pack6_Bush", 1, { sourceWave: "WaveRiftNature" });
  if (!(key in context.state.timers)) { context.state.timers[key] = context.run.time; spawn(); }
  else if (context.run.time < context.state.timers[key]) return;
  else spawn();
  // WaveConfig.wavePackSpawns: 8..11 seconds, spawnOnWaveStart=1.
  const interval = 8 + context.random() * 3 - reduction;
  if (interval > 0) context.state.timers[key] = context.run.time + interval;
  else {
    context.state.timers[key] = Infinity;
    for (const e of context.effects.filter(e => e.type === "WaveTargetPackSpawnIntervalReduction"))
      unconfirmed(context, e, "원본 기본 주기보다 큰 중첩 감소의 처리 미확인");
  }
}

function actorEvent(context: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "before-enemy-damage") {
    if (context.state.actors.some(a => a.data.profiles === 1 && a.kind === "hook"
      && a.data.phase === 1 && a.targets.includes(event.enemy.id) && a.until > context.run.time
      && total(context, unitById(context, a.ownerId) ?? context.run.squads[0], "AstralFisherHookedDoubleDamage") > 0))
      event.hit.amount *= 2;
  }
  if (event.kind === "before-unit-damage") {
    if (owned(context, event.unit, "dash").some(() => Number(BPH_PROFILES[context.profileId(event.unit) ?? ""].raw.dashImmune) > 0)
      || (owned(context, event.unit, "hook").some(a => a.data.phase === 1)
        && total(context, event.unit, "AstralFisherImmuneWhilePulling") > 0)) event.hit.prevented = true;
  }
  if (event.kind === "enemy-killed" && event.killer) {
    for (const a of context.state.actors.filter(a => a.data.profiles === 1 && a.kind === "dash"
      && a.ownerId === event.killer?.id && a.data.executing === 1))
      a.data.remaining += total(context, event.killer, "HeroDashKillGainDashCount");
  }
  if (event.kind === "before-attack") {
    const id = context.profileId(event.unit);
    if (!id) return;
    switch (id) {
      case "Hero7_AstralFisher": {
        if (!owned(context, event.unit, "hook").length) {
          const targets = [event.target, ...context.run.enemies.filter(e => e.hp > 0 && e !== event.target)
            .sort((a, b) => gap(a, event.unit) - gap(b, event.unit))];
          for (const target of targets.slice(0, 1 + total(context, event.unit, "AstralFisherExtraLines")))
            startHook(context, event.unit, target);
        }
        event.attack.handled = true; break;
      }
      case "Hero2_Monk": case "Hero5_Dino": case "Hero5_DinoRider":
        if (!owned(context, event.unit, "dash").length) startDash(context, event.unit, event.target);
        event.attack.handled = true; break;
      case "Hero6_Skelewheel":
        if (!owned(context, event.unit, "wheel").length) startWheel(context, event.unit, event.target);
        event.attack.handled = true; break;
      case "Hero7_Icebourne":
        startSwords(context, event.unit); event.attack.handled = true; break;
      case "Hero4_Bannerman":
        charge(context, event.unit, Number(BPH_PROFILES[id].raw.bannermanChargeTargetCount)
          + total(context, event.unit, "BannermanAttackExtraChargeCount")); break;
      case "Hero9_BlackHole": {
        const times = 1 + total(context, event.unit, "TeleporterExtraTeleportOnAttack");
        const marks = [event.target, ...context.run.enemies.filter(e => e.hp > 0 && e !== event.target)
          .sort((a, b) => gap(a, event.unit) - gap(b, event.unit))];
        for (let n = 0; n < times; n++) {
          const mark = marks[n % marks.length];
          if (total(context, event.unit, "TeleporterDepartDamageEnabled") > 0)
            context.state.spells.push({ id: "Spell_TeleportAndDamageAoe", x: event.unit.x, y: event.unit.y,
              sourceId: event.unit.id, power: Number(BPH_PROFILES[id].raw.spellPower) });
          event.unit.x = mark.x; event.unit.y = mark.y;
          context.state.counters[`profiles:walk:${event.unit.id}:x`] = mark.x;
          context.state.counters[`profiles:walk:${event.unit.id}:y`] = mark.y;
          context.state.spells.push({ id: "Spell_TeleportAndDamageAoe", x: mark.x, y: mark.y,
            sourceId: event.unit.id, targetId: mark.id, power: Number(BPH_PROFILES[id].raw.spellPower) });
        }
        event.attack.handled = true; break;
      }
    }
  }
  if (event.kind === "unit-spawn") {
    const unit = event.unit, info = context.unitInfo(unit);
    if (!info) return;
    context.state.timers[`profiles:born:${unit.id}:${info.lifeId}`] = context.run.time;
    context.state.counters[`profiles:walk:${unit.id}:x`] = unit.x;
    context.state.counters[`profiles:walk:${unit.id}:y`] = unit.y;
    const giant = total(context, unit, "HeroSpawnAsGiantChance");
    if (!info.giant && giant > 0 && context.random() < context.chance(giant) && unit.bph)
      unit.bph = { ...unit.bph, giant: true };
    if (total(context, unit, "HeroSkillTreeVisualUpgrade") > 0) setProfile(context, unit, "Hero7_Warlord_Spiked");
    if (event.profileId === "Hero4_Bannerman") charge(context, unit, total(context, unit, "BannermanSpawnChargeCount"));
    if (event.profileId === "Hero5_Treant") startSeed(context, unit, total(context, unit, "TreantSpawnSeedCount"));
    for (const effect of context.effects.filter(e => matches(context, e, event.profileId, unit))) {
      const key = `profiles:spawn:${placement(effect)}:${effect.type}`;
      switch (effect.type) {
        case "HeroSpawnTransformAllHeroesChance":
          if (context.random() < context.chance(effect.value)) {
            const entries = forms.get(context.state) ?? [];
            for (const other of aliveUnits(context).filter(other => other !== unit)) {
              const old = context.unitInfo(other);
              if (!old) continue;
              const previous = entries.find(entry => entry.unit === other && entry.lifeId === old.lifeId);
              if (!previous) entries.push({ unit: other, profileId: old.profileId, temporaryId: event.profileId,
                until: context.run.time + effect.effectPower, lifeId: old.lifeId });
              else { previous.temporaryId = event.profileId; previous.until = context.run.time + effect.effectPower; }
              setProfile(context, other, event.profileId);
            }
            forms.set(context.state, entries);
          }
          break;
        case "HeroSpawnEveryNthSacrificeGainPack":
          context.state.counters[key] = (context.state.counters[key] ?? 0) + 1;
          if (context.state.counters[key] % effect.value === 0 && BPH_PACKS[info.packId]) {
            sacrifice(context, unit, "pack-reward"); context.grantPack(info.packId, 1);
          }
          break;
        case "HeroSpawnSacrificeChanceReplaceFromPack":
          if (context.random() < context.chance(effect.value))
            replaceFromPack(context, unit, Number(effect.targets.replacementRarity), 1);
          break;
        case "FirstHeroSpawnSacrificeReplaceFromPack":
          if (!context.state.counters[key]) {
            context.state.counters[key] = 1;
            replaceFromPack(context, unit, Number(effect.targets.replacementRarity), effect.value);
          }
          break;
      }
    }
  }
  if (event.kind === "unit-death") {
    if (context.profileId(event.unit) === "Hero4_Bannerman")
      charge(context, event.unit, total(context, event.unit, "BannermanDeathChargeCount"));
    for (const effect of context.effects.filter(e => e.type === "OnHeroDeathSpawn"
      && matches(context, e, context.profileId(event.unit) ?? "", event.unit))) {
      let count = effect.value;
      if (effect.nodeId === "_REMOVERelic3_Cursed_Lantern") {
        const roll = context.random() * 100;
        count = roll < 60 ? 1 : roll < 90 ? 2 : 3;
      }
      const info = context.unitInfo(event.unit);
      if (info) context.spawnProfile("Hero_Skeleton", count, { packId: info.packId,
        parentId: event.unit.id, cause: "summon", position: { x: event.unit.x, y: event.unit.y } });
    }
  }
  if (event.kind === "pack-opened") {
    const count = context.state.counters["profiles:opened"] = (context.state.counters["profiles:opened"] ?? 0) + 1;
    for (const effect of context.effects) {
      const applicable = effect.type === "SacrificeHeroFromEveryNthPack" ? count % effect.value === 0
        : effect.type === "SacrificeHeroFromFirstPacksCount" && count <= effect.value;
      if (!applicable) continue;
      const units = aliveUnits(context).filter(unit => {
        const info = context.unitInfo(unit);
        return info?.resultId === event.result.id && info.packId === event.result.packId;
      });
      if (units.length === 1) sacrifice(context, units[0], "pack-opened");
      else if (units.length > 1) unconfirmed(context, effect, "한 개봉의 여러 병력 중 희생 대상 분포 미확인");
    }
  }
  if (event.kind === "wave-pack-spawn" && !context.state.counters["profiles:wave-copy"]) {
    for (const effect of context.effects.filter(e => e.type === "WavePackSpawnExtraTargetPackChance"
      && e.targets.targetWaveConfig === event.waveId && e.targets.targetPack === event.instance.packId)) {
      if (context.random() >= context.chance(effect.value)) continue;
      context.state.counters["profiles:wave-copy"] = 1;
      try { context.grantPack(event.instance.packId, 1, { sourceWave: event.waveId,
        sourceBuilding: event.instance.sourceBuilding, foilChanceBonus: event.instance.foilChanceBonus,
        giantChance: event.instance.giantChance }); }
      finally { context.state.counters["profiles:wave-copy"] = 0; }
    }
  }
  if (event.kind === "step") {
    for (const unit of aliveUnits(context)) {
      walkBeam(context, unit);
      const info = context.unitInfo(unit);
      if (!info) continue;
      if ((info.profileId === "Hero5_Dino" || info.profileId === "Hero5_DinoRider")
        && unit.clock <= 0 && !context.state.actors.some(a => a.data.profiles === 1
          && a.kind === "dash" && a.ownerId === unit.id)) {
        const reach = Number(BPH_PROFILES[info.profileId].raw.dashMaxDistance)
          * (1 + total(context, unit, "DinoDashDistance")) * BPH_WORLD_TO_PX;
        const target = context.run.enemies.filter(e => e.hp > 0 && gap(unit, e) <= reach)
          .sort((a, b) => gap(unit, a) - gap(unit, b))[0];
        if (target) {
          const before = context.state.actors.length;
          context.emitEvent({ kind: "before-attack", unit, target,
            attack: { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false } });
          const state = context.run.chaos;
          const attack = context.state.actors.slice(before).find(actor => actor.ownerId === unit.id && actor.kind === "dash");
          if (state && attack && attack.power > 0 && chaosActive(context.run)) {
            attack.attackId = state.attacks + 1;
            chaosAfterAttack(context.run, { unit, target, amount: attack.power }, context.run.bph?.fxEvents ?? []);
          }
        }
      }
      const become = total(context, unit, "HeroAliveTimeBecomeGiant"), key = `profiles:giant:${unit.id}:${info.lifeId}`;
      if (become > 0 && !context.state.counters[key]
        && context.run.time - context.state.timers[`profiles:born:${unit.id}:${info.lifeId}`] >= become) {
        context.state.counters[key] = 1;
        if (unit.bph) unit.bph = { ...unit.bph, giant: true };
        context.heal(unit, unit.maxHp);
      }
      if (info.profileId === "Hero2_Knight") {
        const castKey = `profiles:bash:${unit.id}:${info.lifeId}`, interval = Number(BPH_PROFILES.Hero2_Knight.raw.spellCastInterval);
        context.state.timers[castKey] ??= context.state.timers[`profiles:born:${unit.id}:${info.lifeId}`] + interval;
        if (context.run.time >= context.state.timers[castKey]) {
          context.state.timers[castKey] += interval;
          const radius = (1 + total(context, unit, "PaladinTauntArea")) * BPH_WORLD_TO_PX;
          context.emitEvent({ kind: "spellCast", spellId: "Spell_Stun", source: unit, target: null,
            position: { x: unit.x, y: unit.y } });
          for (const enemy of context.run.enemies.filter(e => e.hp > 0 && gap(e, unit) <= radius)) {
            enemy.stun = Math.max(enemy.stun, 1.5);
            context.applyBuff({ target: enemy, source: unit, side: "enemy", id: "Stun", duration: 1.5, power: 0, stacks: 1 });
          }
        }
      }
    }
    tickActors(context, event.dt);
    naturePacks(context);
    const entries = forms.get(context.state);
    if (entries) for (let n = entries.length - 1; n >= 0; n--) {
      const entry = entries[n], info = context.unitInfo(entry.unit);
      if (context.run.time < entry.until) continue;
      entries.splice(n, 1);
      if (entry.unit.hp > 0 && info?.lifeId === entry.lifeId && info.profileId === entry.temporaryId)
        setProfile(context, entry.unit, entry.profileId);
    }
  }
}

function extendedEvent(context: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "unit-spawn") {
    for (const effect of forUnit(context, event.unit)) {
      const reason = BPH_PROFILE_UNCONFIRMED[effect.type];
      if (reason) unconfirmed(context, effect, reason);
    }
  }
  if (event.kind === "step" || event.kind === "unit-spawn" || event.kind === "unit-death") {
    const surge = aliveUnits(context).reduce((sum, unit) => sum + total(context, unit, "HeroMasteryMultiplier")
      + Number(BPH_PROFILES[context.profileId(unit) ?? ""].raw.masteryMultiplier), 0);
    context.state.resourceSurge += surge - (context.state.counters["profiles:surge"] ?? 0);
    context.state.counters["profiles:surge"] = surge;
  }
  if (event.kind === "step") {
    const pending = pendingConsumes.get(context.state);
    if (pending) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const entry = pending[i];
        if (entry.until > context.run.time) continue;
        pending.splice(i, 1);
        context.endConsume(entry.source, entry.target);
      }
    }
  }
  if (event.kind === "before-attack") {
    const id = context.profileId(event.unit);
    const spellId = id && BPH_PROFILE_ATTACK_SPELLS[id];
    if (id && spellId && BPH_EXECUTABLE_SPELLS.has(spellId)) {
      const power = Number(BPH_PROFILES[id].raw.spellPower);
      for (let cast = 0; cast < 1 + total(context, event.unit, "HeroCastCount"); cast++)
        context.state.spells.push({ id: spellId, x: event.target.x, y: event.target.y,
          sourceId: event.unit.id, targetId: event.target.id, power });
      event.attack.handled = true;
    }
  }
  if (event.kind === "consume" && event.phase === "end"
    && context.profileId(event.source) === "Hero6_BloodMage") {
    const raw = BPH_PROFILES.Hero6_BloodMage.raw;
    context.heal(event.source, event.source.maxHp *
      (Number(raw.bloodMageConsumeHealPercentOfOwnMaxHp) + total(context, event.source, "BloodMageConsumeHealPercent")));
  }
  if (event.kind === "enemy-killed" && event.killer
    && context.profileId(event.killer) === "Hero6_BloodMage") {
    const raw = BPH_PROFILES.Hero6_BloodMage.raw;
    const chance = Number(raw.bloodMageConsumeOnKillChance) + total(context, event.killer, "BloodMageConsumeOnKillChance");
    if (chance > 0 && context.random() < context.chance(chance) && context.beginConsume(event.killer, event.enemy)) {
      const duration = Number(raw.bloodMageConsumeHoldSeconds) + Number(raw.bloodMageConsumePauseSeconds)
        + Number(raw.bloodMageConsumeReturnSeconds);
      const pending = pendingConsumes.get(context.state) ?? [];
      pending.push({ source: event.killer, target: event.enemy, until: context.run.time + duration });
      pendingConsumes.set(context.state, pending);
      event.killer.clock = Math.max(event.killer.clock, duration);
    }
  }
  if (event.kind === "damage-dealt") {
    if (event.side === "enemy" && event.source && "downUntil" in event.source
      && context.profileId(event.source) === "Hero6_BloodMage" && event.dealt > 0) {
      const fraction = Number(BPH_PROFILES.Hero6_BloodMage.raw.bloodMageLifestealPercent)
        + total(context, event.source, "BloodMageLifestealBonus");
      context.heal(event.source, event.dealt * fraction);
    }
    if (event.side === "ally" && "downUntil" in event.target && event.source && "speed" in event.source) {
      const fraction = total(context, event.target, "HeroReflectDamagePercent");
      if (fraction > 0 && event.dealt + event.blocked > 0)
        context.applyDamage({ target: event.source, source: event.target, amount: (event.dealt + event.blocked) * fraction });
    }
  }
  if (event.kind === "buff-applied" && event.request.side === "ally"
    && "downUntil" in event.request.target && BUFFS.some(id => id === event.request.id)
    && total(context, event.request.target, "HeroBuffShareToRandomHero") > 0
    && !context.state.counters["profiles:sharing"]) {
    const targets = aliveUnits(context).filter(unit => unit !== event.request.target);
    if (!targets.length) return;
    const target = targets[Math.floor(context.random() * targets.length)];
    context.state.counters["profiles:sharing"] = 1;
    try { context.applyBuff({ ...event.request, target }); }
    finally { context.state.counters["profiles:sharing"] = 0; }
  }
}

function onEvent(context: BphFxContext, event: BphFxEvent): void {
  actorEvent(context, event);
  extendedEvent(context, event);
  switch (event.kind) {
    case "enemy-killed": {
      const unit = event.killer, id = unit && context.profileId(unit);
      if (unit && id) rollBphKillCoin(context, unit,
        (Number(BPH_PROFILES[id].raw.gainCoinOnKillChance) + total(context, unit, "HeroKillBonusCoinChance"))
        * (context.run.bph?.waveId === "WaveChapter2" ? 2 : 1));
      return;
    }
    case "run-start":
      for (const effect of context.effects) {
        const reason = BPH_PROFILE_UNCONFIRMED[effect.type];
        if (reason) unconfirmed(context, effect, reason);
        else if (effect.nodeId === "R_HeroSpawnTransformAllHeroes" && effect.type === "HeroAttackPower")
          unconfirmed(context, effect, "설명은 10초 변환이나 HeroAttackPower 동시 행의 적용 조건 미확인");
      }
      return;
    case "unit-stats": stats(context, event); return;
    case "before-attack": beforeAttack(context, event); return;
    case "unit-death":
      if (context.profileId(event.unit)) {
        context.state.counters["profiles:deaths"] = (context.state.counters["profiles:deaths"] ?? 0) + 1;
        delete context.state.counters[`profiles:shield:${event.unit.id}`];
      }
      return;
    case "coins-gained":
      context.state.counters["profiles:coins"] = (context.state.counters["profiles:coins"] ?? 0) + event.amount;
      return;
    case "unit-spawn": {
      context.state.counters[`profiles:alone:${event.unit.id}`] =
        Number(!context.run.squads.some(squad => [squad, ...squad.soldiers]
          .some(unit => unit !== event.unit && unit.hp > 0 && context.profileId(unit) !== null)));
      const shield = context.effects.filter(e => e.type === "HeroSpawnShieldPercent" && matches(context, e, event.profileId))
        .reduce((total, e) => total + e.value, 0);
      context.state.counters[`profiles:shield:${event.unit.id}`] = event.unit.maxHp * shield;
      return;
    }
    case "before-unit-damage": {
      const key = `profiles:shield:${event.unit.id}`;
      if (!event.hit.prevented && event.hit.amount > 0) {
        const absorbed = Math.min(event.hit.amount, context.state.counters[key] ?? 0);
        context.state.counters[key] = (context.state.counters[key] ?? 0) - absorbed;
        event.hit.amount -= absorbed;
        if (absorbed > 0) context.emit({ kind: "block", x: event.unit.x, y: event.unit.y, value: absorbed });
      }
      return;
    }
  }
}

function killMastery(context: BphFxContext, enemy: Enemy, effect: BphEffect): void {
  grantBphMastery(context.save, { amount: effect.value, source: "combat",
    receiptId: `profile-kill:${context.save.lifecycle.campaignAttempt}:${context.save.lifecycle.managementVisit}:${enemy.id}:${placement(effect)}` });
}

function consume(context: BphFxContext, event: BphFxEvent, effect: BphEffect): void {
  if (event.kind === "unit-spawn") {
    if (!matches(context, effect, event.profileId, event.unit) || context.state.counters["profiles:copy-depth"]) return;
    switch (effect.type) {
      case "HeroSpawnExtraCopies":
        if (context.random() < context.chance(effect.effectPower)) copy(context, event.unit, effect.value);
        return;
      case "FirstTargetRaritySpawnDuplicate": {
        const key = `profiles:first:${placement(effect)}`;
        const count = context.state.counters[key] ?? 0;
        context.state.counters[key] = count + 1;
        if (count < effect.value) copy(context, event.unit, 1);
        return;
      }
      case "DuplicateHeroSpawnWhileNoHeroesAlive":
        if (context.state.counters[`profiles:alone:${event.unit.id}`])
          copy(context, event.unit, effect.value);
        return;
    }
  }
  if (event.kind === "enemy-killed") {
    // Flat monster-kill mastery also applies to cursor/native non-hero kills.
    if (effect.type === "HeroKillMasteryFlat" && !effect.targets.targetHero
      && Number(effect.targets.targetClass ?? 0) === 0 && effect.targets.useTargetRarity !== "1") {
      killMastery(context, event.enemy, effect);
      return;
    }
    const id = event.killer && context.profileId(event.killer);
    if (!id || !event.killer || !matches(context, effect, id, event.killer)) return;
    switch (effect.type) {
      case "HeroKillMasteryFlat": killMastery(context, event.enemy, effect); return;
      case "HeroKillHealPercent": context.heal(event.killer, event.killer.maxHp * effect.value); return;
      case "HeroKillHealChance":
        if (context.random() < context.chance(effect.effectPower)) context.heal(event.killer, event.killer.maxHp * effect.value);
        return;
      case "HeroKillBonusCoinChance":
        return;
    }
  }
  if (event.kind === "unit-death") {
    const id = context.profileId(event.unit);
    if (!id || !matches(context, effect, id, event.unit)) return;
    switch (effect.type) {
      case "HeroDeathSpawnBonusPackChance":
        if (context.random() < context.chance(effect.value)) context.grantPack("Pack1_Basic", 1);
        return;
    }
  }
}

export const BPH_PROFILE_CONSUMERS: readonly BphEffectConsumer[] = [{
  id: "profiles", kinds: [...STAT_KINDS, ...EVENT_KINDS], onEvent, consume,
}];
