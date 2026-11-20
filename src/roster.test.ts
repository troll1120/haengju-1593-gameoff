import { expect, test } from "bun:test";
import { advance, choose, chooseGeneral, createRun, drawCards, might, useSkill } from "./rules";
import type { Enemy, General, Run } from "./rules";
import { DEMO_ROSTER, GENERAL_ART, GENERAL_CLASS, GENERALS, GENERAL_SCALE, PARTY_LIMIT, rosterFor } from "./roster";
import { CENTER, fortRect, SIDES, wallPoint } from "./geometry";

function join(run: Run, general: General): void {
  run.phase = "choice"; run.offers = [`hero-${general}`];
  choose(run, `hero-${general}`);
}
function enemy(run: Run, x: number, y: number): Enemy {
  const goal = wallPoint(fortRect(run.fort, 12), { x, y });
  const foe: Enemy = { id: run.nextId++, kind: "yari", direction: "아래", x, y, hp: 10000, maxHp: 10000,
    speed: 0, elite: false, boss: false, goalX: goal.x, goalY: goal.y, clock: 0, strikeAt: 0, prey: null,
    stun: 0, burn: 0, burnClock: 0, skillClock: 1e9, casting: 0, casts: 0 };
  run.enemies.push(foe);
  return foe;
}
test("the full distribution exposes all generals and the explicit demo flag exposes its configured subset", () => {
  expect(rosterFor(new URLSearchParams())).toEqual(GENERALS);
  expect(rosterFor(new URLSearchParams("demo=0"))).toEqual(GENERALS);
  expect(rosterFor(new URLSearchParams("demo=1"))).toEqual(DEMO_ROSTER);
  expect(DEMO_ROSTER.every(general => GENERALS.includes(general))).toBe(true);
  expect(DEMO_ROSTER.length).toBeLessThan(GENERALS.length);
});

