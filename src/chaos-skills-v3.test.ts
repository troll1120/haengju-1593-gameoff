import { expect, test } from "bun:test";
import { bphBattleMedals } from "./bph-session";
import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import { chaosArena as survivalArena, chaosEnemy, chaosTicks } from "./chaos-test-fixture";
import { bphEffectCombat, generalHp, useSkill } from "./rules";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { CENTER, contains, crosses, distance, fortRect, WIDTH } from "./geometry";
import { riverBank } from "./river";
import { segmentGap } from "./chaos-skill-geometry";
import { uniqueSkillSpeed } from "./skills-unique";
import { chaosAfterAttack, chaosState } from "./chaos";
import { bindBphConsumers, bphConsumers, bphFxContext } from "./bph-fx-dispatch";
import { tickChaosSkills } from "./chaos-skill-tick";
import { skillReady } from "./skill-button";

// These tests also cover the retained L0 column, which is no longer the zero-purchase survival start.
function chaosArena(...args: Parameters<typeof survivalArena>) {
  const run = survivalArena(...args);
  if (args[1] === 0) {
    if (!run.chaos) throw new Error("Missing commander state");
    run.chaos.level = 0;
  }
  // Initialize the fixture at its requested level before assigning health fractions.
  const squad = run.squads[0];
  squad.hp = squad.maxHp = generalHp(args[0], run.chaos!.level) * BPH_SURVIVAL_TABLE.generalHpScale;
  return run;
}

test("N20 arrow rain hits distant map regions in twelve real waves over six seconds", () => {
  const run = chaosArena("권율", 20);
  chaosEnemy(run, 195, 100);
  useSkill(run, 0);
  const targets = [chaosEnemy(run, 30, 70), chaosEnemy(run, 355, 70), chaosEnemy(run, 30, 490), chaosEnemy(run, 355, 490)];
  const hp = targets.map(enemy => enemy.hp);
  const events = run.chaosSkills?.events ?? [];
  expect(events).toHaveLength(144);
  expect(new Set(events.map(event => event.impactTick)).size).toBe(12);
  chaosTicks(run, 11);
  expect(targets.map(enemy => enemy.hp)).toEqual(hp);
  chaosTicks(run, 1);
  const perWave = CHAOS_RULES.skills.arrows.power[5] * 1.57 * BPH_SURVIVAL_TABLE.generalSkill / CHAOS_RULES.skills.arrows.waves[5];
  expect(targets.map((enemy, index) => hp[index] - enemy.hp)).toEqual(targets.map(() => expect.closeTo(perWave)));
  const after = targets.map(enemy => enemy.hp);
  chaosTicks(run, 165);
  expect(targets.map((enemy, index) => after[index] - enemy.hp)).toEqual(targets.map(() => expect.closeTo(11 * perWave)));
});

function shinCharge(level: number, seed = 144) {
  const run = chaosArena("신립", level);
  run.seed = seed;
  const aim = chaosEnemy(run, 245, 100);
  aim.boss = true;
  const effect = useSkill(run, 0).find(effect => effect.kind === "skill")!;
  const clones = run.chaosSkills!.events.filter(event => event.kind === "clones");
  return { run, effect, clones };
}

test("clone spawn points replay by seed and cover dry enemy ground on different sides of the fort", () => {
  const positions = (seed: number) => shinCharge(20, seed).clones.map(event => event.from);
  expect(positions(144)).toEqual(positions(144));
  expect(positions(144)).not.toEqual(positions(145));
  for (let seed = 1; seed <= 24; seed++) {
    const { run, clones } = shinCharge(20, seed);
    const wall = fortRect(run.fort, 12);
    expect(new Set(clones.map(event => `${event.from.x}:${event.from.y}`)).size).toBe(10);
    for (const { from, to } of clones) {
      for (const point of [from, to]) {
        expect(point.x).toBeGreaterThanOrEqual(18);
        expect(point.x).toBeLessThanOrEqual(WIDTH - 18);
        expect(point.y).toBeGreaterThanOrEqual(26);
        expect(point.y).toBeLessThanOrEqual(riverBank() - 8);
        expect(contains(wall, point)).toBe(false);
      }
      expect(crosses(wall, from, to)).toBe(false);
      expect(distance(to, CENTER)).toBeLessThanOrEqual(distance(from, CENTER));
    }
  }
  expect(positions(144).some(point => point.y > CENTER.y)).toBe(true);
  expect(positions(144).some(point => point.y < CENTER.y)).toBe(true);
});

