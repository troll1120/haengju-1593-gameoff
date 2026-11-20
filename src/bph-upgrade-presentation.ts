import { language, t, tr } from "./i18n";
import { recruitment, objects, stats, specialNames } from "./bph-upgrade-labels";
import type { BphPlacement, BphUpgradeNode } from "./bph-upgrade-data";
import { BPH_PROFILES, BPH_TOMES, BPH_ENEMY_MAP } from "./bph-data";
import type { BphEffect, BphSave } from "./bph-contract";
import { BPH_PROFILE_UNCONFIRMED } from "./bph-fx-profiles";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, bphQuestClaims, bphQuestUnknowns } from "./bph-upgrades";
import { bphArtPath, bphProfileArt, bphShipArt } from "./bph-art";
import { implementedEffectDescription } from "./bph-upgrade-effects";
import { bphGoldUpgradeName } from "./bph-upgrade-gold";
import { implementedQuestDescription, implementedQuestName } from "./bph-upgrade-quest-text";
import { effectTarget, phrase } from "./bph-upgrade-effect-text";
import { bphEnemyDisplayName } from "./bph-codex-groups";
import { BPH_BARRACKS_BUILDINGS, bphBuildingPack } from "./bph-fx-buildings";
import { bphRelicEffect } from "./bph-relic-text";

/** A source building the barracks absorbed: its unlock is barracks production (Tavern) or a pack added to the barracks mix. */
function barracksUnlock(effect: BphEffect): { readonly name: string; readonly description: string } | null {
  const id = effect.targets.targetBuilding;
  if (effect.type !== "UnlockBuilding" || !id || !BPH_BARRACKS_BUILDINGS.includes(id)) return null;
  if (id === "Building_1Basic") return { name: t("막사 모집"), description: t("천막 막사 모집 해금") };
  const pack = recruitment[bphBuildingPack(id) ?? ""] ?? "";
  return { name: tr`막사 ${pack}`, description: tr`천막 막사 모집에 ${pack} 추가` };
}

function targetName(id: string | undefined): string {
  if (!id) return "";
  const name = objects[id] ?? BPH_PROFILES[id]?.name ?? BPH_TOMES[id]?.name ?? recruitment[id] ?? bphEnemyDisplayName(id);
  return name && !/[A-Za-z_]/.test(name) ? name : "미확인 대상";
}
const number = (value: number) => String(Number(value.toFixed(4)));

/** The former Frenzy-only and cursor Rain of Arrows nodes now upgrade the tap strike itself, not a tome or a spell. */
const TAP_STRIKE_NODES = new Set(["TomeCursorDpsAreaBonus", "TomeCursorDpsAttackSpeedBonus", "TomeCursorDpsCritChance",
  "CursorCritKillCastSpellAtMonster"]);
