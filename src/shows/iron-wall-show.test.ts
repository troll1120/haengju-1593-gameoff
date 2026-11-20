import { expect, test } from "bun:test";
import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import type { ChaosSkillEvent, ChaosSkillState } from "../chaos-contract";
import { CANNON_GENERAL, cannonShells } from "../chaos-shows/wall-belt";
import type { CannonLayer } from "../chaos-shows/wall-belt";
import { chaosArena, chaosEnemy, chaosTicks } from "../chaos-test-fixture";
import { CENTER, contains, fortRect, gapToRect, sideOf, SIDES } from "../geometry";
import type { Direction, Point, Rect } from "../geometry";
import { PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import { useSkill } from "../rules";
import type { Effect, Run } from "../rules";
import type { ShowChannels } from "../skill-show";
import type { SkillStage } from "../skill-stage";
import { CANNON_SHOW, planShell, SHELL_MOTES, shellMoment, ShellPainter, shellTick, show } from "./iron-wall-show";
import type { CannonPart } from "./iron-wall-show";

type Mark = { readonly part: CannonPart; readonly paint: Paint; readonly alpha: number; readonly x: number; readonly y: number; readonly wide: number; readonly high: number };
const MOVING: ShowChannels = { motion: true, flash: true }, CALM: ShowChannels = { motion: true, flash: false };
const STILL: ShowChannels = { motion: false, flash: true }, STILL_CALM: ShowChannels = { motion: false, flash: false };
const LEVELS = [1, 5, 10, 15, 20] as const;

// A real cast: 김시민 at an army level fires on a foe standing off each side of the wall, after the run has played `wait` ticks.
// `own` is the cast's shells, apart from any passive volley that was already in the air.
type Cast = { readonly run: Run; readonly wall: Rect; readonly state: ChaosSkillState; readonly skill: Effect; readonly own: readonly ChaosSkillEvent[] };
function barrage(level: number, wait = 0): Cast {
  const run = chaosArena(CANNON_GENERAL, level), wall = fortRect(run.fort);
  for (const [x, y] of [[CENTER.x, wall.top - 90], [CENTER.x, wall.bottom + 90], [wall.left - 70, CENTER.y], [wall.right + 70, CENTER.y]]) chaosEnemy(run, x, y);
  chaosTicks(run, wait);
  const flying = new Set(cannonShells(run).map(shell => shell.id)), skill = useSkill(run, 0).find(effect => effect.kind === "skill"), state = run.chaosSkills;
  if (!skill || !state) throw new Error(`no cannon cast at army level ${level}`);
  return { run, wall, state, skill, own: cannonShells(run).filter(shell => !flying.has(shell.id)) };
}

function picture(shell: ChaosSkillEvent, wall: Rect, tick: number, look: ShowChannels): Mark[] {
  const marks: Mark[] = [], moment = shellMoment(shell, tick);
  if (moment) new ShellPainter((part, paint, alpha) => (x, y, wide, high) => { marks.push({ part, paint, alpha, x, y, wide, high }); }, look).shell(planShell(shell, wall), moment);
  return marks;
}

const key = (point: Point): string => `${point.x},${point.y}`;
const centre = (mark: Mark): Point => ({ x: mark.x + mark.wide / 2, y: mark.y + mark.high / 2 });
const holds = (mark: Mark, point: Point): boolean => point.x >= mark.x && point.x <= mark.x + mark.wide && point.y >= mark.y && point.y <= mark.y + mark.high;
// The farthest any ground cell under these boxes lies from a point, measured to cell centres as the rules' reach is.
function farthest(marks: readonly Mark[], from: Point): number {
  return Math.max(0, ...marks.flatMap(mark => {
    const insetX = Math.min(2, mark.wide / 2), insetY = Math.min(2, mark.high / 2);
    return [[mark.x + insetX, mark.y + insetY], [mark.x + mark.wide - insetX, mark.y + insetY], [mark.x + insetX, mark.y + mark.high - insetY],
      [mark.x + mark.wide - insetX, mark.y + mark.high - insetY]].map(([x, y]) => Math.hypot(x - from.x, y - from.y));
  }));
}
// A box's span out of the wall along the way out of one side: [nearest, farthest] pixels beyond that side's wall line.
function outOf(wall: Rect, side: Direction, mark: Mark): readonly [number, number] {
  switch (side) {
    case "위": return [wall.top - mark.y - mark.high, wall.top - mark.y];
    case "아래": return [mark.y - wall.bottom, mark.y + mark.high - wall.bottom];
    case "좌": return [wall.left - mark.x - mark.wide, wall.left - mark.x];
    case "우": return [mark.x - wall.right, mark.x + mark.wide - wall.right];
    default: return side satisfies never;
  }
}
// A box's middle across a wall side, on the axis a port's place along that side is measured on.
const across = (side: Direction, at: Point): number => side === "위" || side === "아래" ? at.x : at.y;

test.each([1, 10, 20])("N%i: every shell's gun, flash and smoke stand on the wall port the rules fire it from, cast and passive alike", level => {
  const { run, wall, state } = barrage(level), smoked = new Set<number>(), flown = new Set<number>();
  for (; cannonShells(run).length; chaosTicks(run, 1)) for (const shell of cannonShells(run)) {
    const marks = picture(shell, wall, state.tick, MOVING), moment = shellMoment(shell, state.tick), side = sideOf(wall, shell.from);
    if (state.tick < shell.startedTick) { expect(marks).toEqual([]); continue; }
    if (!moment) throw new Error(`live shell ${shell.id} has no moment at tick ${state.tick}`);
    expect([gapToRect(wall, shell.from), contains(wall, shell.from)]).toEqual([0, false]);
    const gun = marks.filter(mark => mark.part === "gun"), flash = marks.filter(mark => mark.part === "flash"), smoke = marks.filter(mark => mark.part === "smoke");
    // The gun is in the wall at the port: its barrel crosses the wall line there.
    expect(gun.some(mark => holds(mark, shell.from) && outOf(wall, side, mark)[0] < 0 && outOf(wall, side, mark)[1] > 0)).toBe(true);
    const plan = planShell(shell, wall), bore = gapToRect(wall, plan.smoke.at);
    expect(across(side, plan.smoke.at)).toBe(across(side, shell.from));
    expect(Math.max(...picture(shell, wall, shell.impactTick, MOVING).filter(mark => mark.part === "gun").map(mark => outOf(wall, side, mark)[1]))).toBe(bore);
    if (moment.phase === "flight" && moment.share < CANNON_SHOW.flash) {
      flown.add(shell.id);
      // The flash leaves the bore outward, centred on the port to the pixel, and never reaches back over the wall.
      expect(Math.min(...flash.map(mark => outOf(wall, side, mark)[0]))).toBeGreaterThanOrEqual(0);
      expect(Math.min(...flash.map(mark => outOf(wall, side, mark)[0]))).toBeLessThanOrEqual(bore);
      for (const mark of flash) expect(Math.abs(across(side, centre(mark)) - across(side, shell.from))).toBeLessThanOrEqual(.5);
    } else expect(flash).toEqual([]);
    const drift = Math.max(...plan.smoke.puffs.map(puff => Math.hypot(puff.dx, puff.dy)));
    for (const mark of smoke) expect(Math.hypot(centre(mark).x - plan.smoke.at.x, centre(mark).y - plan.smoke.at.y)).toBeLessThanOrEqual(drift + 2);
    if (smoke.length) smoked.add(shell.id);
  }
  expect(flown.size).toBeGreaterThanOrEqual(CHAOS_RULES.skills.cannon.count[chaosSkillBand(level)] * CHAOS_RULES.skills.cannon.waves[chaosSkillBand(level)]);
  expect([...smoked].sort()).toEqual([...flown].sort());
});

test.each([1, 10, 20])("N%i: the shell rides the rules' own arc over its shadow, and the blast runs from its heart to the rules' radius and no farther", level => {
  const { run, wall, state } = barrage(level), air: readonly CannonPart[] = ["shell", "shadow", "flash"], burst: readonly CannonPart[] = ["shock", "scorch", "ball", "gust", "plume"];
  const landed = new Set<number>();
  for (; cannonShells(run).length; chaosTicks(run, 1)) for (const shell of cannonShells(run)) {
    const moment = shellMoment(shell, state.tick), marks = picture(shell, wall, state.tick, MOVING);
    if (!moment) continue;
    const of = (parts: readonly CannonPart[]) => marks.filter(mark => parts.includes(mark.part));
    expect(farthest(of(["aim", ...burst]), shell.to)).toBeLessThanOrEqual(shell.radius);
    if (moment.phase === "blast") {
      expect(of(air)).toEqual([]);
      if (landed.has(shell.id)) continue;
      landed.add(shell.id);
      // The shock front starts at the heart on the rules' impact tick and, twice as fast, reaches the reduced explosion's rim
      // (the whole blast radius since owner bug 1033) and no farther; on that tick the impact ring already marks the rules' rim.
      const after = shell.untilTick - shell.impactTick, shock = (tick: number) => picture(shell, wall, tick, CALM).filter(mark => mark.part === "shock");
      const { size, pace } = CANNON_SHOW.burst, full = shock(shell.impactTick + after * CANNON_SHOW.shock / pace - 1e-6);
      expect(farthest(shock(shell.impactTick), shell.to)).toBeLessThan(8);
      const ring = picture(shell, wall, shell.impactTick, MOVING).filter(mark => mark.part === "ring");
      expect(farthest(ring, shell.to)).toBeGreaterThan(shell.radius - 4);
      expect(farthest(ring, shell.to)).toBeLessThanOrEqual(shell.radius + 3);
      expect(farthest(full, shell.to)).toBeGreaterThan(shell.radius * size - 4);
      expect(farthest(full, shell.to)).toBeLessThanOrEqual(shell.radius * size + 3);
      expect(of(["ball"])).not.toEqual([]);
      continue;
    }
    // In flight the rules hold the shell at (x, y), lift included; the picture stands on that point and its shadow under it on the ground.
    const share = (state.tick - shell.startedTick) / (shell.impactTick - shell.startedTick);
    const ground = { x: shell.from.x + (shell.to.x - shell.from.x) * share, y: shell.from.y + (shell.to.y - shell.from.y) * share };
    expect(Math.hypot(moment.at.x - shell.x, moment.at.y - shell.y)).toBeCloseTo(0, 9);
    expect(of(["shell"]).some(mark => holds(mark, shell))).toBe(true);
    const [shadow] = of(["shadow"]);
    expect(Math.hypot(centre(shadow).x - ground.x, centre(shadow).y - ground.y)).toBeLessThanOrEqual(1);
    expect(of(burst)).toEqual([]);
  }
  expect(landed.size).toBeGreaterThanOrEqual(CHAOS_RULES.skills.cannon.count[chaosSkillBand(level)] * CHAOS_RULES.skills.cannon.waves[chaosSkillBand(level)]);
});

test("more guns fire a wave and more waves land as the army grows, exactly as CHAOS_RULES.skills.cannon counts them", () => {
  const { count, waves } = CHAOS_RULES.skills.cannon;
  const drawn = LEVELS.map(level => {
    const { run, wall, state } = barrage(level), cast = new Set(cannonShells(run).map(shell => shell.id));
    const guns = new Map<number, Set<string>>(), blasts = new Set<number>();
    for (; cannonShells(run).some(shell => cast.has(shell.id)); chaosTicks(run, 1)) for (const shell of cannonShells(run)) {
      if (!cast.has(shell.id)) continue;
      const marks = picture(shell, wall, state.tick, MOVING);
      if (marks.some(mark => mark.part === "flash")) guns.set(shell.startedTick, (guns.get(shell.startedTick) ?? new Set<string>()).add(key(shell.from)));
      if (marks.some(mark => mark.part === "ball")) blasts.add(shell.impactTick);
    }
    return { guns: [...guns.values()].map(wave => wave.size), waves: blasts.size };
  });
  expect(drawn).toEqual(LEVELS.map(level => chaosSkillBand(level)).map(band => ({ guns: Array.from({ length: waves[band] }, () => count[band]), waves: waves[band] })));
  for (let index = 1; index < drawn.length; index++) {
    expect(drawn[index].guns[0]).toBeGreaterThan(drawn[index - 1].guns[0]);
    expect(drawn[index].waves).toBeGreaterThanOrEqual(drawn[index - 1].waves);
    expect(drawn[index].guns.length * drawn[index].guns[0]).toBeGreaterThan(drawn[index - 1].guns.length * drawn[index - 1].guns[0]);
  }
});

test("with motion off a shell is one still picture in flight and one once the rules land it: gun, track and the rules' reach, nothing travelling or flashing", () => {
  const { run, wall } = barrage(20), [shell] = cannonShells(run), { startedTick, impactTick, untilTick, from, to } = shell;
  for (const look of [STILL, STILL_CALM]) {
    const flight = picture(shell, wall, startedTick, look), landed = picture(shell, wall, impactTick, look);
    for (const tick of [startedTick + .25, startedTick + 7, impactTick - .001]) expect(picture(shell, wall, tick, look)).toEqual(flight);
    for (const tick of [impactTick + 3.5, untilTick - .001]) expect(picture(shell, wall, tick, look)).toEqual(landed);
    expect(landed).not.toEqual(flight);
    for (const tick of [startedTick - 1, untilTick]) expect(picture(shell, wall, tick, look)).toEqual([]);
    expect([...new Set(flight.map(mark => mark.part))].sort()).toEqual(["aim", "gun", "smoke"]);
    expect([...new Set(landed.map(mark => mark.part))].sort()).toEqual(["aim", "gun", "scorch", "shock", "smoke"]);
    // The still track is dotted along the ground from the rules' port to the rules' landing, each dot on a whole pixel.
    const span = Math.hypot(to.x - from.x, to.y - from.y), dots = flight.filter(mark => mark.part === "aim" && mark.wide === 2);
    expect(dots).toHaveLength(Math.ceil(span / CANNON_SHOW.still.gap) - 1);
    for (const dot of dots) {
      const along = ((centre(dot).x - from.x) * (to.x - from.x) + (centre(dot).y - from.y) * (to.y - from.y)) / span;
      expect(along).toBeGreaterThan(0);
      expect(along).toBeLessThan(span + 1);
      expect(Math.hypot(centre(dot).x - from.x - (to.x - from.x) * along / span, centre(dot).y - from.y - (to.y - from.y) * along / span)).toBeLessThanOrEqual(1.5);
    }
    const reach = landed.filter(mark => mark.part === "shock");
    expect(farthest(reach, to)).toBeLessThanOrEqual(shell.radius);
    expect(farthest(reach, to)).toBeGreaterThan(shell.radius - 4);
  }
});

test("a shell's picture repeats, is scattered by the shell's own id, never draws from Math.random and is never red; flashes off paint nothing white", () => {
  const { run, wall } = barrage(20), [shell] = cannonShells(run), global = Math.random;
  const forbidden = new Set<Paint>([PALETTE.danger, PALETTE.red, PALETTE.scarlet]);
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    expect(planShell(shell, wall)).toEqual(planShell(shell, wall));
    expect(planShell({ ...shell, id: shell.id + 1 }, wall).smoke.puffs).not.toEqual(planShell(shell, wall).smoke.puffs);
    for (let tick = shell.startedTick; tick < shell.untilTick; tick += .25) for (const look of [MOVING, CALM, STILL, STILL_CALM]) {
      const marks = picture(shell, wall, tick, look);
      expect(picture(shell, wall, tick, look)).toEqual(marks);
      expect(marks.some(mark => forbidden.has(mark.paint))).toBe(false);
      if (!look.flash) expect(marks.some(mark => mark.paint === PALETTE.white)).toBe(false);
    }
  } finally { Math.random = global; }
});