test("N0 gets one damaging clone and higher bands preserve their split power and push", () => {
  for (const level of [0, 1, 5, 10, 15, 20]) {
    const { clones } = shinCharge(level);
    const band = chaosSkillBand(level), rules = CHAOS_RULES.skills.clones;
    expect(clones).toHaveLength(rules.count[band]);
    expect(clones.reduce((sum, clone) => sum + clone.power, 0)).toBeCloseTo(
      rules.power[band] * (1 + .03 * Math.max(0, level - 1)) * BPH_SURVIVAL_TABLE.generalSkill);
    expect(clones.reduce((sum, clone) => sum + clone.push, 0)).toBeCloseTo(rules.push);
  }
});

test("clone reach and width match Shin at two levels and the independent lanes start dealing damage together", () => {
  const lengths: number[] = [], widths: number[] = [];
  for (const level of [1, 20]) {
    const { run, effect, clones } = shinCharge(level);
    const origin = { x: effect.fromX!, y: effect.fromY! }, length = distance(origin, effect);
    lengths.push(length); widths.push(effect.value);
    const clone = clones.find(event => segmentGap(event.from, origin, effect) > 2 * effect.value)!;
    expect(clone).toBeDefined();
    const witness = chaosEnemy(run, clone.from.x, clone.from.y);
    const main = chaosEnemy(run, origin.x + 14, origin.y);
    for (const event of clones) {
      expect(distance(event.from, event.to)).toBeCloseTo(length, 8);
      expect(event.radius).toBe(effect.value);
      expect(event.startedTick).toBe(run.chaosSkills!.tick);
      expect(event.impactTick).toBe(clone.impactTick);
    }
    expect([main.hp, witness.hp]).toEqual([10000, 10000]);
    chaosTicks(run, 1);
    expect(run.squads[0].trampled).toContain(main.id);
    expect(clone.hits).toContain(witness.id);
    expect(witness.hp).toBeLessThan(10000);
    expect(distance(clone, clone.from)).toBeGreaterThan(0);
  }
  expect(lengths[1]).toBeGreaterThan(lengths[0]);
  expect(widths[1]).toBeGreaterThan(widths[0]);
});

test.each([0, 1, 10, 20])("Song N%i creates repeated distributed lightning without a slow line", level => {
  const run = chaosArena("송상현", level), band = chaosSkillBand(level);
  const enemy = chaosEnemy(run, 195, 100);
  const speed = enemy.speed = 24;
  useSkill(run, 0);
  expect(run.uniqueSkills).toBeUndefined();
  expect(uniqueSkillSpeed(run, enemy)).toBe(1);
  const events = run.chaosSkills?.events ?? [];
  expect(events).toHaveLength(CHAOS_RULES.skills.thunder.count[band] * CHAOS_RULES.skills.thunder.waves[band]);
  expect(new Set(events.filter(event => event.wave === 0).map(event => `${event.to.x}:${event.to.y}`)).size)
    .toBe(CHAOS_RULES.skills.thunder.count[band]);
  const witnesses = events.filter(event => event.wave === 0).map(event => chaosEnemy(run, event.to.x, event.to.y));
  chaosTicks(run, 8);
  expect(witnesses.map(target => target.hp)).toEqual(witnesses.map(() => 10000));
  chaosTicks(run, 1);
  expect(witnesses.map(target => 10000 - target.hp)).toEqual(witnesses.map(() => expect.closeTo(
    CHAOS_RULES.skills.thunder.power[band] * (1 + .03 * Math.max(0, level - 1))
      * BPH_SURVIVAL_TABLE.generalSkill / CHAOS_RULES.skills.thunder.waves[band])));
  expect(enemy.speed).toBe(speed);
});

