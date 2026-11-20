import { expect, test } from "bun:test";
import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import type { ChaosSkillEvent } from "../chaos-contract";
import { chaosArena, chaosEnemy, chaosTicks } from "../chaos-test-fixture";
import { contains, fortRect } from "../geometry";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import { useSkill } from "../rules";
import type { Effect, Run } from "../rules";
import type { ShowChannels } from "../skill-show";
import { POOL, SkillStage } from "../skill-stage";
import { show } from "./dongnae-show";

type Fill = { readonly layer: string; readonly paint: number; readonly alpha: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type Shot = { fills: Fill[]; sparks: (Point & { readonly life: number; readonly twinkles: boolean })[]; veils: number[]; claps: number[] };
type Storm = { readonly run: Run; readonly events: readonly ChaosSkillEvent[]; readonly skill: Effect };
type View = { readonly clock: number; readonly events: readonly ChaosSkillEvent[] };
const MOTION = { motion: true, flash: true }, CALM = { motion: true, flash: false }, STILL = { motion: false, flash: false };
const WITNESS_GAP = 21, CELL = 4, NEXT = [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]], key = (cell: Point): string => `${cell.x},${cell.y}`;
const spans = (fill: Fill, x: number): boolean => fill.x <= x && x <= fill.x + fill.width;
/** A bolt stands on a strike point when a trail rectangle ends on the strike point's row and spans its column. */
const lands = (fills: readonly Fill[], { to }: ChaosSkillEvent): boolean =>
  fills.some(fill => fill.layer === "trails" && fill.y + fill.height === Math.round(to.y) && spans(fill, to.x));

/** A stand-in stage that records what the show draws on the stage's layers and measures reaches with the real stage's own method.
 *  It holds no pooled picture: asking it for a stake, a banner, smoke, a number, a ground mark or the cast shows' stream throws.
 *  `draw` is one frame with Math.random poisoned: of the live run, or with `view` of a frozen clock and strikes on a copy of it. */
function recorder() {
  const shot: Shot = { fills: [], sparks: [], veils: [], claps: [] };
  const refuse = (): never => { throw new Error("the storm asked the stage for more than its layers, motes, dusk and shake"); };
  const layer = (name: string) => {
    let paint = 0, alpha = 1;
    const graphics = {
      fillStyle(next: number, nextAlpha = 1) { paint = next; alpha = nextAlpha; return graphics; },
      fillRect(x: number, y: number, width: number, height: number) { shot.fills.push({ layer: name, paint, alpha, x, y, width, height }); return graphics; },
    };
    return graphics;
  };
  const stage: SkillStage = Object.create(SkillStage.prototype);
  Object.defineProperties(stage, { ground: { value: layer("ground") }, field: { value: layer("field") }, trails: { value: layer("trails") } });
  stage.random = stage.image = stage.sprite = stage.puff = stage.shout = stage.mark = refuse;
  stage.mote = (at, _vx, _vy, _pull, life, _paint, twinkles = false) => { shot.sparks.push({ x: at.x, y: at.y, life, twinkles }); };
  stage.veil = share => { shot.veils.push(share); };
  stage.shake = strength => { shot.claps.push(strength); };
  const draw = (run: Run, channels: ShowChannels, view?: View): Shot => {
    shot.fills = []; shot.sparks = []; shot.veils = []; shot.claps = [];
    const tick = view ? Math.floor(view.clock) : 0, global = Math.random;
    const seen: Run = view ? { ...run, chaosSkills: { tick, remainder: (view.clock - tick) / CHAOS_RULES.simulationHz, events: [...view.events] } } : run;
    Math.random = () => { throw new Error("the storm drew from Math.random"); };
    try { show.update(stage, { now: 0, cssPixel: 1, run: seen, at: unit => unit, foe: () => undefined, channels }); } finally { Math.random = global; }
    return shot;
  };
  return { stage, draw };
}

