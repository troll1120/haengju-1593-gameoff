import { expect, test } from "bun:test";
import { CHAOS_LEVELS, CHAOS_RULES } from "../chaos-contract";
import type { ChaosMilitia, ChaosMods, ChaosState } from "../chaos-contract";
import { chaosArena, chaosEnemy, chaosTicks } from "../chaos-test-fixture";
import { MOTION } from "../motion";
import { PALETTE } from "../presentation";
import { useSkill } from "../rules";
import { castTroop } from "../shows/ambush-show";
import { armyTroop, MILITIA_SHOW, MilitiaBodies, militiaMods, militiaPose, netPhase, planBlow, planPop, reachNet, stillPose, TROOP_MOTES } from "./militia";
import type { MilitiaCanvas } from "./militia";

const MOVING = { motion: true, flash: true }, STILL = { motion: false, flash: false }, HZ = CHAOS_RULES.simulationHz;

function sample(level: number): ChaosState {
  const mods = CHAOS_LEVELS["곽재우"][level] as ChaosMods;
  const member = (id: number, x: number, y: number, aimX: number, aimY: number): ChaosMilitia =>
    ({ id, x, y, startedTick: 40, untilTick: 40 + (mods.general === "곽재우" ? mods.lifetime : 0), nextTick: 70, aimX, aimY, struckTick: 64 });
  return { general: "곽재우", level, mods, tick: 66, remainder: .01, xp: 0, hitXp: {}, feedWindow: -1, feeds: 0, attacks: 0, rangedAttacks: 0, kills: 9,
    trails: [], rings: [], pools: [], fleet: [], orbitHits: {}, pendingTrails: [], stomps: [], nextFleetTick: 0, nextBeltTick: 0, militiaGroup: 1,
    militia: [member(1, 120, 300, 150, 280), member(2, 160, 320, 150, 280), member(3, 300, 140, 250, 160), member(4, 300, 140, 330, 120)],
    pendingMilitia: [{ at: { x: 210, y: 420 }, dueTick: 67 }] };
}

test("the reach outline, the cleave ring and every chip stay on the real reach and cleave read from the army state", () => {
  const rings: number[] = [];
  for (const level of [10, 20]) {
    const state = sample(level), mods = militiaMods(state)!, troop = armyTroop(state, mods);
    expect(troop.members.map(({ id, x, y }) => ({ id, x, y }))).toEqual(state.militia.map(({ id, x, y }) => ({ id, x, y })));
    for (const phase of [0, .37]) {
      const dots = reachNet(troop.members, troop.reach, MILITIA_SHOW.net.gap, phase);
      expect(dots.length).toBeGreaterThan(0);
      for (const dot of dots) {
        const gaps = state.militia.map(member => Math.hypot(dot.x - member.x, dot.y - member.y));
        expect(Math.min(...gaps)).toBeCloseTo(mods.reach, 6);
        expect(gaps.every(gap => gap > mods.reach - 1e-6)).toBe(true);
      }
    }
    for (const [index, member] of troop.members.entries()) for (const volley of [false, true]) {
      const plan = planBlow({ seed: index + 1, from: member, aim: { x: member.aimX, y: member.aimY }, cleave: member.cleave, volley, density: 1, channels: MOVING });
      expect([plan.x, plan.y, plan.ring]).toEqual([member.aimX, member.aimY, mods.cleaveRadius]);
      expect(plan.chips).toHaveLength(volley ? MILITIA_SHOW.volleyChips : MILITIA_SHOW.chips);
      for (const chip of plan.chips)
        expect(Math.hypot(chip.x + chip.vx * chip.life / 1000 - member.aimX, chip.y + chip.vy * chip.life / 1000 - member.aimY)).toBeLessThan(mods.cleaveRadius);
    }
    rings.push(mods.cleaveRadius);
  }
  expect(rings[1]).toBeGreaterThan(rings[0]);
  expect(militiaMods({ mods: CHAOS_LEVELS["사명대사"][20] as ChaosMods })).toBeUndefined();
});

