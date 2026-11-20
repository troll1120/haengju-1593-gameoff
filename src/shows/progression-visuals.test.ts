import { expect, test } from "bun:test";
import { chaosArena } from "../chaos-test-fixture";
import type { SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";
import { planBolt, strokeBolt } from "./dongnae-show";
import { planRam } from "./turtle-ship-show";

function looks() {
  return [1, 8, 20].map(level => {
    const run = chaosArena("이순신", level), squad = run.squads[0];
    squad.awakened = level === 20 ? 2 : 0;
    squad.tier = squad.awakened + 1;
    return skillVfx(run, squad);
  });
}

test("the same turtle ram grows its decoration without changing held damage or its clock", () => {
  const plans = looks().map(vfx => planRam({
    seed: 144, pass: 0, from: { x: 24, y: 300 }, to: { x: 422, y: 300 }, half: 44,
    density: 1, still: false, vfx,
    results: [{ kind: "hit", x: 180, y: 300, value: 120, target: 7 }],
  }));
  expect(plans[0].guns.length).toBeLessThan(plans[1].guns.length);
  expect(plans[1].guns.length).toBeLessThan(plans[2].guns.length);
  for (const plan of plans) {
    expect(plan.times).toEqual(plans[2].times);
    expect(plan.rams).toEqual(plans[2].rams);
    expect(plan.total).toBe(120);
    expect(plan.passes).toBe(plans[2].passes);
    // Motes belong to SkillStage's profile gate, not a second plan density gate.
    expect(plan.chips).toEqual(plans[2].chips);
  }
});

test("lightning gains forks and glow while remaining pinned to the real strike point", () => {
  const profiles = looks();
  const event = { id: 9, from: { x: 180, y: 0 }, to: { x: 220, y: 600 }, radius: 40 };
  const bolts = profiles.map(vfx => planBolt(event, vfx));
  expect(bolts[0].forks.length).toBeLessThan(bolts[2].forks.length);
  for (const bolt of bolts) {
    expect(bolt.channel.length).toBe(bolts[2].channel.length);
    const foot = bolt.channel[bolt.channel.length - 1];
    expect(foot.y + foot.height).toBe(event.to.y);
    expect(foot.x).toBeLessThanOrEqual(event.to.x);
    expect(foot.x + foot.width).toBeGreaterThanOrEqual(event.to.x);
  }
  const draws = profiles.map((vfx, index) => {
    let alpha = 1;
    const fills: number[] = [];
    const trails = {
      fillStyle(_paint: number, next: number) { alpha = next; return trails; },
      fillRect() { fills.push(alpha); return trails; },
    };
    strokeBolt({ trails } as unknown as SkillStage, bolts[index], .05, true, vfx);
    return fills;
  });
  expect(Math.max(...draws[0])).toBe(profiles[0].alpha);
  expect(draws[0].length).toBe(bolts[0].channel.length);
  expect(draws[2].length).toBeGreaterThan(bolts[2].channel.length);
  expect(Math.max(...draws[2])).toBe(1);
});

test("Lv1, Lv8 and Lv20 lightning render the same native channel geometry with growth alpha", () => {
  const profiles = looks(), event = { id: 9, from: { x: 180, y: 0 }, to: { x: 220, y: 600 }, radius: 40 };
  const draws = profiles.map(vfx => {
    let alpha = 1;
    const fills: { x: number; y: number; width: number; height: number; alpha: number }[] = [];
    const trails = {
      fillStyle(_paint: number, next: number) { alpha = next; return trails; },
      fillRect(x: number, y: number, width: number, height: number) { fills.push({ x, y, width, height, alpha }); return trails; },
    };
    strokeBolt({ trails } as unknown as SkillStage, planBolt(event, vfx), .05, false, vfx);
    return fills;
  });
  const geometry = (fills: typeof draws[number]) => fills.map(({ alpha: _alpha, ...rect }) => rect);
  expect(geometry(draws[0])).toEqual(geometry(draws[2]));
  expect(geometry(draws[1])).toEqual(geometry(draws[2]));
  for (const [index, fills] of draws.entries()) {
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.every(fill => fill.width >= 1 && fill.height >= 1 && Number.isInteger(fill.width) && Number.isInteger(fill.height))).toBe(true);
    expect(fills.every(fill => fill.alpha === .55 * profiles[index].alpha)).toBe(true);
  }
});