function effectSubject(effect: BphEffect): string {
  if (TAP_STRIKE_NODES.has(effect.type)) return "";
  return targetName(effect.targets.targetHero ?? effect.targets.targetBuilding ??
    effect.targets.targetTome ?? effect.targets.targetPack ?? effect.targets.targetRelic ??
    (effect.type.startsWith("Bonfire") ? undefined : effect.targets.targetSpell));
}
function effectName(effect: BphEffect): string {
  const goldName = bphGoldUpgradeName(effect, language());
  if (goldName !== undefined) return goldName;
  const barracks = barracksUnlock(effect);
  if (barracks) return barracks.name;
  const subject = effectSubject(effect);
  let name = stats[effect.type]?.[0] ?? specialNames[effect.type] ?? "특수 강화";
  if (language() === "en") return [t(subject), t(name)].filter(Boolean).join(" ");
  if (subject.endsWith("모집")) name = name.replace(/^모집 /, "");
  if (subject.endsWith("책략")) name = name.replace(/^책략 /, "");
  if (subject && name.startsWith(subject + " ")) return t(name);
  const subjectWords = new Set(subject.split(" "));
  return t([subject, name.split(" ").filter(word => !subjectWords.has(word)).join(" ")].filter(Boolean).join(" "));
}
function effectDescription(effect: BphEffect): string {
  const implemented = implementedEffectDescription(effect);
  if (implemented !== null) return implemented;
  const barracks = barracksUnlock(effect);
  if (barracks) return barracks.description;
  const subject = effectSubject(effect);
  const prefix = subject ? tr`${subject} ` : "";
  if (BPH_PROFILE_UNCONFIRMED[effect.type] || [
    "ElectrifyChainDamagePercent", "ElectrifyExtraChainJumps", "ThunderboltApplyStatus",
    "HeroSpellCastSpeed", "TargetSpellBounce", "SpellSurgeMasteryBonusPercent",
    "ChapterFog", "CursorDpsApplyStatusChance", "FirstTargetSpawnAdditionalTome",
    "FogCursorTowerLightRadius", "FogSpectralsEmitLight", "FogUnopenedPacksEmitLight",
    "CursorDpsEveryNthFreezeIntoIceCube", "HeroAttackedFreezeIntoIceCubeChance",
    "HeroDamageFreezeIntoIceCubeChance", "IceCubeExtraHits", "IceCubeSlideSpeed",
    "FrozenSlideBossMaxHpDamage", "FrozenSlideMaxHpDamage", "PackSpawnFrozen",
    "HeroDeathSummonSpectralChance", "SpectralHpDrainReduction", "SpectralPactHpLossReduction",
    "HeroSpellCastApplyStatusChance", "StatusEffectPowerBonus", "TargetSpellPiercerHitRetainRateBonus",
    "TeleporterAoeHitApplyStatusChance", "TomeExtraStacks", "RoguelikeDailyDealWeightBonus",
    "RoguelikePackDiscountChance", "RoguelikeSpecialOfferDiscountChance",
    "ShopDailyDealHeroDoubles", "ShopDailyDealHeroTriples", "ShopRerollDiscountChanceStack",
    "ShopRerollMatchingLineGold", "ShopRerollJackpotGainTargetPack", "ShopUnlockTargetTome",
  ].includes(effect.type)) return tr`${effectName(effect)} 효과 미확인`;
  const stat = stats[effect.type];
  if (stat) {
    const [name, unit] = stat;
    const value = unit === "percent" ? number(effect.value * 100) : number(effect.value);
    return tr`${effectName(effect)} +${value}${unit === "percent" || unit === "points" ? "%" : unit === "seconds" ? "초" : ""}${effect.stackCap > 0 ? tr` (최대 ${number(effect.stackCap * (unit === "percent" ? 100 : 1))}${unit === "percent" ? "%" : ""})` : ""}`;
  }
  const value = number(effect.value), percent = number(effect.value * 100);
  switch (effect.type) {
    case "OpenPackBonusPackChance": return tr`${prefix}시 ${percent}% 확률로 ${targetName(effect.targets.bonusPackOnOpen)} 추가`;
    case "OpenTargetPackExtraHeroChance": return tr`${targetName(effect.targets.targetPack)} 시 ${percent}% 확률로 ${targetName(effect.targets.targetHero)} 추가`;
    case "PackSpawnExtraTargetHeroCopies": return tr`${prefix}모집 시 복제 ${value}명 추가`;
    case "UnlockBuilding": return tr`${prefix}건설 해금`;
    case "ShopCanBeRerolled": return t("상점 갱신 해금");
    case "ShopUnlockTargetPack": case "ShopUnlockTargetTome": return tr`${prefix}상점 판매 해금`;
    case "RecoverDestroyedRelicsWithFoilium": return t("금박을 지불해 파괴된 유물 복원");
    case "ShopDailyDealHeroDoubles": return t("상점 병력 상품 2명 묶음 등장");
    case "ShopDailyDealHeroTriples": return t("상점 병력 상품 3명 묶음 등장");
    case "HeroKillUpgradeUnlock": {
      const stages = BPH_PROFILES[effect.targets.targetHero]?.evolution ?? [];
      return tr`${prefix}처치 진급 +${value}단계 (단계별 ${stages.map(stage => number(stage.kills)).join("/")}마리 처치)`;
    }
    case "OnHeroDeathSpawn": return tr`${prefix}사망 시 ${targetName(effect.targets.heroSpawnOnHeroDeath)} ${value}명 소환`;
    case "BannermanAttackExtraChargeCount": return tr`${prefix}공격 시 아군 ${value}명 추가 충전`;
    case "BannermanDeathChargeCount": return tr`${prefix}사망 시 아군 ${value}명 충전`;
    case "BannermanSpawnChargeCount": return tr`${prefix}등장 시 아군 ${value}명 충전`;
    case "InfectedDeathSpreadRadius": return tr`${prefix}감염 적 사망 시 반경 ${value} 안에 전파`;
    case "InfectedEnemyMoveSpeedMultiplier": return tr`감염 적 이동 속도 ${percent}%`;
    case "InfectedDeathSpawnTargetHero": return tr`감염 적 사망 시 ${percent}% 확률로 ${targetName(effect.targets.heroSpawnOnHeroDeath)} 소환`;
    case "DiscoverTargetRelic": return phrase(`${targetName(effect.targets.targetRelic)} · 유물 칸에서 획득`, `${targetName(effect.targets.targetRelic)} · claim in Relics`);
    case "HeroBlockCastSpell": return tr`${prefix}방어 시 ${targetName(effect.targets.targetSpell)} 시전`;
    case "BonfireShieldBreakCastSpell": return tr`내성 보호막 파괴 시 ${targetName(effect.targets.targetSpell)} 시전`;
    case "CritKillCastSpellAtMonster": case "CursorCritKillCastSpellAtMonster": return tr`${prefix}치명타 처치 시 ${targetName(effect.targets.targetSpell)} 시전`;
    case "ThunderboltApplyStatus": return tr`벼락 적중 시 ${targetName(effect.targets.targetStatus)} 부여`;
    case "HeroDeathCastSpellChance": return tr`${prefix}사망 시 ${percent}% 확률로 ${targetName(effect.targets.targetSpell)} 시전`;
    case "HeroCombatCoinGainedApplyStatusToRandom": return tr`전투 코인 획득 시 무작위 ${prefix}${targetName(effect.targets.targetStatus)} 부여`;
    case "BuildingActivateApplyStatusToAllHeroes": return tr`${prefix}가동 시 전체 아군 ${targetName(effect.targets.targetStatus)} ${value}초`;
    case "HeroAttackExtraSpellCastChance": return tr`${prefix}공격 시 ${percent}% 확률로 ${targetName(effect.targets.targetSpell)} 추가 시전`;
    case "HeroAttackedCastSpellChance": return tr`${prefix}피격 시 ${percent}% 확률로 ${targetName(effect.targets.targetSpell)} 시전`;
    case "HeroDeathCastSpell": return tr`${prefix}사망 시 ${targetName(effect.targets.targetSpell)} ${value}회 시전`;
    case "DayStartGainTargetTome": return tr`전투 시작 시 ${targetName(effect.targets.targetTome)} ${value}개`;
    case "HeroAttackApplyStatusChance": return tr`${prefix}공격 시 ${number((effect.effectPower || effect.value) * 100)}% 확률로 ${targetName(effect.targets.targetStatus)} 부여`;
    case "OpenPackSpecialDropChance": return tr`${targetName(effect.targets.targetTome)} 추가 획득 효과 미확인`;
    case "HeroSpawnExtraCopies": return tr`${prefix}등장 시 ${value}명 추가`;
    case "TeleporterExtraTeleportOnAttack": return tr`${prefix}공격 시 순간이동 ${value}회 추가`;
    case "TreantSeedFortifiedCastSpell": return tr`${prefix}강화된 씨앗에서 ${targetName(effect.targets.targetSpell)} 시전`;
    default: return tr`${effectName(effect)} 효과 미확인`;
  }
}

