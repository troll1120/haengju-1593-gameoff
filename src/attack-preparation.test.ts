import { expect, test } from "bun:test";
import { attackCycle, attackShare, drawAttackPreparation } from "./attack-preparation";
import type { HealthBar } from "./health-bars";
import { chaosArena, chaosEnemy } from "./chaos-test-fixture";
import { advance } from "./rules";

const every = 1.2, windup = .22, dt = 1 / 60;

test("a ready attack gauge stays below its own head even when another unit covers that slot", () => {
  for (const leader of [false, true]) {
    const rects: number[][] = [], occupied: HealthBar[] = [{ x: 0, y: 0, width: 500, height: 500 }];
    const drawing = {
      fillStyle() { return this; },
      fillRect(...rect: number[]) { rects.push(rect); return this; },
    };
    drawAttackPreparation(drawing, { x: 100, y: 200 }, occupied,
      { clock: 0, strikeAt: 0 }, 0, { windFor: 220, cycle: attackCycle() }, leader);
    const width = leader ? 40 : 22;
    expect(rects).toEqual([[100 - width / 2, 200, width, 4], [101 - width / 2, 201, width - 2, 2],
      [101 - width / 2, 201, width - 2, 2]]);
    expect(occupied.at(-1)).toEqual({ x: 100 - width / 2, y: 200, width, height: 4 });
  }
});

/** Replays combat's clock contract for one unit: windup start resets clock to `every`, the hit clears strikeAt, the clock
 *  then counts down and the next windup starts the same tick it reaches zero. */
function swings(count: number) {
  const cycle = attackCycle(), shares: { time: number; share: number | null; hit: boolean }[] = [];
  let time = 0, clock = 0, strikeAt = 0;
  for (let n = 0; n < count;) {
    let hit = false;
    if (strikeAt === 0 && (clock -= dt) <= 0) { clock = every; strikeAt = time + windup; }
    else if (strikeAt > 0 && time >= strikeAt) { strikeAt = 0; hit = true; n++; }
    shares.push({ time, share: attackShare(cycle, clock, strikeAt, time, windup * 1000), hit });
    time += dt;
  }
  return { cycle, shares, time, clock };
}

test("between two hits the bar fills steadily from empty to full over the real interval", () => {
  const { shares } = swings(3);
  const hits = shares.flatMap((s, i) => s.hit ? [i] : []);
  const between = shares.slice(hits[1], hits[2] + 1);
  expect(between[0].share).toBe(0);
  for (let i = 1; i < between.length - 1; i++) expect(between[i].share!).toBeGreaterThanOrEqual(between[i - 1].share!);
  expect(between.at(-2)!.share!).toBeGreaterThan(.95);
  expect(between.at(-1)!.time - between[0].time).toBeCloseTo(every + windup, 1);
});

test("a unit ready before its first target arrives already has a full bar", () => {
  const cycle = attackCycle();
  expect(attackShare(cycle, 0, 0, 0, 220)).toBe(1);
  expect(attackShare(cycle, every, .22, .11, 220)).toBe(1);
  expect(attackShare(cycle, every, 0, .23, 220)).toBe(0);
});

test("first cooldown fills for five seconds without enemies and waits for a target", () => {
  const run = chaosArena("권율", 0), squad = run.squads[0], cycle = attackCycle();
  const start = run.time;
  squad.clock = every;
  expect(attackShare(cycle, squad.clock, 0, run.time, 220)).toBe(0);
  for (let tick = 0; tick < 300; tick++) {
    advance(run, dt);
    const share = attackShare(cycle, squad.clock, squad.strikeAt, run.time, 220);
    if (tick === 30) expect(share!).toBeGreaterThan(0);
    expect(run.enemies).toHaveLength(0);
    expect(squad.strikeAt).toBe(0);
  }
  expect(run.time - start).toBeCloseTo(5, 6);
  expect(attackShare(cycle, squad.clock, 0, run.time, 220)).toBe(1);
  const target = chaosEnemy(run, squad.x + 30, squad.y);
  advance(run, dt);
  expect(squad.strikeAt).toBeGreaterThan(run.time);
  expect(target.hp).toBe(target.maxHp);
  expect(attackShare(cycle, squad.clock, squad.strikeAt, run.time, 220)).toBe(1);
});

test("a first observed windup without a previous readiness frame shows its progress", () => {
  expect(attackShare(attackCycle(), every, .22, .11, 220)).toBeCloseTo(.5, 5);
});

test("a unit that is ready with no target holds a full bar until it swings again", () => {
  const { cycle, time } = swings(1);
  let clock = every;
  for (let t = time; clock > 0; t += dt) attackShare(cycle, clock -= dt, 0, t, 220);
  expect(attackShare(cycle, 0, 0, time + 5, 220)).toBe(1);
  expect(attackShare(cycle, every, time + 5.22, time + 5.1, 220)).toBe(1);
  expect(attackShare(cycle, every, 0, time + 5.23, 220)).toBe(0);
});