/** A real cast at `level`: the run on the tick of the tap, the rules' skill effect and a copy of every strike the rules scheduled. */
function storm(level: number): Storm {
  const run = chaosArena("송상현", level);
  chaosEnemy(run, 195, 100);
  const skill = useSkill(run, 0).find(effect => effect.kind === "skill");
  const events = (run.chaosSkills?.events ?? []).filter(event => event.kind === "thunder").map(event => ({ ...event }));
  if (!skill || !events.length) throw new Error(`송상현 cast no thunder at N${level}`);
  return { run, events, skill };
}

/** Plays one real cast through the real rules to its last strike's end, drawing the live run on every rules tick. With `density`
 *  the show is first told of the cast, as the scene does; without it the strikes are met with no cast at all. */
function play({ run, events, skill }: Storm, { channels, density }: { readonly channels: ShowChannels; readonly density?: number }, each: (shot: Shot, tick: number) => void): void {
  const { stage, draw } = recorder(), state = run.chaosSkills, squad = run.squads[0], last = Math.max(...events.map(event => event.untilTick));
  if (!state) throw new Error("no storm to play");
  show.clear(stage);
  if (density !== undefined) show.cast(stage, { skill, results: [], run, squad, from: squad, tier: squad.tier, channels, density });
  for (let left = last - state.tick + 1; state.tick <= last; left--) {
    if (left <= 0) throw new Error("the rules stopped ticking before the storm ended");
    each(draw(run, channels), state.tick);
    chaosTicks(run, 1);
  }
  show.clear(stage);
}

function digest({ fills, sparks, veils, claps }: Shot): number {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => { hash = Math.imul(hash ^ Math.round(value * 1000), 0x01000193) >>> 0; };
  for (const fill of fills) for (const value of [fill.layer.charCodeAt(0), fill.paint, fill.alpha, fill.x, fill.y, fill.width, fill.height]) mix(value);
  for (const spark of sparks) for (const value of [spark.x, spark.y, spark.life]) mix(value);
  for (const value of [...veils, ...claps]) mix(value);
  return hash;
}

test("the still ring is the edge of the ground the rules really strike, at the shipped radius and at a retuned one", () => {
  // A survival run starts at Lv1, band 1 of the shipped per-band radii.
  const thunder = CHAOS_RULES.skills.thunder, shipped = thunder.radius, hit = thunder.power[1] / thunder.waves[1];
  for (const radius of [shipped[1], 44]) {
    Object.defineProperties(thunder, { radius: { value: shipped.map(() => radius) } });
    try {
      const { run, events } = storm(1), { stage, draw } = recorder(), wave = events.filter(event => event.wave === 0), wall = fortRect(run.fort, 16);
      show.clear(stage);
      // Witnesses stand on open ground only, so nothing but the lightning can touch them.
      const open = (cell: Point): boolean => !contains(wall, { x: cell.x + CELL / 2, y: cell.y + CELL / 2 });
      const ring = draw(run, STILL, { clock: wave[0].startedTick, events: wave }).fills.filter(fill => fill.layer === "ground" && open(fill));
      const beyond = new Map(ring.flatMap(cell => NEXT.map(([dx, dy]) => ({ x: cell.x + dx, y: cell.y + dy })))
        .filter(cell => open(cell) && wave.every(event => Math.hypot(cell.x + CELL / 2 - event.to.x, cell.y + CELL / 2 - event.to.y) > radius)).map(cell => [key(cell), cell] as const));
      // Foes keep 20 px apart (separateEnemies), so the witnesses stand in sparse groups, each group on its own replay of the same cast.
      const groups = (cells: readonly Point[]): Point[][] => cells.reduce<Point[][]>((all, cell) => {
        const group = all.find(members => members.every(other => Math.hypot(other.x - cell.x, other.y - cell.y) >= WITNESS_GAP));
        if (group) group.push(cell); else all.push([cell]);
        return all;
      }, []);
      const witnessed = (cells: readonly Point[]) => groups(cells).flatMap(group => {
        const replay = storm(1);
        expect(replay.events).toEqual(events);
        const foes = group.map(cell => chaosEnemy(replay.run, cell.x + CELL / 2, cell.y + CELL / 2));
        chaosTicks(replay.run, wave[0].impactTick - wave[0].startedTick);
        // A witness the crowd pushed off its cell would witness another cell.
        expect(foes.filter((foe, index) => foe.x !== group[index].x + CELL / 2 || foe.y !== group[index].y + CELL / 2).map(key)).toEqual([]);
        return foes;
      });
      const inside = witnessed(ring), outside = witnessed([...beyond.values()]);
      expect(wave).toHaveLength(thunder.count[1]);
      expect(Math.min(inside.length, outside.length)).toBeGreaterThan(0);
      expect(inside.filter(foe => foe.maxHp - foe.hp < hit - 1e-6).map(key)).toEqual([]);
      expect(outside.filter(foe => foe.maxHp - foe.hp > hit / 2).map(key)).toEqual([]);
    } finally { Object.defineProperties(thunder, { radius: { value: shipped } }); }
  }
});

