import { expect, test } from "bun:test";
import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import { stillPose } from "../chaos-shows/militia";
import { skillLocations } from "../chaos-skill-geometry";
import { chaosArena, chaosEnemy, chaosTicks } from "../chaos-test-fixture";
import { MOTION } from "../motion";
import { useSkill } from "../rules";
import type { Effect } from "../rules";
import { releases } from "../skill-show";
import { AMBUSH_SHOW, castTroop, planAmbush, ringAt } from "./ambush-show";

const ring = (x: number, y: number, count: number, far = 24) => Array.from({ length: count }, (_, index) =>
  ({ x: x + Math.cos(index * Math.PI * 2 / count) * far, y: y + Math.sin(index * Math.PI * 2 / count) * far }));
const cast = { seed: 7, x: 200, y: 300, radius: 72, tier: 1, density: 1, still: false, members: ring(200, 300, 4) };

test("every militia spot and every blade of grass stays inside the real reach, even when the rules moved a member out of it", () => {
  for (const count of [4, 6]) for (const seed of [1, 7, 1593]) for (const far of [24, 90]) {
    const members = ring(cast.x, cast.y, count, far), plan = planAmbush({ ...cast, seed, tier: 3, members });
    expect(plan.shreds).toHaveLength(count * (AMBUSH_SHOW.shreds + AMBUSH_SHOW.shredsPerTier * 2));
    if (far < cast.radius) expect(plan.spots.map(({ x, y }) => ({ x, y }))).toEqual(members);
    for (const point of [...plan.spots, ...plan.shreds, ...plan.shreds.map(shred => ({ x: shred.fromX, y: shred.fromY }))])
      expect(Math.hypot(point.x - cast.x, point.y - cast.y)).toBeLessThanOrEqual(cast.radius);
  }
});

test("the scatter repeats for a seed and never draws from Math.random", () => {
  const global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    expect(planAmbush(cast)).toEqual(planAmbush(cast));
    expect(planAmbush({ ...cast, seed: 8 })).not.toEqual(planAmbush(cast));
  } finally { Math.random = global; }
});

test("with motion off nothing flies and every time is 0, and a slow device gets less grass", () => {
  const still = planAmbush({ ...cast, still: true });
  expect(still.shreds).toEqual([]);
  expect([still.burstAt, still.ringMs, ringAt(still, 50, cast.radius), ...still.spots.map(spot => spot.burstAt)].every(time => time === 0)).toBe(true);
  expect(planAmbush({ ...cast, density: .5 }).shreds).toHaveLength(4 * Math.round(AMBUSH_SHOW.shreds * .5));
});

test("the militia break cover one after another up to the burst, and each held stun lands as the shock ring reaches its foe", () => {
  const plan = planAmbush(cast), each = plan.shreds.length / plan.spots.length;
  expect(plan.spots.map(spot => spot.burstAt)).toEqual([3, 2, 1, 0].map(early => AMBUSH_SHOW.burst - early * AMBUSH_SHOW.stagger));
  plan.shreds.forEach((shred, index) => {
    expect(shred.leaveAt).toBeGreaterThanOrEqual(plan.spots[Math.floor(index / each)].burstAt);
    expect(shred.landAt).toBeGreaterThan(shred.leaveAt);
  });
  const stun = (far: number, target: number): Effect => ({ kind: "stun", x: cast.x + far, y: cast.y, value: 1, target });
  const landsAt = (effect: Effect) => ringAt(plan, Math.hypot(effect.x - cast.x, effect.y - cast.y), cast.radius);
  expect(releases([stun(0, 1), stun(36, 2), stun(72, 3), stun(71, 4)], landsAt, 67).map(release => release.at))
    .toEqual([AMBUSH_SHOW.burst, AMBUSH_SHOW.burst + AMBUSH_SHOW.ring / 2, AMBUSH_SHOW.burst + AMBUSH_SHOW.ring, AMBUSH_SHOW.burst + AMBUSH_SHOW.ring * 71 / 72]);
});

