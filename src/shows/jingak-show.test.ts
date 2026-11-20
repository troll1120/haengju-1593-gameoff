import { expect, test } from "bun:test";
import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import { chaosArena, chaosEnemy, chaosTicks } from "../chaos-test-fixture";
import type { Point } from "../geometry";
import { useSkill } from "../rules";
import { castStomps, JINGAK_SHOW, planJingak, waveAt, waveFront } from "./jingak-show";

const cast = { seed: 7, x: 200, y: 300, radius: 95, tier: 1, density: 1, still: false };
const LEVELS = [1, 5, 10, 15, 20] as const;
function realCast(level: number) {
  const run = chaosArena("황진", level);
  useSkill(run, 0);
  return { run, scheduled: (run.chaosSkills?.events ?? []).filter(event => event.kind === "stomps") };
}

test("every crack cell and dust spot stays inside the real reach, and dust rises as the shockwave reaches it", () => {
  for (const tier of [1, 2, 3]) for (const seed of [1, 7, 1593]) {
    const stomp = { ...cast, seed, tier, radius: 95 * (1 + .12 * (tier - 1)) }, plan = planJingak(stomp);
    expect(plan.cracks.length).toBeGreaterThan(60);
    expect(plan.dust).toHaveLength(JINGAK_SHOW.dust.reduce((sum, ring) => sum + ring.count, 0));
    for (const cell of plan.cracks) {
      expect([cell.x % 4, cell.y % 4]).toEqual([0, 0]);
      expect(cell.far).toBe(Math.hypot(cell.x + 2 - stomp.x, cell.y + 2 - stomp.y));
      for (const [cornerX, cornerY] of [[0, 0], [4, 0], [0, 4], [4, 4]])
        expect(Math.hypot(cell.x + cornerX - stomp.x, cell.y + cornerY - stomp.y)).toBeLessThanOrEqual(stomp.radius);
    }
    expect(plan.cracks.map(cell => cell.far)).toEqual(plan.cracks.map(cell => cell.far).sort((a, b) => a - b));
    for (const spot of plan.dust) {
      const far = Math.hypot(spot.x - stomp.x, spot.y - stomp.y);
      expect(far).toBeLessThanOrEqual(stomp.radius);
      expect(spot.at).toBeCloseTo(waveAt(far, stomp.radius, false), 6);
    }
  }
});

test("the plan repeats for a seed and never draws from Math.random", () => {
  const global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    expect(planJingak(cast)).toEqual(planJingak(cast));
    expect(planJingak({ ...cast, seed: 8 })).not.toEqual(planJingak(cast));
  } finally { Math.random = global; }
});

test("a hit lands as the shockwave reaches its foe: later with distance and never after the wave has run out", () => {
  const { gather, wave } = JINGAK_SHOW;
  let earlier = waveAt(0, cast.radius, false);
  expect(earlier).toBe(gather);
  for (let distance = 1; distance <= cast.radius; distance++) {
    const at = waveAt(distance, cast.radius, false);
    expect(at).toBeGreaterThan(earlier);
    expect(at).toBeLessThanOrEqual(gather + wave);
    expect(waveFront(at - gather, cast.radius)).toBeCloseTo(distance, 6);
    earlier = at;
  }
  expect(waveAt(cast.radius, cast.radius, false)).toBe(gather + wave);
  expect(waveAt(cast.radius * 3, cast.radius, false)).toBe(gather + wave);
  expect(waveFront(wave * 3, cast.radius)).toBe(cast.radius);
});

test("with motion off every hit shows at once and nothing is planned, and a slow device gets fewer cracks and less dust", () => {
  for (const distance of [0, 40, cast.radius]) expect(waveAt(distance, cast.radius, true)).toBe(0);
  expect(planJingak({ ...cast, still: true })).toEqual({ cracks: [], dust: [] });
  const full = planJingak(cast), slow = planJingak({ ...cast, density: .5 });
  expect(slow.dust.length).toBeLessThan(full.dust.length);
  expect(slow.cracks.length).toBeLessThan(full.cracks.length);
});