export function upgradeName(node: BphUpgradeNode): string {
  const implemented = implementedQuestName(node);
  if (implemented !== null) return implemented;
  if (node.type === 4) {
    const target = targetName(node.refs.questHero ?? node.refs.questPack ?? node.refs.questSpell ?? node.refs.questMonster);
    return tr`${target || (node.refs.questMonster ? "적 토벌" : "전투")} 과제`;
  }
  if (node.type === 6) return t(targetName(node.refs.riftSkillTreeGrid) || "귀환 진영");
  if (node.type === 9) return t("다음 진영 관문");
  if ([1, 2, 3].includes(node.type)) return t("강화 연결");
  return node.effects[0] ? effectName(node.effects[0]) : t(objects[node.id] ?? "미확인 강화");
}

/** A tile for one troop or one thing shows it as the picture, with what changes in the badge.
 * An upgrade shared by every troop or the camp has no target, so the stat icon stands alone.
 * Troops drawn from one sprite share a look for the same stat. The sheet's name tells them apart. */
export type UpgradeFace = { readonly picture: string; readonly sheet: "unit" | "ship" | null; readonly badge: string };
type Art = Pick<UpgradeFace, "picture" | "sheet">;
const icon = (file: string): Art => ({ picture: `./art/icons/${file}.webp`, sheet: null });
const sprite = (file: string): Art => ({ picture: `./art/units/${file}.png`, sheet: "unit" });
function troopArt(id: string | undefined): Art | null {
  const profile = id ? BPH_PROFILES[id] : undefined;
  if (!profile) return null;
  const art = bphProfileArt(profile.id);
  return { picture: `./art/${bphArtPath(art)}`, sheet: bphShipArt(art) ? "ship" : "unit" };
}
const buildingArt: Readonly<Record<string, string>> = {
  Building_1Basic: "yard-rack", Building_2Advanced: "yard-rack", Building_5Nature: "yard-rack",
  Building_6Death: "yard-rack", Building_7Frost: "yard-rack", Building_4Royal: "yard-forge0",
};
/** The same target order as the name, so the picture and the label never disagree. Null is a shared upgrade. */
function targetArt(node: BphUpgradeNode): Art | null {
  if (node.type === 4) {
    const enemy = BPH_ENEMY_MAP[node.refs.questMonster ?? ""];
    return troopArt(node.refs.questHero) ?? (node.refs.questPack ? icon("card") : node.refs.questSpell ? icon("flash")
      : enemy && enemy.kind !== "ship" ? sprite(enemy.kind === "guard" ? "so_yoshitoshi" : enemy.kind) : null);
  }
  if (node.type === 6 || node.type === 9) return icon("rift");
  const effect = node.effects[0];
  if (!effect || TAP_STRIKE_NODES.has(effect.type)) return null;
  const targets = effect.targets;
  const troop = troopArt(targets.targetHero);
  if (troop) return troop;
  if (targets.targetBuilding) return icon(buildingArt[targets.targetBuilding] ?? "yard-hall");
  if (targets.targetTome) return icon("tome-book-svg");
  if (targets.targetPack) return icon("card");
  if (targets.targetRelic) return icon("unit-cap-relic");
  return targets.targetSpell && !effect.type.startsWith("Bonfire") ? icon("flash") : null;
}
/** First match wins: narrow stat words precede the broad ones that contain them. */
const statBadges: readonly (readonly [RegExp, string])[] = [
  [/UpgradeUnlock|VisualUpgrade|Giant/, "up"],
  [/Unlock|CanBeRerolled|RecoverDestroyed|Discover/, "lock"],
  [/Crit/, "pierce"],
  [/Coin|Salary|Discount|Cost|Gold|Jackpot/, "coin"],
  [/Mastery/, "star-mastery"],
  [/Heal|Lifesteal/, "heart"],
  [/^HeroDuration$|Hp|HP|Shield|Block|DamageReduction|Immune|Reflect|ExtraHits/, "shield"],
  [/Range|Distance/, "crossbow"],
  [/Area|Radius|Size|Taunt/, "range-friendly"],
  [/Speed|FireRate|Interval|Cooldown|Activat|Duration|Seconds|HitsToOpen|Stun|Freeze/, "hourglass"],
  [/AttackPower|Damage|Sword|Blade|Charge/, "sword"],
  [/Foilium|FoilChance/, "jackpot-foil"],
  [/Spawn|Copies|Pool|Pack|Deal/, "reinforce"],
  [/Count|Bounce|Cast|Projectile|Lines|Seed|Dash|Chance|Slot/, "plus"],
];
function statBadge(node: BphUpgradeNode): string {
  // A kill task wears a skull, so an enemy rider never passes for the Joseon rider drawn from the same sheet.
  if (node.type === 4) return node.refs.questMonster && !node.refs.questHero && !node.refs.questPack && !node.refs.questSpell
    ? "skull" : "trophy";
  if (node.type === 6 || node.type === 9) return "home";
  const type = node.effects[0]?.type ?? "";
  if (type === "TomeCursorDpsAttackSpeedBonus" || type === "TomeCursorDpsCritChance") return "plus";
  if (type === "CursorCritKillCastSpellAtMonster") return "flaming-arrow-tail";
  return statBadges.find(([pattern]) => pattern.test(type))?.[1] ?? "skill-up";
}
export function upgradeFace(node: BphUpgradeNode): UpgradeFace {
  const target = targetArt(node), stat = icon(statBadge(node));
  return target ? { ...target, badge: stat.picture } : { ...stat, badge: "" };
}

