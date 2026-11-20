import { expect, test } from "bun:test";
import { deferFixtureBarracks } from "./bph-barracks-fixture";
import { BPH_WAVES } from "./bph-data";
import { bphSurvivalBossGroup, bphSurvivalPlan } from "./bph-survival";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { createBphRun } from "./bph-session";
import { ensureBphSave } from "./bph-session";
import { freshMeta } from "./meta";
import { advance } from "./rules";
import { setFieldSize } from "./geometry";
import { createBphBattle } from "./bph-combat";
import { freshBphSave } from "./bph-save";
import { createRun } from "./rules";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";

const chapters = ["WaveChapter1", "WaveChapter2", "WaveChapter3", "WaveChapter4"] as const;
const regularBatchCounts = [
  180, 180, 148, 148, 140, 140, 132, 132, 176, 176, 220, 220,
  280, 280, 360, 360, 460, 460, 510, 510, 510, 510, 510, 510,
  590, 590, 590, 590, 670, 670,
];
setFieldSize(390, 844);
test.each(chapters)("%s supplies its own enemies throughout all thirty half-minute windows", wave => {
  const roster = new Set<string>(BPH_WAVES[wave].map(burst => burst.id));

  const plan = bphSurvivalPlan(wave);

  const regular = plan.filter(entry => !entry.boss && !entry.elite && !entry.rush);
  const outsideRoster = regular.filter(entry => !roster.has(entry.profileId));
  // Beyond the two patrol swaps, only the roster tiers (castle 1040) field outside profiles.
  const borrowed: Readonly<Record<typeof chapters[number], readonly string[]>> = {
    WaveChapter1: ["Monster4_Bandit", "Monster4_Sentinel"],
    WaveChapter2: ["Monster4_Bandit"],
    WaveChapter3: ["Monster4_Bandit", "Monster6_Spider"],
    WaveChapter4: [],
  };
  expect([...new Set(outsideRoster.map(entry => entry.profileId))].sort()).toEqual([...borrowed[wave]].sort());
  expect(outsideRoster.filter(entry => entry.at < 180).map(entry => [entry.profileId, Math.floor(entry.at)]))
    .toEqual(wave === "WaveChapter1" ? [["Monster4_Bandit", 60], ["Monster4_Sentinel", 150]] : []);
  expect(outsideRoster.some(entry => entry.at >= 180)).toBe(wave !== "WaveChapter4");
  let total = 0;
  for (const [batch, expected] of regularBatchCounts.entries()) {
    const start = batch * BPH_SURVIVAL_TABLE.batchSeconds;
    const spawns = regular.filter(entry => entry.at >= start && entry.at < start + BPH_SURVIVAL_TABLE.batchSeconds);
    const count = wave === "WaveChapter4" && start < BPH_SURVIVAL_TABLE.chapter4Opening.until
      ? 12 : expected;
    expect(spawns).toHaveLength(count);
    total += count;
  }
  expect(regular).toHaveLength(total);
  expect(plan.filter(entry => entry.boss).map(entry => [entry.at, entry.final])).toEqual([
    [180, false], [360, false], [540, false], [540, false], [720, false], [720, false], [810, true], [810, true], [810, true],
  ]);
  expect(plan.every(entry => entry.at > 0 && entry.at <= 900)).toBe(true);
});

test("C1 patrols replace one Raider at each authored cadence without inheriting its strength", () => {
  const patrols = bphSurvivalPlan("WaveChapter1").filter(entry => entry.at < 180 &&
    (entry.profileId === "Monster4_Bandit" || entry.profileId === "Monster4_Sentinel"));
  expect(patrols).toHaveLength(2);
  const expected = [
    ["Monster4_Bandit", "samurai", 60 + 3 * 30 / 149, .024, .215, .0128],
    ["Monster4_Sentinel", "guard", 150 + 30 / 141, .0792, .44, .024],
  ] as const;
  for (const [index, [id, kind, at, hp, unitDamage, castleDamage]] of expected.entries()) {
    const actual = patrols[index];
    expect(actual).toMatchObject({ profileId: id, kind, boss: false });
    expect(actual.at).toBeCloseTo(at, 10);
    expect(actual.hp).toBeCloseTo(hp, 10);
    expect(actual.unitDamage).toBeCloseTo(unitDamage, 10);
    expect(actual.castleDamage).toBeCloseTo(castleDamage, 10);
  }
});