test("each wave of the cast's other stomps shows together on the rules' separate spots from the tick it starts until the rules end it, and a higher level shows more at once in more waves", () => {
  let fewerAtOnce = 0, fewerWaves = 0;
  for (const level of LEVELS) {
    const { run, scheduled } = realCast(level), rules = CHAOS_RULES.skills.stomps, band = chaosSkillBand(level);
    const shownOn = new Map<number, number[]>(), sceneAt = new Map<number, ReturnType<typeof castStomps>["stomps"]>();
    while (run.chaosSkills?.events.length) {
      const scene = castStomps(run.chaosSkills);
      sceneAt.set(scene.tick, scene.stomps);
      for (const stomp of scene.stomps) shownOn.set(stomp.id, [...(shownOn.get(stomp.id) ?? []), scene.tick]);
      chaosTicks(run, 1);
    }
    for (const event of scheduled) {
      const ticks = shownOn.get(event.id) ?? [];
      expect([ticks[0], ticks.at(-1), ticks.length]).toEqual([event.startedTick, event.untilTick - 1, event.untilTick - event.startedTick]);
    }
    const waves = [...new Set(scheduled.map(event => event.wave))], shownAtItsStart = waves.map(wave => {
      const landing = scheduled.filter(event => event.wave === wave), ids = new Set(landing.map(event => event.id));
      const shown = (sceneAt.get(landing[0].startedTick) ?? []).filter(stomp => ids.has(stomp.id));
      expect(shown.map(stomp => [stomp.x, stomp.y, stomp.radius, stomp.landsTick])).toEqual(landing.map(event => [event.to.x, event.to.y, event.radius, event.impactTick]));
      return new Set(shown.map(stomp => `${stomp.x},${stomp.y}`)).size;
    });
    expect(shownAtItsStart).toEqual(Array.from({ length: rules.waves[band] }, () => rules.count[band]));
    expect([shownAtItsStart[0] > fewerAtOnce, waves.length > fewerWaves]).toEqual([true, true]);
    fewerAtOnce = shownAtItsStart[0]; fewerWaves = waves.length;
  }
});

test("the foes the rules strike as a wave lands are exactly those standing inside a drawn reach, and none is struck while its picture is still coming", () => {
  for (const level of LEVELS) {
    const { run, scheduled } = realCast(level), first = castStomps(run.chaosSkills).stomps, lands = first[0].landsTick;
    const aPixelEitherSideOfEachRim = first.flatMap(stomp => [-1, 1].flatMap(past => [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]): Point => ({ x: stomp.x + dx * (stomp.radius + past), y: stomp.y + dy * (stomp.radius + past) }))));
    const foes = aPixelEitherSideOfEachRim.map(at => chaosEnemy(run, at.x, at.y));
    const struck = () => scheduled.filter(event => event.wave === 0).flatMap(event => event.hits).filter((id, index, ids) => ids.indexOf(id) === index).sort((a, b) => a - b);
    const stillComing = () => { const scene = castStomps(run.chaosSkills); return scene.stomps.filter(stomp => scene.tick < stomp.landsTick).length; };
    chaosTicks(run, lands - 1);
    expect([stillComing(), struck()]).toEqual([first.length, []]);
    const standingInside = foes.filter(foe => first.some(stomp => Math.hypot(foe.x - stomp.x, foe.y - stomp.y) <= stomp.radius)).map(foe => foe.id).sort((a, b) => a - b);
    expect([standingInside.length > 0, standingInside.length < foes.length]).toEqual([true, true]);
    chaosTicks(run, 1);
    expect([stillComing(), struck()]).toEqual([0, standingInside]);
  }
});

test("only 황진's own scheduled stomps are drawn: a fresh Lv1 cast shows just its own first stomps, and another general's started attacks never show as stomps", () => {
  const plain = realCast(1), thunder = chaosArena("송상현", 20), band = chaosSkillBand(1);
  useSkill(thunder, 0);
  const first = plain.scheduled.filter(event => event.startedTick <= 0);
  expect(first).toHaveLength(CHAOS_RULES.skills.stomps.count[band]);
  expect(castStomps(plain.run.chaosSkills).stomps.map(stomp => stomp.id)).toEqual(first.map(event => event.id));
  expect(thunder.chaosSkills?.events.filter(event => event.startedTick <= 0).map(event => event.kind)).toContain("thunder");
  expect(castStomps(thunder.chaosSkills).stomps).toEqual([]);
});