/** A tile sells once. The same definition repeated in one tree is that upgrade's further purchases.
 * A task tile pays once per authored threshold instead. */
export type UpgradeRank = { readonly bought: number; readonly max: number };
export function upgradeRank(save: BphSave, placement: BphPlacement): UpgradeRank {
  const tiles = [...BPH_PLACEMENTS.values()].filter(p => p.gridId === placement.gridId && p.nodeId === placement.nodeId);
  const node = placement.nodeId ? BPH_UPGRADE_NODES[placement.nodeId] : undefined;
  if (node?.type === 4) return { bought: tiles.reduce((sum, p) => sum + bphQuestClaims(save, p.id), 0),
    max: tiles.length * node.thresholds.length };
  return { bought: tiles.filter(p => save.purchasedPlacements.includes(p.id)).length, max: tiles.length };
}
/** The tile's rank corner: nothing for a one-time upgrade, MAX once every purchase is made. */
export function upgradeRankPips(rank: UpgradeRank): string {
  if (rank.max < 2) return "";
  if (rank.bought >= rank.max) return "MAX";
  return rank.max <= 3 ? "●".repeat(rank.bought) + "○".repeat(rank.max - rank.bought) : `${rank.bought}/${rank.max}`;
}
export function upgradeRankText(rank: UpgradeRank): string {
  return tr`최대 ${rank.max}회 · 남은 횟수 ${rank.max - rank.bought}회`;
}