test("the drawn clock runs on between the rules' ticks and never reaches the next one, so no blast shows before the rules land the shell", () => {
  const tickMs = 1000 / CHAOS_RULES.simulationHz, [shell] = cannonShells(barrage(0).run);
  expect(shellTick({ tick: 40, remainder: 0 })).toBe(40);
  expect(shellTick({ tick: 40, remainder: 0 }, tickMs / 2)).toBeCloseTo(40.5, 9);
  expect(shellTick({ tick: 40, remainder: .5 / CHAOS_RULES.simulationHz })).toBeCloseTo(40.5, 9);
  expect(shellTick({ tick: 40, remainder: 0 }, tickMs * 5)).toBeLessThan(41);
  expect(shellMoment(shell, shellTick({ tick: shell.impactTick - 1, remainder: 0 }, tickMs * 5))?.phase).toBe("flight");
  expect(shellMoment(shell, shell.impactTick)?.phase).toBe("blast");
});

type Laid = readonly [layer: CannonLayer, x: number, y: number, wide: number, high: number];
function recorder(): { readonly stage: SkillStage; readonly laid: Laid[]; readonly asked: { mote: number; puff: number; shake: number; veil: number } } {
  const laid: Laid[] = [], asked = { mote: 0, puff: 0, shake: 0, veil: 0 }, stage: SkillStage = Object.create(null);
  const layer = (name: CannonLayer) => {
    const graphics = { fillStyle: () => graphics, fillRect: (x: number, y: number, wide: number, high: number) => { laid.push([name, x, y, wide, high]); return graphics; } };
    return graphics;
  };
  Object.defineProperties(stage, { ground: { value: layer("ground") }, trails: { value: layer("trails") } });
  stage.mote = () => { asked.mote++; }; stage.puff = () => { asked.puff++; }; stage.shake = () => { asked.shake++; }; stage.veil = () => { asked.veil++; };
  // The drawn iron ball and reduced explosion are pooled sprites; the recorder only proves the show asks for them harmlessly.
  const fake = (): Phaser.GameObjects.Sprite => { const sprite = {
    setPosition: () => sprite, setVisible: () => sprite, setOrigin: () => sprite, setScale: () => sprite, setAlpha: () => sprite,
    play: () => sprite, anims: { timeScale: 1 },
  } as unknown as Phaser.GameObjects.Sprite; return sprite; };
  stage.sprite = () => fake(); stage.freeSprite = () => undefined;
  return { stage, laid, asked };
}
const frame = (run: Run, now: number, channels: ShowChannels) => ({ now, cssPixel: 1, run, channels, at: (point: Point) => point, foe: () => undefined });

