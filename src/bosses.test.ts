import { expect, test } from "bun:test";
import { BOSS_IDS, BOSSES, matchup } from "./bosses";
import type { DamageClass } from "./bosses";
import { advance, BALANCE, createRun, GENERAL_CLASS, soldier, useSkill } from "./rules";
import type { Enemy, Run, Shot } from "./rules";
import { guardPoint } from "./geometry";

test("resistant bosses reduce one class by sixty percent and all bosses have a fifty-percent counter", () => {
  const attacks: DamageClass[] = ["arrow", "melee", "artillery", "skill"];
  for (const boss of BOSS_IDS) {
    const resistance = BOSSES[boss].resist;
    if (resistance) expect(matchup(boss, resistance)).toBe(.4);
    expect(matchup(boss, BOSSES[boss].weak)).toBe(1.5);
    for (const attack of attacks.filter(kind => kind !== BOSSES[boss].resist && kind !== BOSSES[boss].weak))
      expect(matchup(boss, attack)).toBe(1);
  }
});

function encounter(): { run: Run; boss: Enemy } {
  const run = createRun(42), at = guardPoint(0, "아래", 40), squad = run.squads[0];
  squad.x = squad.targetX = at.x; squad.y = squad.targetY = at.y;
  squad.clock = 1e9; squad.soldiers = [];
  run.xp = -1e9; run.commandClock = 1e9; run.spawnBudget = -1e9;
  const boss: Enemy = { ...run.enemies[0], id: 900, boss: true, elite: false,
    x: at.x + 24, y: at.y, hp: 1e6, maxHp: 1e6, speed: 0, clock: 1e9,
    skillClock: 1e9, bossArt: "konishi" };
  run.enemies = [boss, ...Array.from({ length: 24 }, (_, i) => ({
    ...boss, id: 901 + i, boss: false, bossArt: undefined, x: -2000 - i * 40, y: -2000,
  }))];
  return { run, boss };
}

function projectile(run: Run, boss: Enemy, kind: Shot["kind"]): void {
  run.shots.push({ id: 9900, kind, x: boss.x, y: boss.y, toX: boss.x, toY: boss.y,
    target: kind === "arrow" ? boss.id : 0, speed: 300, prey: null,
    damage: 100, critical: false, by: "weapon", splash: 26, pierce: 0, from: 0 });
}

test("real arrow and artillery arrivals obey the boss resistance and counter class in clear weather", () => {
  const arrows = encounter();
  arrows.run.weather = "맑음";
  projectile(arrows.run, arrows.boss, "arrow");
  advance(arrows.run, .05);
  expect(arrows.boss.hp).toBe(1e6 - 40);
  const rockets = encounter(); rockets.boss.bossArt = "kobayakawa";
  rockets.run.weather = "맑음";
  projectile(rockets.run, rockets.boss, "rocket");
  advance(rockets.run, .05);
  expect(rockets.boss.hp).toBe(1e6 - 40);
  projectile(rockets.run, rockets.boss, "arrow");
  advance(rockets.run, .05);
  expect(rockets.boss.hp).toBe(1e6 - 40 - 150);
});

for (const [art, kind, classMultiplier, fire] of [
  ["kobayakawa", "rocket", .4, true],
  ["wakizaka", "rocket", 1.5, true],
  ["konishi", "arrow", .4, false],
  ["kobayakawa", "arrow", 1.5, false],
] as const) {
  test(`rain composes ${kind} damage with ${art}'s class multiplier exactly once`, () => {
    const { run, boss } = encounter();
    run.weather = "비"; boss.bossArt = art;
    projectile(run, boss, kind);

    advance(run, .05);

    expect(boss.hp).toBe(1e6 - 100 * classMultiplier * (fire ? .75 : 1));
  });
}

test("melee resistance applies to a real hero strike without pushing the attacker through walls", () => {
  const { run, boss } = encounter(), hero = run.squads[0];
  boss.bossArt = "wakizaka";
  hero.strikeAt = .01; hero.aim = boss.id;
  const before = { x: hero.x, y: hero.y };
  const hits = advance(run, .05).filter(effect => effect.kind === "hit" && effect.target === boss.id);
  expect(hits).toHaveLength(1);
  expect(hits[0].value).toBe(Math.round(BALANCE.strike * 2.65 * .4 * (hits[0].critical ? 2 : 1)));
  expect({ x: hero.x, y: hero.y }).toEqual(before);
});

test("a shield rejects normal fire and a hero skill breaks it", () => {
  const { run, boss } = encounter();
  boss.shielded = true; run.squads[0].skillClock = 0;
  projectile(run, boss, "arrow"); advance(run, .05);
  expect(boss.hp).toBe(1e6); expect(boss.shielded).toBe(true);
  expect(useSkill(run, 0).some(effect => effect.kind === "interrupt")).toBe(true);
  expect(boss.shielded).toBe(false); expect(boss.hp).toBeLessThan(1e6);
});

test("a boss pursues the general even when a soldier is closer", () => {
  const { run, boss } = encounter();
  run.squads[0].soldiers = [soldier("archer", 1, { x: boss.x + 2, y: boss.y })];
  boss.clock = 0; advance(run, .05);
  expect(boss.prey).toEqual([0, -1]);
});

test("the first mid-boss is gentler than later encounters without changing the passive opening", () => {
  const early = encounter(), late = encounter();
  early.boss.appearedAt = 120; late.boss.appearedAt = 240;
  early.boss.skillClock = late.boss.skillClock = 0;
  advance(early.run, .05); advance(late.run, .05);
  // Later encounters now keep a graduated power scale instead of jumping to 1.
  expect(early.run.telegraphs[0].damage).toBeCloseTo(late.run.telegraphs[0].damage
    * BALANCE.openingBossPower / (BALANCE.openingBossPower + BALANCE.bossPowerStep));
});

test("each boss enrages at half health and immediately warns its second-phase move", () => {
  for (const art of BOSS_IDS) {
    const { run, boss } = encounter();
    boss.bossArt = art; boss.hp = boss.maxHp / 2;
    const effects = advance(run, .05);
    expect(boss.enraged).toBe(true);
    expect(effects.some(effect => effect.kind === "rage" && effect.target === boss.id)).toBe(true);
    expect(run.telegraphs.find(mark => mark.owner === boss.id)?.skill).toBe(BOSSES[art].second);
    const second = advance(run, .05);
    expect(second.some(effect => effect.kind === "rage")).toBe(false);
  }
});

test("seeded runs balance all three resistances and select different final bosses from eight identities", () => {
  const finals = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const run = createRun(seed);
    expect(new Set(run.bossRoster).size).toBe(5);
    const counters: ("arrow" | "artillery" | "melee" | null)[] = ["arrow", "artillery", "melee", null];
    expect(run.bossRoster.slice(0, 4).map(id => BOSSES[id].resist).sort()).toEqual(counters.sort());
    expect(BOSSES[run.bossRoster[0]].resist).not.toBe(GENERAL_CLASS[run.commander] === "archer" ? "arrow" : "melee");
    finals.add(run.bossRoster[4]);
    expect(run.bossOrder).toEqual(run.bossRoster.slice(0, 4).map(id => BOSSES[id].pattern));
  }
  expect(finals.size).toBe(8);
});

test("every final boss has no class resistance and remains vulnerable to skills", () => {
  for (const boss of BOSS_IDS) {
    for (const attack of ["arrow", "melee", "artillery"] as const) expect(matchup(boss, attack, true)).toBe(1);
    expect(matchup(boss, "skill", true)).toBe(1.5);
  }
});
