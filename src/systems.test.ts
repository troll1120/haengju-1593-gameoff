import { expect, test } from "bun:test";
import { advance, ARMS, BALANCE, NAVAL_GUN, cardPools, choose, classCount, createRun, drawCards, enemyCount, ENEMY_SPACING, GENERAL_GROWTH, might, recruit, reelCards, toughness, upgradeClass, upgradeCost, useSkill } from "./rules";
import type { CardId, Enemy, Run } from "./rules";
import { ARMY_KINDS } from "./roster";
import { CENTER, fortRect, setFieldSize } from "./geometry";
import { riverBank, riverLane } from "./river";
import { classCard } from "./cards";

function take(run: Run, card: CardId): void {
  run.phase = "choice"; run.offers = [card]; choose(run, card);
}
function quiet(): Run {
  const run = createRun(7);
  run.enemies = []; run.xp = -1e9; run.spawnBudget = -1e9;
  run.nextElite = run.nextBoss = run.nextWave = run.nextRiverWave = 1e9;
  run.squads[0].clock = 1e9; run.squads[0].soldiers = [];
  return run;
}
function boat(run: Run, cargo = 5): Enemy {
  const template = createRun(9).enemies[0];
  const passengers = Array.from({ length: cargo }, (_, i) => ({ ...template, id: 500 + i, hp: 100, maxHp: 100 }));
  return { ...template, id: 900, kind: "ship", shipArt: "kobaya", direction: "아래", cargo: passengers,
    x: 100, y: riverBank() + 4, speed: 40, hp: 250, maxHp: 250 };
}

test("200 seeds never offer owned joins, duplicate targets or premature stars", () => {
  for (let seed = 1; seed <= 200; seed++) for (const level of [2, 4, 5, 9, 10, 15]) for (const party of [2, 4]) {
    const run = createRun(seed);
    take(run, "hero-김시민");
    if (party === 4) { take(run, "hero-곽재우"); take(run, "hero-황진"); }
    run.level = level; run.time = 400;
    for (const tier of [1, 2, 3]) {
      for (const squad of run.squads) { squad.tier = tier; squad.awakened = tier - 1; }
      for (const kind of ARMY_KINDS) run.drill[kind] = tier - 1;
      const cards = drawCards(run), targets: string[] = [];
      for (const card of cards) {
        if (card.startsWith("hero-")) {
          expect(run.squads.some(squad => squad.general === card.slice(5))).toBe(false);
          expect(run.squads.length).toBeLessThan(4);
        }
        expect(card.startsWith("promote-") || card.startsWith("rare-") || card.startsWith("epic-")).toBe(false);
        const army = classCard(card);
        if (army) {
          targets.push(`class:${army.kind}`);
          if (card.startsWith("recruit-")) expect(classCount(run, army.kind)).toBe(0);
          if (card.startsWith("upgrade-")) {
            const before = classCount(run, army.kind), copy = structuredClone(run);
            take(copy, card);
            if (copy.drill[army.kind] > run.drill[army.kind]) {
              expect(tier).toBeLessThan(3);
              expect(level).toBeGreaterThanOrEqual(tier === 1 ? 5 : 10);
              expect(classCount(copy, army.kind)).toBe(before);
            } else {
              expect(copy.drill[army.kind]).toBe(run.drill[army.kind]);
              expect(classCount(copy, army.kind)).toBeGreaterThan(before);
            }
          }
          if (card.startsWith("legend-")) expect(tier).toBe(3);
        } else if (card.startsWith("hero-")) targets.push(`hero:${card.slice(5)}`);
        else if (card.startsWith("awaken-")) {
          targets.push(`hero:${card.slice(7)}`);
          expect(level).toBeGreaterThanOrEqual(tier === 1 ? 5 : 10);
          expect(tier).toBeLessThan(3);
        } else targets.push(card);
      }
      expect(new Set(targets).size).toBe(targets.length);
    }
  }
});

test("reel pools are pure and every actual slot is an eligible candidate", () => {
  for (let seed = 1; seed <= 200; seed++) for (const exhausted of [false, true]) {
    const run = createRun(seed); run.level = 10;
    if (exhausted) {
      run.time = 400; run.arrow = run.hwacha = 3; run.quiver = run.powder = run.fire = true;
      take(run, "hero-김시민"); take(run, "hero-곽재우"); take(run, "hero-황진");
      for (const squad of run.squads) { squad.tier = 3; squad.awakened = 2; }
      for (const kind of ARMY_KINDS) {
        if (!classCount(run, kind)) recruit(run, kind);
        run.drill[kind] = 2;
      }
    }
    const before = structuredClone(run), pools = cardPools(run);
    expect(run).toEqual(before);
    const cards = drawCards(run);
    for (const [slot, card] of cards.entries()) {
      expect(pools.flat()).toContain(card);
      expect(reelCards(run, slot, cards.slice(0, slot))).toContain(card);
    }
  }
});