// These mixed nodes run some effects but have additional data without a consumer.
// Keep inactive features explicit without promising their authored, unused numbers.
const partialNotes: Readonly<Record<string, readonly [string, string]>> = {
  FOIL_Illusionist: ["환영 복제 수 증가", "extra illusion copies"],
  FOIL_Portal: ["시전 속도 증가", "faster casting"],
  SN_BloodMage_ConsumeChance: ["시체 흡수 후 공격력 증가", "damage growth after corpse absorption"],
  SN_ShopRerollUnlock: ["특별 상품 등장 보정", "special-offer draw bonus"],
  SN_ShopRoguelikeSlotBonus: ["특별 상품 등장 보정", "special-offer draw bonus"],
  SN_ShopRoguelikeSlotBonus2: ["특별 상품 등장 보정", "special-offer draw bonus"],
  SN_ShopRoguelikeSlotBonus3: ["특별 상품 등장 보정", "special-offer draw bonus"],
  SN_ShopRoguelikeSlotBonus4: ["특별 상품 등장 보정", "special-offer draw bonus"],
  SN_RoguelikeDiscountChance: ["특별 상품 생성·지급 경로 연결 대기", "special-offer generation and delivery pending"],
  SN_RoguelikeDiscountChance2: ["특별 상품 생성·지급 경로 연결 대기", "special-offer generation and delivery pending"],
  SN_RoguelikeDiscountChance3: ["특별 상품 생성·지급 경로 연결 대기", "special-offer generation and delivery pending"],
};