test("N20 stomps damage eight separate locations simultaneously without overlap multiplication", () => {
  const run = chaosArena("황진", 20);
  chaosEnemy(run, 225, 100);
  useSkill(run, 0);
  const events = run.chaosSkills?.events.filter(event => event.kind === "stomps" && event.wave === 0) ?? [];
  expect(events).toHaveLength(8);
  expect(new Set(events.map(event => event.impactTick))).toEqual(new Set([9]));
  const witnesses = events.map(event => chaosEnemy(run, event.to.x, event.to.y));
  chaosTicks(run, 9);
  expect(witnesses.map(enemy => 10000 - enemy.hp)).toEqual(Array(8).fill(expect.closeTo(
    CHAOS_RULES.skills.stomps.power[5] * 1.57 * BPH_SURVIVAL_TABLE.generalSkill / CHAOS_RULES.skills.stomps.waves[5])));
});

test("N20 militia keep emerging in different map regions and attack through their lifetime", () => {
  const run = chaosArena("곽재우", 20);
  chaosEnemy(run, 195, 100);
  useSkill(run, 0);
  const events = run.chaosSkills?.events ?? [];
  expect(events).toHaveLength(48);
  expect(new Set(events.map(event => event.startedTick)).size).toBe(8);
  expect(events.at(-1)?.startedTick).toBe(126);
  const first = events[0], last = events.at(-1);
  if (!last) throw new Error("Missing last militia wave");
  const target = chaosEnemy(run, first.x, first.y);
  const late = chaosEnemy(run, last.x, last.y);
  target.ladder = true;
  chaosTicks(run, 30);
  expect(target.hp).toBeLessThan(10000);
  const before = late.hp;
  chaosTicks(run, 126);
  expect(late.hp).toBeLessThan(before);
  expect(run.squads[0].soldiers).toHaveLength(0);
});

test("N20 overlapping militia waves occupy thirty distinct legal spawn positions before moving", () => {
  const run = chaosArena("곽재우", 20);
  useSkill(run, 0);
  chaosTicks(run, 72);
  const state = run.chaosSkills;
  if (!state) throw new Error("Missing militia schedule");
  const live = state.events.filter(event => event.kind === "militia"
    && event.startedTick <= state.tick && state.tick < event.impactTick);
  expect(live).toHaveLength(30);
  expect(new Set(live.map(event => `${event.x}:${event.y}`)).size).toBe(30);
  expect(live.every(event => event.x === event.from.x && event.y === event.from.y
    && !contains(fortRect(run.fort, 12), event) && event.y <= riverBank() - 8)).toBe(true);
  for (let first = 0; first < live.length; first++) for (let second = first + 1; second < live.length; second++)
    expect(distance(live[first], live[second]) + 1e-9).toBeGreaterThanOrEqual(CHAOS_RULES.skills.militia.spacing);
});

test("N20 turtle ships collide from four directions and never damage an untouched distant strip", () => {
  const run = chaosArena("이순신", 20);
  useSkill(run, 0);
  const ships = run.chaosSkills?.events ?? [];
  expect(ships).toHaveLength(60);
  expect(new Set(ships.map(event => Math.atan2(event.to.y - event.from.y, event.to.x - event.from.x))).size).toBe(4);
  const event = ships[0], target = chaosEnemy(run, (event.from.x + event.to.x) / 2, event.to.y);
  const outside = chaosEnemy(run, -300, -300);
  chaosTicks(run, 1);
  expect(target.hp).toBe(10000);
  chaosTicks(run, 35);
  expect(target.hp).toBeLessThan(10000);
  expect(event.hits).toContain(target.id);
  expect(outside.hp).toBe(10000);
});

