import { afterEach, expect, test } from "bun:test";
import { shownAmount } from "./display-scale";
import { BPH_CODEX_SLOTS } from "./bph-codex-data";
import { bphCodexDetails } from "./bph-codex-details";
import { BPH_CODEX_CLASSES, bphClassArt, bphCodexEnemyArt, bphCodexSkillLines, bphCodexStatFacts, bphCodexValueText, bphGeneralArt, bphSlotArt } from "./bph-codex-page";
import type { BphCodexArt } from "./bph-codex-page";
import { allyAnimation } from "./ally-animation";
import { ENEMY_ANIMATIONS } from "./enemy-animation";
import type { EnemyArt } from "./enemy-animation";
import { BPH_CLASS_ART, bphProfileArt, bphShipArt } from "./bph-art";
import { BPH_CODEX_GROUPS } from "./bph-codex-groups";
import { bphCommanderSkill } from "./bph-commander-info";
import { BPH_GENERALS } from "./bph-commanders";
import { bphCodexUnread } from "./bph-view";
import { freshBphSave } from "./bph-save";
import { setLanguage, t } from "./i18n";
import { AWAKENINGS, COOLDOWNS, GENERAL_SKILLS, SKILL_NAMES, generalUnit } from "./roster";
import { UNIQUE_SKILL_DESCRIPTIONS } from "./skills-unique";
import { skillGrowthDescription } from "./skill-growth-view";
import { BALANCE } from "./rules";

const RELEASE_GATE = /미확인|unconfirmed|(?:effect|reward|target) unknown|unknown (?:effect|reward|target)|TODO|TBD|placeholder/iu;
const ENGINE_NOTES = /실행기|실행식|미지원|대기열|Charge/u;
afterEach(() => setLanguage("ko"));

test.each(["ko", "en"] as const)("every codex skill line is player text in %s, and inactive skills show no numbers", lang => {
  setLanguage(lang);
  const abilities = BPH_CODEX_SLOTS.flatMap(slot => bphCodexDetails(slot.id).skills);
  expect(abilities.some(ability => !ability.implemented)).toBe(true);
  for (const ability of abilities) {
    const lines = bphCodexSkillLines(ability);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toMatch(RELEASE_GATE);
      expect(line).not.toMatch(ENGINE_NOTES);
      if (lang === "en") expect(line).not.toMatch(/[가-힣]/u);
    }
    if (!ability.implemented) expect(lines).toEqual([lang === "ko" ? "지금 전투에서는 발동하지 않는 기술입니다." : "This skill does not activate in current battles."]);
  }
});

test("values drop float noise and a zero maximum distance reads as no limit", () => {
  expect(bphCodexValueText({ label: "사거리", value: 53.333334128061935, unit: "px" })).toBe("53");
  expect(bphCodexValueText({ label: "기절", value: .4000000059604645, unit: "초" })).toBe("0.4초");
  expect(bphCodexValueText({ label: "막기 확률", value: 11.999999731779099, unit: "%" })).toBe("12%");
  expect(bphCodexValueText({ label: "최대 거리", value: 0, unit: "px" })).toBe("제한 없음");
});

test.each(BPH_GENERALS.map(general => [general] as const))("%s preparation card shows the battle rule numbers but never ultimate damage", general => {
  const skill = GENERAL_SKILLS[general], facts = bphCommanderSkill(general).facts;
  const value = (label: string) => facts.find(fact => fact.label === label)?.value;
  expect(value("재사용")).toBe(`${COOLDOWNS[general]}초`);
  if (general === "송상현" || general === "김시민" || general === "사명대사") {
    expect(facts.map(fact => fact.label)).toEqual(["재사용"]);
    return;
  }
  expect([value("피해"), value("선박 피해")]).toEqual([undefined, undefined]);
  if (skill.kind === "volley" || skill.kind === "bombard" || skill.kind === "sweep") expect(value("범위")).toBe(String(skill.radius));
  if (skill.kind === "sweep") expect(value("기절")).toBe(`${skill.stun}초`);
  if (skill.kind === "charge" && general !== "이순신") expect(value("최대 거리")).toBe(String(BALANCE.chargeReach));
  if (general === "이순신") expect(value("범위")).toBe("48");
  if (skill.kind === "hold") expect([value("지속"), value("길이")]).toEqual(["5초", "144"]);
  if (skill.kind === "ambush") expect([value("지속"), value("소환 수"), value("기절")]).toEqual(["3초", "4", "1초"]);
  if (skill.kind === "heal") expect(value("회복")).toBe(`${Math.round(skill.ratio * 100)}%`);
  if (skill.kind === "shield") expect(value("지속")).toBe(`${BALANCE.shieldSeconds}초`);
});

