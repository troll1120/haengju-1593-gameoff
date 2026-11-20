import { expect, test } from "bun:test";
import { advance, choose, createRun, drawCards, generalHp, recruit, soldier, strength, useSkill } from "./rules";
import type { CardId, Enemy, Run, SoldierKind } from "./rules";
import { classCard, rarityAt } from "./cards";
import { synergy } from "./synergy";
import { CENTER, guardPoint } from "./geometry";
import { ordinaryCard } from "./bots";

function take(run: Run, card: CardId): void {
  run.phase = "choice"; run.offers = [card]; choose(run, card);
}
/** One ready soldier and stationary durable targets; no hero or wall weapon attacks. */
function arena(kind: SoldierKind) {
  const run = createRun(42), squad = run.squads[0], at = guardPoint(0, "아래", 50);
  squad.state = "down"; squad.hp = 0; squad.downUntil = 1e9;
  squad.soldiers = [soldier(kind, 1, at)];
  run.commandClock = 1e9; run.spawnBudget = -1e9; run.xp = -1e9;
  run.arrowClock = run.hwachaClock = 1e9;
  run.enemies = Array.from({ length: 8 }, (_, i): Enemy => ({
    id: 100 + i, kind: "yari", direction: "아래", x: at.x + (i % 4) * 8, y: at.y + 18 + Math.floor(i / 4) * 10,
    hp: 1e6, maxHp: 1e6, speed: 0, elite: false, boss: false, goalX: CENTER.x, goalY: CENTER.y,
    clock: 1e9, strikeAt: 0, prey: null, stun: 0, burn: 0, burnClock: 0, skillClock: 1e9, casting: 0, casts: 0,
  }));
  return { run, unit: squad.soldiers[0] };
}
function attack(run: Run): void {
  const unit = run.squads[0].soldiers[0];
  unit.strikeAt = .0001; unit.aim = run.enemies[0].id;
  advance(run, .001);
}

test("class stars ignore headcount and preserve every recruited body", () => {
  const run = createRun(1);
  const tiers: number[] = [synergy(run, "archer").tier];
  for (let i = 0; i < 5; i++) {
    recruit(run, "archer", 0);
    tiers.push(synergy(run, "archer").tier);
  }
  expect(tiers).toEqual([0, 0, 0, 0, 0, 0]);
  expect(synergy(run, "archer").count).toBe(6);
  expect(run.squads[0].soldiers).toHaveLength(6);
  recruit(run, "monk", 0);
  expect(synergy(run, "archer").tier).toBe(0);
  expect(synergy(run, "monk").tier).toBe(0);
});

test("a rare recruit grants three soldiers instead of the common pair", () => {
  const common = createRun(1), rare = createRun(1);
  take(common, "recruit-archer"); take(rare, "rare-archer");
  expect(strength(common.squads[0])).toBe(3);
  expect(strength(rare.squads[0])).toBe(4);
});

test.each(["archer", "hwacha", "spearman", "monk"] as const)("%s epic changes its real attack", kind => {
  const plain = arena(kind), epic = arena(kind);
  take(epic.run, `epic-${kind}`);
  attack(plain.run); attack(epic.run);
  if (kind === "archer") {
    expect(plain.run.shots[0]?.pierce).toBe(0);
    expect(epic.run.shots[0]?.pierce).toBe(1);
  } else if (kind === "hwacha") {
    expect(epic.run.shots[0]?.splash).toBeCloseTo(plain.run.shots[0].splash * 1.35);
  } else {
    const hit = (run: Run) => run.enemies.filter(enemy => enemy.hp < enemy.maxHp).length;
    expect(hit(epic.run) - hit(plain.run)).toBe(2);
    if (kind === "monk") expect(epic.run.enemies[0].stun).toBeGreaterThan(plain.run.enemies[0].stun);
  }
});

test.each(["archer", "hwacha", "spearman", "monk"] as const)("%s storm legendary transforms its attack coverage", kind => {
  const plain = arena(kind), legend = arena(kind);
  take(legend.run, `legend-${kind}-storm`);
  attack(plain.run); attack(legend.run);
  if (kind === "archer" || kind === "hwacha") {
    expect(legend.run.shots.length - plain.run.shots.length).toBe(2);
  } else {
    expect(legend.run.enemies.filter(enemy => enemy.hp < enemy.maxHp)).toHaveLength(8);
    expect(plain.run.enemies.filter(enemy => enemy.hp < enemy.maxHp)).toHaveLength(kind === "monk" ? 3 : 2);
  }
});

