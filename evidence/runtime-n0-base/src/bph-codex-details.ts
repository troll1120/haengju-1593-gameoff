import type { BphEffect } from "./bph-contract";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { BPH_MONSTERS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { BPH_CODEX_SLOTS } from "./bph-codex-data";

const rarities = ["일반", "희귀", "영웅", "전설"] as const;
export type BphCodexValue = {
  readonly label: string; readonly value: number; readonly unit: string;
};
export type BphCodexAbility = {
  readonly condition: string; readonly values: readonly BphCodexValue[];
  readonly source: string; readonly implemented: boolean;
};
export function bphCodexLabel(id: string): string {
  const p = BPH_PROFILES[id], t = BPH_TOMES[id];
  return p ? `${p.name} · ${rarities[p.rarity] ?? p.rarity}`
    : t ? `${t.name} · ${rarities[t.rarity] ?? t.rarity}` : id;
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
/**
 * Base values, before purchased upgrades, foil bonuses and temporary buffs.
 * Only branches actually executed by the current runtime appear as active skills.
 */
export function bphCodexDetails(id: string, effects: readonly BphEffect[] = []) {
  const p = BPH_PROFILES[id], t = BPH_TOMES[id], enemy = BPH_MONSTERS[id];
  const stats: BphCodexValue[] = [];
  const skills: BphCodexAbility[] = [];
  const evolution = (p?.evolution ?? []).map((step, index) => ({
    profileId: step.profileId, name: bphCodexLabel(step.profileId), kills: step.kills,
    changesIdentity: step.become, requiredUnlockLevel: index + 1,
    unlocked: effects.filter(e => e.type === "HeroKillUpgradeUnlock"
      && Object.values(e.targets).includes(id)).reduce((n, e) => n + e.value, 0) > index,
    condition: "해당 병력의 HeroKillUpgradeUnlock 강화 단계와 누적 처치 수",
  }));
  if (p) {
    stats.push(value("체력", p.hp), value("공격력", p.damage), value("공격 간격", p.cooldown, "초"),
      value("사거리", p.range * BPH_WORLD_TO_PX, "px"), value("이동 속도", p.moveSpeed * BPH_WORLD_TO_PX, "px/초"),
      value("공격 반경", p.area * BPH_WORLD_TO_PX, "px"), value("치명타 확률", p.critChance * 100, "%"),
      value("치명타 배율", p.critDamage, "배"), value("막기 확률", p.blockChance * 100, "%"),
      value("피해 감소", p.reduction * 100, "%"));
    const n = (field: string) => Number(p.raw[field] ?? 0);
    switch (id) {
      case "Hero2_Knight":
        skills.push(ability("생성 후 일정 주기마다 주변의 살아 있는 적에게 기절", [
          value("주기", n("spellCastInterval"), "초"), value("반경", BPH_WORLD_TO_PX, "px"),
          value("기절", 1.5, "초"),
        ])); break;
      case "Hero2_Monk": case "Hero5_Dino": case "Hero5_DinoRider":
        skills.push(ability("공격 대상이 있을 때 돌진; 최대 거리가 0이면 제한 없음", [
          value("돌진 피해", n("chargeAttackDamage")), value("이동 속도 배율", n("chargeMoveSpeedMultiplier"), "배"),
          value("최소 거리", n("dashMinDistance") * BPH_WORLD_TO_PX, "px"),
          value("최대 거리", n("dashMaxDistance") * BPH_WORLD_TO_PX, "px"),
          value("연속 돌진", id === "Hero2_Monk" ? 3 : 1, "회"),
        ])); break;
      case "Hero6_Skelewheel":
        skills.push(ability("공격 대상이 있을 때 회전 이동", [
          value("지속", n("wheelModeDurationSeconds"), "초"),
          value("이동 속도 배율", n("wheelModeMoveSpeedMultiplier"), "배"),
        ])); break;
      case "Hero7_Icebourne":
        skills.push(ability("공격 시 회전 칼날 생성", [
          value("칼날", n("rotatingSwordCount"), "개"), value("지속", n("rotatingSwordDuration"), "초"),
          value("각속도", n("rotatingSwordAngularSpeed"), "도/초"),
          value("궤도 반경", n("rotatingSwordRadius") * BPH_WORLD_TO_PX, "px"),
        ])); break;
      case "Hero7_AstralFisher":
        skills.push(ability("공격 대상에 갈고리 적중 후 당김", [
          value("당김 거리", n("astralFisherPullDistance") * BPH_WORLD_TO_PX, "px"),
          value("당김 시간", n("astralFisherPullDuration"), "초"),
          value("기절", n("astralFisherHitStunDuration"), "초"),
        ])); break;
      case "Hero4_Bannerman":
        skills.push(ability("공격 시 자신을 제외한 살아 있는 무작위 아군에게 Charge", [
          value("대상 수", n("bannermanChargeTargetCount"), "명"),
          value("지속", n("bannermanChargeDuration"), "초"), value("효과 위력", 100),
        ])); break;
      case "Hero5_Beastmaster":
        skills.push(ability("생성 시 척후 의병 동반", [value("동반 병력", n("beastmasterFriendCount"), "명")],
          "bph-combat.ts:addBphProfile")); break;
      case "Hero6_BloodMage":
        skills.push(ability("적에게 실제 피해를 준 뒤 회복", [
          value("실제 피해 대비 회복", n("bloodMageLifestealPercent") * 100, "%"),
        ])); break;
      case "Hero9_BlackHole":
        skills.push(ability("공격 시 대상 위치로 순간이동; 출발 피해는 별도 강화 필요", [
          value("이동 횟수", 1), value("도착 범위 피해", 6 * n("spellPower")),
          value("피해 반경", 1.5 * BPH_WORLD_TO_PX, "px"),
        ], "bph-fx-profiles.ts + bph-fx-status.ts:executeSpell")); break;
      case "Hero2_Pyromancer": case "Hero9_Supernova":
        skills.push(ability(id === "Hero2_Pyromancer" ? "공격 시 화염탄 도착 지점" : "공격 시 지뢰에 적이 닿을 때", [
          value("피해", (id === "Hero2_Pyromancer" ? 4 : 10) * n("spellPower")),
          value("반경", (id === "Hero2_Pyromancer" ? .30000001192092896 : .6000000238418579) * BPH_WORLD_TO_PX, "px"),
        ], "bph-fx-profiles.ts:ATTACK_SPELLS + bph-fx-status.ts:executeSpell")); break;
      case "Hero3_WitchDoctor": case "Hero4_Stormcaller": case "Hero9_Quasar":
        skills.push(ability("공격 주문을 현재 실행기가 지원하지 않아 원본 기본 공격으로 대신함",
          [], "bph-fx-profiles.ts:ATTACK_SPELLS + bph-fx-status.ts:BPH_EXECUTABLE_SPELLS", false)); break;
    }
  } else if (enemy) {
    stats.push(value("체력", enemy.hp), value("공격력", enemy.damage), value("성벽 피해", enemy.towerDamage),
      value("공격 간격", enemy.attackSpeed > 0 ? 1 / enemy.attackSpeed : 0, "초"),
      value("사거리", enemy.range * BPH_WORLD_TO_PX, "px"),
      value("이동 속도", enemy.moveSpeed * BPH_WORLD_TO_PX, "px/초"));
  } else if (t) {
    const supported = [0, 1, 4, 6].includes(t.effectKind) && id !== "Tome_DragonsCall";
    skills.push(ability(supported ? "획득 후 지속 시간 동안 적용; 주기는 강화 전 기준"
      : "원본 데이터는 있으나 현재 실행기 미지원", [
      value("지속", Number(t.raw.buffDuration), "초"), value("주기", t.interval, "초"),
      value("최소 주기", t.intervalMin, "초"), value("최대 주기", t.intervalMax, "초"),
      value("주기당 발동", t.casts, "회"),
    ], "bph-fx-status.ts:startTome/channelInterval/tickTomes", supported));
    if (id === "Tome_Thunderstorm") skills.push(ability("무작위 살아 있는 적에게 벼락", [
      value("피해", 1.5), value("기절", .4000000059604645, "초"),
    ], "bph-fx-status.ts:executeSpell"));
    if (id === "Tome_Earthquake") skills.push(ability("성 중앙에서 충격파; 밀치기 실행식 미확인", [
      value("피해", 2), value("반경", 3 * BPH_WORLD_TO_PX, "px"), value("기절", 1.5, "초"),
    ], "bph-fx-status.ts:executeSpell"));
    if (id === "Tome_RaiseDead") skills.push(ability(`주기마다 ${bphCodexLabel(reference(t.raw.summonUnit) ?? "")} 소환`,
      [value("소환 수", t.casts, "명")], "bph-fx-status.ts:tickTomes"));
    if (id === "Tome_CursorDPS") skills.push(ability("활성 책략 하나당 손길의 기본 피해에 가산; 중복 적용은 미지원", [
      value("기본 피해", 1 + Number(t.raw.cursorDpsDamageBonusPercent)),
    ], "bph-spells.ts:bphTouchDamage + bph-fx-status.ts:startTome"));
  }
  return { id, name: bphCodexLabel(id), stats, skills, evolution, baseValues: true as const };
}