test("the show draws a passive volley that came with no cast, and throws each shell's chips once within its share of the stage", () => {
  const { count, passiveEvery, flight } = CHAOS_RULES.skills.cannon, band = chaosSkillBand(20), run = chaosArena(CANNON_GENERAL, 20);
  chaosEnemy(run, CENTER.x, fortRect(run.fort).top - 90);
  chaosTicks(run, passiveEvery[band]);
  expect(cannonShells(run)).toHaveLength(count[band]);
  const { stage, laid, asked } = recorder();
  try {
    show.update(stage, frame(run, 0, MOVING));
    expect([...new Set(laid.map(([layer]) => layer))].sort()).toEqual(["ground", "trails"]);
    const sparks = asked.mote;
    expect(sparks).toBeGreaterThan(0);
    show.update(stage, frame(run, 16, MOVING));
    expect(asked.mote).toBe(sparks);
    chaosTicks(run, flight);
    show.update(stage, frame(run, 600, MOVING));
    show.update(stage, frame(run, 616, MOVING));
    expect(asked).toEqual({ mote: count[band] * SHELL_MOTES, puff: 0, shake: 0, veil: 0 });
  } finally { show.clear(stage); }
  const quiet = chaosArena("권율", 0), still = recorder();
  chaosEnemy(quiet, 225, 100);
  useSkill(quiet, 0);
  chaosTicks(quiet, 30);
  show.update(still.stage, frame(quiet, 0, MOVING));
  expect(still.laid).toEqual([]);
});

