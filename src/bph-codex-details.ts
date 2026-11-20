import type { BphEffect, BphProfile } from "./bph-contract";
import { BPH_ATTACK_RANGE_TO_PX, BPH_WORLD_TO_PX } from "./bph-contract";
import { BPH_ENEMY_MAP, BPH_MONSTERS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { BPH_CODEX_SLOTS } from "./bph-codex-data";
import { unitAbilityText, unitDisplayName } from "./unit-codex-i18n";
import { language } from "./i18n";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { bphEffectValue } from "./bph";
import { MONK_LANDING_DAMAGE_MULTIPLIER } from "./bph-fx-profiles";

export type BphCodexValue = {
  readonly label: string; readonly value: number; readonly unit: string;
};
export type BphCodexAbility = {
  readonly condition: string; readonly values: readonly BphCodexValue[];
  readonly source: string; readonly implemented: boolean;
};
export function bphCodexLabel(id: string): string {
  const p = BPH_PROFILES[id], t = BPH_TOMES[id];
  return p ? unitDisplayName(id, language()) ?? p.name : t ? t.name : id;
}
/** Identity is the original asset ID. Sharing a class, name or art is not identity. */
export function bphCodexIdentities(ids: readonly string[] = BPH_CODEX_SLOTS.map(slot => slot.id)): readonly string[] {
  return [...new Set(ids)];
}
const value = (label: string, amount: number, unit = ""): BphCodexValue => ({ label, value: amount, unit });
const ability = (condition: string, values: readonly BphCodexValue[],
  source = "bph-fx-profiles.ts", implemented = true): BphCodexAbility => ({ condition, values, source, implemented });
function reference(raw: string | number | undefined): string | null {
  if (typeof raw !== "string") return null;
  const parsed: unknown = JSON.parse(raw);
  return parsed && typeof parsed === "object" && "name" in parsed && typeof parsed.name === "string" ? parsed.name : null;
}
/** Joseon small-unit leader ranks shown on the spear promotion ladder, keyed by the promoted profile. */
export const BPH_PROMOTION_RANKS: Readonly<Record<string, string>> = { Hero1_Squire2: "오장", Hero1_Squire3: "십장", Hero4_Bannerman: "기총" };
const W = BPH_WORLD_TO_PX;
/** Original spell table sizes quoted by the codex, in world units and seconds. */
const SPELL = {
  Stun: { radius: 1, duration: 1.5 }, Fireball: { radius: .30000001192092896 }, AoeCircle: { radius: .5 },
  InfectionBomb: { radius: .4000000059604645, duration: 5, tick: .5 }, Tornado: { radius: .25, duration: 4, tick: .5 },
  Mine: { radius: .6000000238418579, duration: 30 }, TeleportAndDamageAoe: { radius: 1.5 }, HammerTaunt: { radius: 1 },
} as const;
const lines = (...parts: readonly string[]): string => parts.join("; ");
const raw = (p: BphProfile, field: string): number => Number(p.raw[field] ?? 0);
const IMMUNE = "감염에 걸리지 않습니다.";
const SPIRIT = "떠도는 혼령이라 싸우는 동안 체력이 조금씩 줄어듭니다.";
const DASH_HITS = "부딪힌 적에게 피해를 주고 잠시 기절시킨 뒤 밀어냅니다.";
const SAFE_DASH = "돌진하는 동안에는 피해를 받지 않습니다.";
const dashValues = (p: BphProfile, chain?: number): BphCodexValue[] => [
  value("돌진 피해", raw(p, "chargeAttackDamage")), value("이동 속도 배율", raw(p, "chargeMoveSpeedMultiplier"), "배"),
  value("최소 거리", raw(p, "dashMinDistance") * W, "px"), value("최대 거리", raw(p, "dashMaxDistance") * W, "px"),
  ...chain === undefined ? [] : [value("연속 돌진", chain, "회")], value("기절", raw(p, "dashHitStunDuration"), "초"),
];
const drain = (p: BphProfile): BphCodexValue =>
  value("초당 체력 감소", raw(p, "survivePhaseHpLossPerTick") / (raw(p, "survivePhaseHpLossTickIntervalSeconds") || 1));
const taunt = (): BphCodexAbility[] => [ability(lines("직접 공격하지 않습니다.", "둘레의 적이 이 기병을 노리도록 끌어들입니다."),
  [value("도발 반경", SPELL.HammerTaunt.radius * W, "px")], "native: Spell_HammerTaunt aura")];
/** What each army unit does in battle, in player words. Unit spells deal the unit's full attack damage (native). */
const UNIT_SKILLS: Readonly<Record<string, (p: BphProfile) => readonly BphCodexAbility[]>> = {
  Hero1_Archer: () => [ability("사거리 안의 적에게 화살을 쏩니다.", [], "bph-combat.ts:bphArms")],
  Hero1_Barbarian: () => [ability("앞쪽 부채꼴 안의 적을 한꺼번에 벱니다.", [], "native: cone attack")],
  Hero1_Squire: () => [ability(lines("가까운 적을 창으로 찌릅니다.", "창병 진급을 강화하면 적을 처치할수록 오장, 십장, 기총으로 진급합니다."), [],
    "bph-combat.ts:bphUnitKill")],
  Hero1_Squire2: () => [ability(lines("오장으로 진급한 창병입니다.", "창병보다 멀리, 세게 찌릅니다."), [], "bph-combat.ts:bphUnitKill")],
  Hero1_Squire3: () => [ability(lines("십장으로 진급한 창병입니다.", "오장보다 더 세고 빠르게 찌릅니다."), [], "bph-combat.ts:bphUnitKill")],
  Hero2_Knight: () => [ability("적의 공격을 일정 확률로 막아 냅니다.", [], "rules.ts block"),
    ability("강화 후 적의 공격을 막으면 주변 적을 1.5초 기절시킵니다.",
      [value("기절", SPELL.Stun.duration, "초"), value("반경", SPELL.Stun.radius * W, "px")], "native: SN_PaladinAbility + Spell_Stun")],
  Hero2_Monk: p => [ability(lines("가까운 적 사이를 연달아 뛰어넘습니다.", "착지 지점 둘레의 적을 공격하고 기절시키며 밀어냅니다.", "도약 중에는 피해를 받지 않습니다."),
    [value("착지 피해", raw(p, "chargeAttackDamage") * MONK_LANDING_DAMAGE_MULTIPLIER), value("연속 도약", 3, "회"), value("기절", raw(p, "dashHitStunDuration"), "초")], "bph-fx-profiles.ts:startDash")],
  Hero5_Dino: p => [ability(lines("표적을 향해 곧게 돌진합니다.", DASH_HITS, SAFE_DASH), dashValues(p), "bph-fx-profiles.ts:startDash")],
  Hero5_DinoRider: p => [ability(lines("표적을 향해 돌진하며 짧은 간격으로 화살을 쏩니다.", SAFE_DASH,
    "쓰러지거나 희생되면 말과 기수가 갈라져 돌격 기병과 궁기병으로 다시 싸웁니다."),
  [value("돌진 피해", raw(p, "chargeAttackDamage")), value("이동 속도 배율", raw(p, "chargeMoveSpeedMultiplier"), "배"),
    value("화살 간격", raw(p, "riderArrowInterval"), "초")], "native: rider arrows + dismount")],
  Hero5_Rider: () => [ability("적을 꿰뚫고 날아가는 화살을 쏘아 화살이 지나는 길의 적 모두에게 피해를 줍니다.", [], "native: Spell_RiderPiercer")],
  Hero2_Pyromancer: p => [ability("공격할 때마다 화전을 쏘아 떨어진 자리 둘레의 적 모두에게 피해를 줍니다.",
    [value("피해", p.damage), value("반경", SPELL.Fireball.radius * W, "px")], "native: Spell_Fireball")],
  Hero3_WitchDoctor: p => [ability(lines("독연 단지를 던져 떨어진 자리의 적에게 피해를 주고 감염시킵니다.", "연기는 그 자리에 남아 안에 든 적에게 계속 피해를 줍니다."),
    [value("첫 피해", p.damage), value("반경", SPELL.InfectionBomb.radius * W, "px"), value("지속", SPELL.InfectionBomb.duration, "초"),
      value("주기", SPELL.InfectionBomb.tick, "초")], "native: Spell_InfectionBomb")],
  Hero4_Stormcaller: p => [ability(lines("공격하면 표적 자리에 연막 회오리를 일으킵니다.", "회오리는 천천히 떠돌며 안에 든 적에게 일정한 간격으로 피해를 줍니다.",
    "휘말린 적을 끌어당겨 돌리다가 내던집니다."),
  [value("피해", p.damage), value("주기", SPELL.Tornado.tick, "초"), value("지속", SPELL.Tornado.duration, "초"),
    value("반경", SPELL.Tornado.radius * W, "px")], "native: Spell_Tornado")],
  Hero9_Quasar: p => [ability(lines("공격하면 신기전 불줄기를 쏘아 지나는 길의 적 모두에게 한 번씩 피해를 줍니다.",
    "불줄기는 조금씩 휘어 나가며 화면 끝에 닿으면 반대편에서 한 번 더 이어집니다."), [value("피해", p.damage)], "native: Spell_Quasar")],
  Hero9_Supernova: p => [ability(lines("공격하면 표적 근처에 불씨 지뢰를 묻습니다.",
    "손가락이나 마우스로 지뢰를 건드리면 불이 붙어 곧 터지며 둘레의 적 모두에게 피해를 줍니다.",
    "터지는 지뢰는 폭발에 닿은 다른 지뢰도 터뜨립니다.", "건드리지 않은 지뢰는 시간이 지나면 조용히 사라집니다."),
  [value("피해", p.damage), value("반경", SPELL.Mine.radius * W, "px"), value("지속", SPELL.Mine.duration, "초")], "native: Spell_Mine pointer trigger")],
  Hero9_BlackHole: p => [ability("공격하면 순식간에 표적 자리로 옮겨 가 둘레의 적 모두에게 피해를 줍니다.",
    [value("도착 범위 피해", p.damage), value("피해 반경", SPELL.TeleportAndDamageAoe.radius * W, "px")], "native: Spell_TeleportAndDamageAoe")],
  Hero3_DemonSlayer: () => [ability("화살이 일정 확률로 치명타가 되어 더 큰 피해를 줍니다.", [], "native: Hero.RollCrit")],
  Hero3_Illusionist: p => [
    ability("살아 있는 동안 전투에서 얻는 숙련이 늘어납니다.", [value("숙련 증가", raw(p, "masteryMultiplier") * 100, "%")], "bph-fx-profiles.ts:resourceSurge"),
    ability("쓰러지면 터져 둘레의 적 모두에게 피해를 줍니다.", [value("피해", p.damage), value("반경", SPELL.AoeCircle.radius * W, "px")],
      "native: Spell_AoeCircle on death"),
    ability("모집으로 들어올 때 분신이 함께 나옵니다.", [], "bph.ts: pack clones"),
  ],
  Hero3_Portal: p => [ability(lines("일정한 간격으로 지금까지 발견한 병력 하나를 배에서 내려 보냅니다.", "흔한 병력일수록 더 자주 내립니다.",
    "자기와 같은 배는 내리지 않습니다.", "다섯 번 내려 보내면 배가 물러납니다."),
  [value("주기", raw(p, "spellCastInterval"), "초"), value("상륙 병력", raw(p, "spawnerMaxSummons"), "명")], "native: Spell_SpawnerSummon")],
  Hero4_Bannerman: p => [ability("공격할 때마다 자신을 뺀 무작위 아군 한 명의 다음 공격을 강화합니다.",
    [value("대상 수", raw(p, "bannermanChargeTargetCount"), "명"), value("지속", raw(p, "bannermanChargeDuration"), "초")], "bph-fx-profiles.ts:charge")],
  Hero4_Duelist: p => [ability(lines("적에게 뛰어들어 내려찍고, 착지한 자리 둘레의 적을 잠시 기절시킵니다.", "적을 처치하면 일정 확률로 동전을 얻습니다."),
    [value("기절", raw(p, "bloodhunterLandingStunSeconds"), "초"), value("착지 반경", raw(p, "bloodhunterLandingStunRadius") * W, "px"),
      value("동전 확률", raw(p, "gainCoinOnKillChance") * 100, "%")], "native: leap + kill coin")],
  Hero_Bear: () => [ability(lines("둘레의 적을 한꺼번에 내리칩니다.", "받는 피해가 줄어듭니다.", IMMUNE), [], "native: zombieImmune")],
  Hero_Jaguar: () => [ability(lines("가까운 적에게 재빨리 달려들어 벱니다.", IMMUNE), [], "native: zombieImmune")],
  Hero_Monkey: () => [ability(lines("사거리 안의 적에게 화살을 쏩니다.", IMMUNE), [], "native: zombieImmune")],
  Hero_Rat: () => [ability(lines("가까운 적을 칼로 벱니다.", IMMUNE), [], "native: zombieImmune")],
  Hero_Skeleton: p => [ability(lines("가까운 적을 창으로 찌릅니다.", SPIRIT, IMMUNE), [drain(p)], "native: survive-phase HP loss")],
  Hero_SkeletonUpgraded: p => [ability(lines("소환 창병보다 더 세고 빠르게 찌릅니다.", SPIRIT, IMMUNE), [drain(p)], "native: survive-phase HP loss")],
  Hero5_Beastmaster: p => [ability("전투에 나설 때 척후 의병들을 데리고 나옵니다.", [value("동반 병력", raw(p, "beastmasterFriendCount"), "명")],
    "bph-combat.ts:addBphProfile")],
  Hero5_Treant: p => [ability("공격할 때마다 둘레에서 가장 많이 다친 아군에게 목책 말뚝을 던져 잠시 방어를 굳혀 줍니다.",
    [value("대상 수", 1, "명"), value("지속", raw(p, "seedStatusDuration"), "초"), value("반경", raw(p, "seedRange") * W, "px")], "native: Spell_Seed")],
  Hero6_BloodMage: p => [ability("적에게 준 피해의 일부만큼 체력을 회복합니다.", [value("실제 피해 대비 회복", raw(p, "bloodMageLifestealPercent") * 100, "%")])],
  Hero6_Shotgun: p => [ability(lines("한 번에 여러 발을 부채꼴로 흩뿌려 쏩니다.", "한 발 한 발이 공격력만큼 피해를 줍니다."),
    [value("탄환", raw(p, "shotgunArrowCount"), "개"), value("퍼짐 각도", raw(p, "shotgunConeAngleDegrees"), "도")], "native: shotgun volley")],
  Hero6_Skelewheel: p => [ability(lines("표적이 생기면 편곤을 휘두르며 이리저리 내달려 부딪히는 적 모두에게 피해를 줍니다.", "화면 끝에 닿으면 튕겨 나오고, 부딪힌 적을 밀어냅니다."),
    [value("지속", raw(p, "wheelModeDurationSeconds"), "초"), value("이동 속도 배율", raw(p, "wheelModeMoveSpeedMultiplier"), "배")], "bph-fx-profiles.ts:startWheel")],
  Hero7_AstralFisher: p => [ability(lines("멀리 있는 적에게 갈고리를 던져 잠시 기절시키고, 배 쪽으로 끌어당긴 뒤 피해를 줍니다.", "가까이 다가온 적은 직접 칩니다."),
    [value("당김 거리", raw(p, "astralFisherPullDistance") * W, "px"), value("당김 시간", raw(p, "astralFisherPullDuration"), "초"),
      value("기절", raw(p, "astralFisherHitStunDuration"), "초")], "bph-fx-profiles.ts:startHook")],
  Hero7_Icebourne: p => [ability("공격할 때 몸 둘레를 도는 칼날을 만들어 닿는 적에게 피해를 줍니다.",
    [value("칼날", raw(p, "rotatingSwordCount"), "개"), value("지속", raw(p, "rotatingSwordDuration"), "초"),
      value("각속도", raw(p, "rotatingSwordAngularSpeed"), "도/초"), value("궤도 반경", raw(p, "rotatingSwordRadius") * W, "px")], "bph-fx-profiles.ts:startSwords")],
  Hero7_Warlord: taunt,
  Hero7_Warlord_Spiked: taunt,
  Hero8_Doppelganger: () => [ability("모집할 때마다 지금까지 발견한 다른 병력 하나로 모습을 바꿉니다.", [], "native: pack-open transform")],
};
/**
 * Base values, before purchased upgrades, foil bonuses and temporary buffs.
 * Only branches actually executed by the current runtime appear as active skills.
 */
export function bphCodexDetails(id: string, effects: readonly BphEffect[] = []) {
  const p = BPH_PROFILES[id], t = BPH_TOMES[id], enemy = BPH_MONSTERS[id];
  const stats: BphCodexValue[] = [];
  const skills: BphCodexAbility[] = [];
  const gated = p?.evolution.length && Object.values(BPH_UPGRADE_NODES).some(node =>
    node.effects.some(effect => effect.type === "HeroKillUpgradeUnlock" && Object.values(effect.targets).includes(id)));
  const unlocked = bphEffectValue(effects, "HeroKillUpgradeUnlock", id);
  const evolution = (p?.evolution ?? []).map((step, index) => ({
    profileId: step.profileId, name: bphCodexLabel(step.profileId), kills: step.kills,
    changesIdentity: step.become, requiredUnlockLevel: index + 1,
    unlocked: unlocked > index,
    condition: "진급 강화를 배우고 필요한 수만큼 적을 처치하면 진급합니다.",
    rank: BPH_PROMOTION_RANKS[step.profileId] ?? null,
  })).filter(step => !gated || step.unlocked);
  if (p) {
    stats.push(value("체력", p.hp), value("공격력", p.damage), value("공격 간격", p.cooldown, "초"),
      value("사거리", p.range * BPH_ATTACK_RANGE_TO_PX, "px"), value("이동 속도", p.moveSpeed * BPH_WORLD_TO_PX, "px/초"),
      value("공격 반경", p.area * BPH_ATTACK_RANGE_TO_PX, "px"), value("치명타 확률", p.critChance * 100, "%"),
      value("치명타 배율", p.critChance > 0 ? 2 + p.critDamage : 0, "배"), value("막기 확률", p.blockChance * 100, "%"),
      value("피해 감소", p.reduction * 100, "%"));
    const base = UNIT_SKILLS[id]?.(p) ?? [], text = unitAbilityText(id, language());
    skills.push(...(text ? [ability(text, base.flatMap(skill => skill.values))] : base));
  } else if (enemy) {
    stats.push(value("체력", enemy.hp), value("공격력", enemy.damage), value("성벽 피해", enemy.towerDamage),
      value("공격 간격", enemy.attackSpeed > 0 ? 1 / enemy.attackSpeed : 0, "초"),
      value("사거리", enemy.range * BPH_WORLD_TO_PX, "px"),
      value("이동 속도", enemy.moveSpeed * BPH_WORLD_TO_PX, "px/초"));
  } else if (t) {
    const supported = [0, 1, 4, 6].includes(t.effectKind) || id === "Tome_Blizzard";
    skills.push(ability(supported ? "획득 후 지속 시간 동안 적용; 주기는 강화 전 기준"
      : "원본 데이터는 있으나 현재 실행기 미지원", [
      value("지속", Number(t.raw.buffDuration), "초"), value("주기", t.interval, "초"),
      value("최소 주기", t.intervalMin, "초"), value("최대 주기", t.intervalMax, "초"),
      value("주기당 발동", t.casts, "회"),
    ], "bph-fx-status.ts:startTome/channelInterval/tickTomes", supported));
    if (id === "Tome_Thunderstorm") skills.push(ability("커서 둘레의 적에게 벼락이 떨어져요", [
      value("피해", 1.5), value("기절", .4000000059604645, "초"),
    ], "bph-fx-status.ts:executeSpell"));
    if (id === "Tome_Earthquake") skills.push(ability("커서 자리에 땅이 울려 둘레의 적이 잠깐 기절해요; 밀치기 실행식 미확인", [
      value("피해", 2), value("반경", BPH_WORLD_TO_PX, "px"), value("기절", 1.5, "초"),
    ], "bph-fx-status.ts:executeSpell"));
    if (id === "Tome_RaiseDead") skills.push(ability(`주기마다 ${bphCodexLabel(reference(t.raw.summonUnit) ?? "")} 소환`,
      [value("소환 수", t.casts, "명")], "bph-fx-status.ts:tickTomes"));
    if (id === "Tome_DragonsCall") skills.push(ability("커서 자리에 불길이 번져 안에 든 적을 태워요", [], "bph-tome-fields.ts:landBphDragonFire"));
    if (id === "Tome_Blizzard") skills.push(ability("커서 둘레에 눈보라가 몰아쳐 적이 느려지고, 또 걸리면 잠깐 얼어붙어요", [],
      "bph-tome-fields.ts:castBphBlizzard"));
    if (id === "Tome_CursorDPS") skills.push(ability("켜져 있는 동안 화살비가 더 세게 꽂혀요; 중복 적용은 미지원", [
      value("기본 피해", 1 + Number(t.raw.cursorDpsDamageBonusPercent)),
    ], "bph-fx-status.ts:landStrikes + bph-fx-status.ts:startTome"));
  }
  return { id, name: bphCodexLabel(id), stats, skills, evolution, baseValues: true as const };
}

/** What a skill's base values say about the unit, in the order a player would name it. */
const SKILL_TRAITS: readonly (readonly [readonly string[], string])[] = [
  [["상륙 병력", "동반 병력", "소환 수"], "소환"], [["실제 피해 대비 회복"], "회복"], [["도발 반경"], "도발"], [["당김 거리"], "끌어당김"],
  [["대상 수"], "지원"], [["칼날"], "회전 칼날"], [["탄환"], "산탄"], [["돌진 피해"], "돌진"], [["착지 반경"], "도약"],
  [["도착 범위 피해"], "순간이동"], [["첫 피해"], "독"], [["숙련 증가"], "숙련"], [["기절"], "기절"],
];
const AREA_LABELS = ["반경", "피해 반경", "도착 범위 피해"];
const ENEMY_KIND_TRAITS: Readonly<Record<string, string>> = { yari: "보병", samurai: "무사", cavalry: "기마", guard: "중장", teppo: "조총" };
/**
 * Two or three words in place of exact numbers (owner rule: the codex never shows stat values).
 * Allies read their attack type, skills and defences; enemies read their troop kind, rank and pace.
 */
export function bphCodexTraits(id: string): readonly string[] {
  const p = BPH_PROFILES[id], enemy = BPH_MONSTERS[id], kind = BPH_ENEMY_MAP[id];
  const traits: string[] = [];
  if (p) {
    const labels = (UNIT_SKILLS[id]?.(p) ?? []).flatMap(skill => skill.values.map(entry => entry.label));
    // A unit with no reach never attacks directly; it backs the line instead.
    traits.push(p.range === 0 ? "지원" : p.attackType === 1 ? "원거리" : "근접");
    for (const [sources, trait] of SKILL_TRAITS) if (sources.some(label => labels.includes(label))) traits.push(trait);
    if (p.area > 0 || AREA_LABELS.some(label => labels.includes(label))) traits.push("범위");
    if (p.critChance > 0) traits.push("치명타");
    if (p.blockChance > 0) traits.push("막기");
    if (p.reduction > 0) traits.push("단단함");
    if (traits.length < 2 && !traits.includes("범위")) traits.push("단일");
  } else if (enemy && kind) {
    const pace = enemy.moveSpeed * BPH_WORLD_TO_PX;
    traits.push(kind.kind === "teppo" ? "원거리" : "근접", ENEMY_KIND_TRAITS[kind.kind] ?? "");
    if (kind.bossId) traits.push("지휘관");
    else if (kind.role.startsWith("Elite")) traits.push("정예");
    traits.push(pace === 0 ? "고정" : pace >= 90 ? "빠름" : pace <= 47 ? "느림" : "");
  }
  return [...new Set(traits.filter(Boolean))].slice(0, 3);
}