test.each(["archer", "hwacha", "spearman", "monk"] as const)("%s guard legendary changes control or sustain", kind => {
  const { run, unit } = arena(kind);
  unit.hp = unit.maxHp / 2;
  take(run, `legend-${kind}-guard`);
  attack(run);
  if (kind === "archer" || kind === "hwacha") expect(run.shots[0]?.stun).toBe(kind === "archer" ? .65 : .8);
  else if (kind === "spearman") expect(run.enemies[0].stun).toBeCloseTo(.6);
  else expect(unit.hp / unit.maxHp).toBeCloseTo(.54006, 4);
});

test("class stars raise actual damage independently of recruited headcount", () => {
  const damage: number[] = [];
  for (const tier of [0, 1, 2]) {
    const { run, unit } = arena("spearman");
    run.drill.spearman = tier;
    unit.strikeAt = .01; unit.aim = run.enemies[0].id;
    advance(run, .05);
    damage.push(1e6 - run.enemies[0].hp);
  }
  expect(damage[0]).toBeLessThan(damage[1]);
  expect(damage[1]).toBeLessThan(damage[2]);
});

test("late class offers gate legends on star three and never repeat acquired transformations", () => {
  const run = createRun(1593); run.time = 400; run.level = 12;
  run.drill.archer = 2;
  const seen = new Set<string>();
  for (let i = 0; i < 3000; i++) for (const card of drawCards(run)) {
    const army = classCard(card);
    if (army) seen.add(army.rarity);
  }
  expect([...seen].sort()).toEqual(["common", "legend", "rare"]);
  take(run, "epic-archer"); take(run, "legend-archer-storm"); take(run, "legend-archer-guard");
  run.time += 61;
  for (let i = 0; i < 500; i++) for (const card of drawCards(run)) {
    expect(card).not.toBe("epic-archer");
    expect(card).not.toBe("legend-archer-storm");
    expect(card).not.toBe("legend-archer-guard");
  }
});

test("rarity probability admits legendary only in the late bands", () => {
  expect([0, 120, 240, 360].map(time => rarityAt(time, .005))).toEqual(["rare", "epic", "legend", "legend"]);
  expect(rarityAt(400, .5)).toBe("rare");
  expect(rarityAt(400, .9)).toBe("common");
});

test("ordinary bot choices exclude every legendary transformation", () => {
  const run = createRun(1);
  run.offers = ["legend-archer-storm", "rare-archer", "rift"];
  expect(ordinaryCard(run)).toBe("rare-archer");
});

test("chests can grant and settle a star-three class legend without a card choice", () => {
  // The new ladder spawn draw changes the random stream before chest selection.
  const run = createRun(7); run.time = 400; run.level = 12; run.drill.archer = 2;
  run.nextBoss = run.nextElite = run.nextWave = 1e9; run.spawnBudget = -1e9; run.xp = -1e9;
  let card: CardId | undefined;
  for (let i = 0; i < 100 && !card; i++) {
    run.chests.push({ id: 900 + i, ...CENTER });
    advance(run, .05);
    card = run.roulette?.card;
    if (!card || card.startsWith("rare-")) { run.roulette = null; card = undefined; }
  }
  expect(card).toBeDefined();
  const army = card && classCard(card);
  expect(army?.rarity).toBe("legend");
  if (!run.roulette || !card) throw new Error("fixture did not find a transformation chest");
  run.roulette.remaining = .01;
  advance(run, .05);
  expect(run.tactics.archer.storm || run.tactics.archer.guard).toBe(true);
  expect(run.metrics.cards).toContain(card);
});

test("repeated general cards promote one leader to tier three and preserve growth after a level", () => {
  const run = createRun(42), squad = run.squads[0], original = squad.maxHp;
  take(run, "awaken-권율"); take(run, "awaken-권율");
  expect(run.squads).toHaveLength(1);
  expect(squad.tier).toBe(3);
  expect(squad.maxHp).toBe(Math.round(original * 1.3));
  run.xp = run.nextXp; advance(run, .05);
  expect(squad.maxHp).toBe(generalHp("권율", 2, 3));
  run.level = 10;
  for (let i = 0; i < 300; i++) expect(drawCards(run)).not.toContain("promote-권율");
});

test("promoting an injured general does not revive him before the infirmary timer", () => {
  const { run } = arena("archer"), squad = run.squads[0], until = squad.downUntil;
  take(run, "awaken-권율");
  expect(squad.tier).toBe(2);
  expect(squad.hp).toBe(0);
  expect(squad.state).toBe("down");
  expect(squad.downUntil).toBe(until);
});