test.each([0, 10, 20])("Kim N%i shells start on castle walls, arc, then explode and knock outward without protection", level => {
  const run = chaosArena("김시민", level), wall = fortRect(run.fort), squad = run.squads[0];
  squad.awakened = 2; squad.hp = 100; squad.maxHp = 100;
  const effects = useSkill(run, 0), shells = run.chaosSkills?.events ?? [];
  expect(shells.length).toBe(CHAOS_RULES.skills.cannon.count[chaosSkillBand(level)] * CHAOS_RULES.skills.cannon.waves[chaosSkillBand(level)]);
  expect(shells.every(event => event.from.x === wall.left || event.from.x === wall.right
    || event.from.y === wall.top || event.from.y === wall.bottom)).toBe(true);
  const shell = shells[0], enemy = chaosEnemy(run, shell.to.x, shell.to.y);
  const start = { x: enemy.x, y: enemy.y };
  expect(run.shieldUntil).toBe(0); expect(run.reflect).toBe(false);
  bphEffectCombat(run, effects).applyUnitDamage({ target: squad, amount: 10 });
  expect(squad.hp).toBeLessThan(100);
  chaosTicks(run, 4);
  expect(enemy.hp).toBe(10000);
  const progress = 4 / 9;
  expect(shell.y).toBeCloseTo(shell.from.y + (shell.to.y - shell.from.y) * progress
    - shell.arcHeight * 4 * progress * (1 - progress));
  chaosTicks(run, 5);
  expect(enemy.hp).toBeLessThan(10000);
  expect(distance(enemy, start)).toBeGreaterThan(0);
  expect(run.chaos?.defense?.unitPrevented ?? 0).toBe(0);
});

test("Kim N0 aims different wall ports at actual enemies even when their grid cells are empty", () => {
  const run = chaosArena("김시민", 0), wall = fortRect(run.fort);
  const enemy = chaosEnemy(run, wall.right + 80, CENTER.y);
  useSkill(run, 0);
  const shells = run.chaosSkills?.events ?? [];
  expect(shells).toHaveLength(6);
  expect(new Set(shells.filter(shell => shell.wave === 0).map(shell => `${shell.from.x}:${shell.from.y}`)).size).toBe(2);
  expect(shells.every(shell => shell.to.x === enemy.x && shell.to.y === enemy.y)).toBe(true);
  expect(shells.every(shell => !crosses(wall, shell.from, shell.to))).toBe(true);
  chaosTicks(run, 54);
  expect(10000 - enemy.hp).toBeCloseTo(10 * BPH_SURVIVAL_TABLE.generalSkill);
});

test.each([1, 10])("Kim Lv%i barrage shells foes already inside a breached wall where they stand", level => {
  const run = chaosArena("김시민", level), squad = run.squads[0];
  squad.x = CENTER.x; squad.y = CENTER.y + 20;
  const enemy = chaosEnemy(run, CENTER.x - 20, CENTER.y - 10), at = { x: enemy.x, y: enemy.y };
  expect(useSkill(run, 0)).not.toEqual([]);
  const shells = run.chaosSkills?.events ?? [];
  expect(shells.length).toBeGreaterThan(0);
  expect(shells.filter(shell => shell.wave === 0).every(shell => shell.to.x === at.x && shell.to.y === at.y)).toBe(true);
  chaosTicks(run, 2 * CHAOS_RULES.skills.cannon.interval);
  expect(enemy.hp).toBeLessThan(10000);
});

test("Kim barrage level table never weakens a level below the one before (owner DM 1033)", () => {
  const { count, waves, radius, power } = CHAOS_RULES.skills.cannon;
  for (const column of [count, waves, radius, power]) for (let band = 1; band < column.length; band++)
    expect(column[band]).toBeGreaterThanOrEqual(column[band - 1]);
  expect(count[1] >= 2 && waves[1] >= 3 && radius[1] >= 64 && power[1] >= power[0]).toBe(true);
});