test("the decoration repeats for a seed and never draws from Math.random", () => {
  const global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    const blow = { seed: 7, from: { x: 100, y: 200 }, aim: { x: 130, y: 190 }, cleave: militiaMods(sample(20))!.cleaveRadius, volley: true, density: 1, channels: MOVING };
    expect(planBlow(blow)).toEqual(planBlow(blow));
    expect(planBlow({ ...blow, seed: 8 })).not.toEqual(planBlow(blow));
    const pop = { seed: 3, at: { x: 50, y: 60 }, breakout: MILITIA_SHOW.breakout.cast, density: 1, channels: MOVING };
    expect(planPop(pop)).toEqual(planPop(pop));
    expect(planPop({ ...pop, seed: 4 })).not.toEqual(planPop(pop));
    // Only a cast's breakout throws leaves, and they are still in the air when its grass has fallen back.
    const grass = planPop(pop).filter(chip => !chip.leaf), leaves = planPop(pop).filter(chip => chip.leaf);
    expect(Math.min(...leaves.map(chip => chip.life))).toBeGreaterThan(Math.max(...grass.map(chip => chip.life)));
    expect(planPop({ ...pop, breakout: MILITIA_SHOW.breakout.army }).some(chip => chip.leaf)).toBe(false);
  } finally { Math.random = global; }
});

test("with motion off the picture holds still: no march, no ring or chips, and each body stands on its native spot", () => {
  const state = sample(10), mods = militiaMods(state)!, member = state.militia[0];
  expect([netPhase(0, STILL), netPhase(1234.5, STILL), netPhase(98765, STILL)]).toEqual([0, 0, 0]);
  expect(netPhase(MILITIA_SHOW.net.march * 2.5, MOVING)).toBeCloseTo(.5, 9);
  expect(planBlow({ seed: 1, from: member, aim: { x: member.aimX, y: member.aimY }, cleave: mods.cleaveRadius, volley: true, density: 1, channels: STILL }))
    .toMatchObject({ x: member.aimX, y: member.aimY, ring: 0, chips: [] });
  expect(planPop({ seed: 1, at: member, breakout: MILITIA_SHOW.breakout.cast, density: 1, channels: STILL })).toEqual([]);
  const risingSinkingSteppingStriking = { x: member.x, y: member.y, faceLeft: true, moving: true, gait: 7, bornMs: 10, leftMs: 10, blowMs: 30, heading: .4 };
  const still = militiaPose({ ...risingSinkingSteppingStriking, still: true }), moving = militiaPose({ ...risingSinkingSteppingStriking, still: false });
  expect(still).toMatchObject({ x: member.x, y: member.y, angle: 0, buried: 0, flipX: true });
  expect(moving.buried).toBeGreaterThan(0);
  expect(Math.hypot(moving.x - member.x, moving.y - member.y)).toBeGreaterThan(0);
  expect(still.frame).toBe(moving.frame);
  expect(militiaPose({ ...risingSinkingSteppingStriking, still: true, blowMs: Infinity }).frame).not.toBe(still.frame);
});

test("with motion off an army militia reads the rules' whole ticks only: on its rules spot, in the attack pose for the whole ticks a blow lasts", () => {
  const state = sample(10), mods = militiaMods(state);
  if (!mods) throw new Error("The sample is not 곽재우's army");
  const blowTicks = Math.ceil((MOTION.spearContactMs + MOTION.spearRecoveryMs) * HZ / 1000);
  const stand = (tick: number, remainder: number) => {
    const troop = armyTroop({ ...state, tick, remainder }, mods);
    return troop.members.map(member => stillPose(member, troop, member.aimX < member.x));
  };
  const struck = state.militia[0].struckTick, idle = stand(struck - 1, 0);
  for (const tick of [struck, struck + blowTicks - 1]) for (const remainder of [0, .5 / HZ, .99 / HZ]) {
    const drawn = stand(tick, remainder);
    expect(drawn).toEqual(stand(tick, 0));
    drawn.forEach((body, index) => {
      expect(body).toMatchObject({ x: state.militia[index].x, y: state.militia[index].y, angle: 0, buried: 0 });
      expect(body.frame).not.toBe(idle[index].frame);
    });
  }
  expect(stand(struck + blowTicks, 0)).toEqual(idle);
});