test.each([1, 3])("general upgrade offers respect ownership and tier %i's cap", tier => {
  const run = createRun(42, "권율", undefined, ["권율", "김시민"]);
  run.level = 5; run.squads[0].tier = tier;
  take(run, "hero-김시민");
  const promotions = new Set<string>();
  for (let i = 0; i < 300; i++) for (const card of drawCards(run)) {
    if (card.startsWith("awaken-")) promotions.add(card);
    expect(card).not.toBe("hero-곽재우");
  }
  expect(promotions.has("awaken-권율")).toBe(tier === 1);
  expect(promotions.has("awaken-김시민")).toBe(true);
});

test("a promoted general's volley gains real damage and radius at each tier", () => {
  const results = [1, 2, 3].map(tier => {
    const { run } = arena("archer"), squad = run.squads[0];
    for (let i = 1; i < tier; i++) take(run, "promote-권율");
    squad.state = "guard"; squad.hp = squad.maxHp; squad.skillClock = 0;
    const before = run.enemies[0].hp, effect = useSkill(run, 0).find(effect => effect.kind === "skill");
    return { radius: effect?.value ?? 0, damage: before - run.enemies[0].hp };
  });
  expect(results.map(row => row.radius)).toEqual([80, 89.60000000000001, 99.2]);
  expect(results[1].damage / results[0].damage).toBeCloseTo(1.15);
  expect(results[2].damage / results[0].damage).toBeCloseTo(1.3);
});

test("arrows carry visible level and merged-unit growth, and high-tier arrows flame", () => {
  const looks = [1, 5, 10].map(level => {
    const { run } = arena("archer"); run.level = level; attack(run);
    return { tier: run.shots[0].tier, flaming: run.shots[0].flaming };
  });
  expect(looks).toEqual([{ tier: 1, flaming: false }, { tier: 2, flaming: false }, { tier: 3, flaming: true }]);
  const merged = arena("archer"); merged.unit.tier = 3; attack(merged.run);
  expect(merged.run.shots[0].tier).toBe(3);
});

test("high-tier cannon arrivals request a larger visible blast", () => {
  const blasts = [1, 3].map(tier => {
    const { run } = arena("hwacha"), at = run.enemies[0];
    run.squads[0].soldiers[0].clock = 1e9;
    run.shots.push({ id: 900, kind: "rocket", x: at.x, y: at.y, toX: at.x, toY: at.y, target: 0,
      speed: 300, prey: null, damage: 100, critical: false, by: "weapon", splash: 26, pierce: 0, from: 0, tier });
    return advance(run, .001).find(effect => effect.kind === "blast")?.value;
  });
  expect(blasts).toEqual([1, 1.7]);
});

test("rare critical bursts really finish regular enemies after growth unlocks them", () => {
  let bursts = 0, ordinary = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const { run } = arena("archer"), at = run.enemies[0];
    run.rng = seed; run.level = 5; run.squads[0].soldiers[0].clock = 1e9;
    run.shots.push({ id: 900, kind: "arrow", x: at.x, y: at.y, toX: at.x, toY: at.y, target: at.id,
      speed: 300, prey: null, damage: 100, critical: true, by: "weapon", splash: 0, pierce: 0, from: 0 });
    const effects = advance(run, .001), burst = effects.find(effect => effect.kind === "devastate");
    if (burst) { bursts++; expect(at.hp).toBeLessThanOrEqual(0); }
    else { ordinary++; expect(at.hp).toBe(999900); }
  }
  expect(bursts).toBeGreaterThan(2); expect(bursts).toBeLessThan(30);
  expect(ordinary).toBe(500 - bursts);
});

test.each(["boss", "elite", "opening"] as const)("critical bursts cannot execute %s targets", mode => {
  for (let seed = 1; seed <= 200; seed++) {
    const { run } = arena("archer"), at = run.enemies[0];
    run.rng = seed; run.level = mode === "opening" ? 1 : 5;
    at.boss = mode === "boss"; at.elite = mode === "elite";
    run.squads[0].soldiers[0].clock = 1e9;
    run.shots.push({ id: 900, kind: "arrow", x: at.x, y: at.y, toX: at.x, toY: at.y, target: at.id,
      speed: 300, prey: null, damage: 100, critical: true, by: "weapon", splash: 0, pierce: 0, from: 0 });
    expect(advance(run, .001).some(effect => effect.kind === "devastate")).toBe(false);
    expect(at.hp).toBe(999900);
  }
});
