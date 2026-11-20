import type { BphEffect } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { amount, effectClass, effectSubject, effectTarget, effectTome, EXECUTED_SPELLS, ordinal, phrase, signed, tomeWorks } from "./bph-upgrade-effect-text";
import { statDescription } from "./bph-upgrade-stat-text";
import { hasBphShopEffects } from "./bph-shop-session";
import { BPH_TAP_STRIKE } from "./bph-tap-strike";

/** Null means that no gameplay effect can be promised by the current executable code.
 * Consumers: bph-fx-profiles, bph-fx-status, bph-fx-buildings, bph, bph-shop,
 * bph-combat, bph-session and bph-upgrades. This formatter never enables effects.
 */
export function implementedEffectDescription(effect: BphEffect): string | null {
  const stat = statDescription(effect);
  if (stat !== null) return stat;
  const v = amount(effect.value), p = amount(effect.value * 100), power = amount(effect.effectPower);
  const chance = amount(effect.effectPower * 100);
  const subject = effectSubject(effect), prefix = subject ? `${subject} ` : "";
  const spell = effectTarget(effect.targets.targetSpell), book = effectTome(effect);
  // The spell queue is not an implementation when executeSpell rejects the ID.
  if (["HeroDeathCastSpell", "HeroDeathCastSpellChance", "HeroAttackExtraSpellCastChance",
    "HeroAttackedCastSpellChance", "HeroBlockCastSpell", "BonfireShieldBreakCastSpell",
    "TowerAttackedCastSpellChance", "CritKillCastSpellAtMonster",
    "OpenPackCastSpell", "OpenBoosterBoxCastSpell", "BuildingActivateCastSpell",
    "TreantSeedFortifiedCastSpell"].includes(effect.type) && !EXECUTED_SPELLS.has(effect.targets.targetSpell)) return null;
  if (effect.targets.targetBuilding === "Building_XRelics" && effect.type !== "UnlockBuilding") return null;
  switch (effect.type) {
    case "BattleGoldGainBonus":
      return phrase(`적 처치로 얻는 금화 +${p}%`, `Gold from defeating enemies +${p}%`);
    case "GoldPouchSpawnChanceBonus":
      return phrase(`금화 주머니 적 출현 확률이 기본 확률의 ${p}%만큼 증가`,
        `Gold pouch enemy spawn chance increases by ${p}% of the base chance`);
    case "BuildingReduceActivationCooldownPercent":
      return phrase(`${prefix}건물 가동 속도 ${signed(effect.value * 100)}%`, `${prefix}building activation speed ${signed(effect.value * 100)}%`);
    case "WaveTargetPackSpawnIntervalReduction":
      return phrase(`${prefix}의병 숲 모집 간격 ${v}초 단축 (기본 8~11초)`, `${prefix}Militia Forest recruit interval reduced by ${v}s (base 8-11s)`);
    case "HeroMoveLightBeamDistance":
      return phrase(`이동 거리 ${v}마다 광선 발생`, `Emit a light beam every ${v} world units moved`);
    case "HeroMoveLightBeamDamage":
      return phrase(`이동 광선 피해 ${v}`, `Walking light beam damage ${v}`);
    case "HeroMoveLightBeamRadius":
      return phrase(`이동 광선 반경 ${v}`, `Walking light beam radius ${v} world units`);
    case "HeroWheelModeWheelingMoveSpeedMultiplierRamp":
      return phrase(`${prefix}회전 중 0.1초마다 이동 속도 +${p}%`, `${prefix}wheel speed +${p}% every 0.1s`);
    case "ArcherArrowBounceChance":
      return phrase(`${prefix}공격 시 ${p}% 확률로 도탄 1회 추가`, `${prefix}${p}% chance for 1 extra bounce per attack`);
    case "HeroStatsPerFoilHeroInCollection":
      return phrase(`수집한 금박 병력 종류당 체력·공격력 +${p}%`, `HP and damage +${p}% per unique collected foil troop`);
    case "HeroKillHealChance":
      return phrase(`${prefix}처치 시 ${chance}% 확률로 최대 체력 ${p}% 회복`, `${prefix}${chance}% chance on kill to heal ${p}% max HP`);
    case "HeroSkillTreeVisualUpgrade":
      return phrase(`${prefix}등장 시 가시 장수로 진급`, `${prefix}spawn as the spiked Warlord`);
    case "HeroSpawnExtraCopies":
      return phrase(`${prefix}등장 시 ${chance}% 확률로 ${v}명 추가`, `${prefix}${chance}% chance to spawn ${v} extra copies`);
    case "PackSpawnExtraTargetHeroCopies":
      return phrase(`${prefix}모집 시 복제 ${v}명 추가`, `${prefix}recruit ${v} extra copies from packs`);
    case "OpenTargetPackExtraHeroChance":
      return phrase(`${effectTarget(effect.targets.targetPack)} 개봉 시 ${p}% 확률로 ${effectTarget(effect.targets.targetHero)} 1명 추가`,
        `${effectTarget(effect.targets.targetPack)}: ${p}% chance for 1 extra ${effectTarget(effect.targets.targetHero)}`);
    case "UnlockBuilding":
      return phrase(`${prefix}건설 해금${effect.targets.targetBuilding === "Building_XRelics" ? " (가동 기능 미구현)" : ""}`,
        `${prefix}construction unlocked${effect.targets.targetBuilding === "Building_XRelics" ? " (activation is not implemented)" : ""}`);
    case "ShopCanBeRerolled": return phrase("상점 갱신 해금 (기본 비용 1코인, 갱신마다 +1)", "Unlock shop rerolls (base 1 coin, +1 per reroll)");
    case "RoguelikePackDiscountChance":
      return hasBphShopEffects([effect])
        ? phrase(`모집 상품 할인 확률 +${v}%포인트 (상품 생성 시 확정, 가격 30% 할인)`,
          `Pack discount chance +${v} percentage points (price fixed on creation, 30% discount)`) : null;
    case "ShopRerollDiscountChanceStack":
      return hasBphShopEffects([effect])
        ? phrase(`방문 내 상점 갱신마다 모집·묶음 할인 확률 +${v}%포인트`,
          `Each shop reroll this visit adds ${v} percentage points to pack/box discount chance`) : null;
    case "BeastmasterAddTargetHeroToPool":
      return ["SN_BeastmasterAddBear", "SN_BeastmasterAddJaguar", "SN_BeastmasterAddMonkey"].includes(effect.nodeId)
        ? phrase(`친구 쥐 1마리를 ${effectTarget(effect.targets.targetHero)}로 교체 (총 4마리)`,
          `Replace 1 Rat friend with ${effectTarget(effect.targets.targetHero)} (4 friends total)`) : null;
    case "WaveSpeedPerRiftUpgrades":
      return phrase(`기구 지원: 이 균열의 강화 ${power}개마다 공세 생성 속도 +${p}% (원본 진입 경로 미연결)`,
        `Supported: +${p}% wave spawn speed per ${power} upgrades in this rift (original entry path pending)`);
    case "ShopUnlockTargetPack": return phrase(`${prefix}상점 판매 후보에 추가`, `${prefix}added to eligible shop stock`);
    case "RecoverDestroyedRelicsWithFoilium":
      return phrase("파괴된 유물 복원: 금박 5개, 복원마다 비용 +5", "Restore a destroyed relic for 5 foilium; cost +5 per recovery");
    case "DiscoverTargetRelic":
      return phrase(`${effectTarget(effect.targets.targetRelic)} 1개 획득`, `Gain 1 ${effectTarget(effect.targets.targetRelic)}`);
    case "HeroKillUpgradeUnlock": {
      const stages = BPH_PROFILES[effect.targets.targetHero]?.evolution ?? [];
      return phrase(`${prefix}처치 진급 +${v}단계 (단계별 ${stages.map(s => s.kills).join("/")}마리 처치)`,
        `${prefix}unlock ${v} promotion stages (kills: ${stages.map(s => s.kills).join("/")})`);
    }
    case "OnHeroDeathSpawn":
      return effect.nodeId === "_REMOVERelic3_Cursed_Lantern"
        ? phrase("사망 시 해골 1/2/3명 소환 (60%/30%/10%)", "On death summon 1/2/3 skeletons (60%/30%/10%)")
        : phrase(`${prefix}사망 시 해골 ${v}명 소환`, `${prefix}summon ${v} skeletons on death`);
    case "BannermanAttackExtraChargeCount":
    case "BannermanDeathChargeCount":
    case "BannermanSpawnChargeCount": {
      const when = effect.type === "BannermanAttackExtraChargeCount" ? ["공격", "attack"] :
        effect.type === "BannermanDeathChargeCount" ? ["사망", "death"] : ["등장", "spawn"];
      return phrase(`${prefix}${when[0]} 시 아군 ${v}명 ${effect.type === "BannermanAttackExtraChargeCount" ? "추가 " : ""}충전 (10초간 공격 피해 +100%)`,
        `${prefix}charge ${v} ${effect.type === "BannermanAttackExtraChargeCount" ? "extra " : ""}allies on ${when[1]} (+100% attack damage for 10s)`);
    }
    case "HeroBlockCastSpell": return phrase(`${prefix}완전 방어 시 ${spell} ${v}회 시전`, `${prefix}cast ${spell} ${v} times on a full block`);
    case "BonfireShieldBreakCastSpell": return phrase(`내성 보호막 파괴 시 ${spell} 1회 시전`, `Cast ${spell} once when the castle shield breaks`);
    case "TowerAttackedCastSpellChance": return phrase(`내성 체력 손실 시 ${chance}% 확률로 ${spell} 시전`, `${chance}% chance to cast ${spell} when the castle loses HP`);
    case "HeroDeathCastSpellChance": return phrase(`${prefix}사망 시 ${p}% 확률로 ${spell} 1회 시전`, `${prefix}${p}% chance to cast ${spell} once on death`);
    case "HeroDeathCastSpell": return phrase(`${prefix}사망 시 ${spell} ${v}회 시전`, `${prefix}cast ${spell} ${v} times on death`);
    case "HeroAttackExtraSpellCastChance": return phrase(`${prefix}공격 시 ${p}% 확률로 ${spell} 1회 추가 시전`, `${prefix}${p}% chance to cast an extra ${spell} on attack`);
    case "HeroAttackedCastSpellChance": return phrase(`${prefix}피해를 받으면 ${p}% 확률로 ${spell} 1회 시전`, `${prefix}${p}% chance to cast ${spell} after taking damage`);
    case "CursorCritKillCastSpellAtMonster":
      return phrase(`화살비가 불화살이 되어 맞은 적이 ${BPH_TAP_STRIKE.fireSeconds}초간 불탐`, `Volleys become fire arrows: struck enemies burn for ${BPH_TAP_STRIKE.fireSeconds}s`);
    case "CritKillCastSpellAtMonster":
      return phrase(`${prefix}치명타 처치 시 ${spell} 1회 시전`, `${prefix}cast ${spell} once on a critical kill`);
    case "BuildingActivateCastSpell": return phrase(`${prefix}가동 시 ${spell} ${v}회 시전`, `${prefix}cast ${spell} ${v} times per activation`);
    case "OpenPackCastSpell":
      return phrase(`${effectTarget(effect.targets.targetPack)} 개봉 시 ${spell} ${v}회 시전`,
        `Cast ${spell} ${v} times when opening ${effectTarget(effect.targets.targetPack) || "a pack"}`);
    case "OpenBoosterBoxCastSpell":
      return phrase(`${effectTarget(effect.targets.targetPack)} 묶음 개봉 시 ${spell} ${v}회 시전`,
        `Cast ${spell} ${v} times when opening a ${effectTarget(effect.targets.targetPack)} box`);
    case "BuildingActivateGainCombatCoins":
      return phrase(`${prefix}가동 시 ${p}% 확률로 ${power}코인 획득`, `${prefix}${p}% chance to gain ${power} coins per activation`);
    case "BuildingActivateApplyStatusToAllHeroes":
      return effect.targets.targetStatus === "Charge" ? phrase(`${prefix}가동 시 전체 아군 ${v}초간 공격 피해 +100%`,
        `${prefix}all allies gain +100% attack damage for ${v}s per activation`) : null;
    case "HeroCombatCoinGainedApplyStatusToRandom":
      return effect.targets.targetStatus === "Fortify" ? phrase(`전투 코인 1개당 무작위 ${prefix}1명에게 다음 피해 1회 방어`,
        `Each combat coin lets 1 random ${subject || "troop"} block its next hit`) : null;
    case "HeroAttackApplyStatusChance": {
      if (effect.targets.targetStatus === "Fortify") return phrase(`${prefix}공격 시 ${amount((effect.effectPower || effect.value) * 100)}% 확률로 다음 피해 1회 방어`,
        `${prefix}${amount((effect.effectPower || effect.value) * 100)}% chance on attack to block the next hit`);
      if (effect.nodeId === "SN_MonkeyAttackStun") return phrase(`${prefix}공격 시 ${chance}% 확률로 ${v}초 기절`, `${prefix}${chance}% chance to stun for ${v}s on attack`);
      return null;
    }
    case "HeroSpawnApplyStatusToSelf":
      return effect.targets.targetStatus === "Invisibility" ? phrase(`${prefix}등장 후 5초간 적 표적 회피 및 공격 속도 +100%`,
        `${prefix}avoid enemy targeting and gain +100% attack speed for 5s on spawn`) : null;
    case "HeroPeriodicApplyStatus":
      return effect.targets.targetStatus === "Invisibility" ? phrase(`${prefix}${v}초마다 5초간 적 표적 회피 및 공격 속도 +100%`,
        `${prefix}avoid enemy targeting and gain +100% attack speed for 5s every ${v}s`) : null;
    case "HeroKillApplyStatusToSelfChance":
      return effect.targets.targetStatus === "Charge" ? phrase(`${prefix}처치 시 ${chance}% 확률로 10초간 공격 피해 +100%`,
        `${prefix}${chance}% chance on kill for +100% attack damage for 10s`) : null;
    case "HeroSpawnApplyStatusToAllHeroes":
      return effect.targets.targetStatus === "Fortify" ? phrase(`${prefix}등장 시 자신을 포함한 ${effectClass(effect.targets.secondTargetHaengjuClass ?? effect.targets.secondTargetClass)} ${effect.effectPower > 0 ? `중 무작위 최대 ${power}명` : "전원"}이 다음 피해 1회 방어`,
        `When a ${subject || "friendly"} troop spawns, ${effect.effectPower > 0 ? `up to ${power} random` : "all"} ${effectClass(effect.targets.secondTargetHaengjuClass ?? effect.targets.secondTargetClass)} allies (including itself) block their next hit`) : null;
    case "StatusEffectDurationBonus":
      return effect.targets.targetStatus === "Invisibility" ? phrase(`은신 공격 가속 지속 시간 +${p}%`, `Invisibility attack-speed duration +${p}%`) : null;
    case "CursorDpsEveryNthApplyStatus":
      return effect.targets.targetStatus === "Stun" ? phrase(`화살비 ${v}회마다 ${power}초 기절`, `Every ${ordinal(effect.value)} volley stuns for ${power}s`) : null;
    case "CursorDpsEveryNthDamageMult":
      return phrase(`화살비 ${v}회마다 피해 ${power}배`, `Every ${ordinal(effect.value)} volley deals ${power}x damage`);
    case "CursorHealsHeroesInsteadOfMonsterDamage":
      return phrase(`화살비가 적 대신 피해의 ${p}%로 아군 회복`, `Volleys heal allies for ${p}% of volley damage`);
    case "DayStartGainTargetTome":
      return book && tomeWorks(book) ? phrase(`전투 시작 시 ${effectTarget(book)} ${v}개`, `Start battle with ${v} ${effectTarget(book)}`) : null;
    case "TeleporterExtraTeleportOnAttack":
      return phrase(`${prefix}공격 시 순간이동 ${v}회 추가`, `${prefix}${v} extra teleports per attack`);
    case "TeleporterDepartDamageEnabled":
      return phrase(`${prefix}순간이동 출발 지점에도 피해 1회`, `${prefix}deal damage once at the teleport departure point too`);
    case "HeroCastCount":
      if (effect.targets.targetHero && !["Hero2_Pyromancer", "Hero9_Supernova"].includes(effect.targets.targetHero)) return null;
      if (effect.nodeId.startsWith("FOIL_") && !["FOIL_Pyromancer", "FOIL_Supernova"].includes(effect.nodeId)) return null;
      return effect.targets.targetHero === "Hero9_Supernova" || effect.nodeId === "FOIL_Supernova"
        ? phrase(`${prefix}공격마다 폭탄 ${v}개 추가`, `${prefix}${v} extra bombs per attack`)
        : phrase(`${prefix}공격마다 화염탄 ${v}개 추가`, `${prefix}${v} extra fireballs per attack`);
    case "TomeChannelCastsPerTickBonus":
      return book === "Tome_RaiseDead" || book === "Tome_Thunderstorm" ? phrase(`${prefix}주기마다 소환·시전 ${v}회 추가`, `${prefix}${v} extra summons or casts per tick`) : null;
    case "TomeChannelIntervalReduction":
      return book === "Tome_RaiseDead" || book === "Tome_Thunderstorm" ? phrase(`${prefix}시전 빈도 +${p}% (간격 ÷${amount(1 + effect.value)})`,
        `${prefix}cast rate +${p}% (interval / ${amount(1 + effect.value)})`) : null;
    case "TomeEffectPower":
      if (book === "Tome_RaiseDead") return phrase(`${prefix}소환 병력 공격력 +${p}%`, `${prefix}summoned troop damage +${p}%`);
      if (book === "Tome_Earthquake") return phrase(`${prefix}기절 시간 +${p}%`, `${prefix}stun duration +${p}%`);
      if (book === "Tome_CursorDPS") return phrase(`${prefix}기본 화살비 범위 보너스 +${p}%`, `${prefix}base volley-radius bonus +${p}%`);
      if (!book) return phrase(`소환 병력 공격력·기본 화살비 범위 보너스·책략 기절 시간 +${p}%`,
        `Summoned troop damage, base volley-radius bonus and tome stun duration +${p}%`);
      return null;
    case "TomePowerPerFoilTomeInCollection":
      return phrase(`수집한 금박 책략 종류당 책략 피해·소환 공격력 +${p}%`, `Spell and summoned troop damage +${p}% per collected foil tome`);
    case "FirstTargetRaritySpawnDuplicate":
      return phrase(`${prefix}첫 ${v}명 등장 시 각각 복제 1명`, `${prefix}duplicate each of the first ${v} spawns once`);
    case "DuplicateHeroSpawnWhileNoHeroesAlive":
      return phrase(`다른 아군 병력이 없을 때 등장하면 복제 ${v}명`, `Spawn ${v} copies when no other allied troop is alive`);
    case "HeroBuffShareToRandomHero":
      return phrase(`강화 상태를 받으면 무작위 다른 아군 1명에게 동일하게 공유`, `Share received buffs with 1 random other ally`);
    case "HeroClassAlsoCountsAs": {
      const first = effectClass(effect.targets.targetHaengjuClass ?? effect.targets.targetClass);
      const second = effectClass(effect.targets.secondTargetHaengjuClass ?? effect.targets.secondTargetClass);
      if (effect.targets.targetHaengjuClass)
        return phrase(`${first}·${second}: 높은 쪽 대장간 강화와 서로의 병종 전용 전투 유물 효과 적용`,
          `${first} and ${second} share their highest smithy level and class-specific relic effects in battle`);
      return phrase(`${first}·${second} 병과 강화를 서로 함께 적용`, `${first} and ${second} share class bonuses`);
    }
    case "HeroAttackDamageScalesWithMasterySurgeBonus":
      return phrase(`${prefix}공격력에 숙련 증폭의 ${p}% 추가`, `${prefix}damage gains ${p}% of the mastery surge bonus`);
    case "BoosterPackTargetHeroWeightDouble":
      return effect.targets.targetHaengjuClass ? phrase(`${prefix}모집 비중 2배`, `${prefix}recruitment weight ×2`) : null;
    case "FirstTargetSpawnAdditionalTome":
      return effect.targets.targetHaengjuClass ? phrase(`${prefix}첫 ${v}명은 등장 시 전술 1개 즉시 사용`,
        `The first ${v} ${subject} troops each cast a tactic on arrival`) : null;
    case "HeroFirstSpawnsApplyStatusToSelf":
      return effect.targets.targetHaengjuClass && effect.targets.targetStatus === "Revive"
        ? phrase(`${prefix}첫 ${v}명은 체력 절반으로 1회 부활`, `The first ${v} ${subject} troops revive once at half health`) : null;
    case "HeroSpawnTransformAllHeroesChance":
      return phrase(`${prefix}등장 시 ${p}% 확률로 다른 아군을 자신과 같은 병력으로 ${power}초 변환`,
        `${prefix}${p}% chance on spawn to turn other allies into this troop for ${power}s`);
    case "HeroAliveTimeBecomeGiant":
      return phrase(`${prefix}${v}초 생존 시 거대 상태가 되고 체력 전부 회복`, `${prefix}become giant and fully heal after ${v}s alive`);
    case "HeroDeathSpawnBonusPackChance":
      return phrase(`${prefix}사망 시 ${p}% 확률로 기본 모집 1개`, `${prefix}${p}% chance to drop 1 basic pack on death`);
    case "HeroSpawnSacrificeChanceReplaceFromPack":
      return phrase(`${prefix}등장 시 ${p}% 확률로 희생 후 같은 모집의 희귀도 ${effect.targets.replacementRarity} 병력 1명`,
        `${prefix}${p}% chance on spawn to sacrifice and replace with 1 rarity-${effect.targets.replacementRarity} troop from its pack`);
    case "FirstHeroSpawnSacrificeReplaceFromPack":
      return phrase(`${prefix}첫 등장 병력 희생 후 같은 모집의 희귀도 ${effect.targets.replacementRarity} 병력 ${v}명`,
        `${prefix}sacrifice the first spawn for ${v} rarity-${effect.targets.replacementRarity} troops from its pack`);
    case "HeroSpawnEveryNthSacrificeGainPack":
      return phrase(`${prefix}${v}번째 등장마다 희생 후 해당 모집 1개 획득`, `${prefix}sacrifice every ${ordinal(effect.value)} spawn for 1 pack of its origin`);
    case "SacrificeHeroFromEveryNthPack":
      return phrase(`${v}번째 모집마다 단독 등장 병력 희생 (여럿 등장하면 적용 안 됨)`, `Sacrifice the sole troop from every ${ordinal(effect.value)} pack (no sacrifice for multiple troops)`);
    case "SacrificeHeroFromFirstPacksCount":
      return phrase(`첫 ${v}회 모집의 단독 등장 병력 희생 (여럿 등장하면 적용 안 됨)`, `Sacrifice the sole troop from the first ${v} packs (none for multiple troops)`);
    case "AstralFisherHookedDoubleDamage": return phrase(`${prefix}끌어당기는 중 적이 받는 피해 2배`, `${prefix}hooked enemies take 2x damage while being pulled`);
    case "AstralFisherImmuneWhilePulling": return phrase(`${prefix}끌어당기는 동안 받는 피해 0`, `${prefix}take 0 damage while pulling`);
    case "AstralFisherPathStun": return phrase(`${prefix}낚싯줄 경로의 적 3초 기절`, `${prefix}stun enemies along the fishing line for 3s`);
    case "TargetHeroExtraProjectilesDouble": return phrase(`${prefix}추가 발사체 수 2배`, `${prefix}double extra projectile count`);
    case "TreantSeedBounce":
      return phrase(`${prefix}씨앗 ${effect.nodeId.startsWith("FOIL_") ? "100" : chance}% 확률로 ${v}회 추가 도탄`,
        `${prefix}seeds have ${effect.nodeId.startsWith("FOIL_") ? "100" : chance}% chance for ${v} extra bounces`);
    default: return null;
  }
}
