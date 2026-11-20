import { expect, test } from "bun:test";
import { BPH_CODEX_SLOTS, BPH_CODEX_TEXT } from "./bph-codex-data";
import { bphCodexCards, bphCodexEntries, bphCodexRecruitProgress, bphCodexTextLines } from "./bph-codex";
import { BPH_CODEX_CLASSES, bphCodexClassViews } from "./bph-codex-page";
import { bphCodexCompletion } from "./bph-codex-groups";
import { bphCodexPreviewSave } from "./bph-codex-preview";
import { unlockBphGeneral } from "./bph-commanders";
import { BPH_ENEMY_MAP, BPH_TOMES } from "./bph-data";
import { freshBphSave } from "./bph-save";
import { BPH_WITHHELD_TOMES } from "./bph-tome-availability";
import { openBphPack } from "./bph";
import { parseBphSave } from "./bph-save";
import { BPH_UNIT_UPGRADES } from "./bph-unit-upgrades";
import { UNIT_SPECIAL_TEXT } from "./unit-codex-i18n";

test("every purchasable special has a discovered codex card and copy for every tier in both languages", () => {
  const save = freshBphSave();
  for (const [id, config] of BPH_UNIT_UPGRADES) {
    save.discovered.push(id);
    const special = UNIT_SPECIAL_TEXT[id];
    expect(special?.values).toHaveLength(config.specialMax);
    for (const lang of ["ko", "en"] as const) {
      expect(special?.[lang].name).toBeTruthy();
      expect(special?.[lang].description()).toBeTruthy();
      for (const value of [0, ...special!.values]) expect(special![lang].value(value)).not.toContain("%p");
    }
  }
  expect(BPH_CODEX_CLASSES.flatMap(group => bphCodexCards(save, "allies", group))
    .filter(card => card.discovered).map(card => card.key)).toEqual(expect.arrayContaining([...BPH_UNIT_UPGRADES.keys()]));
});

test("shield counter uses plain percentages in Korean and English", () => {
  const shield = UNIT_SPECIAL_TEXT.Hero2_Knight!;
  for (const lang of ["ko", "en"] as const) {
    expect([0, ...shield.values].map(shield[lang].value)).toEqual(["0%", "7%", "14%", "21%"]);
  }
});

test("the next soldier hint follows actual draws across reloads without buying any node", () => {
  let save = freshBphSave();
  expect(bphCodexRecruitProgress(save)).toEqual({ opened: 0, target: 4 });
  for (let draw = 1; draw <= 6; draw++) {
    openBphPack(save, { packId: "Pack1_Basic", effects: [] });
    save = parseBphSave(JSON.parse(JSON.stringify(save)));
    expect(save.purchasedPlacements).toEqual([]);
    if (draw < 4) expect(bphCodexRecruitProgress(save)).toEqual({ opened: draw, target: 4 });
    else if (draw < 6) {
      expect(save.discovered).toContain("Hero1_Barbarian");
      expect(bphCodexRecruitProgress(save)).toEqual({ opened: draw, target: 6 });
    } else {
      expect(save.discovered).toContain("Hero1_Archer");
      expect(bphCodexRecruitProgress(save)).toBeNull();
    }
  }
});

test("a soldier found early is skipped and a different dimension promises no opening draw", () => {
  const save = freshBphSave();
  save.discovered.push("Hero1_Barbarian");
  expect(bphCodexRecruitProgress(save)).toEqual({ opened: 0, target: 6 });
  save.dimension = 1;
  expect(bphCodexRecruitProgress(save)).toBeNull();
});

// Only collectible books have a codex card; a withheld book outside the codex (Tome_FortuneCache) removes none.
const WITHHELD_CARDS = [...BPH_WITHHELD_TOMES].filter(id => BPH_TOMES[id]?.collectible).length;
import verified from "../review/p10/codex/verified-text.json";
import collection from "../review/p10/codex/collection.json";

