/** Final 2026-11-16 audit, group B (47 definitions). Keep source definitions for refunds. */
import { BPH_ARMY_TRAINING } from "./bph-army-training";

export const BPH_V1_HIDDEN_UPGRADES: ReadonlySet<string> = new Set([
  // Survival fields neither zombie eggs nor the Dragon's Call quest spell.
  "Q_DefeatZombie", "Q_DefeatZombieRunner", "Q_DefeatDragonsCall",
  "Mod_Frostbite", "Mod_RiftInvasion",
  "SN_Spectral_HPLossReduction", "SN_Chaos_ElectrifyExtraShockTarget", "SN_Chaos_HeroDeathSpawnSpectre",
  "SN_DemolitionistBombRadius", "SN_DemolitionistChainDamage", "SN_DemolitionistChargeTime",
  "SN_LaserMageQuasarBlue", "SN_LaserMageQuasarRed", "SN_TeleporterAoePush",
  "SN_TeleporterFortifyHeroes", "SN_TeleporterPullMonsters", "_SN_AllHeroes_SpawnCharge",
  "FOIL_HeroFrenzy", "FOIL_SpectralPact", "Mod_SacrificeRandomHero", "PN_StarDoor",
  "Rift_ReturnToMain",
  "SN_AstralFisher_HookedKillSpectre", "SN_Barbarian_AtkSpdLowHP",
  "SN_Beastmaster_FriendRespawn", "SN_Beastmaster_FriendRespawn2",
  "SN_BloodMage_ConsumeDamage", "SN_BloodMage_ConsumeHeroesNearby", "SN_DinoRiderMerge",
  "SN_ElectrifyExtraShockTarget 1", "SN_ElectrifyExtraShockTarget 2", "SN_ElectrifyExtraShockTarget",
  "SN_ElectrifyShockSpread 1", "SN_ElectrifyShockSpread", "SN_FinishPrestige0",
  "SN_FinishPrestige1", "SN_FinishPrestige2", "SN_FrozenSlideMaxHpDamage",
  "SN_HeroDeathSpawnSpectre 1", "SN_HeroDeathSpawnSpectre", "SN_Spawner_RarityWeights",
  "SN_ThunderboltElectrify", "SN_TomeCursorAttackSpeed 1", "SN_TomeSurgeBuffIncrease",
  "SN_TomeSurgeBuffIncrease2",
  // The portal relic and its original unlock are restored with an executed pack replacement.
]);