test("a cast made with a passive volley in the air dims the field until its own first wave is over, shakes once for each of its own waves and names its own blasts as its ground", () => {
  const { passiveEvery, waves, count } = CHAOS_RULES.skills.cannon, band = chaosSkillBand(20), blasts = (shells: readonly ChaosSkillEvent[]) => shells.map(shell => ({ x: shell.to.x, y: shell.to.y, radius: shell.radius }));
  const { run, state, skill, own } = barrage(20, passiveEvery[band] + 3), squad = run.squads[0], firstOver = Math.min(...own.map(shell => shell.untilTick)), { stage, asked } = recorder();
  expect(cannonShells(run)).toHaveLength(own.length + SIDES.length * count[band]);
  expect(show.areas?.(skill, run)).toEqual(blasts(own));
  try {
    show.cast(stage, { skill, run, squad, channels: MOVING, density: 1, results: [], from: squad, tier: squad.tier });
    let frames = 0;
    for (let now = 0; cannonShells(run).some(shell => own.includes(shell)); now += 33, chaosTicks(run, 1)) {
      show.update(stage, frame(run, now, MOVING));
      if (state.tick < firstOver) frames++;
      expect(asked.veil).toBe(frames);
    }
    expect(frames).toBeGreaterThan(0);
    expect(asked.shake).toBe(waves[band]);
  } finally { show.clear(stage); }
  // A passive volley the rules fire in the same step, just after the cast, is newer than the cast and still not the cast.
  const late = barrage(20, passiveEvery[band] - 1);
  chaosTicks(late.run, 1);
  expect(cannonShells(late.run)).toHaveLength(late.own.length + SIDES.length * count[band]);
  expect(show.areas?.(late.skill, late.run)).toEqual(blasts(late.own));
});

test("with motion off the show holds one picture between the rules' ticks and asks the stage for no chips, smoke, shake or dusk", () => {
  const { run, skill } = barrage(20), squad = run.squads[0], { stage, laid, asked } = recorder();
  try {
    show.cast(stage, { skill, run, squad, channels: STILL, density: 1, results: [], from: squad, tier: squad.tier });
    for (const ticks of [0, 1, CHAOS_RULES.skills.cannon.flight]) {
      chaosTicks(run, ticks);
      laid.length = 0;
      show.update(stage, frame(run, 1000, STILL));
      const held = [...laid];
      expect(held).not.toEqual([]);
      laid.length = 0;
      show.update(stage, frame(run, 1977, STILL));
      expect(laid).toEqual(held);
    }
    expect(asked).toEqual({ mote: 0, puff: 0, shake: 0, veil: 0 });
  } finally { show.clear(stage); }
});