test("collection retains all 67 original references in their source order", () => {
  expect(collection).toEqual(BPH_CODEX_SLOTS.map(slot => [slot.id, slot.source]));
  expect(["hero", "tome", "enemy"].map(kind =>
    BPH_CODEX_SLOTS.filter(slot => slot.kind === kind).length)).toEqual([32, 9, 26]);
});

test("unopened collection is locked and a discovered foil is unread until seen", () => {
  const save = freshBphSave();
  expect(bphCodexEntries(save).every(entry => !entry.discovered && !entry.unread && !entry.foil)).toBe(true);
  save.discovered.push("Hero1_Squire");
  save.foils.push("Hero1_Squire");
  const discovered = bphCodexEntries(save).find(entry => entry.slot.id === "Hero1_Squire");
  expect([discovered?.discovered, discovered?.foil, discovered?.unread]).toEqual([true, true, true]);
  save.seen.push("Hero1_Squire");
  expect(bphCodexEntries(save).find(entry => entry.slot.id === "Hero1_Squire")?.unread).toBe(false);
});

const everyCard = (save: ReturnType<typeof freshBphSave>) => [
  ...BPH_CODEX_CLASSES.flatMap(group => bphCodexCards(save, "allies", group)),
  ...bphCodexCards(save, "tomes", "spearman"), ...bphCodexCards(save, "enemies", "spearman")];

test("enemy cards put every regular unit before commanders and preserve order within each group", () => {
  const save = bphCodexPreviewSave(freshBphSave());
  const entries = bphCodexEntries(save).filter(entry => entry.enemy);
  const regular = entries.filter(entry => !entry.enemy?.bossId);
  const commanders = entries.filter(entry => entry.enemy?.bossId);
  expect(bphCodexCards(save, "enemies", "spearman").map(card => card.key))
    .toEqual([...regular, ...commanders].map(entry => entry.slot.id));
});

test("a fresh account shows only question marks, apart from the starting commander, until a commander is hired", () => {
  const save = freshBphSave();
  expect(bphCodexCompletion(save).found).toBe(0);
  expect(everyCard(save)).toHaveLength(54 - WITHHELD_CARDS);
  for (const card of everyCard(save)) expect([card.discovered, card.label, card.art.kind, card.rarity]).toEqual([false, "???", "unknown", null]);
  const named = () => bphCodexCards(save, "generals", "spearman").filter(card => card.discovered).map(card => card.label);
  expect(named()).toEqual(["권율"]);
  for (const card of bphCodexCards(save, "generals", "spearman").filter(card => !card.discovered))
    expect([card.label, card.art.kind]).toEqual(["???", "unknown"]);
  expect(unlockBphGeneral(save, { runs: 1, bestSeconds: 0, bossesReached: 0, bossesKilled: 0 })).toEqual(["신립"]);
  expect(named()).toEqual(["권율", "신립"]);
});

test("the preview copy reveals every group and commander while the real save stays untouched", () => {
  const save = freshBphSave();
  save.discovered.push("Hero1_Squire");
  const before = JSON.stringify(save), preview = bphCodexPreviewSave(save);
  expect(JSON.stringify(save)).toBe(before);
  expect(bphCodexCompletion(preview).found).toBe(54 - WITHHELD_CARDS);
  const cards = [...everyCard(preview), ...bphCodexCards(preview, "generals", "spearman")];
  expect(cards).toHaveLength(62 - WITHHELD_CARDS);
  expect(cards.filter(card => !card.discovered || card.art.kind === "unknown")).toEqual([]);
});

test("ally class tabs and reward rows hide a class until one of its units is found", () => {
  const save = freshBphSave();
  expect(bphCodexClassViews(save).map(view => [view.label, view.art.kind])).toEqual(BPH_CODEX_CLASSES.map(() => ["???", "unknown"]));
  save.discovered.push("Hero1_Squire");
  expect(bphCodexClassViews(save).filter(view => view.found).map(view => [view.classId, view.label, view.art.kind]))
    .toEqual([["spearman", "창병", "sprite"]]);
});