const MILITIA = CHAOS_RULES.skills.militia, HZ = CHAOS_RULES.simulationHz;
/** A real cast on the rules: the arena's 곽재우 at an army level among the foes the test places, and the militia the rules then plan. */
function realCast(level: number, foes: readonly (readonly [number, number])[]) {
  const run = chaosArena("곽재우", level), enemies = foes.map(([x, y]) => chaosEnemy(run, x, y));
  useSkill(run, 0);
  const state = run.chaosSkills;
  if (!state) throw new Error(`The rules planned no cast militia at army level ${level}`);
  return { run, state, enemies };
}

test("every militia a cast raises breaks out on the spot the rules chose, a wave at a time and never before the rules start it, and a higher army level raises more", () => {
  const raised: number[] = [], crowds: number[] = [];
  for (const level of [1, 10, 20]) {
    const band = chaosSkillBand(level), count = MILITIA.count[band], waves = MILITIA.waves[band], life = MILITIA.lifetime[band] + CHAOS_RULES.skills.afterTicks;
    // Each foe stands inside one region, so that region's militia rise on it; no foe is in reach of another rising spot, so none walks.
    const { run, state } = realCast(level, [[300, 60], [60, 340]]), seen = new Set<number>(), last = (waves - 1) * MILITIA.interval + life;
    let crowd = 0;
    for (let tick = 0; tick <= last; tick++) {
      const members = castTroop(state).members, risen = members.filter(member => !seen.has(member.id)), wave = tick / MILITIA.interval;
      const fresh = state.events.filter(event => event.kind === "militia" && event.startedTick === tick).sort((a, b) => a.id - b.id);
      expect(risen.map(({ x, y }) => ({ x, y }))).toEqual(Number.isInteger(wave) && wave < waves ? fresh.map(event => ({ x: event.x, y: event.y })) : []);
      for (let a = 0; a < fresh.length; a++) for (let b = a + 1; b < fresh.length; b++)
        expect(Math.hypot(fresh[a].from.x - fresh[b].from.x, fresh[a].from.y - fresh[b].from.y)).toBeGreaterThanOrEqual(MILITIA.spacing - 1e-9);
      for (const member of risen) seen.add(member.id);
      crowd = Math.max(crowd, members.length);
      if (tick === last - 1) expect(members).toHaveLength(count);
      chaosTicks(run, 1);
    }
    expect(castTroop(state).members).toEqual([]);
    expect(seen.size).toBe(count * waves);
    expect(crowd).toBe(count * Math.min(waves, Math.ceil(life / MILITIA.interval)));
    raised.push(seen.size); crowds.push(crowd);
  }
  expect(raised[0] < raised[1] && raised[1] < raised[2]).toBe(true);
  expect(crowds[0] < crowds[1] && crowds[1] < crowds[2]).toBe(true);
});

