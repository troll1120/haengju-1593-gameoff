import { expect, test } from "bun:test";
import { advance, buyRecruit, createRun, GENERAL_CLASS, RECRUIT_COST, recruitCost } from "./rules";
import { keepStage, strikeFort, wallOpen, wallStage } from "./fortification";
import { CENTER, distance, fortRect, guardPoint, sideOf, SIDES, wallPosts } from "./geometry";

test("one general and one matching soldier start with no wall weapons", () => {
  const run = createRun(42);
  expect(run.squads).toHaveLength(1);
  expect(run.squads[0].soldiers.map(unit => unit.kind)).toEqual([GENERAL_CLASS[run.squads[0].general]]);
  expect(run.arrow).toBe(0); expect(run.hwacha).toBe(0);
  expect(run.squads[0].soldiers[0].perch).toBeUndefined();
});

test("barracks recruitment spends earned gold and begins at the castle centre", () => {
  const run = createRun(42);
  expect(buyRecruit(run, "archer")).toEqual([]);
  run.gold = RECRUIT_COST;
  const starting = new Set(run.squads.flatMap(squad => squad.soldiers));
  expect(buyRecruit(run, "archer").length).toBeGreaterThan(0);
  expect(run.gold).toBe(0);
  expect(recruitCost(run)).toBe(68);
  const archer = run.squads.flatMap(squad => squad.soldiers).find(unit => unit.kind === "archer" && !starting.has(unit));
  expect(archer?.x).toBe(CENTER.x); expect(archer?.y).toBe(CENTER.y);
  run.phase = "lost"; run.gold = recruitCost(run);
  expect(buyRecruit(run, "monk")).toEqual([]); expect(run.gold).toBe(68);
});

test("twenty purchases cost 2720 gold and the twentieth recruit costs 212", () => {
  const run = createRun(42); run.gold = 10000;
  for (let bought = 0; bought < 20; bought++) {
    if (bought === 19) expect(recruitCost(run)).toBe(212);
    buyRecruit(run, bought % 2 ? "monk" : "spearman");
  }
  expect(run.recruitsBought).toBe(20); expect(10000 - run.gold).toBe(2720);
});

test("each side takes its own damage and only a breached side exposes the base", () => {
  const run = createRun(42), base = run.base, sideHp = run.walls.위;
  strikeFort(run, guardPoint(0, "위", 0), sideHp);
  expect(run.walls.위).toBe(0);
  for (const side of SIDES.filter(side => side !== "위")) expect(run.walls[side]).toBe(sideHp);
  expect(run.base).toBe(base);
  advance(run, .05); expect(run.phase).toBe("playing");
  strikeFort(run, guardPoint(0, "위", 0), base);
  advance(run, .05); expect(run.base).toBe(0); expect(run.phase).toBe("lost");
});

test("loaded legacy palisades neither absorb damage nor reopen a breached wall", () => {
  const run = structuredClone(createRun(42));
  run.palisades.좌 = { hp: 220, until: 24 };
  run.palisadesBought = 1;
  run.walls.좌 = 100;
  const at = guardPoint(0, "좌", 0), base = run.base, gold = run.gold;
  strikeFort(run, at, 100);
  expect(run.walls.좌).toBe(0);
  expect(wallOpen(run, "좌")).toBe(false);
  strikeFort(run, at, 10);
  expect(run.base).toBe(base - 10);
  expect(run.gold).toBe(gold);
});

test("an enemy that reached the keep hits it several times harder than a blow through the broken wall line", () => {
  const run = createRun(42), at = guardPoint(0, "위", 0);
  strikeFort(run, at, run.walls.위);
  strikeFort(run, at, 10);
  expect(run.base).toBe(run.maxBase - 10);
  strikeFort(run, at, 10, 8);
  expect(run.base).toBe(run.maxBase - 90);
});

test("a broken side throws its garrison off the wall and nobody stands on its posts", () => {
  const run = createRun(42), inner = fortRect(run.fort, 8), posts = wallPosts(run.fort), sideOfPost = (i: number) => sideOf(inner, posts[i]);
  run.xp = -1e9; run.gold = 10000;
  for (let i = 0; i < 12; i++) buyRecruit(run, i % 3 ? "archer" : "hwacha");
  for (let step = 0; step < 80; step++) advance(run, .05);
  const garrison = () => run.squads.flatMap(squad => squad.soldiers).filter(unit => unit.kind === "archer" || unit.kind === "hwacha");
  const side = SIDES.map(s => ({ s, n: garrison().filter(u => u.perch !== undefined && sideOfPost(u.perch) === s).length })).sort((a, b) => b.n - a.n)[0].s;
  const thrown = garrison().filter(u => u.perch !== undefined && sideOfPost(u.perch) === side), health = thrown.map(u => u.hp);
  expect(thrown.length).toBeGreaterThan(0);
  strikeFort(run, guardPoint(run.fort, side, 0), run.walls[side]);
  expect(wallOpen(run, side)).toBe(false);
  for (let step = 0; step < 40; step++) advance(run, .05);
  const brokenPosts = posts.filter((_, i) => sideOfPost(i) === side);
  expect(garrison().filter(u => u.perch !== undefined && sideOfPost(u.perch) === side)).toHaveLength(0);
  expect(garrison().filter(u => brokenPosts.some(post => distance(post, u) < 4))).toHaveLength(0);
  thrown.forEach((unit, i) => expect(unit.hp).toBeLessThan(health[i]));
});

test("walls crumble in stages to a breach and the keep cracks, burns, smokes and collapses", () => {
  const run = createRun(42), quarter = run.maxWall / 4;
  expect([1, .7, .4, .1, 0].map(share => { run.walls.좌 = quarter * share; return wallStage(run, "좌"); })).toEqual([0, 1, 2, 3, 4]);
  expect([1, .7, .4, .1, 0].map(share => { run.base = run.maxBase * share; return keepStage(run); })).toEqual([0, 1, 2, 3, 4]);
});