test("collection presentation never grants or changes discovery rewards", () => {
  const save = freshBphSave();
  save.discovered.push("Hero1_Squire", "Boss1_Apogre");
  const before = structuredClone(save);
  bphCodexEntries(save);
  expect(save).toEqual(before);
  expect(BPH_CODEX_SLOTS.find(slot => slot.id === "Hero1_Squire")?.discoveryBonus).toBe(10);
  expect(BPH_CODEX_SLOTS.find(slot => slot.id === "Boss1_Apogre")?.discoveryBonus).toBe(100);
});

test("same-name enemies sharing art occupy one card while named allies stay distinct", () => {
  const entries = bphCodexEntries(freshBphSave());
  for (const kind of ["hero", "tome", "enemy"] as const) {
    const labels = entries.filter(entry => entry.slot.kind === kind).map(entry => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  }
  expect(entries.filter(entry => entry.enemy?.kind === "yari" && !entry.enemy.bossId).map(entry => entry.label))
    .toEqual(["창병"]);
  expect(entries).toHaveLength(54 - WITHHELD_CARDS);
  expect(entries.filter(entry => entry.slot.kind === "hero")).toHaveLength(32);
  expect(entries.filter(entry => entry.slot.kind === "tome")).toHaveLength(9 - WITHHELD_CARDS);
});

test("a later spear variant discovers the shared entry without changing save data", () => {
  const save = freshBphSave();
  save.discovered.push("Monster1_Raider");
  const before = structuredClone(save);
  const entry = bphCodexEntries(save).find(entry => entry.slot.id === "Monster1_Caveling");
  expect(entry?.discovered).toBe(true);
  expect(entry?.unread).toBe(true);
  expect(save).toEqual(before);
});

test("all eight boss biographies follow the shared battle identity map", () => {
  const bosses = bphCodexEntries(freshBphSave()).filter(entry => entry.enemy?.bossId);
  expect(bosses.length).toBe(8);
  for (const entry of bosses) {
    expect(entry.text && "gameId" in entry.text ? entry.text.gameId : null)
      .toBe(BPH_ENEMY_MAP[entry.slot.id].bossId);
  }
});

test("shipped historical text equals the supplied verified artifact exactly", () => {
  for (const [id, text] of Object.entries(BPH_CODEX_TEXT)) {
    expect(text).toEqual(Reflect.get(verified, id));
  }
  const released = Object.entries(verified).filter(([, text]) => "release" in text && text.release);
  expect(Object.keys(BPH_CODEX_TEXT).filter(id => id.startsWith("japan_")).sort())
    .toEqual(released.map(([id]) => id).sort());
});

test.each([
  ["militia", "unit_militia", 5],
  ["chongtong", "unit_chongtong", 2],
] as const)("%s slots display the exact verified %s text", (classId, textId, count) => {
  const entries = bphCodexEntries(freshBphSave()).filter(entry => entry.profile?.classId === classId);
  expect(entries.length).toBe(count);
  for (const entry of entries) expect(entry.textId).toBe(textId);
  expect(bphCodexTextLines(textId)).toEqual([verified[textId].text]);
});

test("popup preserves verified general fields and class text without rewriting", () => {
  expect(bphCodexTextLines("gwon_yul")).toEqual([
    `조선 · ${verified.gwon_yul.years} · ${verified.gwon_yul.title}`,
    `주요 전투: ${verified.gwon_yul.battles}`,
    `최후: ${verified.gwon_yul.end}`,
  ]);
  expect(bphCodexTextLines("unit_spearman")).toEqual([verified.unit_spearman.text]);
  expect(bphCodexTextLines("japan_ukita")).toEqual([
    `일본 · ${verified.japan_ukita.years} · ${verified.japan_ukita.title}`,
    `주요 전투: ${verified.japan_ukita.battles}`,
    `최후: ${verified.japan_ukita.end}`,
  ]);
});