test("class cards strengthen existing soldiers without replacing or recruiting them", () => {
  const run = createRun(1), original = run.squads[0].soldiers[0];
  run.level = 10;
  take(run, "upgrade-archer"); take(run, "upgrade-archer");
  expect(run.squads[0].soldiers).toEqual([original]);
  expect(run.drill.archer).toBe(2);
  expect(run.tactics.archer.epic).toBe(true);
  expect(upgradeCost(run, "archer")).toBeNull();
});

test("hero skill cards combine stars, health and awakening without adding soldiers", () => {
  const run = createRun(2), squad = run.squads[0], count = squad.soldiers.length;
  run.level = 10;
  take(run, "awaken-권율"); take(run, "awaken-권율");
  expect([squad.tier, squad.awakened]).toEqual([3, 2]);
  expect(squad.soldiers).toHaveLength(count);
  expect(squad.maxHp).toBe(Math.round(BALANCE.generalHp.권율 * (1 + BALANCE.hpGrowth * 9) * 1.3));
});

test.each([1, 2, 3])("cannon star %i applies its awakening exactly once without restoring the removed shield", tier => {
  const run = createRun(2, "김시민"), squad = run.squads[0];
  for (let star = 1; star < tier; star++) take(run, "awaken-김시민");
  squad.skillClock = 0;
  useSkill(run, squad.id);
  expect(run.shieldUntil).toBe(0);
  expect(run.reflect).toBe(false);
  const [first] = run.chaosSkills?.events ?? [];
  expect(first?.kind).toBe("cannon");
  const star1 = createRun(2, "김시민");
  star1.squads[0].skillClock = 0;
  useSkill(star1, star1.squads[0].id);
  const ratio = (first?.power ?? 0) / (star1.chaosSkills?.events[0]?.power ?? 1);
  expect(ratio).toBeCloseTo((1 + GENERAL_GROWTH.skill * (squad.tier - 1)) * (1 + squad.awakened * .25));
});

test("blacksmith spends 400 then 1200 on the same class stars as cards", () => {
  const run = createRun(2); run.gold = 1600;
  upgradeClass(run, "archer");
  expect([run.gold, run.drill.archer, upgradeCost(run, "archer")]).toEqual([1200, 1, 1200]);
  upgradeClass(run, "archer");
  expect([run.gold, run.drill.archer, run.tactics.archer.epic]).toEqual([0, 2, true]);
});

test("recruitment stops at twelve per class and forty eight overall", () => {
  const run = createRun(1);
  for (let i = 0; i < 20; i++) recruit(run, "archer");
  expect(classCount(run, "archer")).toBe(12);
  for (const kind of ["spearman", "monk", "hwacha", "ming_cavalry"] as const)
    for (let i = 0; i < 20; i++) recruit(run, kind);
  expect(run.squads.flatMap(squad => squad.soldiers)).toHaveLength(48);
});

test("fractional loot awards 112 whole coins for 100 ordinary kills at plus twelve percent", () => {
  const run = quiet(); run.meta = { ...run.meta, goldGain: 1.12 };
  const template = createRun(3).enemies[0];
  run.enemies = Array.from({ length: 100 }, (_, i) => ({ ...template, id: 1000 + i, hp: 1, maxHp: 1, x: 20, y: 100, speed: 0 }));
  run.shots.push({ id: 3000, kind: "rocket", x: 20, y: 100, toX: 20, toY: 100, speed: 260, target: 0,
    prey: null, damage: 100, critical: false, by: "weapon", splash: 26, pierce: 0, from: 0 });
  advance(run, .05);
  expect([run.kills, run.gold]).toEqual([100, 112]);
});

test("a third level weapon evolves at a matching chest after five minutes", () => {
  const run = quiet(); run.arrow = 3; run.quiver = true; run.time = 300;
  run.chests.push({ id: 3000, x: 100, y: 400 });
  advance(run, .05);
  expect(run.roulette?.evolution).toBe("arrow");
});

test("class stars alone reduce spearman hit counts across nine enemy-health timings", () => {
  const rows = [60, 120, 180, 240, 300, 360, 420, 480, 540].map(time => {
    const run = createRun(1);
    // Star two first becomes legal at level five. Hold that level fixed to
    // isolate the star bonus after the owner's level-growth retune (.35 -> .25).
    run.level = 5;
    const hp = BALANCE.enemyHp * toughness(time);
    return [1, 2.435, 3.87].map(power => Math.ceil(hp / (might(run) * ARMS.spearman.power * power)));
  });
  expect(rows.filter(row => row[1] < row[0])).toHaveLength(9);
  expect(rows.filter(row => row[2] < row[1]).length).toBeGreaterThanOrEqual(7);
});