test("each bolt comes down from the rules' origin at the rules' pace, joins it to the strike point on the impact tick and is gone at untilTick, and the ground is lit only inside the real reach", () => {
  const { skills } = CHAOS_RULES, shipped = { flight: skills.thunder.flight, afterTicks: skills.afterTicks };
  for (const [level, flight, afterTicks] of [[0, shipped.flight, shipped.afterTicks], [20, shipped.flight, shipped.afterTicks], [10, 5, 9]]) {
    Object.defineProperties(skills.thunder, { flight: { value: flight } });
    Object.defineProperties(skills, { afterTicks: { value: afterTicks } });
    try {
      const { run, events } = storm(level), { stage, draw } = recorder(), faults: string[] = [];
      show.clear(stage);
      for (const event of events) {
        const alone = (clock: number): Shot => draw(run, MOTION, { clock, events: [event] });
        const { id, from, to, radius } = event, top = Math.round(from.y), foot = Math.round(to.y);
        let reached = 0;
        if (alone(event.startedTick - .5).fills.length || alone(event.untilTick).fills.length) faults.push(`${id} is drawn outside its life`);
        for (let tick = event.startedTick; tick < event.untilTick; tick++) {
          const { fills } = alone(tick), bolt = fills.filter(fill => fill.layer === "trails"), tip = Math.max(top, ...bolt.map(fill => fill.y + fill.height));
          for (const fill of bolt)
            if (fill.x < to.x - radius || fill.x + fill.width > to.x + radius || fill.y < top || fill.y + fill.height > foot) faults.push(`${id} bolt leaves its corridor at ${tick}`);
          for (const fill of fills.filter(item => item.layer === "ground")) {
            const far = Math.hypot(fill.x + CELL / 2 - to.x, fill.y + CELL / 2 - to.y);
            reached = Math.max(reached, far);
            if (far > radius || fill.x % CELL || fill.y % CELL || fill.width !== CELL || fill.height !== CELL) faults.push(`${id} lights ground outside its reach at ${tick}`);
          }
          const due = from.y + (to.y - from.y) * (tick - event.startedTick) / (event.impactTick - event.startedTick);
          if (tick < event.impactTick && (Math.abs(tip - due) > CELL + .5 || tip >= foot)) faults.push(`${id} leader is off the rules' pace at ${tick}`);
          if (tick === event.impactTick && !(lands(fills, event) && bolt.some(fill => fill.y === top && spans(fill, from.x)))) faults.push(`${id} does not join origin and strike point on impact`);
        }
        if (reached <= radius - CELL) faults.push(`${id} ring stops short of the real radius`);
      }
      expect(faults).toEqual([]);
    } finally {
      Object.defineProperties(skills.thunder, { flight: { value: shipped.flight } });
      Object.defineProperties(skills, { afterTicks: { value: shipped.afterTicks } });
    }
  }
});

