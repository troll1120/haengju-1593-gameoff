import { expect, test } from "bun:test";
import { award, bonusesOf, buyNode, canBuy, freshMeta, GENERAL_NODES, HIDDEN_NODES, keepMeta, loadMeta, meritFor, META_NODES, openGenerals, TREE_NODES, visibleNode } from "./meta";
import { advance, autoCard, cardPools, choose, createRun, enterEndless, GENERALS, ladderHp, recruit, useSkill } from "./rules";
import { CENTER, fortRect, HEIGHT, setFieldSize, WIDTH } from "./geometry";
import { competent } from "../tools/meta-balance";
import { ICON_PIXELS } from "./icon-pixels";
import { freshBphSave } from "./bph-save";
import { bphMilestones, ensureBphSave } from "./bph-session";
import { unlockBphGeneral } from "./bph-commanders";

test("a one minute defeat funds the first troop purchase", () => {
  const meta = freshMeta();
  expect(meritFor(400, 95, 0)).toBe(50);
  expect(meritFor(2500, 300, 2)).toBe(330);
  expect(meritFor(2500, 600, 2)).toBe(234);
  expect(award(meta, meritFor(0, 60, 0), { seconds: 60, won: false })).toBe(50);
  expect(buyNode(meta, "troops8")).toBe(true);
  expect(meta.merit).toBe(10);
  expect(buyNode(meta, "troops8")).toBe(false);
  expect(bonusesOf(meta).caps?.troops).toBe(8);
});
test("competent fresh profiles lose near one minute before permanent growth", () => {
  // Owner DMs 1794626233.833599 / 1794626251.975969 replace the old
  // fresh-profile winning curve. This uses the same live combat and input as the harness.
  setFieldSize(370, 800);
  try {
    const runs = Array.from({ length: 48 }, (_, profile) => competent({
      meta: freshMeta(), seed: profile * 10000 + 144, general: GENERALS[profile % 4],
    }).run);
    const times = runs.map(run => run.time).sort((a, b) => a - b);
    expect(runs.filter(run => run.phase === "won")).toHaveLength(0);
    expect(times[24]).toBeGreaterThanOrEqual(40);
    expect(times[24]).toBeLessThanOrEqual(80);
    expect(times.filter(time => time > 120).length).toBeLessThanOrEqual(5);
    expect(times[47]).toBeLessThanOrEqual(240);
  } finally { setFieldSize(390, 650); }
});
test("minute records pay once and three missed records enable recovery until a new record", () => {
  const meta = freshMeta();
  expect(award(meta, 50, { seconds: 180, won: false })).toBe(150);
  for (let i = 0; i < 3; i++) expect(award(meta, 50, { seconds: 150, won: false })).toBe(50);
  expect(award(meta, 50, { seconds: 170, won: false })).toBe(62);
  expect(award(meta, 50, { seconds: 240, won: false })).toBe(142);
  expect(award(meta, 50, { seconds: 200, won: false })).toBe(50);
});
test("all 128 remaining purchases obey prerequisite order and have a renderable description", () => {
  expect([TREE_NODES.length, GENERAL_NODES.length, HIDDEN_NODES.length]).toEqual([72, 40, 16]);
  expect(new Set(META_NODES.map(node => node.id)).size).toBe(128);
  expect(TREE_NODES.reduce((sum, node) => sum + node.cost, 0)).toBe(23060);
  const meta = freshMeta(); meta.merit = 100000;
  expect(buyNode(meta, "keep6")).toBe(false);
  expect(buyNode(meta, "wall2")).toBe(false);
  expect(buyNode(meta, "navy")).toBe(false);
  expect(buyNode(meta, "endless")).toBe(false);
  award(meta, 50, { seconds: 600, won: true }); meta.losses = 5;
  expect(buyNode(meta, "general-처영")).toBe(false);
  expect(buyNode(meta, "general-신립")).toBe(false);
  for (const node of META_NODES) {
    if (typeof node.art === "string") expect(node.art.length).toBeGreaterThan(0);
    else expect(Object.hasOwn(ICON_PIXELS, node.art.icon)).toBe(true);
    expect(node.name.length).toBeGreaterThan(0);
    expect(node.effect.length).toBeLessThanOrEqual(18);
  }
  for (let pass = 0; pass < 4; pass++) for (const node of META_NODES) if (canBuy(meta, node.id)) buyNode(meta, node.id);
  expect(meta.nodes).toHaveLength(128);
  expect(buyNode(meta, "keep7")).toBe(false);
  expect(bonusesOf(meta)).toMatchObject({ startGold: 150, startTroops: 2, startArrow: 1, startHwacha: 1, startFire: true,
    caps: { party: 4, troops: 48, weapon: 3, drill: 2, hero: 3, tactics: 3, evolution: true, naval: true }, navalStart: 2, navalTurtle: true, endless: true });
});
test("fresh account caps every card source while later purchases affect the next battle", () => {
  const meta = freshMeta(), run = createRun(137, "권율", bonusesOf(meta));
  run.level = 20;
  const offers = cardPools(run).flat();
  expect(offers.some(card => card.startsWith("hero-") || card.startsWith("awaken-") || ["arrow", "hwacha", "rift"].includes(card))).toBe(false);
  expect(offers).toContain("upgrade-archer");
  for (let i = 0; i < 20; i++) recruit(run, "spearman");
  expect(run.squads.flatMap(squad => squad.soldiers)).toHaveLength(4);
  meta.merit = 10000; buyNode(meta, "troops8"); buyNode(meta, "party2"); buyNode(meta, "bow"); buyNode(meta, "startBow");
  const grown = createRun(137, "권율", bonusesOf(meta)); grown.level = 5;
  expect(grown.arrow).toBe(1);
  expect(cardPools(grown).flat().some(card => card.startsWith("hero-"))).toBe(true);
  for (let i = 0; i < 20; i++) recruit(grown, "spearman");
  expect(grown.squads.flatMap(squad => squad.soldiers)).toHaveLength(8);
  expect(cardPools(grown).flat().some(card => card.startsWith("hero-"))).toBe(false);
});
test("hidden paths depend on defeat history, river survival and victory", () => {
  const meta = freshMeta(), militia = HIDDEN_NODES.find(node => node.id === "militia1"), navy = HIDDEN_NODES.find(node => node.id === "navy");
  if (!militia || !navy) throw new Error("missing path");
  expect(visibleNode(meta, militia)).toBe(false); expect(visibleNode(meta, navy)).toBe(false);
  meta.losses = 5; meta.bestSeconds = 180;
  expect(visibleNode(meta, militia)).toBe(true); expect(visibleNode(meta, navy)).toBe(true);
});
test("the royal road unlocks a fresh endless run without a final-boss rout", () => {
  const meta = freshMeta(); meta.wins = 1;
  expect(buyNode(meta, "endless")).toBe(true);
  const run = createRun(7, "권율", bonusesOf(meta));
  enterEndless(run);
  run.time = 599.95; run.nextElite = run.nextBoss = run.nextWave = 1000;
  run.base = 1e9;
  advance(run, .1);
  expect(run.endless).toBe(true);
  expect(run.phase).toBe("playing");
  expect(run.time).toBeGreaterThan(600);
  expect(run.metrics.bosses.some(boss => boss.final)).toBe(false);
});
test("old barracks costs refund once and retain previously unlocked generals", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value),
  } });
  try {
    storage.set("haengju1593-meta", JSON.stringify({ merit: 25, earned: 3000, runs: 8, unlocked: 12, tiers: { wall: 5, troops: 3, skill: 2, gold: 1 } }));
    const meta = loadMeta();
    expect(meta.merit).toBe(25 + 560 + 680 + 90 + 30);
    expect(meta.unlocked).toBe(12);
    expect(meta.nodes).toEqual([]);
    keepMeta(meta);
    expect(loadMeta()).toEqual(meta);
    for (const [earned, opened] of [[0, 4], [1, 4], [299, 4], [300, 5], [900, 6], [3000, 8]]) {
      storage.set("haengju1593-meta", JSON.stringify({ merit: 0, earned }));
      expect(openGenerals(loadMeta(), 8)).toBe(opened);
    }
    for (const invalid of ["null", "[]", "7", "{bad"]) {
      storage.set("haengju1593-meta", invalid);
      expect(loadMeta()).toEqual(freshMeta());
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original); else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
test("retired general purchases refund their original cost to the playable wallet once", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let stored = "";
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; },
  } });
  try {
    for (const alreadyConverted of [false, true]) {
      const bph = freshBphSave();
      bph.resources.mastery = 7;
      stored = JSON.stringify({
        version: alreadyConverted ? 4 : 2, merit: 13, runs: 1, bestSeconds: 60, unlocked: 10,
        nodes: ["general-처영", "general-조헌", "general-신립", "general-신립", "troops8"],
        ...(alreadyConverted ? { bph } : {}),
      });

      const meta = loadMeta(), save = ensureBphSave(meta);
      expect(save.resources.mastery).toBe((alreadyConverted ? 7 : 13) + 80 + 100);
      expect(meta.nodes).toEqual(["troops8"]);
      expect(unlockBphGeneral(save, bphMilestones(meta))).toEqual(["신립"]);
      expect(save.unlockedGenerals).toEqual(["권율", "신립"]);
      keepMeta(meta);
      const reloaded = loadMeta();
      expect(reloaded.merit).toBe(193);
      expect(reloaded.nodes).toEqual(["troops8"]);
      expect(ensureBphSave(reloaded).resources.mastery).toBe((alreadyConverted ? 7 : 13) + 180);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original); else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
test("raw damage equals the displayed class totals and records the first wall breach", () => {
  const run = createRun(7);
  // The event timestamp is the contract; a card policy's survival time is not.
  run.walls.위 = .01; run.wall = Object.values(run.walls).reduce((sum, hp) => sum + hp, 0);
  const wall = fortRect(run.fort);
  Object.assign(run.enemies[0], { ladder: true, x: CENTER.x, y: wall.top, goalX: CENTER.x, goalY: wall.top, speed: 0, clock: 0 });
  for (let i = 0; i < 2000 && run.phase !== "lost"; i++) {
    if (run.phase === "choice" && run.offers.length) choose(run, autoCard(run));
    for (const squad of run.squads) useSkill(run, squad.id);
    advance(run, .1);
  }
  const raw = run.metrics.damage.squads.reduce((sum, value) => sum + value, 0) + run.metrics.damage.weapon + run.metrics.damage.skill;
  expect(Object.values(run.metrics.classDamage).reduce((sum, value) => sum + value, 0)).toBeCloseTo(raw, 5);
  expect(run.metrics.firstBreach).not.toBeNull();
  expect(run.metrics.firstBreach).toBeCloseTo(.1, 8);
});
test.each([[0, 15], [539, 15], [540, 13], [580, 13]])("ladder troops obey the shield and late pressure at %s seconds", (time, damage) => {
  expect([150, 210, 300, 420, 510, 600].map(ladderHp)).toEqual([1, 3, 8, 20, 36, 55]);
  const run = createRun(7), template = run.enemies[0];
  run.enemies = [{ ...template, id: 90001, ladder: true, breach: "위", x: CENTER.x, y: CENTER.y, hp: 1e9, maxHp: 1e9, speed: 0, clock: 0, stun: 0 }];
  run.time = time; run.shieldUntil = time + 10; run.xp = -100; run.nextElite = run.nextBoss = run.nextWave = 1000; run.bossSpawned = true;
  const before = run.base;
  advance(run, .1);
  expect(run.base).toBe(before); expect(run.enemies[0].prey).toBeNull(); expect(run.metrics.blocked).toBe(damage);
  run.shieldUntil = 0; run.enemies[0].clock = 0;
  advance(run, .1);
  expect(run.base).toBe(before - damage);
});
