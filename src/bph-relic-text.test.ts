import { expect, test } from "bun:test";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { bphRelicDescriptions, bphRelicEffect } from "./bph-relic-text";
import { setLanguage } from "./i18n";

test("every imported relic has one Korean sentence without internal effect labels", () => {
  setLanguage("ko");
  const relics = Object.values(BPH_UPGRADE_NODES).filter(node => node.type === 5);
  expect(relics).toHaveLength(45);
  expect(Object.keys(bphRelicDescriptions()).sort()).toEqual(relics.map(relic => relic.id).sort());
  for (const relic of relics) {
    const text = bphRelicEffect(relic.id);
    // Ignore the conjunction in troop names such as 승병과 궁수.
    expect(text.replace(/(?:승병|창병|의병|화차병)과 /g, "")).not.toMatch(/병과|배율|중첩|발동|희귀도|복제|[A-Za-z_\n]/);
    expect(text).toEndWith(".");
    expect(text.length).toBeLessThan(140);
  }
  expect(relics.filter(relic => /없습니다|미확인|미구현/.test(bphRelicEffect(relic.id)))).toEqual([]);
});

test("owner examples describe the first recruits, timed recharge and real probability bonuses", () => {
  setLanguage("ko");
  expect(bphRelicEffect("Relic1_CharmWarrior")).toBe("창병이 뽑힐 비중이 2배가 되고, 매 전투 첫 창병 2명은 같은 병력 1명씩을 더 데려옵니다.");
  expect(bphRelicEffect("Relic1_Rapier")).toBe("모집할 때마다 8초간 화살비 충전이 15% 빨라지며, 최대 45%까지 늘어납니다.");
  expect(bphRelicEffect("Relic1_FourLeafClover")).toBe("확률 효과가 1.33배 잘 터지고, 일반 대비 희귀·영웅·전설이 뽑힐 비율이 기존의 1.4·1.8·3배가 됩니다.");
});

test.each([
  ["Relic_HuntersAreOutcast", "궁수와 의병"],
  ["Relic_ArcanistsAreHunters", "승병과 궁수"],
  ["Relic_MilitiaAreMystics", "창병과 승병"],
  ["Relic_MysticsAreArcanists", "화차병과 승병"],
  ["Relic_OutcastsAreMilitia", "의병과 창병"],
] as const)("%s describes both kinds of combat sharing", (id, troops) => {
  setLanguage("ko");
  const text = bphRelicEffect(id);
  expect(text).toContain(troops);
  expect(text).toContain("둘 중 더 높은 대장간 강화");
  expect(text).toContain("서로의 병종 전용 전투 유물 효과");
  expect(text).not.toMatch(/모집|뽑힐/);
});

test("relic copy reads effect values and includes the restored battle effects", () => {
  const node = BPH_UPGRADE_NODES.R_MysticSpawnFortify;
  expect(bphRelicEffect(node.id, { ...node, effects: node.effects.map(effect => ({ ...effect, effectPower: 1 })) }))
    .toBe("창병이 뽑힐 비중이 2배가 되고, 나오면 자신을 포함한 창병 중 무작위 최대 1명이 다음 피해를 1번 막습니다.");
  expect(bphRelicEffect("R_AutomaticBallista")).toBe("내성의 최대 체력이 2배가 되고, 피해를 받을 때마다 맞은 곳 1걸음 안의 적에게 화살비로 피해 1을 줍니다.");
  expect(bphRelicEffect("Relic1_TomeDuration")).toBe("전술이 뽑힐 비중이 1.5배가 되고, 효과가 30% 더 오래갑니다.");
  expect(bphRelicEffect("R_FirstPackPortal")).toBe("매 전투 첫 모집에서는 원래 병력과 전술 대신 지원 판옥선 1척이 나옵니다.");
  expect(bphRelicEffect("R_EpicAttacksEletrify_Demo")).toContain("10% 확률로 주변 적에게 감전 피해 2와 0.4초 정지");
  expect(bphRelicEffect("Relic1_Rare")).toContain("희귀 병력의 공격은 50% 확률로");
});

test("English relic descriptions name the remapped troop in both effects", () => {
  setLanguage("en");
  try {
    expect(bphRelicEffect("Relic1_CharmWarrior")).toBe("Spearman duplicate each of the first 2 spawns once · Spearman recruitment weight ×2");
  } finally {
    setLanguage("ko");
  }
});

test("status relics describe the final revive, freeze, shock and automatic tactic rules", () => {
  setLanguage("ko");
  expect(bphRelicEffect("R_HunterPeriodicInvisibility")).toBe("궁수가 뽑힐 비중이 2배가 되고, 매 15초마다 궁수는 5초간 적의 표적이 되지 않으며 공격 속도가 2배가 됩니다.");
  expect(bphRelicEffect("_REMOVER_HeroSpawnInvisibility")).toBe("병력이 나오면 10초간 적의 표적이 되지 않으며 공격 속도가 2배가 됩니다.");
  expect(bphRelicEffect("Relic1_CharmArcanist")).toContain("첫 승병 2명은 나올 때 전술을 1개씩 즉시 씁니다");
  expect(bphRelicEffect("Relic1_CharmMystic")).toContain("첫 승병 2명은 죽어도 체력 절반으로 1번 되살아납니다");
  expect(bphRelicEffect("Relic4_Arctic_FrozenMace")).toBe("화살비가 12번째로 적을 맞힐 때마다 맞은 적이 5초간 멈춥니다.");
  expect(bphRelicEffect("R_ShockNeedle")).toBe("화살비에 맞은 적은 10% 확률로 감전되어 피해 2와 0.4초 정지를 받고, 1걸음 안의 다른 적 1명에게도 전해집니다.");
  expect(bphRelicEffect("R_HeroSpawnTransformAllHeroes")).toContain("모든 병력의 피해가 33% 늘고");
  expect(bphRelicEffect("_REMOVERelic1_WarBanner")).toContain("서로 다른 모집·상자 종류마다 강화 포인트 획득량이 10%");
});