test("Kim Lv1 cast into ten foes inside its reach damages more than one", () => {
  const run = chaosArena("김시민", 1), wall = fortRect(run.fort);
  const foes = Array.from({ length: 10 }, (_, index) => chaosEnemy(run, CENTER.x - 18 + (index % 5) * 9, wall.top - 40 + Math.floor(index / 5) * 9));
  expect(useSkill(run, 0)).not.toEqual([]);
  chaosTicks(run, CHAOS_RULES.skills.cannon.flight + 2);
  expect(foes.filter(foe => foe.hp < 10000).length).toBeGreaterThan(1);
});

test("Kim's skill button cue lights when ready and goes out on the tap that casts", () => {
  const run = chaosArena("김시민", 1), squad = run.squads[0];
  chaosEnemy(run, CENTER.x, fortRect(run.fort).top - 40);
  squad.skillClock = 0.5;
  expect(skillReady(squad)).toBe(false);
  squad.skillClock = 0;
  expect(skillReady(squad)).toBe(true);
  expect(useSkill(run, 0)).not.toEqual([]);
  expect(skillReady(squad)).toBe(false);
});

test("later cannon waves retarget live threats at launch instead of wasting shells on dead targets", () => {
  const run = chaosArena("김시민", 0), wall = fortRect(run.fort);
  const first = chaosEnemy(run, 40, 80), survivor = chaosEnemy(run, 350, 80);
  first.hp = .1;
  useSkill(run, 0);
  const later = run.chaosSkills?.events.find(event => event.wave === 1 && event.ordinal === 0);
  if (!later) throw new Error("Missing later cannon wave");
  chaosTicks(run, 9);
  expect(first.hp).toBeLessThanOrEqual(0);
  expect(survivor.hp).toBeLessThan(10000);
  const caster = chaosEnemy(run, CENTER.x, wall.top - 20);
  caster.casting = run.nextId++;
  chaosTicks(run, 9);
  expect(later.to).toEqual({ x: caster.x, y: caster.y });
  expect(later.resolved).toBe(false);
  expect(later.impactTick).toBe(27);
  chaosTicks(run, 9);
  expect(caster.hp).toBeLessThan(10000);
  expect(later.resolved).toBe(true);
});

test.each([[150, 1], [540, 36 + 19 / 3], [900, 55]])(
  "cannon damage counters the authored siege HP scale at %i seconds without boosting ordinary or wave targets",
  (time, scale) => {
    const run = chaosArena("김시민", 0);
    run.time = time;
    const normal = chaosEnemy(run, 40, 100), siege = chaosEnemy(run, 41, 100), wave = chaosEnemy(run, 42, 100);
    siege.ladder = true; wave.ladder = true; wave.wave = true;
    useSkill(run, 0);
    tickChaosSkills(run, .3, []);
    expect(10000 - normal.hp).toBeCloseTo(10 / 3 * BPH_SURVIVAL_TABLE.generalSkill);
    expect(10000 - wave.hp).toBeCloseTo(10 / 3 * BPH_SURVIVAL_TABLE.generalSkill);
    expect(10000 - siege.hp).toBeCloseTo(10 / 3 * scale * BPH_SURVIVAL_TABLE.generalSkill);
  },
);

test.each(["송상현", "김시민", "황진"] as const)(
  "%s impacts deal native damage and resolve their real event without a duplicate generic blast",
  general => {
    const run = chaosArena(general, general === "황진" ? 20 : 0);
    useSkill(run, 0);
    const event = run.chaosSkills?.events[0];
    if (!event) throw new Error("Missing scheduled impact");
    const target = chaosEnemy(run, event.to.x, event.to.y);
    const effects = chaosTicks(run, event.impactTick);
    expect(target.hp).toBeLessThan(10000);
    expect(event.resolved).toBe(true);
    expect(effects.some(effect => effect.kind === "hit" && effect.target === target.id)).toBe(true);
    expect(effects.filter(effect => effect.kind === "blast")).toEqual([]);
  },
);