/** Keep these definitions and their placements so old saves can be refunded and paths stay connected. */
export const BPH_MOVED_UNIT_UPGRADES: ReadonlySet<string> = new Set([
  ...BPH_ARMY_TRAINING.flatMap(p => p.nodeId ?? []),
  "PN_AllHeroes_AttackPower", "PN_HeroDuration", "SN_HeroAtkSpd", "SN_HeroDeathAttackPowerRun",
  "SN_HeroDeathAttackSpeedRun", "SN_HeroDeathMoveSpeedRun", "SN_HeroDmg", "SN_HeroDmg 1",
  "SN_HeroDmg 3", "SN_HeroDmg 4", "SN_HeroDuration", "SN_HeroDuration 1",
  "SN_HeroDuration2", "SN_HeroDuration2 1",
  "SN_AstralFisher_HookedDoubleDamage", "SN_AstralFisher_ImmuneWhilePulling", "SN_AstralFisher_PathStun", "SN_AstralFisher_PullStrength",
  "SN_AstralFisher_Range", "SN_BannermanAttackExtraCharge", "SN_BannermanDeathCharge", "SN_BannermanSpawnCharge",
  "SN_Barbarian_AreaAttack", "SN_Barbarian_DeadSpawnSkeleton", "SN_Barbarian_Duration", "SN_Barbarian_HealOnKill",
  "SN_BearGiantChance", "SN_BloodMage_ConsumeChance", "SN_BloodMage_ConsumeHeal", "SN_BloodMage_Lifesteal",
  "SN_DinoDashAgain", "SN_DinoDashDistance", "SN_DuelistAtkSpeed", "SN_DuelistCoinCrit",
  "SN_DuelistCoinFortifyRandom", "SN_DuelistKillCoinChance", "SN_FireMageCast", "SN_FireMageFireballAOE",
  "SN_FireMageSpeed", "SN_FireballDamage", "SN_HammerFreezeRetaliation", "SN_HammerReturnDamage",
  "SN_HammerShield", "SN_HammerShockwaveRadius", "SN_IllusionistExplosionDamage", "SN_IllusionistExplosionRadius",
  "SN_IllusionistMultiplier", "SN_IllusionistPackClones", "SN_IllusionistPackClones2", "SN_IllusionistPackClones3",
  "SN_InfectedAoE", "SN_InfectedDamageTaken", "SN_InfectedDeathSpawnSkeleton", "SN_InfectedDeathSpread",
  "SN_InfectedSlow", "SN_JaguarKillHeal", "SN_MonkAttackSpeed", "SN_MonkDashCount",
  "SN_MonkDuration", "SN_MonkSuperDash", "SN_MonkeyAttackStun", "SN_PaladinAbility 1",
  "SN_PaladinBlock", "SN_PaladinBlockThunderbolt", "SN_PaladinTaunt", "SN_RangerAttackSpeed",
  "SN_RangerBounce", "SN_RangerRange", "SN_RiderArrowBounce1", "SN_RiderJavelinRetain",
  "SN_RotatingSwords_Count", "SN_RotatingSwords_Count2", "SN_RotatingSwords_Count3", "SN_RotatingSwords_Freeze",
  "SN_RotatingSwords_Size", "SN_RotatingSwords_Speed", "SN_SkeletonAttackSpeed", "SN_SkeletonDamage",
  "SN_SkeletonDieThrowBone", "SN_SkeletonDieThrowBone 1", "SN_SkeletonHP", "SN_SkeletonShotgunArrowCount",
  "SN_SkeletonShotgunArrowCount2", "SN_SkeletonShotgunArrowCount3", "SN_SkeletonShotgunAttackSpeed", "SN_SkeletonShotgunExtraProjectilesDouble",
  "SN_SkeletonWheelAttackDamage", "SN_SkeletonWheelDeathThrowBones", "SN_SkeletonWheelDuration", "SN_SkeletonWheelEdgeSpeed",
  "SN_SkeletonWheelRampSpeed", "SN_Spawner_CastSpeed", "SN_SquireBonusChance", "SN_SquireBonusChance2",
  "SN_SquireDamage 2", "SN_StormcallerCast", "SN_ThiefCritChance", "SN_ThiefCritDmg",
  "SN_ThiefRainOfArrow", "SN_TornadoDamage", "SN_TornadoDuration", "SN_TornadoSize",
  "SN_TreantDuration", "SN_TreantSeedBounce", "SN_TreantSeedBounce2", "SN_TreantSeedFortifiedBeam",
  "SN_TreantSpawnSeeds",
  "SN_HeroFromAdvancedPackDamage", "SN_HeroFromAdvancedPackDamage 1", "SN_HeroFromAdvancedPackDuration", "SN_HeroFromAdvancedPackDuration 1",
  "SN_HeroFromBasicPackDamage", "SN_HeroFromBasicPackDamage 1", "SN_HeroFromBasicPackDamage 2", "SN_HeroFromBasicPackDuration",
  "SN_HeroFromBasicPackDuration 1", "SN_HeroFromBasicPackDuration 2", "SN_HeroFromMagicPackDamage", "SN_HeroFromMagicPackDuration",
]);

export const BPH_HIDDEN_UPGRADES: ReadonlySet<string> = new Set([...BPH_V1_HIDDEN_UPGRADES, ...BPH_MOVED_UNIT_UPGRADES]);