function ending(chapter = 0) {
  const meta = freshMeta();
  ensureBphSave(meta).chapter = chapter;
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: [] });
  const battle = run.bph;
  if (!battle?.survival) throw new TypeError("Missing survival battle");
  // The last authored spawn is already past; model a cleared final battlefield.
  run.time = 899.95;
  battle.survival.cursor = bphSurvivalPlan(battle.waveId).length;
  return run;
}
test.each([0, 1, 2, 3])("chapter %s wins at exactly 900 even without a boss record", chapter => {
  const run = ending(chapter);

  advance(run, .1);

  expect(run.time).toBe(900);
  expect(run.phase).toBe("won");
  expect(run.metrics.bosses).toEqual([]);
});
test("castle defeat has precedence on the deadline tick", () => {
  const run = ending();
  run.base = 0;

  advance(run, .1);

  expect(run.time).toBe(900);
  expect(run.phase).toBe("lost");
});
test("clearing all recorded bosses before the deadline does not win", () => {
  const run = ending();
  run.time = 880;
  run.metrics.bosses.push({ art: "konishi", final: false, appeared: 720, fallen: 870, phase2: null, dealt: 0 });

  advance(run, .05);

  expect(run.phase).toBe("playing");
});
test.each([0, 3])("chapter %s first boss is this run's drawn commander with its own art", chapter => {
  const run = ending(chapter), battle = run.bph;
  if (!battle?.survival) throw new TypeError("Missing survival battle");
  run.time = 179.95;
  battle.survival.cursor = bphSurvivalPlan(battle.waveId).findIndex(entry => entry.at >= 180);

  advance(run, .1);

  const [commander] = bphSurvivalBossGroup(battle.survival, 0), boss = run.enemies.find(enemy => enemy.boss);
  expect(BPH_SURVIVAL_TABLE.commanders as readonly string[]).toContain(commander);
  expect(boss).toMatchObject({ bphProfileId: commander, appearedAt: 180 });
  expect(boss?.bossArt).toBeDefined();
  expect(run.metrics.bosses).toEqual([{ art: boss?.bossArt ?? null, final: false, appeared: 180, fallen: null, phase2: null, dealt: 0 }]);
});
test("identical seed and fixed input reproduce combat, while a different seed changes it", () => {
  const replay = (seed: number) => {
    const run = createBphRun(freshMeta(), { seed, general: "권율", upgrades: [] });
    for (let tick = 0; tick < 400; tick++) advance(run, .05);
    return { time: run.time, rng: run.rng, base: run.base, enemies: run.enemies,
      squads: run.squads, kills: run.kills, gold: run.gold };
  };

  const actual = replay(7), repeated = replay(7), changed = replay(8);

  expect(repeated).toEqual(actual);
  expect(changed).not.toEqual(actual);
});

test.each([false, true])("new and filling transports preserve passenger HP with E1=%s", e1 => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율",
    upgrades: e1 ? BPH_UPGRADE_NODES.Mod_MonsterHpAndDamage125.effects : [] });
  deferFixtureBarracks(run);
  run.squads = []; run.shieldUntil = Infinity;
  const sizes = new Map<number, number>();
  let sawNew = false, sawAddition = false;

  for (let tick = 0; tick < 1200; tick++) {
    advance(run, .05);
    for (const ship of run.enemies.filter(enemy => enemy.cargo?.length)) {
      const cargo = ship.cargo;
      if (!cargo) throw new TypeError("Transport cargo missing");
      const previous = sizes.get(ship.id);
      sawNew ||= previous === undefined;
      sawAddition ||= previous !== undefined && cargo.length > previous;
      expect(ship.maxHp).toBeCloseTo(cargo.reduce((sum, enemy) => sum + enemy.maxHp / 2, 0), 8);
      sizes.set(ship.id, cargo.length);
    }
  }

  expect({ sawNew, sawAddition }).toEqual({ sawNew: true, sawAddition: true });
});
test("a partly filled transport departs at the next half-minute boundary", () => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  run.squads = []; run.shieldUntil = Infinity;
  for (let tick = 0; tick < 400 && !run.enemies.some(enemy => enemy.cargo?.length && !enemy.sailing); tick++)
    advance(run, .05);
  const ship = run.enemies.find(enemy => enemy.cargo?.length && !enemy.sailing), battle = run.bph;
  if (!ship || !battle?.survival) throw new TypeError("Missing partially filled transport");
  run.time = 29.99; run.enemies = [ship];
  battle.survival.cursor = bphSurvivalPlan(battle.waveId).findIndex(entry => entry.at >= 30);
  const y = ship.y;

  advance(run, .05);

  expect(ship.sailing).toBe(true);
  expect(ship.y).toBeLessThan(y);
});

test("non-survival rift battles retain tick-time boss appearance", () => {
  const run = createRun(7);
  run.bph = createBphBattle(freshBphSave(7), [], "WaveRiftDeath");
  run.squads = []; run.enemies = []; run.shieldUntil = Infinity;
  run.time = 92.99;

  advance(run, .05);

  expect(run.bph.survival).toBeNull();
  expect(run.metrics.bosses[0].appeared).toBe(run.time);
});