test.each([0, 10, 20])("Samyeong N%i rings damage and briefly stun only on arrival while never healing", level => {
  const run = chaosArena("사명대사", level), squad = run.squads[0];
  squad.hp = squad.maxHp / 2;
  const health = squad.hp;
  const enemy = chaosEnemy(run, squad.x + 50, squad.y);
  useSkill(run, 0);
  expect(squad.hp).toBe(health);
  chaosTicks(run, 1);
  expect(enemy.hp).toBe(10000);
  expect(enemy.stun).toBe(0);
  chaosTicks(run, 8);
  expect(enemy.hp).toBeLessThan(10000);
  expect(enemy.stun).toBeGreaterThan(0);
  const hp = enemy.hp;
  chaosTicks(run, 12);
  expect(enemy.hp).toBe(hp);
  expect(enemy.stun).toBeLessThanOrEqual(0);
  // A landed L0 hit promotes the legacy fixture to Lv1; growth preserves its health fraction.
  expect(squad.hp / squad.maxHp).toBe(.5);
});

test("native delayed attack rewards and damage receipts occur once without direct-kill recursion", () => {
  const run = chaosArena("송상현", 20), context = bphFxContext(run);
  if (!context) throw new Error("Missing combat context");
  const receipts: { spellId: string | undefined; dealt: number; id: number | undefined }[] = [];
  bindBphConsumers(context, [...bphConsumers(), {
    id: "quests", kinds: [], consume: () => { throw new Error("Observer has no effects"); },
    onEvent: (_ctx, event) => {
      if (event.kind === "damage-dealt" && event.side === "enemy") receipts.push({ spellId: event.spellId, dealt: event.dealt, id: event.receiptId });
    },
  }], false);
  useSkill(run, 0);
  const strike = run.chaosSkills?.events[0];
  if (!strike) throw new Error("Missing lightning");
  // ID 1044 wins both loot draws in the arena's seeded battle.
  run.nextId = 1044;
  const enemy = chaosEnemy(run, strike.to.x, strike.to.y);
  enemy.hp = .1; enemy.bphProfileId = "Monster1_Caveling";
  const gold = run.gold, medals = bphBattleMedals(run);
  chaosTicks(run, 180);
  expect(run.kills).toBe(1);
  expect(run.gold - gold).toBe(1);
  expect(bphBattleMedals(run) - medals).toBe(1);
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({ spellId: "chaos:manual:thunder", dealt: .1 });
  expect(receipts[0].id).toBeDefined();
  expect(run.chaos?.kills).toBe(0);
});

test("passive cannon and bell growth produce attacks without shield actors or healing pools", () => {
  const kim = chaosArena("김시민", 20), sam = chaosArena("사명대사", 20);
  // The passive guns only answer enemies in reach; give Kim's arena one north of the wall.
  chaosEnemy(kim, CENTER.x, fortRect(kim.fort).top - 60);
  sam.squads[0].hp = sam.squads[0].maxHp / 2;
  const health = sam.squads[0].hp;
  chaosState(kim); chaosState(sam);
  for (let index = 0; index < 3; index++) chaosAfterAttack(sam, { unit: sam.squads[0], target: CENTER, amount: 1 }, []);
  expect(sam.chaosSkills?.events.map(event => event.kind)).toEqual(["bell"]);
  chaosTicks(kim, 75); chaosTicks(sam, 24);
  expect(kim.chaosSkills?.events.map(event => event.kind)).toEqual(Array(8).fill("cannon"));
  expect(kim.chaos?.orbitHits).toEqual({});
  expect(sam.chaos?.pools).toEqual([]);
  expect(sam.squads[0].hp).toBe(health);
});