test("a cast militia's blow is the rules' own strike, and the drawn reach and cleave are the ones the rules walked and struck with", () => {
  // Lv15 is the four-man band (the former Lv10 row, one band later).
  const level = 15, count = MILITIA.count[chaosSkillBand(level)], near = MILITIA.radius - 4, beyond = MILITIA.radius + 2;
  // The rules reserve spaced ground per region; one probe cast on an empty field reads the real wave-zero rising spots.
  const probe = realCast(level, []);
  const [first, second, , last] = probe.state.events.filter(event => event.kind === "militia" && event.wave === 0)
    .sort((a, b) => a.ordinal - b.ordinal).map(event => ({ x: event.from.x, y: event.from.y }));
  const { run, state, enemies: [onSpot, inCleave, outOfCleave, inReach, outOfReach] } = realCast(level, [
    [second.x, second.y], [second.x + near, second.y], [second.x - beyond, second.y],
    // Lv15's area puts the last spot by the castle's west wall, so its in-reach foe stands below it on open ground.
    [last.x, last.y + MILITIA.reach - 6], [first.x + MILITIA.reach + 4, first.y]]);
  const rising = state.events.filter(event => event.kind === "militia" && event.wave === 0)
    .sort((a, b) => a.ordinal - b.ordinal);

  chaosTicks(run, 10);
  const early = castTroop(state), chaser = early.members[0], walker = early.members[3];
  expect(early.members).toHaveLength(count);
  // Every militia chases its nearest live foe: the cell-zero man has already left his rising spot,
  // walking at most the rules' pace for the ticks elapsed.
  const left = Math.hypot(chaser.x - first.x, chaser.y - first.y);
  expect(left).toBeGreaterThan(8);
  expect(left).toBeLessThanOrEqual(10 * MILITIA.speed / HZ + 1e-9);
  expect(walker.y).toBeGreaterThan(rising[3].from.y);
  // It has walked off its rising spot without striking yet, so it has no blow and aims at nothing.
  expect(walker).toMatchObject({ struckTick: -Infinity, aimX: walker.x, aimY: walker.y });
  expect(Math.hypot(inReach.x - rising[3].from.x, inReach.y - rising[3].from.y)).toBeLessThanOrEqual(early.reach);
  expect(Math.hypot(outOfReach.x - first.x, outOfReach.y - first.y)).toBeGreaterThan(early.reach);

  chaosTicks(run, MILITIA.attackEvery - state.tick - 1);
  const swings = chaosTicks(run, 1).filter(effect => effect.kind === "swing" && effect.squad === undefined), troop = castTroop(state);
  // With map-wide chase all four converged members strike on the shared attack tick.
  expect(swings).toHaveLength(4);
  for (const swing of swings)
    expect(troop.members.filter(member => member.x === swing.fromX && member.y === swing.fromY).map(({ aimX, aimY, struckTick }) => ({ aimX, aimY, struckTick })))
      .toEqual([{ aimX: swing.x, aimY: swing.y, struckTick: state.tick }]);
  const idle = troop.members.filter(member => member.struckTick !== state.tick);
  expect(idle).toHaveLength(troop.members.length - swings.length);
  for (const member of idle) expect(member).toMatchObject({ struckTick: -Infinity, aimX: member.x, aimY: member.y });

  const striker = troop.members[1], gap = (foe: { readonly x: number; readonly y: number }) => Math.hypot(foe.x - striker.aimX, foe.y - striker.aimY);
  expect([onSpot, inCleave, outOfCleave].map(foe => foe.hp < foe.maxHp)).toEqual([true, true, false]);
  expect(gap(inCleave)).toBeLessThanOrEqual(striker.cleave);
  expect(gap(outOfCleave)).toBeGreaterThan(striker.cleave);

  // Its cluster falls, so the striker re-targets the next nearest live foe anywhere on the field and keeps chasing.
  for (const foe of [onSpot, inCleave, outOfCleave]) foe.hp = 0;
  chaosTicks(run, MILITIA.attackEvery);
  const reAimed = castTroop(state).members.find(member => member.id === striker.id);
  expect(reAimed?.struckTick).not.toBe(-Infinity);
  expect([inReach, outOfReach].some(foe =>
    Math.hypot((reAimed?.aimX ?? 0) - foe.x, (reAimed?.aimY ?? 0) - foe.y) < 1e-6)).toBe(true);
});

test("with motion off a cast militia shows a real blow in whole rules ticks: the attack pose from the tick the rules strike, for as long as a spear blow lasts", () => {
  const { run, state } = realCast(20, [[300, 60], [60, 340]]);
  chaosTicks(run, MILITIA.attackEvery);
  const struck = castTroop(state).members.find(member => member.struckTick === state.tick);
  if (!struck) throw new Error("No militia struck on the first attack tick");
  const blowTicks = Math.ceil((MOTION.spearContactMs + MOTION.spearRecoveryMs) * HZ / 1000), posed: boolean[] = [];
  const idle = stillPose({ ...struck, struckTick: -Infinity }, castTroop(state), false).frame;
  for (let tick = 0; tick <= blowTicks; tick++) {
    const troop = castTroop(state), body = troop.members.find(member => member.id === struck.id);
    if (!body) throw new Error("The militia left before its blow ended");
    posed.push(stillPose(body, troop, false).frame !== idle);
    chaosTicks(run, 1);
  }
  expect(posed).toEqual([...Array.from({ length: blowTicks }, () => true), false]);
});