test.each(["ko", "en"] as const)("all eight commander skill displays promise attacks without protection or healing in %s", lang => {
  setLanguage(lang);
  for (const general of BPH_GENERALS) {
    const skill = bphCommanderSkill(general);
    const displayed = [
      t(skill.name), t(skill.line), ...skill.facts.map(fact => t(fact.label)),
      ...AWAKENINGS[general].flatMap(entry => [t(entry.name), t(entry.line)]),
      ...[1, 2, 3].map(tier => skillGrowthDescription(general, tier)),
      t(UNIQUE_SKILL_DESCRIPTIONS[general] ?? ""),
    ];
    for (const text of displayed) {
      expect(text).not.toMatch(/보호|회복|치유|방어선|철벽|피해 감소|heal|shield|protect|defen|iron.?wall/iu);
      if (lang === "en") expect(text).not.toMatch(/[가-힣]/u);
    }
    expect(skill.name).toBe(SKILL_NAMES[general]);
  }
});

test.each([
  ["송상현", "뇌우", "Thunder Rain"],
  ["사명대사", "범종", "Great Temple Bell"],
  ["김시민", "현자총통 일제포격", "Hyeonja Cannon Barrage"],
] as const)("%s uses the approved skill identity in both locales", (general, ko, en) => {
  setLanguage("ko");
  expect(t(bphCommanderSkill(general).name)).toBe(ko);
  setLanguage("en");
  expect(t(bphCommanderSkill(general).name)).toBe(en);
});

test("lobby count covers unread collection entries only", () => {
  const save = freshBphSave();
  save.discovered.push("general:권율", "Hero1_Squire", "Monster1_Caveling", "Tome_Thunderstorm");
  save.seen.push("Tome_Thunderstorm");
  expect(bphCodexUnread(save)).toBe(2);
});

test("ally and enemy details share one stat order, and a merged enemy fills the same rows with ranges", () => {
  const labels = (id: string) => bphCodexStatFacts([bphCodexDetails(id).stats]).map(fact => fact.label);
  const shared = ["체력", "공격력", "공격 간격", "사거리", "이동 속도"];
  expect(labels("Hero1_Squire").slice(0, 5)).toEqual(shared);
  expect(labels("Monster1_Caveling").slice(0, 5)).toEqual(shared);
  const spears = BPH_CODEX_GROUPS.find(group => group.slot.id === "Monster1_Caveling");
  if (!spears || spears.variants.length < 2) throw new Error("missing merged spear group");
  const merged = bphCodexStatFacts(spears.variants.map(variant => bphCodexDetails(variant.id).stats));
  expect(merged.slice(0, 5).map(fact => fact.label)).toEqual(shared);
  expect(merged.find(fact => fact.label === "체력")?.value).toBe("20-8000");
});

test("every codex picture is the front idle frame the battle registers for that entry", () => {
  const front = { moving: false, attacking: false, hurt: false, down: false, direction: "front" } as const;
  const ally = (base: string) => bphShipArt(base) ? { ...ENEMY_ANIMATIONS["enemy-panokseon-front-idle"].frames[0], key: base }
    : allyAnimation(base, front).frames[0];
  const foe = (art: EnemyArt) => ENEMY_ANIMATIONS[art.full || art.ship ? `enemy-${art.base}-front-idle` : `enemy-${art.base}-idle`].frames[0];
  const drawn = (art: BphCodexArt) => art.kind === "sprite" ? { key: art.key, ...(art.frame === null ? {} : { frame: art.frame }) } : art.kind;
  for (const classId of BPH_CODEX_CLASSES) expect(drawn(bphClassArt(classId))).toEqual(ally(BPH_CLASS_ART[classId]));
  for (const general of BPH_GENERALS) expect(drawn(bphGeneralArt(general))).toEqual(ally(generalUnit(general)));
  for (const slot of BPH_CODEX_SLOTS.filter(slot => slot.kind === "hero"))
    expect(drawn(bphSlotArt(slot))).toEqual(ally(bphProfileArt(slot.id)));
  for (const slot of BPH_CODEX_SLOTS.filter(slot => slot.kind === "enemy"))
    expect(drawn(bphSlotArt(slot))).toEqual(foe(bphCodexEnemyArt(slot.id)));
});

test("card figures share one scale and draw a window inside their battle frame", () => {
  const figures = [...BPH_CODEX_CLASSES.map(bphClassArt), ...BPH_GENERALS.map(bphGeneralArt),
    ...BPH_CODEX_SLOTS.filter(slot => slot.kind === "enemy").map(bphSlotArt)];
  for (const art of figures) {
    if (art.kind !== "sprite") throw new Error("codex figure without a battle sprite");
    expect(art.scale).toBe(art.src.includes("/ships/") ? 1 : 2);
    expect([art.view.x >= art.rect.x, art.view.y >= art.rect.y, art.view.x + art.view.width <= art.rect.x + art.rect.width,
      art.view.y + art.view.height <= art.rect.y + art.rect.height]).toEqual([true, true, true, true]);
  }
});