/** A pooled picture as the stage hands it out, remembering how the troop last placed it. */
class Shot {
  readonly frame = { width: 32, height: 32 };
  cell = 0; flipX = false; crop: readonly number[] = []; visible = false; x = 0; y = 0; angle = 0;
  setFrame(frame: number) { this.cell = frame; return this; }
  setFlipX(value: boolean) { this.flipX = value; return this; }
  setCrop(...box: number[]) { this.crop = box; return this; }
  setVisible(value: boolean) { this.visible = value; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setAngle(degrees: number) { this.angle = degrees; return this; }
  setDepth() { return this; }
}

/** The stage as a troop uses it, recording every mark, picture, mote and puff. `now` is the stage clock, stepped by the test. */
function recordingStage() {
  const marks: string[] = [], taken: Shot[] = [], freed = new Set<object>(), motes: { readonly at: number; readonly lands: number; readonly thrown: string }[] = [];
  const record = { now: 0, puffs: 0, marks, motes,
    live: () => taken.filter(shot => !freed.has(shot)),
    aloft: () => Math.max(0, ...motes.map(mote => motes.filter(other => other.at <= mote.at && mote.at < other.lands).length)) };
  const pen = (layer: string): MilitiaCanvas["ground"] => {
    const self: MilitiaCanvas["ground"] = {
      fillStyle(color, alpha = 1) { marks.push(`${layer} paint ${color} ${alpha}`); return self; },
      fillRect(x, y, width, height) { marks.push(`${layer} ${x} ${y} ${width} ${height}`); return self; } };
    return self;
  };
  const canvas: MilitiaCanvas = { ground: pen("ground"), field: pen("field"), trails: pen("trails"),
    image() { const shot = new Shot(); taken.push(shot); return shot; },
    free(picture) { freed.add(picture); },
    mote(at, vx, vy, pull, life, paint) { motes.push({ at: record.now, lands: record.now + life, thrown: `${at.x} ${at.y} ${vx} ${vy} ${pull} ${paint}` }); },
    puff() { record.puffs++; } };
  return { canvas, record };
}

/** A real cast on a crowded field: foes stand all round the fort, so the militia strike wherever the rules raise them. */
function crowdedCast(level: number) {
  const run = chaosArena("곽재우", level);
  for (let x = 30; x < 390; x += 45) for (let y = 50; y < 500; y += 50) if (x < 100 || x > 290 || y < 215 || y > 420) chaosEnemy(run, x, y);
  useSkill(run, 0);
  const state = run.chaosSkills;
  if (!state) throw new Error(`The rules planned no cast militia at army level ${level}`);
  return { run, state };
}

/** Plays a whole real cast through the troop's picture, two frames to a rules tick, and gives back what the stage saw. Every frame
 *  must hold one body for each real member, and the picture must never draw from Math.random. */
function playCast(level: number) {
  const { run, state } = crowdedCast(level), { canvas, record } = recordingStage(), bodies = new MilitiaBodies(MILITIA_SHOW.breakout.cast);
  let crowd = 0;
  const frame = (remainder: number) => {
    record.now += 500 / HZ;
    const troop = castTroop({ ...state, remainder }), global = Math.random;
    Math.random = () => { throw new Error("the troop's picture drew from Math.random"); };
    try { bodies.update(canvas, troop, { now: record.now, channels: MOVING }); } finally { Math.random = global; }
    expect(record.live()).toHaveLength(troop.members.length);
    crowd = Math.max(crowd, record.live().length);
  };
  while (state.events.some(event => event.kind === "militia")) {
    frame(0); frame(.5 / HZ);
    chaosTicks(run, 1);
  }
  frame(0);
  return { crowd, record };
}

test("a cast's militia are drawn one body to each real member for the whole cast, more at a higher army level, within the troop's share of the stage's motes, without smoke, and the same every time", () => {
  const crowds = [1, 10, 20].map(level => {
    const { crowd, record } = playCast(level);
    expect(record.live()).toEqual([]);
    expect(record.motes.length).toBeGreaterThan(TROOP_MOTES);
    expect(record.aloft()).toBeLessThanOrEqual(TROOP_MOTES);
    expect(record.puffs).toBe(0);
    return crowd;
  });
  expect(crowds[0] < crowds[1] && crowds[1] < crowds[2]).toBe(true);
  const [once, again] = [playCast(20), playCast(20)].map(({ record }) => Bun.hash(`${record.marks.join("\n")}\n${record.motes.map(mote => mote.thrown).join("\n")}`));
  expect(again).toBe(once);
});

test("cast militia rise without dotted rings and strike without slash trails, while keeping their hit sparks", () => {
  const { run, state } = crowdedCast(20), { canvas, record } = recordingStage();
  const bodies = new MilitiaBodies(MILITIA_SHOW.breakout.cast);
  const draw = () => {
    record.marks.length = 0;
    bodies.update(canvas, castTroop(state), { now: record.now, channels: MOVING, run });
    return [...record.marks];
  };
  draw();
  chaosTicks(run, 2);
  record.now = 2000 / HZ;
  const arrival = draw();
  let strike: string[] = [];
  for (let tick = 3; tick <= CHAOS_RULES.skills.militia.attackEvery + 1; tick++) {
    chaosTicks(run, 1);
    record.now = tick * 1000 / HZ;
    const marks = draw();
    if (marks.some(mark => mark.startsWith(`trails paint ${PALETTE.outline} `))) {
      strike = marks;
      break;
    }
  }
  expect(arrival.some(mark => /^field -?\d/.test(mark))).toBe(true);
  expect(arrival.filter(mark => /^ground -?\d.* 4 4$/.test(mark))).toEqual([]);
  expect(strike.length).toBeGreaterThan(0);
  expect(strike.filter(mark => /^trails -?\d.* 2 2$/.test(mark))).toEqual([]);
  expect(strike.filter(mark => /^ground -?\d.* 4 4$/.test(mark))).toEqual([]);
});

test("with motion off a cast is only standing bodies: each whole and upright on its rules position, drawn the same on every frame between two ticks, with nothing thrown", () => {
  const { run, state } = crowdedCast(20), { canvas, record } = recordingStage(), bodies = new MilitiaBodies(MILITIA_SHOW.breakout.cast);
  const rules = CHAOS_RULES.skills.militia, poses = new Set<number>();
  // Through the second wave's first ticks, when a moving body would still be climbing out, and the first wave's first blows.
  for (let tick = 0; tick <= rules.interval + rules.attackEvery; tick++) {
    const frames = [0, .3 / HZ, .9 / HZ].map(remainder => {
      record.now += 1000 / HZ / 3;
      const troop = castTroop({ ...state, remainder }), from = record.marks.length;
      bodies.update(canvas, troop, { now: record.now, channels: STILL });
      return { marks: record.marks.slice(from), spots: troop.members.map(({ x, y }) => ({ x, y })),
        bodies: record.live().map(({ x, y, cell, flipX, crop, angle, visible }) => ({ x, y, cell, flipX, crop, angle, visible })) };
    });
    expect(frames[1]).toEqual(frames[0]);
    expect(frames[2]).toEqual(frames[0]);
    expect(frames[0].marks.length).toBeGreaterThan(0);
    expect(frames[0].bodies.map(({ x, y, crop, angle, visible }) => ({ x, y, crop, angle, visible })))
      .toEqual(frames[0].spots.map(spot => ({ ...spot, crop: [], angle: 0, visible: true })));
    for (const body of frames[0].bodies) poses.add(body.cell);
    chaosTicks(run, 1);
  }
  expect(poses.size).toBe(2);
  expect([record.motes.length, record.puffs]).toEqual([0, 0]);
});

test("the commander's progression grows militia decoration while the same physical troop keeps its positions and bodies", () => {
  const state = sample(10), mods = militiaMods(state);
  if (!mods) throw new Error("missing militia mods");
  const troop = armyTroop(state, mods);
  const draws = [1, 10, 20].map(level => {
    const run = chaosArena("곽재우", level), { canvas, record } = recordingStage();
    run.squads[0].awakened = level === 20 ? 2 : 0;
    run.squads[0].tier = run.squads[0].awakened + 1;
    const bodies = new MilitiaBodies(MILITIA_SHOW.breakout.army);
    bodies.update(canvas, troop, { now: 100, channels: STILL, run });
    return {
      bodies: record.live().map(({ x, y, cell, crop }) => ({ x, y, cell, crop })),
      marks: record.marks,
    };
  });
  expect(draws[1].bodies).toEqual(draws[0].bodies);
  expect(draws[2].bodies).toEqual(draws[0].bodies);
  const patchAlpha = (marks: readonly string[]) => Number(marks.find(mark => mark.startsWith(`ground paint ${PALETTE.forest} `))?.split(" ").at(-1));
  expect(patchAlpha(draws[1].marks)).toBeGreaterThan(patchAlpha(draws[0].marks));
  expect(patchAlpha(draws[2].marks)).toBeGreaterThan(patchAlpha(draws[1].marks));
});