test.each([[10, 30], [20, 10], [20, 30]])(
  "Samyeong N%i at %i army attacks per second deals bell damage without any stun lock",
  (level, attacksPerSecond) => {
    const run = chaosArena("사명대사", level), context = bphFxContext(run);
    if (!context) throw new Error("Missing native context");
    bindBphConsumers({ ...context, pointer: { x: -1000, y: -1000 } }, bphConsumers(), false);
    const target = chaosEnemy(run, CENTER.x, CENTER.y - 100);
    let stunnedTicks = 0;
    for (let tick = 0; tick < 300; tick++) {
      if (tick % (30 / attacksPerSecond) === 0)
        chaosAfterAttack(run, { unit: run.squads[0], target, amount: 1 }, []);
      chaosTicks(run, 1);
      if (target.stun > 0) stunnedTicks++;
    }
    expect(stunnedTicks).toBe(0);
    expect(target.hp).toBeLessThan(10000);
    expect(run.chaosSkills?.events.every(event => event.trigger === "army" && event.stun === 0)).toBe(true);
    expect(run.metrics.skills[0]).toBe(0);
  },
);

test.each((["김시민", "사명대사"] as const).flatMap(general =>
  (["manual", "army"] as const).map(trigger => ({ general, trigger }))))(
  "$general $trigger attacks retain their actual origin in native damage receipts",
  ({ general, trigger }) => {
    const run = chaosArena(general, 5), context = bphFxContext(run);
    if (!context) throw new Error("Missing native combat context");
    const receipts: { spellId: string; dealt: number; source: number | undefined; target: number; id: number | undefined }[] = [];
    bindBphConsumers({ ...context, pointer: { x: -1000, y: -1000 } }, [...bphConsumers(), {
      id: "quests", kinds: [], consume: () => { throw new Error("Observer only"); },
      onEvent: (_ctx, event) => {
        if (event.kind === "damage-dealt" && event.side === "enemy" && event.spellId?.startsWith("chaos:"))
          receipts.push({ spellId: event.spellId, dealt: event.dealt, source: event.source?.id, target: event.target.id, id: event.receiptId });
      },
    }], false);
    const squad = run.squads[0], wall = fortRect(run.fort);
    squad.x = CENTER.x; squad.y = wall.top - 50;
    const target = chaosEnemy(run, CENTER.x, wall.top - 60);
    if (trigger === "manual") useSkill(run, 0);
    else if (general === "김시민") chaosTicks(run, 120);
    else for (let attack = 0; attack < 12; attack++)
      chaosAfterAttack(run, { unit: squad, target, amount: 1 }, []);
    const events = run.chaosSkills?.events ?? [];
    expect(events.length).toBe(general === "김시민" ? trigger === "manual" ? 9 : 3 : trigger === "manual" ? 2 : 1);
    expect(events.every(event => event.trigger === trigger)).toBe(true);
    expect(target.hp).toBe(10000);
    chaosTicks(run, 24);
    // 김시민's Lv5 band fires at power 10 since owner bug 1033 raised it to Lv0's (was 7.5: 2.8 and 1.008).
    const amount = (general === "김시민" ? trigger === "manual" ? 56 / 15 : 1.344 : trigger === "manual" ? 3.36 : .5376)
      * BPH_SURVIVAL_TABLE.generalSkill;
    expect(receipts).toEqual([{
      spellId: `chaos:${trigger}:${general === "김시민" ? "cannon" : "bell"}`,
      dealt: expect.closeTo(amount), source: squad.id, target: target.id, id: expect.any(Number),
    }]);
    expect(10000 - target.hp).toBeCloseTo(amount);
    expect(run.metrics.skills[0]).toBe(trigger === "manual" ? 1 : 0);
  },
);