test("with motion off a strike is one still ring on its real reach and one column from its origin to its strike point, the same at every tick, frame time and flash setting of its life", () => {
  for (const level of [0, 20]) {
    const { run, events } = storm(level), { stage, draw } = recorder(), faults: string[] = [];
    show.clear(stage);
    for (const event of events) {
      const still = (clock: number, flash: boolean): string => JSON.stringify(draw(run, { motion: false, flash }, { clock, events: [event] }));
      const blank = (clock: number): boolean => !draw(run, STILL, { clock, events: [event] }).fills.length;
      const life = [event.startedTick, event.startedTick + .37, event.impactTick - .01, event.impactTick, event.impactTick + .5, event.untilTick - .01];
      const pictures = new Set(life.flatMap(clock => [still(clock, false), still(clock, true)])), { id, from, to, radius } = event;
      const { fills, sparks, veils, claps }: Shot = JSON.parse([...pictures][0]);
      if (pictures.size !== 1 || sparks.length || veils.length || claps.length) faults.push(`${id} moves`);
      if (!blank(event.startedTick - .01) || !blank(event.untilTick)) faults.push(`${id} stands outside its life`);
      const struck = (x: number, y: number): boolean => Math.hypot(x + CELL / 2 - to.x, y + CELL / 2 - to.y) <= radius;
      const ring = fills.filter(fill => fill.layer === "ground"), painted = new Set(ring.map(key));
      for (let y = Math.floor((to.y - radius) / CELL) * CELL - CELL; y <= to.y + radius + CELL; y += CELL)
        for (let x = Math.floor((to.x - radius) / CELL) * CELL - CELL; x <= to.x + radius + CELL; x += CELL)
          if (struck(x, y) && NEXT.some(([dx, dy]) => !struck(x + dx, y + dy)) && !painted.has(key({ x, y }))) faults.push(`${id} ring is open at ${x},${y}`);
      if (ring.some(cell => !struck(cell.x, cell.y) || struck(cell.x, cell.y) && Math.hypot(cell.x + CELL / 2 - to.x, cell.y + CELL / 2 - to.y) <= radius - 2 * CELL)) faults.push(`${id} ring leaves the edge of its reach`);
      const column = fills.filter(fill => fill.layer === "trails").sort((a, b) => a.y - b.y), first = column[0], last = column[column.length - 1];
      const joined = column.every((row, index) => index === 0 || row.y === column[index - 1].y + column[index - 1].height);
      if (!first || !joined || first.y !== Math.round(from.y) || !spans(first, from.x) || last.y + last.height !== Math.round(to.y) || !spans(last, to.x)) faults.push(`${id} column does not join origin and strike point`);
    }
    expect(faults).toEqual([]);
  }
});

test("every level draws exactly the strikes and waves the rules cast, and a higher level draws more of both", () => {
  const { count, waves } = CHAOS_RULES.skills.thunder, totals: number[] = [];
  for (const level of [1, 5, 10, 15, 20]) {
    const band = chaosSkillBand(level), cast = storm(level), feet: number[] = [], bursts: number[] = [];
    let claps = 0;
    play(cast, { channels: MOTION }, (shot, tick) => {
      const landing = cast.events.filter(event => event.impactTick === tick);
      if (landing.length) feet.push(landing.filter(event => lands(shot.fills, event)).length);
      if (shot.sparks.length) bursts.push(new Set(shot.sparks.map(key)).size);
      claps += shot.claps.length;
    });
    const wave = Array.from({ length: waves[band] }, () => count[band]);
    expect({ feet, bursts, claps }).toEqual({ feet: wave, bursts: wave, claps: waves[band] });
    totals.push(feet.reduce((sum, bolts) => sum + bolts, 0));
  }
  expect(totals.map((total, index) => index === 0 || total > totals[index - 1])).not.toContain(false);
});