export function upgradeDescription(node: BphUpgradeNode): string {
  if (node.type === 5) return bphRelicEffect(node.id, node);
  if (node.id.startsWith("HJ_ArmyTraining") && node.effects[0]?.type === "HeroDuration") {
    const percent = number(node.effects[0].value * 100);
    return phrase(`병력 체력 +${percent}%`, `Troop HP +${percent}%`);
  }
  const inactive = partialNotes[node.id];
  if (inactive) {
    const foilHero = node.id === "FOIL_Illusionist" ? "Hero3_Illusionist" : node.id === "FOIL_Portal" ? "Hero3_Portal" : "";
    const applied = node.effects.flatMap(effect => {
      const description = implementedEffectDescription(effect);
      if (description === null) return [];
      return [foilHero && effect.type === "FoilHeroHp" ? phrase(
        `금박 ${effectTarget(foilHero)} 체력 +${number(effect.value * 100)}%`,
        `Foil ${effectTarget(foilHero)} HP +${number(effect.value * 100)}%`,
      ) : description];
    }).join(" · ");
    return phrase(`적용: ${applied}. 미적용: ${inactive[0]}.`, `Applied: ${applied}. Not applied: ${inactive[1]}.`);
  }
  const quest = implementedQuestDescription(node);
  if (quest !== null) return quest;
  if (node.type === 4) {
    const income = node.values.questIncomeFlatBonus;
    const target = targetName(node.refs.questPack ?? node.refs.questMonster ?? node.refs.questHero ?? node.refs.questSpell);
    const action = node.refs.questPack ? "실행" : node.refs.questMonster ? "처치" : node.refs.questHero ? "병력 과제" : node.refs.questSpell ? "책략 과제" : "과제";
    const rewards = [
      income ? tr`시작 코인 +${number(income)}` : "",
      node.values.questMasteryReward ? tr`숙련 +${number(node.values.questMasteryReward)}` : "",
      node.refs.questDisplayRewardPack || node.refs.questUnlockPackReward
        ? tr`${targetName(node.refs.questDisplayRewardPack ?? node.refs.questUnlockPackReward)} 해금` : "",
      node.refs.questRelicPackReward ? tr`${targetName(node.refs.questRelicPackReward)} 보상` : "",
    ].filter(Boolean);
    return tr`${target} ${action} ${node.thresholds.join("/")}회 → ${rewards.join(" · ") || "보상 미확인"}${bphQuestUnknowns(node).length ? " · 집계 효과 미확인" : ""}`.trim();
  }
  if (node.type === 6 && node.refs.riftSkillTreeGrid) return phrase(
    `${effectTarget(node.refs.riftSkillTreeGrid)} 강화망 접근 해금`,
    `Unlock access to the ${effectTarget(node.refs.riftSkillTreeGrid)} upgrade tree`,
  ) + (node.refs.targetPack
    ? phrase(` · ${targetName(node.refs.targetPack)} 해금`, ` · Unlock ${t(targetName(node.refs.targetPack))}`) : "");
  if (node.type === 6) return tr`${upgradeName(node)} 이동 해금`;
  if (node.type === 9) return tr`${node.values.doorPrestigeLevel === 1 ? "전초" : "후방"} 진영 관문 해금`;
  return node.effects.length ? node.effects.filter(e => e.value !== 0 || implementedEffectDescription(e) !== null).map(effectDescription).join(" · ") || t("효과 미확인") : t("효과 미확인");
}
