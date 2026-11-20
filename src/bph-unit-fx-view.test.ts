import { expect, test } from "bun:test";
import { addBphProfile } from "./bph-combat";
import type { BphActor } from "./bph-contract";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { createBphRun } from "./bph-session";
import { fireArrowThrow, flightPoint, groundFires, hazeRows, potShare, streamPoints, streamSegments, UNIT_FX_SHOW, unitFxLook, UnitFxView } from "./bph-unit-fx-view";
import type { Point } from "./geometry";
import { freshMeta } from "./meta";
import { PALETTE, rangeCells } from "./presentation";
import { advance, createRun } from "./rules";
import type { Run } from "./rules";
import type { ShowChannels } from "./skill-show";
import type { FrameContext, SkillStage } from "./skill-stage";

type Fill = { readonly layer: string; readonly paint: number; readonly alpha: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
function recorder() {
  const fills: Fill[] = [], motes: (Point & { readonly paint: number })[] = [];
  const layer = (name: string) => {
    let paint = 0, alpha = 1;
    const graphics = {
      fillStyle(next: number, nextAlpha = 1) { paint = next; alpha = nextAlpha; return graphics; },
      fillRect(x: number, y: number, width: number, height: number) { fills.push({ layer: name, paint, alpha, x, y, width, height }); return graphics; },
    };
    return graphics;
  };
  const sprites: { key: string; x: number; y: number; visible: boolean; freed: boolean }[] = [];
  const sprite = (key: string) => {
    const record = { key, x: 0, y: 0, visible: false, freed: false };
    sprites.push(record);
    const handle = { record, anims: { isPlaying: false }, play: () => { handle.anims.isPlaying = true; return handle; },
      setPosition: (x: number, y: number) => { record.x = x; record.y = y; return handle; },
      setRotation: () => handle, setVisible: (visible: boolean) => { record.visible = visible; return handle; } };
    return handle;
  };
  const stage = { ground: layer("ground"), field: layer("field"), trails: layer("trails"), sprite,
    freeSprite: (handle: ReturnType<typeof sprite>) => { handle.record.freed = true; },
    mote: (at: Point, _vx: number, _vy: number, _pull: number, _life: number, paint: number) => { motes.push({ x: at.x, y: at.y, paint }); },
    random: () => { throw new Error("the unit view drew from the cast shows' stream"); } };
  return { stage: stage as unknown as SkillStage, fills, motes, sprites };
}
const MOTION: ShowChannels = { motion: true, flash: true };
const frame = (run: Run, now: number, at: (unit: Point) => Point = unit => unit, channels = MOTION): FrameContext =>
  ({ now, cssPixel: 1, run, at, foe: () => undefined, channels });
function draw(view: UnitFxView, stage: SkillStage, context: FrameContext): void {
  const global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try { view.update(stage, context); } finally { Math.random = global; }
}
function battle(profileId: string, at: Point = { x: 100, y: 200 }, foil = false) {
  const run = createBphRun(freshMeta(), { seed: 3, general: "권율", upgrades: [] });
  addBphProfile(run, { profileId, copies: 1, foil, discovered: false }, { packId: "Pack1_Basic", position: at });
  const fx = run.bph?.fx, unit = run.squads[0].soldiers[0];
  if (!fx || !unit) throw new Error("missing bph battle");
  return { run, fx, unit };
}
let nextId = 90000;
const actor = (kind: BphActor["kind"], fields: Partial<BphActor>): BphActor =>
  ({ id: nextId++, ownerId: -1, kind, x: 0, y: 0, toX: 0, toY: 0, startedAt: 0, until: 1, power: 1, radius: 0, targets: [], data: {}, ...fields });
const cast = (spellId: string): NonNullable<BphActor["cast"]> =>
  ({ id: 1, spellId, sourceId: null, sourceLifeId: null, tomeId: null, targetId: null, position: { x: 0, y: 0 }, foil: null, power: 1 });
const centre = (fill: Fill): Point => ({ x: fill.x + fill.width / 2, y: fill.y + fill.height / 2 });
const key = (cell: Point) => `${cell.x},${cell.y}`;
function segmentGap(at: Point, from: Point, to: Point): number {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const share = length ? Math.max(0, Math.min(1, ((at.x - from.x) * dx + (at.y - from.y) * dy) / length)) : 0;
  return Math.hypot(at.x - from.x - share * dx, at.y - from.y - share * dy);
}

test("a hwacha's fire arrow flies from its hwacha to the rules' landing spot, and drawing never writes the run", () => {
  const { run, fx, unit } = battle("Hero2_Pyromancer");
  for (let i = 0; i < 200 && !run.enemies.length; i++) advance(run, .05);
  const enemy = run.enemies[0];
  enemy.x = 260; enemy.y = 200; enemy.hp = enemy.maxHp = 100; enemy.shielded = false;
  const context = bphFxContext(run);
  if (!context) throw new Error("missing effects context");
  context.state.spells.length = 0; context.state.actors.length = 0;
  unit.x = 100; unit.y = 200;
  dispatchBphEffects(run, { kind: "before-attack", unit, target: enemy,
    attack: { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false } });
  run.time += .02;
  dispatchBphEffects(run, { kind: "step", dt: .02 });
  const arrow = fx.actors.find(candidate => unitFxLook(candidate) === "fire-arrow");
  if (!arrow) throw new Error("the hwacha cast no fire arrow");
  const hand = { x: unit.x, y: unit.y - UNIT_FX_SHOW.rope.hand };
  const start = fireArrowThrow(arrow, hand, arrow.startedAt), end = fireArrowThrow(arrow, hand, arrow.until);
  expect(Math.hypot(start.from.x - unit.x, start.from.y - unit.y)).toBeLessThanOrEqual(UNIT_FX_SHOW.rope.hand);
  expect(flightPoint(start.from, start.to, start.share)).toMatchObject({ x: start.from.x, y: start.from.y, lift: 0 });
  expect(flightPoint(end.from, end.to, end.share)).toMatchObject({ x: arrow.x, y: arrow.y, lift: 0 });
  expect(flightPoint(start.from, start.to, .5).lift).toBeGreaterThan(0);

  const view = new UnitFxView(), { stage, sprites } = recorder(), before = JSON.stringify(fx.actors);
  run.time = arrow.startedAt + (arrow.until - arrow.startedAt) / 2;
  draw(view, stage, frame(run, 0));
  expect(JSON.stringify(fx.actors)).toBe(before);
  expect(view.tracked).toBe(1);
  const thrown = fireArrowThrow(arrow, hand, run.time), head = flightPoint(thrown.from, thrown.to, thrown.share);
  expect(sprites).toHaveLength(1);
  expect(sprites[0]).toMatchObject({ key: "rocket", visible: true, freed: false });
  expect(Math.hypot(sprites[0].x - head.x, sprites[0].y - head.y)).toBeLessThanOrEqual(8);
  for (let step = 0; step < 60 && fx.actors.includes(arrow); step++) {
    run.time += .05;
    dispatchBphEffects(run, { kind: "step", dt: .05 });
    draw(view, stage, frame(run, (step + 1) * 50));
  }
  expect(fx.actors.includes(arrow)).toBe(false);
  expect(view.tracked).toBe(0);
  expect(sprites[0].freed).toBe(true);
});

test("an ignited mine leaves seven harmless ground fires for five seconds; an expired mine leaves none", () => {
  const { run, fx } = battle("Hero9_Supernova");
  const mine = actor("mine", { x: 160, y: 300, toX: 160, toY: 300, radius: 80, startedAt: run.time, until: run.time + 30,
    cast: cast("Spell_Mine"), data: { statusSpell: 1, mode: 1, fuseAt: run.time + .2 } });
  fx.actors.push(mine);
  const view = new UnitFxView(), { stage, fills } = recorder();
  expect(unitFxLook(mine)).toBe("ember-mine");
  run.time += .5;
  draw(view, stage, frame(run, 0));
  expect(fills.filter(fill => fill.layer === "field").length).toBeGreaterThan(0);
  run.time += 1;
  fx.actors.splice(fx.actors.indexOf(mine), 1);
  fills.length = 0;
  draw(view, stage, frame(run, 1000));
  const fires = groundFires(mine);
  expect(fires).toHaveLength(UNIT_FX_SHOW.fire.count);
  for (const spot of fires) expect(Math.hypot(spot.x - mine.x, spot.y - mine.y)).toBeLessThanOrEqual(mine.radius * UNIT_FX_SHOW.fire.inset);
  expect(view.tracked).toBe(UNIT_FX_SHOW.fire.count);
  run.time += .5;
  fills.length = 0;
  draw(view, stage, frame(run, 1500));
  const burning = fills.filter(fill => fill.layer === "ground");
  expect(burning.length).toBeGreaterThan(0);
  for (const fill of burning) expect(Math.hypot(centre(fill).x - mine.x, centre(fill).y - mine.y)).toBeLessThanOrEqual(mine.radius);
  run.time += UNIT_FX_SHOW.fire.life;
  fills.length = 0;
  draw(view, stage, frame(run, 6000));
  expect(view.tracked).toBe(0);
  expect(fills).toHaveLength(0);

  const quiet = actor("mine", { x: 60, y: 300, radius: 80, startedAt: run.time, until: run.time + .5, cast: cast("Spell_Mine"), data: { statusSpell: 1, mode: 1 } });
  fx.actors.push(quiet);
  run.time = quiet.until - 1 / 60;
  draw(view, stage, frame(run, 7000));
  run.time = quiet.until;
  fx.actors.splice(fx.actors.indexOf(quiet), 1);
  draw(view, stage, frame(run, 7100));
  expect(view.tracked).toBe(0);
});

test("a singijeon stream is drawn only on the path segments the rules traced, never across a screen-edge wrap", () => {
  const { run, fx } = battle("Hero9_Quasar");
  const path = [{ from: { x: 200, y: 200 }, to: { x: 360, y: 212 } }, { from: { x: 0, y: 212 }, to: { x: 80, y: 216 } }];
  const data: Record<string, number> = { unitSpell: 1, pathCount: path.length, fromX: 200, fromY: 200, duration: .4, age: 0 };
  path.forEach((segment, n) => Object.assign(data, { [`path${n}FromX`]: segment.from.x, [`path${n}FromY`]: segment.from.y,
    [`path${n}ToX`]: segment.to.x, [`path${n}ToY`]: segment.to.y }));
  const beam = actor("beam", { x: 80, y: 216, startedAt: run.time, until: run.time + .4, radius: 16, cast: cast("Spell_Quasar"), data });
  fx.actors.push(beam);
  expect(unitFxLook(beam)).toBe("singijeon");
  expect(streamSegments(beam)).toEqual(path);
  const points = streamPoints(path, 3, Infinity);
  expect(points.length).toBeGreaterThan(50);
  for (const point of points) expect(Math.min(...path.map(segment => segmentGap(point, segment.from, segment.to)))).toBeLessThan(1e-9);
  expect(points.map(point => point.along)).toEqual([...points.map(point => point.along)].sort((a, b) => a - b));

  const view = new UnitFxView(), { stage, fills } = recorder();
  run.time = beam.startedAt + .2;
  draw(view, stage, frame(run, 0));
  const drawn = fills.filter(fill => fill.layer !== "ground");
  expect(drawn.length).toBeGreaterThan(0);
  for (const fill of drawn) expect(Math.min(...path.map(segment => segmentGap(centre(fill), segment.from, segment.to)))).toBeLessThanOrEqual(3);
  fills.length = 0;
  run.time = beam.until;
  draw(view, stage, frame(run, 400));
  expect(fills).toHaveLength(0);
});

test("a smoke pot rides above its rules position in flight, and its landed haze never leaves the rules' reach cells", () => {
  const { run, fx } = battle("Hero3_WitchDoctor");
  const pot = actor("mine", { x: 150, y: 260, toX: 200, toY: 260, radius: 53, startedAt: run.time, until: run.time + 5.9, cast: cast("Spell_InfectionBomb"),
    data: { unitSpell: 1, fromX: 100, fromY: 260, flight: .9, duration: 5, age: .45, landed: 0 } });
  fx.actors.push(pot);
  expect(unitFxLook(pot)).toBe("smoke-pot");
  expect(potShare(pot)).toBeCloseTo(.5, 9);
  const view = new UnitFxView(), { stage, fills } = recorder();
  draw(view, stage, frame(run, 0));
  const lift = flightPoint({ x: 100, y: 260 }, { x: 200, y: 260 }, .5).lift, body = fills.filter(fill => fill.layer === "trails").map(centre);
  expect(body.length).toBeGreaterThan(0);
  for (const spot of body) expect(Math.hypot(spot.x - pot.x, spot.y - (pot.y - lift))).toBeLessThanOrEqual(6);

  Object.assign(pot, { x: 200, y: 260 });
  Object.assign(pot.data, { age: 1.5, landed: 1 });
  run.time = pot.startedAt + 1.5;
  fills.length = 0;
  draw(view, stage, frame(run, 1500));
  const reach = new Set(rangeCells(pot.x, pot.y, pot.radius).map(key));
  expect(new Set(hazeRows(pot.x, pot.y, pot.radius).flatMap(row => Array.from({ length: row.width / 4 }, (_, n) => key({ x: row.x + n * 4, y: row.y }))))).toEqual(reach);
  const haze = fills.filter(fill => fill.layer === "ground");
  expect(haze.length).toBeGreaterThan(0);
  for (const fill of haze) for (let x = fill.x; x < fill.x + fill.width; x += 4) expect(reach.has(key({ x, y: fill.y }))).toBe(true);
});

test.each([false, true])("a soldier's promotion shimmer requires foil=%s and fades out at the drawn position", foil => {
  const { run, unit } = battle("Hero1_Squire", { x: 100, y: 200 }, foil);
  const progress = unit.bph;
  if (!progress) throw new Error("missing soldier progress");
  const drawnAt = (spot: Point) => ({ x: spot.x + 9, y: spot.y - 5 });
  const view = new UnitFxView(), { stage, fills } = recorder();
  draw(view, stage, frame(run, 0, drawnAt));
  progress.profileId = "Hero1_Squire2";
  draw(view, stage, frame(run, 16, drawnAt));
  expect(view.tracked).toBe(0);
  expect(fills).toHaveLength(0);
  progress.stage++;
  draw(view, stage, frame(run, 33, drawnAt));
  if (!foil) {
    expect(view.tracked).toBe(0);
    expect(fills).toHaveLength(0);
    return;
  }
  expect(view.tracked).toBe(1);
  const spot = drawnAt(unit), shimmer = fills.filter(fill => fill.layer === "field").map(centre);
  expect(shimmer.length).toBeGreaterThan(0);
  for (const at of shimmer) expect(Math.hypot(at.x - spot.x, at.y - spot.y)).toBeLessThanOrEqual(UNIT_FX_SHOW.prism.rise + 4);
  run.time += UNIT_FX_SHOW.prism.life + UNIT_FX_SHOW.step;
  fills.length = 0;
  draw(view, stage, frame(run, 1000, drawnAt));
  expect(view.tracked).toBe(0);
  expect(fills).toHaveLength(0);
});

test("flail leads the charge and displays precisely the enemies damaged by wheel contact", () => {
  const { run, fx, unit } = battle("Hero6_Skelewheel", { x: 140, y: 300 });
  run.time = .1; // The old wall-clock spin points down at the start of this rightward attack.
  const template = createRun(4).enemies[0];
  const enemies = [[210, 300], [155, 350], [155, 361]].map(([x, y]) => ({
    ...template, id: run.nextId++, x, y, goalX: x, goalY: y, hp: 1, maxHp: 1, shielded: false, speed: 0,
  }));
  run.enemies = enemies;
  dispatchBphEffects(run, { kind: "before-attack", unit, target: enemies[0],
    attack: { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false } });
  const wheel = fx.actors.find(entry => entry.kind === "wheel");
  const context = bphFxContext(run);
  if (!wheel || !context) throw new Error("missing live wheel");
  const view = new UnitFxView(), { stage, fills } = recorder();
  draw(view, stage, frame(run, 0));
  const initialHead = fills.find(fill => fill.layer === "trails" && fill.paint === PALETTE.silverLight);
  if (!initialHead) throw new Error("flail head wasn't drawn");

  fills.length = 0;
  run.time += 1 / 30;
  context.emitEvent({ kind: "step", dt: 1 / 30 });
  draw(view, stage, frame(run, 1000 / 30));
  const damaged = enemies.filter(enemy => enemy.hp < 1).map(enemy => enemy.id);
  const shown = enemies.filter(enemy => fills.some(fill => fill.layer === "trails"
    && fill.paint === PALETTE.silverLight && fill.alpha === 1
    && Math.hypot(centre(fill).x - enemy.x, centre(fill).y - enemy.y) <= 3)).map(enemy => enemy.id);
  expect({ heading: [centre(initialHead).x > 140, Math.abs(centre(initialHead).y - 300) <= 4], damaged, shown })
    .toEqual({ heading: [true, true], damaged: enemies.slice(0, 2).map(enemy => enemy.id),
      shown: enemies.slice(0, 2).map(enemy => enemy.id) });
});

test("no picture in the view uses the reds reserved for enemy warnings", () => {
  const reserved = new Set<number>([PALETTE.danger, PALETTE.red, PALETTE.scarlet, PALETTE.brick, PALETTE.brickShade, PALETTE.brickDeep,
    PALETTE.rose, PALETTE.clay, PALETTE.clayLight, PALETTE.clayDeep, PALETTE.wine, PALETTE.wineDeep]);
  const { run, fx, unit } = battle("Hero5_Dino", { x: 180, y: 300 });
  const owner = { ownerId: unit.id, data: { profiles: 1 } };
  fx.actors.push(
    actor("hook", { ...owner, x: 240, y: 260, targets: [-1], data: { profiles: 1, phase: 0 } }),
    actor("blade", { ...owner, x: 220, y: 300, until: run.time + 2, data: { profiles: 1, angle: 0, angular: Math.PI, orbit: 40 } }),
    actor("seed", { ...owner, x: 200, y: 290, toX: 260, toY: 290, targets: [unit.id], until: run.time + .8 }),
    actor("wheel", { ...owner, x: 180, y: 300, until: run.time + 3, data: { profiles: 1, angle: 1 } }),
    actor("dash", { ...owner, x: 200, y: 300, until: run.time + 1, data: { profiles: 1, fromX: 140, fromY: 300 } }),
    actor("mine", { x: 120, y: 360, radius: 80, until: run.time + 30, cast: cast("Spell_Mine"), data: { statusSpell: 1, mode: 1, litAt: run.time } }),
    actor("mine", { x: 260, y: 360, radius: 60, until: run.time + 4, cast: cast("Spell_PoisonCloud"), data: { statusSpell: 1, mode: 0 } }),
    actor("mine", { x: 300, y: 200, radius: 33, until: run.time + 4, cast: cast("Spell_Tornado"), data: { unitSpell: 1 } }),
    actor("mine", { x: 150, y: 420, until: run.time + 1, cast: cast("Spell_Fireball"), data: { statusSpell: 1, mode: 2, fromX: 100, fromY: 300 } }),
    actor("beam", { x: 300, y: 120, until: run.time + .4, radius: 16, cast: cast("Spell_Quasar"), data: { unitSpell: 1, fromX: 100, fromY: 120 } }),
  );
  const view = new UnitFxView(), { stage, fills, motes } = recorder();
  const lit = fx.actors[5];
  for (let step = 0; step < 6; step++) {
    if (step === 3) { fx.actors.splice(fx.actors.indexOf(lit), 1); unit.bph && unit.bph.stage++; }
    run.time += .1;
    draw(view, stage, frame(run, step * 100));
    draw(view, stage, frame(run, step * 100 + 50, undefined, { motion: false, flash: false }));
  }
  expect(new Set(fills.map(fill => fill.layer))).toEqual(new Set(["ground", "field", "trails"]));
  expect(motes.length).toBeGreaterThan(0);
  for (const paint of [...fills.map(fill => fill.paint), ...motes.map(mote => mote.paint)]) expect(reserved.has(paint)).toBe(false);
});