test.each([0, 1, 10, 20])("Gwak N%i militia cannot divert ladder attacks from the wall while their actors live", level => {
  const run = chaosArena("곽재우", level), wall = fortRect(run.fort);
  if (level === 0 && run.bph) run.bph = { ...run.bph, survival: null };
  const ladder = chaosEnemy(run, CENTER.x, wall.top - 8);
  ladder.ladder = true; ladder.clock = 0; ladder.speed = 24;
  // The 100-hit palisade is lighter than one 10-HP ladder blow; give the side room to show the whole blow.
  run.walls.위 = 100;
  const before = run.walls.위;
  useSkill(run, 0);
  chaosTicks(run, 45);
  expect(before - run.walls.위).toBeCloseTo(10);
  if (level === 0) {
    const ambush = run.uniqueSkills?.[0];
    if (ambush?.kind !== "ambush") throw new Error("Missing retained N0 attackers");
    expect(ambush.members).toHaveLength(4);
    expect(Object.hasOwn(run, "chaosSkills")).toBe(false);
    expect(run.chaos?.level).toBe(0);
  } else expect(run.chaosSkills?.events.some(event => event.kind === "militia" && !event.resolved)).toBe(true);
});

test.each([0, 1, 20])("Shin N%i keeps the original charge protection from native warned hits while charging", level => {
  const run = chaosArena("신립", level), squad = run.squads[0];
  if (level === 0) squad.hp = squad.maxHp = generalHp("신립", 1) * BPH_SURVIVAL_TABLE.generalHpScale;
  const health = squad.hp;
  const target = chaosEnemy(run, 245, 100);
  useSkill(run, 0);
  run.telegraphs.push({ id: run.nextId++, owner: target.id, skill: "gunner", shape: "circle",
    x: 209, y: 100, fromX: 245, fromY: 100, radius: 120,
    startedAt: run.time - 1, at: run.time + 1 / 30, damage: 10, wallDamage: 0 });
  chaosTicks(run, 1);
  expect(squad.hp).toBe(health);
  expect(run.metrics.generalsStruck).toBe(0);
  expect(squad.state).toBe("charge");
  chaosTicks(run, 3);
  expect(target.hp).toBeLessThan(10000);
  expect(target.stun).toBeGreaterThan(0);
});

test.each(["권율", "황진", "이순신"] as const)("%s N0 never allocates enhanced attack state on cast or update", general => {
  const run = chaosArena(general, 0);
  if (!run.bph) throw new Error("Missing BPH fixture");
  run.bph = { ...run.bph, survival: null };
  chaosEnemy(run, 225, 100);
  useSkill(run, 0);
  chaosTicks(run, 90);
  expect(Object.hasOwn(run, "chaosSkills")).toBe(false);
  expect(run.chaos?.level).toBe(0);
});

test("Shin N0 creates only its new clone and leaves no live skill actor after the sweep", () => {
  const { run, clones } = shinCharge(0);
  expect(run.chaosSkills!.events).toEqual(clones);
  expect(clones).toHaveLength(1);
  chaosTicks(run, 90);
  expect(run.chaosSkills!.events).toEqual([]);
});

test.each(["권율", "신립", "송상현", "황진", "곽재우", "이순신", "김시민", "사명대사"] as const)(
  "%s scheduled attacks replay with identical damage and RNG under fractional tick partitions", general => {
    const run = chaosArena(general, 20);
    chaosEnemy(run, 245, 100);
    useSkill(run, 0);
    const replay = structuredClone(run), rng = run.rng;
    for (let tick = 0; tick < 60; tick++) tickChaosSkills(run, 1 / 30, []);
    for (let tick = 0; tick < 200; tick++) tickChaosSkills(replay, .01, []);
    expect(run.chaosSkills?.tick).toBe(60);
    expect(replay.chaosSkills?.tick).toBe(60);
    expect(run.chaosSkills?.events).toEqual(replay.chaosSkills?.events);
    expect(run.enemies).toEqual(replay.enemies);
    expect([run.rng, replay.rng]).toEqual([rng, rng]);
  },
);