test("the shore sits 56 pixels south of the wall, level with the title's start button", () => {
  setFieldSize(370, 800);
  expect(riverBank() - fortRect(0).bottom).toBe(56);
  expect(riverLane()).toBe(572);
  setFieldSize(390, 650);
});

test("a transport lands exactly its passengers and keeps the enemy headcount", () => {
  const run = quiet(), transport = boat(run);
  run.enemies = [transport];
  expect(enemyCount(run)).toBe(5);
  advance(run, .1);
  expect(run.enemies.map(enemy => enemy.id)).toEqual([500, 501, 502, 503, 504]);
  expect(run.enemies.every(enemy => enemy.y <= riverBank() - 8)).toBe(true);
  const gaps = run.enemies.flatMap((a, i) => run.enemies.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y)));
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(ENEMY_SPACING);
  expect(enemyCount(run)).toBe(5);
});

test("encirclement sends its own five five two convoy without launching a partial ordinary boat", () => {
  const run = quiet(), pending = boat(run, 1);
  pending.wave = false; pending.y = riverBank() + 140;
  run.enemies = [pending]; run.time = 209.95; run.nextWave = 210;
  advance(run, .1);
  const wave = run.enemies.filter(enemy => enemy.cargo && enemy.wave);
  expect(wave.map(enemy => enemy.cargo?.length)).toEqual([5, 5, 2]);
  for (const carrier of wave)
    expect(carrier.maxHp).toBeCloseTo((carrier.cargo ?? []).reduce((sum, passenger) => sum + passenger.maxHp, 0) / 2, 8);
  expect(pending.y).toBe(riverBank() + 140);
  expect(pending.sailing).not.toBe(true);
});

test("encirclement's field cap counts embarked soldiers rather than transport hulls", () => {
  const run = quiet();
  run.enemies = Array.from({ length: 40 }, (_, index) => {
    const carrier = boat(run);
    carrier.id += index; carrier.y = riverBank() + 100;
    carrier.cargo?.forEach((passenger, order) => { passenger.id = 10000 + index * 5 + order; });
    return carrier;
  });
  run.time = 209.95; run.nextWave = 210;
  advance(run, .1);
  expect(enemyCount(run)).toBe(220);
});

test("sinking a loaded boat awards passenger loot and leaves nobody to land", () => {
  const run = quiet(), transport = boat(run);
  run.enemies = [transport];
  transport.y = riverLane();
  run.shots.push({ id: 3000, kind: "rocket", x: 100, y: riverLane(), toX: 100, toY: riverLane(), speed: 260, target: 0,
    prey: null, damage: 300, critical: false, by: "weapon", splash: 26, pierce: 0, from: 0, naval: true });
  advance(run, .05);
  expect([run.kills, run.gold, run.enemies.length]).toEqual([5, 5, 0]);
});

test("naval stars supply one ship, a second ship, then a turtle ship without a third", () => {
  const run = quiet(); run.level = 10;
  take(run, "recruit-panokseon");
  expect(classCount(run, "panokseon")).toBe(1);
  take(run, "upgrade-panokseon");
  expect(classCount(run, "panokseon")).toBe(2);
  take(run, "upgrade-panokseon");
  expect(classCount(run, "panokseon")).toBe(2);
  expect(run.drill.panokseon).toBe(2);
});

test("naval guns prefer an enemy boat over a closer land enemy", () => {
  const run = quiet(), transport = boat(run);
  transport.x = 200; transport.y = riverLane(); transport.speed = 0;
  const ground = { ...createRun(9).enemies[0], id: 9001, x: 100, y: riverBank() - 8, speed: 0, clock: 1e9 };
  run.enemies = [ground, transport];
  take(run, "recruit-panokseon"); run.squads[0].soldiers[0].x = 100;
  advance(run, .05);
  expect(run.squads[0].soldiers[0].aim).toBe(transport.id);
});

test("the deck cannon holds station off the shore and shells a laden transport before the land enemy nearest the castle", () => {
  const run = quiet(), transport = boat(run);
  transport.x = CENTER.x; transport.y = riverLane() + 40; transport.speed = 0; transport.sailing = true; transport.hp = transport.maxHp = 1e9;
  const ground = { ...createRun(9).enemies[0], id: 9001, x: CENTER.x - 40, y: fortRect(run.fort).bottom + 6, speed: 0, clock: 1e9 };
  run.enemies = [ground, transport];
  take(run, "recruit-panokseon");
  const ship = run.squads[0].soldiers[0];
  for (let tick = 0; tick < 120 && !run.shots.some(shot => shot.kind === "shell"); tick++) advance(run, .05);
  const shell = run.shots.find(shot => shot.kind === "shell");
  expect(shell?.target).toBe(transport.id);
  for (let tick = 0; tick < 200; tick++) advance(run, .05);
  expect(ship.x).toBe(CENTER.x + NAVAL_GUN.slots[0]);
  expect(ship.y).toBe(riverLane());
});

