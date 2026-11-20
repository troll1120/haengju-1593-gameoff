import { expect, test } from "bun:test";
import { BPH_UPGRADE_NODES } from "./bph-upgrades";
import { upgradeDescription, upgradeFace, upgradeName, upgradeRank, upgradeRankPips, upgradeRankText } from "./bph-upgrade-presentation";
import { BPH_HIDDEN_UPGRADES, BPH_V1_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { BPH_ENEMY_MAP, BPH_PROFILES } from "./bph-data";
import { BPH_CLASS_ART, bphArtFile } from "./bph-art";
import type { BphUpgradeNode } from "./bph-upgrade-data";
import { BPH_PLACEMENTS, adjacentBphPlacements, visibleBphPlacements } from "./bph-upgrades";
import { freshBphSave } from "./bph-save";
import { implementedEffectDescription } from "./bph-upgrade-effects";
import { setLanguage } from "./i18n";

test.each([
  ["SN_Barbarian_AreaAttack", "칼잡이 의병 공격 범위 +50%"],
  ["SN_RangerRange", "궁수 공격 사거리 +35%"],
  ["SN_Building_Basic_FasterActivation", "천막 막사 건물 가동 대기 감소 +2초"],
  ["SN_BonusPackOnOpen", "숙련 모집 시 15% 확률로 기본 모집 추가"],
  ["SN_IllusionistPackClones", "분신 승병 모집 시 복제 1명 추가"],
])("describes the authored effect and unit for %s", (id, description) => {
  expect(upgradeDescription(BPH_UPGRADE_NODES[id])).toBe(description);
});

test("an unimplemented low-HP curve is never presented as an implemented numeric effect", () => {
  const node = BPH_UPGRADE_NODES.SN_Barbarian_AtkSpdLowHP;
  expect(node.effects.map(implementedEffectDescription)).toEqual([null]);
});

test.each(["ko", "en"] as const)("implemented descriptions use %s text without internal placeholders", lang => {
  setLanguage(lang);
  try {
    for (const node of Object.values(BPH_UPGRADE_NODES)) for (const effect of node.effects) {
      const description = implementedEffectDescription(effect);
      if (description === null) continue;
      expect(description).not.toMatch(/미확인|unconfirmed|effect unknown|unknown (?:effect|reward|target)|TODO|TBD|placeholder/i);
      expect(description).not.toMatch(lang === "en" ? /[가-힣]/ : /[A-Za-z_]/);
    }
  } finally {
    setLanguage("ko");
  }
});

test("a changed effect value reaches the player-facing description", () => {
  const node = BPH_UPGRADE_NODES.SN_RangerRange;
  const changed = { ...node, effects: node.effects.map(e => ({ ...e, value: 0.2 })) };
  expect(upgradeDescription(changed)).toBe("궁수 공격 사거리 +20%");
});

test("upgrade names do not repeat the subject words", () => {
  for (const node of Object.values(BPH_UPGRADE_NODES)) {
    const words = upgradeName(node).split(" ");
    expect(new Set(words).size).toBe(words.length);
  }
  expect(upgradeName(BPH_UPGRADE_NODES.SN_SquireUpgrade)).toBe("창병 진급");
});

test("kill promotion descriptions expose the profile's staged conditions", () => {
  expect(upgradeDescription(BPH_UPGRADE_NODES.SN_SquireUpgrade))
    .toBe("창병 처치 진급 +1단계 (단계별 10/20/50마리 처치)");
});

test("all upgrade labels expose Korean text rather than internal identifiers", () => {
  const untranslated = Object.values(BPH_UPGRADE_NODES).filter(node =>
    /[A-Za-z_]|팩/i.test(upgradeName(node) + upgradeDescription(node)));
  expect(untranslated.map(node => node.id)).toEqual([]);
});

test("a secondary start remains hidden until a connected neighbor is purchased", () => {
  const save = freshBphSave();
  const reroll = BPH_PLACEMENTS.get("_SkillTreeMain_Demo:23:8");
  if (!reroll) throw new Error("Missing original reroll placement");
  expect(visibleBphPlacements(save, reroll.gridId).map(p => p.id)).not.toContain(reroll.id);
  const neighbor = adjacentBphPlacements(reroll)[0];
  if (!neighbor) throw new Error("Missing original reroll neighbor");
  save.purchasedPlacements.push(neighbor.id);
  expect(visibleBphPlacements(save, reroll.gridId).map(p => p.id)).toContain(reroll.id);
});

// Unit 2 release blockers: assertions distinguish real numerical effects from data-only effects.
const unit2Cases = [
  ["FOIL_Illusionist", "금박 분신 승병 체력 +100%", "환영 복제 수 증가", "Foil Decoy Monk HP +100%", "extra illusion copies"],
  ["FOIL_Portal", "금박 지원 판옥선 체력 +100%", "시전 속도 증가", "Foil Reinforcement Panokseon HP +100%", "faster casting"],
  ["Relic1_CharmWarrior", "전사 병과 첫 2명 등장 시 각각 복제 1명", "전사 병과 모집 확률 증가", "Spearman duplicate each of the first 2 spawns once · Spearman recruitment weight ×2", "higher Warrior recruitment chance"],
  ["Relic1_TomeDuration", "전술 유지 시간 +30%", "전술 등장 보정", "active duration +30%", "tome draw bonus"],
  ["R_ArcanistTomePower", "비술사 병과 공격력에 숙련 증폭의 50% 추가", "비술사 병과 모집 확률 증가", "Warrior Monk damage gains 50% of the mastery surge bonus · Warrior Monk recruitment weight ×2", "higher Arcanist recruitment chance"],
  ["R_CharmHunter", "방랑자 병과 처치 시 25% 확률로 10초간 공격 피해 +100%", "방랑자 병과 모집 확률 증가", "Militia 25% chance on kill for +100% attack damage for 10s · Militia recruitment weight ×2", "higher Outcast recruitment chance"],
  ["R_HunterPeriodicInvisibility", "명사수 병과 15초마다 5초간 적 표적 회피 및 공격 속도 +100%", "명사수 병과 모집 확률 증가 · 적 표적 선택 회피", "Archer recruitment weight ×2 · Archer avoid enemy targeting and gain +100% attack speed for 5s every 15s", "higher Sharpshooter recruitment chance; enemy targeting avoidance"],
  ["R_MysticSpawnFortify", "신비 병과 등장 시 자신을 포함한 신비 병과 중 무작위 최대 2명이 다음 피해 1회 방어", "신비 병과 모집 확률 증가", "When a Spearman troop spawns, up to 2 random Spearman allies (including itself) block their next hit · Spearman recruitment weight ×2", "higher Mystic recruitment chance"],
  ["R_WarriorAliveGiant", "전사 병과 15초 생존 시 거대 상태가 되고 체력 전부 회복", "전사 병과 모집 확률 증가", "Spearman recruitment weight ×2 · Spearman become giant and fully heal after 15s alive", "higher Warrior recruitment chance"],
  ["R_HunterArrowBounce - Demo", "명사수 병과 공격 시 25% 확률로 도탄 1회 추가", "명사수 병과 모집 확률 증가", "Archer 25% chance for 1 extra bounce per attack · Archer recruitment weight ×2", "higher Sharpshooter recruitment chance"],
  ["R_WarriorsSpawnFortify - Demo", "신비 병과 등장 시 자신을 포함한 신비 병과 전원이 다음 피해 1회 방어", "신비 병과 모집 확률 증가", "When a Warrior Monk troop spawns, all Warrior Monk allies (including itself) block their next hit · Warrior Monk recruitment weight ×2", "higher Mystic recruitment chance"],
  ["SN_BloodMage_ConsumeChance", "회복 총통병 처치 시 시체 흡수 확률 +25퍼센트포인트", "시체 흡수 후 공격력 증가", "Recovering Gunner Corpse Absorption Chance on Kill +25 percentage points", "damage growth after corpse absorption"],
  ...["SN_ShopRerollUnlock", "SN_ShopRoguelikeSlotBonus", "SN_ShopRoguelikeSlotBonus2", "SN_ShopRoguelikeSlotBonus3", "SN_ShopRoguelikeSlotBonus4"].map(id => [
    id, id === "SN_ShopRerollUnlock" ? "상점 갱신 해금 (기본 비용 1코인, 갱신마다 +1)" : "상점 상품 칸 +1",
    "특별 상품 등장 보정", id === "SN_ShopRerollUnlock" ? "Unlock shop rerolls (base 1 coin, +1 per reroll)" : "Shop Slots +1",
    "special-offer draw bonus",
  ] as const),
] as const;

const repairedRelicCopy: Readonly<Record<string, string>> = {
  Relic1_CharmWarrior: "창병이 뽑힐 비중이 2배가 되고, 매 전투 첫 창병 2명은 같은 병력 1명씩을 더 데려옵니다.",
  Relic1_TomeDuration: "전술이 뽑힐 비중이 1.5배가 되고, 효과가 30% 더 오래갑니다.",
  R_ArcanistTomePower: "승병이 뽑힐 비중이 2배가 되고, 강화 포인트 획득량 보너스의 50%만큼 승병 공격력이 늘어납니다.",
  R_CharmHunter: "의병이 뽑힐 비중이 2배가 되고, 적을 처치하면 25% 확률로 10초간 피해가 2배가 됩니다.",
  R_HunterPeriodicInvisibility: "궁수가 뽑힐 비중이 2배가 되고, 매 15초마다 궁수는 5초간 적의 표적이 되지 않으며 공격 속도가 2배가 됩니다.",
  R_MysticSpawnFortify: "창병이 뽑힐 비중이 2배가 되고, 나오면 자신을 포함한 창병 중 무작위 최대 2명이 다음 피해를 1번 막습니다.",
  R_WarriorAliveGiant: "창병이 뽑힐 비중이 2배가 되고, 15초 동안 살아남으면 거대해지고 체력을 모두 회복합니다.",
  "R_HunterArrowBounce - Demo": "궁수가 뽑힐 비중이 2배가 되고, 공격할 때 25% 확률로 화살이 다른 적에게 1번 더 튕깁니다.",
  "R_WarriorsSpawnFortify - Demo": "승병이 뽑힐 비중이 2배가 되고, 나오면 자신을 포함한 모든 승병이 다음 피해를 1번 막습니다.",
};

for (const lang of ["ko", "en"] as const) test.each(unit2Cases)(`unit 2 ${lang} describes only consumed numbers for %s`, (id, ko, inactiveKo, en, inactiveEn) => {
  setLanguage(lang);
  try {
    const expected = repairedRelicCopy[id]
      ? lang === "ko" ? repairedRelicCopy[id] : en
      : lang === "ko" ? `적용: ${ko}. 미적용: ${inactiveKo}.` : `Applied: ${en}. Not applied: ${inactiveEn}.`;
    expect(upgradeDescription(BPH_UPGRADE_NODES[id])).toBe(expected);
  } finally {
    setLanguage("ko");
  }
});

test("unit 2 blood absorption text follows the active chance without claiming inactive damage growth", () => {
  const node = BPH_UPGRADE_NODES.SN_BloodMage_ConsumeChance;
  const changed = { ...node, effects: node.effects.map(e => ({
    ...e, value: e.type === "BloodMageConsumeOnKillChance" ? 0.1 : 9,
  })) };
  expect(upgradeDescription(changed)).toBe("적용: 회복 총통병 처치 시 시체 흡수 확률 +10퍼센트포인트. 미적용: 시체 흡수 후 공격력 증가.");
});

test("unit 2 random fortification text follows the consumer's maximum target count", () => {
  const node = BPH_UPGRADE_NODES.R_MysticSpawnFortify;
  const changed = { ...node, effects: node.effects.map(e => ({ ...e, effectPower: 1 })) };
  expect(upgradeDescription(changed)).toBe("창병이 뽑힐 비중이 2배가 되고, 나오면 자신을 포함한 창병 중 무작위 최대 1명이 다음 피해를 1번 막습니다.");
});

// Owner 1794841974.121319: a tile must show whose upgrade it is, and how often it can still be bought.
const authoredTileNodes = [...new Set([...BPH_PLACEMENTS.values()].flatMap(p => p.nodeId ? [p.nodeId] : []))]
  .map(id => BPH_UPGRADE_NODES[id]).filter(node => ![1, 2, 3].includes(node.type) && !BPH_V1_HIDDEN_UPGRADES.has(node.id));
const tileNodes = authoredTileNodes.filter(node => !BPH_HIDDEN_UPGRADES.has(node.id));
function tile(id: string) {
  const p = BPH_PLACEMENTS.get(id);
  if (!p) throw new RangeError(id);
  return p;
}

/** What a tile is about, as far as the art tells it apart: troops drawn from one sprite are one target. */
function targetOf(node: BphUpgradeNode): string {
  if (node.type === 4) {
    if (node.refs.questHero) return `troop:${BPH_PROFILES[node.refs.questHero].classId}`;
    if (node.refs.questPack) return "pack";
    if (node.refs.questSpell) return "spell";
    const enemy = BPH_ENEMY_MAP[node.refs.questMonster ?? ""];
    return enemy ? `enemy:${enemy.kind}` : "shared";
  }
  if (node.type === 6) return "camp";
  // Owner 1794902274.483289 (tap strike): the former Frenzy and cursor Rain of Arrows nodes upgrade the volley itself.
  if (["TomeCursorDpsAreaBonus", "TomeCursorDpsAttackSpeedBonus", "TomeCursorDpsCritChance", "CursorCritKillCastSpellAtMonster"]
    .includes(node.effects[0]?.type ?? "")) return "shared";
  const targets = node.effects[0]?.targets ?? {};
  if (targets.targetHero) return `troop:${BPH_PROFILES[targets.targetHero].classId}`;
  if (targets.targetBuilding) return "building";
  if (targets.targetTome) return "tactic";
  if (targets.targetPack) return "pack";
  if (targets.targetRelic) return "relic";
  return targets.targetSpell && !node.effects[0]?.type.startsWith("Bonfire") ? "spell" : "shared";
}

// Lead spec change after owner 1794844538.696679 (clean icons, no name initials on tiles): two tiles may look
// alike only when they share both the target and the stat. Troops drawn from one sprite count as one target,
// so the spearman types share a look for the same stat and the sheet's name tells them apart. This replaces
// "every different upgrade looks different". It is the specification, not a loosened assertion.
test("tiles with a different target or a different stat never look the same", () => {
  const meanings = new Map<string, Set<string>>();
  for (const node of tileNodes) {
    const face = upgradeFace(node), look = `${face.picture}|${face.badge}`;
    meanings.set(look, (meanings.get(look) ?? new Set<string>()).add(`${targetOf(node)}|${face.badge || face.picture}`));
  }
  expect([...meanings].filter(([, seen]) => seen.size > 1).map(([look, seen]) => [look, ...seen])).toEqual([]);
});

// The stat each icon stands for (lead: sword = attack, shield = defence and so on). No boot is drawn, so the hourglass is speed.
// Keep testing the authored faces of moved upgrades while pinning which stats still appear on the tree.
const statIcons: readonly (readonly [string, readonly string[], readonly string[]])[] = [
  ["sword", ["CursorDpsDamage"], ["HeroAttackPower", "TargetPackHeroDamage"]],
  ["shield", ["BonfireMaxHP", "HeroBlockChance"], ["HeroDuration", "TargetPackHeroHp"]],
  ["hourglass", ["CursorDpsIntervalReduction"], ["HeroAttackSpeed", "ArcherFireRate", "FireMageAttackSpeed"]],
  ["crossbow", [], ["ArcherRange"]],
  ["range-friendly", ["CursorDpsRadius"], ["HeroAreaAttack"]],
  ["pierce", ["HeroCritChance"], ["HeroCritDamage"]],
  ["heart", [], ["HeroKillHealPercent"]],
];
test.each(statIcons)("the %s icon marks its authored stats and only the remaining stats appear on the tree", (file, visible, moved) => {
  const types = [...visible, ...moved];
  const authored = authoredTileNodes.filter(node => types.includes(node.effects[0]?.type ?? ""));
  expect(new Set(authored.map(node => node.effects[0].type))).toEqual(new Set(types));
  expect(new Set(authored.filter(node => !BPH_HIDDEN_UPGRADES.has(node.id)).map(node => node.effects[0].type)))
    .toEqual(new Set(visible));
  for (const node of authored) {
    const face = upgradeFace(node);
    expect([node.id, face.badge || face.picture]).toEqual([node.id, `./art/icons/${file}.webp`]);
  }
});

test("the first two right-branch tiles show their own troop and their own stat", () => {
  expect(upgradeFace(BPH_UPGRADE_NODES["SN_SquireDamage 2"])).toMatchObject({
    picture: "./art/units/spearman.png", sheet: "unit", badge: "./art/icons/sword.webp" });
  expect(upgradeFace(BPH_UPGRADE_NODES.SN_Barbarian_AreaAttack)).toMatchObject({
    picture: "./art/units/uibyeong.png", sheet: "unit", badge: "./art/icons/range-friendly.webp" });
});

// Owner 1794844538.696679: a stat icon alone is only for upgrades shared by every troop or the camp.
function targetKind(node: BphUpgradeNode): "troop" | "thing" | "shared" {
  const target = targetOf(node);
  return /^(troop|enemy):/.test(target) ? "troop" : target === "shared" ? "shared" : "thing";
}

test("troop and shared faces keep their authored rules and the remaining tree mix is exact", () => {
  const visible = { troop: 0, thing: 0, shared: 0 };
  const moved = { troop: 0, thing: 0, shared: 0 };
  for (const node of authoredTileNodes) {
    const kind = targetKind(node), face = upgradeFace(node);
    (BPH_HIDDEN_UPGRADES.has(node.id) ? moved : visible)[kind]++;
    expect([node.id, face.sheet !== null, face.badge === ""]).toEqual([node.id, kind === "troop", kind === "shared"]);
    if (kind === "shared") expect(face.picture).toStartWith("./art/icons/");
    if (kind !== "troop" || node.type !== 0) continue;
    const hero = node.effects[0].targets.targetHero, classId = BPH_PROFILES[hero].classId;
    const own = ["Hero1_Squire", "Hero1_Archer", "Hero1_Barbarian"].includes(hero) || classId === "joseon_cavalry" ? `units/${bphArtFile(BPH_CLASS_ART[classId])}`
      : `${classId === "panokseon" ? "ships" : "units"}/bph/${hero}`;
    expect(face.picture).toBe(`./art/${own}.png`);
  }
  expect(visible).toEqual({ troop: 46, thing: 84, shared: 95 });
  expect(moved).toEqual({ troop: 93, thing: 12, shared: 34 });
  // No shared tile is limited to a troop class or rarity today. One that is needs that class's picture first.
  expect(tileNodes.filter(node => targetKind(node) === "shared" && node.effects.some(effect =>
    Number(effect.targets.targetClass) > 0 || effect.targets.useTargetRarity === "1")).map(node => node.id)).toEqual([]);
});

test("every tile picture and badge is a shipped art file", async () => {
  const files = new Set(tileNodes.flatMap(node => [upgradeFace(node).picture, upgradeFace(node).badge]).filter(Boolean));
  const missing: string[] = [];
  for (const file of files) if (!await Bun.file(new URL(`../public/${file.slice(2)}`, import.meta.url)).exists()) missing.push(file);
  expect(missing).toEqual([]);
});

test("rank pips count the bought tiles of one definition in one tree and end in MAX", () => {
  const save = freshBphSave();
  const pair = [tile("_SkillTreeMain_Demo:27:16"), tile("_SkillTreeMain_Demo:28:16")];
  const pips = () => pair.map(p => upgradeRankPips(upgradeRank(save, p)));
  expect(pair.map(p => p.nodeId)).toEqual(["SN_Barbarian_AreaAttack", "SN_Barbarian_AreaAttack"]);
  expect(pips()).toEqual(["○○", "○○"]);
  save.purchasedPlacements.push(pair[0].id);
  expect(pips()).toEqual(["●○", "●○"]);
  expect(upgradeRank(save, tile("_SkillTreeMain_Demo:27:14"))).toEqual({ bought: 0, max: 2 });
  save.purchasedPlacements.push(pair[1].id);
  expect(pips()).toEqual(["MAX", "MAX"]);
  const block = tile("_SkillTreeMain_Demo:19:25");
  expect([block.nodeId, upgradeRank(save, block)]).toEqual(["SN_PaladinBlock", { bought: 0, max: 3 }]);
  save.purchasedPlacements.push("_SkillTreeMain_Demo:18:25", "_SkillTreeMain_Demo:18:24");
  expect(upgradeRankPips(upgradeRank(save, block))).toBe("●●○");
});

test("a one-time upgrade has no pips, a long ladder is counted and another tree is not", () => {
  const save = freshBphSave();
  expect(upgradeRankPips(upgradeRank(save, tile("_SkillTreeMain_Demo:23:15")))).toBe("");
  const long = [...BPH_PLACEMENTS.values()].find(p => upgradeRank(save, p).max > 3 && tileNodes.some(node => node.id === p.nodeId && node.type === 0));
  if (!long) throw new RangeError("no long ladder");
  const task = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === "Q_CompleteQuests");
  if (!task) throw new RangeError("Q_CompleteQuests");
  expect(upgradeRank(save, task)).toEqual({ bought: 0, max: BPH_UPGRADE_NODES.Q_CompleteQuests.thresholds.length });
  expect(BPH_UPGRADE_NODES.Q_CompleteQuests.thresholds.length).toBeGreaterThan(3);
  save.purchasedPlacements.push(long.id);
  expect(upgradeRankPips(upgradeRank(save, long))).toBe(`1/${upgradeRank(save, long).max}`);
  const foil = [...BPH_PLACEMENTS.values()].filter(p => p.nodeId === "PN_StartingFoilium");
  expect(new Set(foil.map(p => p.gridId)).size).toBe(2);
  save.purchasedPlacements.push(foil[0].id);
  const other = foil.find(p => p.gridId !== foil[0].gridId);
  if (!other) throw new RangeError("PN_StartingFoilium");
  expect(upgradeRank(save, other).bought).toBe(0);
});

test.each(["ko", "en"] as const)("the %s limit line carries the maximum and the remaining purchases", lang => {
  setLanguage(lang);
  try {
    const line = upgradeRankText({ bought: 1, max: 3 });
    expect(line).toMatch(/3\D+2/);
    expect(line).not.toMatch(lang === "en" ? /[가-힣]/ : /[A-Za-z_]/);
  } finally {
    setLanguage("ko");
  }
});
