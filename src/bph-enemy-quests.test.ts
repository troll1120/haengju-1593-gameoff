import { afterEach, expect, test } from "bun:test";
import { BPH_SURVIVAL_CHAPTERS, BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { bphSurvivalPlan, bphSurvivalProfiles } from "./bph-survival";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { BPH_UPGRADE_NODES, BPH_PLACEMENTS, recordBphProgress, canBuyBphNode, bphNodeBlockers, visibleBphPlacements } from "./bph-upgrades";
import { bphCodexEntries } from "./bph-codex";
import { effectTarget } from "./bph-upgrade-effect-text";
import { upgradeDescription, upgradeName } from "./bph-upgrade-presentation";
import { freshBphSave } from "./bph-save";
import { setLanguage, t } from "./i18n";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { bphFxContext } from "./bph-fx-dispatch";
import { createRun } from "./rules";

afterEach(() => setLanguage("ko"));

test.each(["ko", "en"] as const)("boss quest names match distinct codex identities in %s", lang => {
  setLanguage(lang);
  const entries = bphCodexEntries(freshBphSave());
  const names = BPH_SURVIVAL_TABLE.commanders.map(id => effectTarget(id));
  expect(new Set(names).size).toBe(BPH_SURVIVAL_TABLE.commanders.length);
  for (const node of Object.values(BPH_UPGRADE_NODES).filter(node =>
    node.type === 4 && node.refs.questMonster?.startsWith("Boss"))) {
    const target = effectTarget(node.refs.questMonster);
    const entry = entries.find(entry => entry.slot.id === node.refs.questMonster ||
      entry.slot.id === node.refs.questMonster.replace(/2$/, ""));
    if (!entry) throw new RangeError(`Missing codex target: ${node.refs.questMonster}`);
    expect(target).toBe(entry.label);
    expect(upgradeName(node)).toContain(target);
    expect(upgradeDescription(node)).toContain(target);
    if (lang === "en") expect(target).not.toMatch(/[가-힣]/);
  }
});

test("every offered enemy quest targets a profile fielded by a survival chapter", () => {
  const fielded = new Set(BPH_SURVIVAL_CHAPTERS.flatMap(wave => [...bphSurvivalProfiles(wave)]));
  const unreachable = Object.values(BPH_UPGRADE_NODES).filter(node =>
    node.type === 4 && !BPH_HIDDEN_UPGRADES.has(node.id) &&
    node.refs.questMonster && !fielded.has(node.refs.questMonster));
  expect(unreachable.map(node => [node.id, node.refs.questMonster])).toEqual([]);
});

test.each(["Q_DefeatZombie", "Q_DefeatZombieRunner", "Q_DefeatDragonsCall"])(
  "%s is not offered because its egg or spell is absent from survival", id => {
    const save = freshBphSave();
    save.dimension = 3;
    save.purchasedPlacements = [...BPH_PLACEMENTS.keys()];
    const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === id);
    if (!placement) throw new RangeError(id);
    expect(visibleBphPlacements(save, placement.gridId).map(p => p.id)).not.toContain(placement.id);
    expect(bphNodeBlockers(save, placement.id)).toEqual([t("제거된 강화")]);
  },
);

test.each(["WaveChapter1", "WaveChapter2"] as const)("%s fields existing cavalry and gunners alongside infantry", wave => {
  const regular = bphSurvivalPlan(wave).filter(entry => !entry.boss && !entry.elite && !entry.rush);
  expect([...new Set(regular.map(entry => entry.kind))].sort()).toEqual(wave === "WaveChapter1"
    ? ["cavalry", "guard", "samurai", "teppo", "yari"]
    : ["cavalry", "samurai", "teppo", "yari"]);
  expect(regular).toHaveLength(10_952);
});

test.each(["Q_DefeatSpikedMammoth", "Q_DefeatTroll", "Q_DefeatZombie2"])(
  "%s counts its reachable target once through real combat damage", id => {
    const node = BPH_UPGRADE_NODES[id], save = freshBphSave();
    const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === id);
    if (!placement) throw new RangeError(id);
    save.dimension = 2;
    save.purchasedPlacements = [...BPH_PLACEMENTS.values()].filter(p => p.nodeId !== id).map(p => p.id);
    recordBphProgress(save, { kind: "chapter-entered", chapter: 0, dimension: 2 });
    const meta = freshMeta(); meta.bph = save;
    const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: [] });
    const context = bphFxContext(run);
    if (!context) throw new RangeError("No context");
    const target = node.refs.questMonster;
    expect(BPH_SURVIVAL_CHAPTERS.some(wave => bphSurvivalProfiles(wave).has(target))).toBe(true);
    const template = createRun(4).enemies[0];
    for (let index = 0; index < node.thresholds[0]; index++) {
      const enemy = { ...template, id: run.nextId++, bphProfileId: target,
        hp: 1, maxHp: 1, shielded: false };
      run.enemies.push(enemy);
      context.applyDamage({ target: enemy, amount: 2 });
      context.applyDamage({ target: enemy, amount: 2 });
    }
    expect(save.questProgress[placement.id]).toBe(node.thresholds[0]);
    expect(canBuyBphNode(save, placement.id)).toBe(true);
  },
);