test("each of twenty generals spawns alone with its own class soldier", () => {
  expect(GENERALS).toHaveLength(20);
  for (const general of GENERALS) {
    const run = createRun(42, general);
    expect(run.squads.map(squad => squad.general)).toEqual([general]);
    expect(run.squads[0].soldiers.map(unit => unit.kind)).toEqual([GENERAL_CLASS[general]]);
    expect(run.squads[0].maxHp).toBeGreaterThan(0);
  }
  expect(GENERAL_CLASS.권율).toBe("archer");
  expect(GENERAL_CLASS.곽재우).toBe("ming_cavalry");
});
test("joining four unique generals brings four class soldiers and no fifth hero offers", () => {
  const run = createRun(42);
  run.level = 5;
  for (const general of ["김시민", "곽재우", "황진"] as const) join(run, general);
  expect(run.squads).toHaveLength(4);
  expect(new Set(run.squads.map(squad => squad.post))).toEqual(new Set(SIDES));
  expect(run.squads.map(squad => squad.soldiers.map(unit => unit.kind))).toEqual([["archer"], ["monk"], ["ming_cavalry"], ["spearman"]]);
  for (let i = 0; i < 100; i++) expect(drawCards(run).some(card => card.startsWith("hero-"))).toBe(false);
  join(run, "처영");
  expect(run.squads).toHaveLength(PARTY_LIMIT);
});
test("duplicate and locked hero cards cannot add squads through either join path", () => {
  const run = createRun(42, "권율", undefined, ["권율", "김시민", "곽재우"]);
  join(run, "권율"); join(run, "황진");
  run.phase = "general"; run.generalOffers = ["황진"]; chooseGeneral(run, "황진");
  expect(run.squads.map(squad => squad.general)).toEqual(["권율"]);
  run.level = 4;
  for (let i = 0; i < 100; i++)
    for (const card of drawCards(run)) if (card.startsWith("hero-")) expect(["hero-김시민", "hero-곽재우"]).toContain(card);
});
test("the fourth general has finite skill, damage and taken counters", () => {
  const run = createRun(42);
  for (const general of ["김시민", "곽재우", "황진"] as const) join(run, general);
  run.enemies = [];
  const squad = run.squads[3];
  enemy(run, squad.x + 10, squad.y + 10);
  useSkill(run, 3);
  for (let i = 0; i < 40; i++) advance(run, .05);
  expect(run.metrics.skills[3]).toBe(1);
  expect(Number.isFinite(run.metrics.damage.squads[3])).toBe(true);
  expect(Number.isFinite(run.metrics.taken[3])).toBe(true);
});
test("a full party retains four assigned sides even when pressure changes", () => {
  const run = createRun(42);
  for (const general of ["김시민", "곽재우", "황진"] as const) join(run, general);
  const assigned = run.squads.map(squad => squad.post);
  run.enemies = [];
  for (let i = 0; i < 50; i++) enemy(run, CENTER.x, 30);
  run.commandClock = 0; advance(run, .05);
  expect(run.squads.map(squad => squad.post)).toEqual(assigned);
});
test("a recovering general yields a pressured side without duplicating the final four posts", () => {
  const run = createRun(42);
  join(run, "김시민");
  const down = run.squads[1], side = down.post;
  down.state = "down"; down.hp = 0; down.downUntil = 100;
  run.enemies = [];
  const at = wallPoint(fortRect(run.fort, 60), side === "위" ? { x: CENTER.x, y: 0 }
    : side === "좌" ? { x: 0, y: CENTER.y } : side === "우" ? { x: 1000, y: CENTER.y } : { x: CENTER.x, y: 1000 });
  for (let i = 0; i < 40; i++) enemy(run, at.x, at.y);
  run.commandClock = 0; advance(run, .05);
  expect(run.squads[0].post).toBe(side);
  join(run, "곽재우"); join(run, "황진");
  expect(new Set(run.squads.map(squad => squad.post))).toEqual(new Set(SIDES));
});
test("each general skill casts, starts a cooldown and refuses an immediate second cast", () => {
  for (const general of GENERALS) {
    const run = createRun(42, general), squad = run.squads[0];
    run.enemies = []; enemy(run, squad.x + 15, squad.y + 20);
    squad.skillClock = 0;
    expect(useSkill(run, 0).some(effect => effect.kind === "skill")).toBe(true);
    expect(squad.skillClock).toBeGreaterThan(0);
    expect(useSkill(run, 0)).toEqual([]);
  }
});
test("Hwang Jin sweeps nearby enemies with damage, knockback and stun", () => {
  const run = createRun(42, "황진"), squad = run.squads[0];
  run.enemies = []; squad.skillClock = 0;
  const foe = enemy(run, squad.x + 20, squad.y + 20);
  useSkill(run, 0);
  expect(foe.hp).toBe(10000 - 4 * might(run));
  expect(foe.stun).toBe(2);
});
test("Cheo Yeong heals living allies without reviving casualties or repairing the fort", () => {
  const run = createRun(42, "처영"), squad = run.squads[0], soldier = squad.soldiers[0];
  join(run, "권율");
  const down = run.squads[1]; down.state = "down"; down.hp = 0; down.downUntil = 30;
  squad.hp = squad.maxHp * .2; soldier.hp = soldier.maxHp * .2; squad.skillClock = 0;
  run.base = 10; run.walls.위 = 10;
  useSkill(run, 0);
  expect(squad.hp).toBeCloseTo(squad.maxHp * .5);
  expect(soldier.hp).toBeCloseTo(soldier.maxHp * .5);
  expect(down.hp).toBe(0); expect(run.base).toBe(10); expect(run.walls.위).toBe(10);
});
test("Jo Heon bombards the aimed crowd for heavy damage in clear weather", () => {
  const run = createRun(42, "조헌"), squad = run.squads[0];
  run.weather = "맑음";
  run.enemies = []; squad.skillClock = 0;
  const foe = enemy(run, 40, 40);
  const effects = useSkill(run, 0);
  expect(foe.hp).toBe(10000 - 7 * might(run));
  expect(effects.some(effect => effect.kind === "blast")).toBe(true);
});
test("Shin Rip returns on his first charge while Kim Yeomul needs awakening", () => {
  for (const general of ["신립", "김여물"] as const) {
    const run = createRun(42, general), squad = run.squads[0];
    run.enemies = []; squad.skillClock = 0;
    enemy(run, squad.x, squad.y + 60);
    useSkill(run, 0);
    expect(squad.lane?.back).toBe(general === "신립");
  }
});
test("Lee Boknam applies burning arrows distinct from Gwon Yul's direct volley in clear weather", () => {
  for (const general of ["이복남", "권율"] as const) {
    const run = createRun(42, general), squad = run.squads[0];
    run.weather = "맑음";
    run.enemies = []; squad.skillClock = 0;
    const foe = enemy(run, 40, 40);
    useSkill(run, 0);
    expect(foe.burn).toBe(general === "이복남" ? 5 : 0);
    expect(foe.hp).toBe(10000 - (general === "이복남" ? 3 : 5) * might(run));
  }
});
for (const [general, power, burn] of [["조헌", 7, 0], ["이복남", 3, 5], ["권율", 5, 0]] as const) {
  test(`${general}'s skill in rain preserves base power and burn duration with only fire damage reduced`, () => {
    const run = createRun(42, general), squad = run.squads[0];
    run.weather = "비"; run.enemies = []; squad.skillClock = 0;
    const foe = enemy(run, 40, 40);

    useSkill(run, 0);

    expect(foe.hp).toBe(10000 - power * might(run) * (general === "권율" ? 1 : .75));
    expect(foe.burn).toBe(burn);
  });
}
test("all roster art loads original two-frame units and portraits at double soldier scale", async () => {
  expect(GENERAL_SCALE).toBe(2);
  for (const general of GENERALS) {
    for (const file of [`units/${GENERAL_ART[general]}.png`, `portraits/${GENERAL_ART[general]}.png`, `units/${GENERAL_CLASS[general]}.png`]) {
      expect(await Bun.file(`${import.meta.dir}/../public/art/${file}`).exists()).toBe(true);
    }
  }
});