test("the same cast is the same picture again and at any frame rate, and drawing it never touches the run", () => {
  const film = (): number[] => {
    const frames: number[] = [];
    play(storm(20), { channels: MOTION }, shot => frames.push(digest(shot)));
    return frames;
  };
  const first = film(), { interval } = CHAOS_RULES.skills.thunder;
  expect(new Set(first.slice(0, interval)).size).toBe(interval);
  expect(film()).toEqual(first);
  const { run, events } = storm(20), live = run.chaosSkills?.events ?? [], before = JSON.stringify(run);
  const start = events[0].startedTick, ticks = Math.max(...events.map(event => event.untilTick)) - start;
  const filmed = (perTick: number): { readonly frames: number[]; readonly sparks: number } => {
    const { stage, draw } = recorder(), frames: number[] = [];
    let sparks = 0;
    show.clear(stage);
    for (let step = 0; step <= ticks * perTick; step++) {
      const shot = draw(run, MOTION, { clock: start + step / perTick, events: live });
      sparks += shot.sparks.length;
      if (step % perTick === 0) frames.push(digest(shot));
    }
    return { frames, sparks };
  };
  expect(filmed(3)).toEqual(filmed(1));
  expect(JSON.stringify(run)).toBe(before);
});

test("no mode paints a danger colour or any layer but the ground and the trails; flashes off paints no white, twinkles no spark and never lifts the dusk; motion off asks for no dusk, shake or spark", () => {
  const danger: number[] = [PALETTE.danger, PALETTE.red, PALETTE.scarlet], waves = CHAOS_RULES.skills.thunder.waves[chaosSkillBand(20)];
  const seen = (channels: ShowChannels) => {
    const cast = storm(20), paints = new Set<number>(), layers = new Set<string>(), dusk: number[] = [], lastImpact = Math.max(...cast.events.map(event => event.impactTick));
    let sparks = 0, twinkles = 0, claps = 0, lifts = 0;
    play(cast, { channels }, (shot, tick) => {
      for (const fill of shot.fills) { paints.add(fill.paint); layers.add(fill.layer); }
      if (tick <= lastImpact && dusk.length && shot.veils[0] < dusk[dusk.length - 1]) lifts++;
      dusk.push(...shot.veils);
      sparks += shot.sparks.length; twinkles += shot.sparks.filter(spark => spark.twinkles).length; claps += shot.claps.length;
    });
    return { paints: [...paints], layers: [...layers].sort(), dusk: dusk.length, sparks, twinkles, claps, lifts };
  };
  const motion = seen(MOTION), calm = seen(CALM), still = seen(STILL);
  for (const mode of [motion, calm, still]) {
    expect(mode.paints.filter(paint => danger.includes(paint))).toEqual([]);
    expect(mode.layers).toEqual(["ground", "trails"]);
  }
  expect([motion, calm, still].map(mode => mode.paints.includes(PALETTE.white))).toEqual([true, false, false]);
  expect([motion.lifts, calm.lifts, calm.twinkles, calm.sparks, motion.twinkles]).toEqual([waves, 0, 0, motion.sparks, motion.sparks]);
  expect([still.dusk, still.claps, still.sparks]).toEqual([0, 0, 0]);
});

test("a cast's particle headroom thins the sparks without thinning the strikes, and the sparks alive at once fit the stage's motes", () => {
  const thrown = (density: number) => {
    const cast = storm(20), bursts = new Map<string, number>(), dying: number[] = [];
    let struck = 0, peak = 0;
    play(cast, { channels: MOTION, density }, (shot, tick) => {
      for (const spark of shot.sparks) {
        bursts.set(`${tick}:${key(spark)}`, (bursts.get(`${tick}:${key(spark)}`) ?? 0) + 1);
        dying.push(tick + spark.life * CHAOS_RULES.simulationHz / 1000);
      }
      struck += cast.events.filter(event => event.impactTick === tick && lands(shot.fills, event)).length;
      peak = Math.max(peak, dying.filter(until => tick < until).length);
    });
    return { each: [...new Set(bursts.values())], bursts: bursts.size, struck, peak, strikes: cast.events.length };
  };
  const full = thrown(1), half = thrown(.5), none = thrown(0);
  expect(full.each).toHaveLength(1);
  expect(full.each[0]).toBeGreaterThan(1);
  expect(half.each).toEqual([Math.round(full.each[0] * .5)]);
  expect([full.bursts, half.bursts, none.bursts]).toEqual([full.strikes, full.strikes, 0]);
  expect([full.struck, half.struck, none.struck]).toEqual([full.strikes, full.strikes, full.strikes]);
  expect(full.peak).toBeLessThanOrEqual(POOL.motes);
});