test("with no transport the deck cannon lobs at the land enemy nearest the castle and bursts there", () => {
  const run = quiet(), wall = fortRect(run.fort), template = createRun(9).enemies[0];
  const near = { ...template, id: 9001, x: CENTER.x - 30, y: wall.bottom + 4, speed: 0, clock: 1e9, hp: 1e9, maxHp: 1e9 };
  const far = { ...template, id: 9002, x: CENTER.x - 60, y: riverBank() - 8, speed: 0, clock: 1e9, hp: 1e9, maxHp: 1e9 };
  run.enemies = [far, near];
  take(run, "recruit-panokseon");
  const blasts: { x: number; y: number }[] = [];
  let shell: Run["shots"][number] | undefined;
  for (let tick = 0; tick < 200 && !blasts.length; tick++) {
    for (const effect of advance(run, .05)) if (effect.kind === "blast" && effect.by === "panokseon") blasts.push(effect);
    shell ??= run.shots.find(shot => shot.kind === "shell");
  }
  expect(shell).toMatchObject({ toX: near.x, toY: near.y, lob: { height: NAVAL_GUN.arc } });
  expect(blasts[0]).toMatchObject({ x: near.x, y: near.y });
});

test("a sunk allied ship stays absent for twenty seconds and returns from the left", () => {
  const run = quiet(), fleet = { ...createRun(9).enemies[0], id: 9001, kind: "ship" as const,
    shipArt: "atakebune" as const, x: 100, y: riverLane(), speed: 0, hp: 1e9, maxHp: 1e9, skillClock: 0, expiresAt: 100 };
  run.enemies = [fleet];
  take(run, "recruit-panokseon");
  const unit = run.squads[0].soldiers[0]; unit.hp = 1;
  advance(run, .05);
  expect(unit.hp).toBe(0);
  const returnedAt = unit.downUntil;
  expect(returnedAt - run.time).toBe(20);
  while (run.time < returnedAt - .1) advance(run, .05);
  expect(unit.hp).toBe(0);
  while (run.time < returnedAt + .01) advance(run, .05);
  expect(unit.hp).toBeGreaterThan(0);
  expect(unit.x).toBeLessThan(30);
  expect(unit.y).toBe(riverLane());
});

test("naval gun cadence includes its windup in the two point four second cycle", () => {
  const run = quiet(), transport = boat(run), squad = run.squads[0];
  squad.general = "황진";
  transport.y = riverLane() + 30; transport.speed = 0; transport.hp = transport.maxHp = 1e9;
  run.enemies = [transport];
  take(run, "recruit-panokseon");
  const unit = squad.soldiers[0], times: number[] = [];
  for (let tick = 0; tick < 120; tick++) {
    unit.x = transport.x;
    const effects = advance(run, .05);
    // The hull rocket's shot (value 0), not the deck cannon's (value 1).
    if (effects.some(effect => effect.kind === "shot" && effect.by === "panokseon" && effect.value === 0)) times.push(run.time);
  }
  expect(times).toHaveLength(3);
  for (let i = 1; i < times.length; i++) {
    expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(2.4 - 1e-8);
    expect(times[i] - times[i - 1]).toBeLessThanOrEqual(2.45 + 1e-8);
  }
});

test.each([0, 2])("fleet guns lose their wall pressure against %i naval stars without warning skills", stars => {
  const run = quiet(); run.time = 180; run.nextRiverWave = 180;
  const template = createRun(9).enemies[0];
  // Keep the normal field floor occupied by inert land enemies so this is only a fleet encounter.
  run.enemies = Array.from({ length: 20 }, (_, index) => ({ ...template, id: 5000 + index,
    x: -1000, y: -1000, hp: 1e9, maxHp: 1e9, speed: 0, clock: 1e9, skillClock: 1e9 }));
  if (stars) {
    run.level = 10; take(run, "recruit-panokseon"); take(run, "upgrade-panokseon");
  }
  const before = run.walls.아래;
  for (let i = 0; i < 900; i++) advance(run, .05);
  expect(run.telegraphs).toHaveLength(0);
  const loss = (before - run.walls.아래) / before;
  if (!stars) { expect(loss).toBeGreaterThanOrEqual(.3); expect(loss).toBeLessThanOrEqual(.5); }
  else expect(loss).toBeLessThanOrEqual(.1);
});
