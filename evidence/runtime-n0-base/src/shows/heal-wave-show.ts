import { HEIGHT, WIDTH } from "../geometry";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import type { General } from "../roster";
import { actualManualHealRatio } from "../rules";
import type { Effect, Run, Unit } from "../rules";
import { envelope, scatter } from "../skill-show";
import type { Area, ShowChannels } from "../skill-show";
import type { CastContext, FrameContext, Reach, SkillShow, SkillStage } from "../skill-stage";

export const HEAL_WAVE_GENERAL: General = "사명대사";

/** The show retains only positions and the offered ratio, and never writes combat state. */
export type HealedAlly = Readonly<Pick<Unit, "x" | "y" | "kind">>;
export type HealFigures = {
  /** The offered max-HP fraction, including awakening and growth, before the HP cap. */
  readonly ratio: number;
  /** The units the rules' heal reached: the run's own objects, read-only, so the stage can say where each one is drawn. */
  readonly allies: readonly HealedAlly[];
};
/** Read the offered ratio at cast time, using the rules' helper for legacy effects. The allies are the living, fit units
 *  reached by the rules' heal loop. Neither the run nor the effect is changed. */
export function healFigures(skill: Pick<Effect, "value" | "squad" | "actualHealRatio">, run: Readonly<Run>): HealFigures {
  const squad = skill.squad === undefined ? undefined : run.squads[skill.squad];
  if (!squad) throw new Error("Healing effect has no casting squad");
  return { ratio: skill.actualHealRatio ?? actualManualHealRatio(run, squad),
    allies: run.squads.flatMap(squad => [squad, ...squad.soldiers]).filter(unit => unit.hp > 0 && unit.downUntil <= run.time) };
}
export const healShout = (figures: Pick<HealFigures, "ratio">): string => `+${Math.round(figures.ratio * 100)}%`;

/** Display-only staging, in milliseconds from the cast unless named otherwise, and picture sizes in pixels. The rules heal on the
 *  cast tick and their heal has no radius: none of these is a gameplay number, they only time and size the picture that follows. */
export const HEAL_WAVE = {
  bloom: 140, travel: 500, hold: 240, fade: 220,
  still: 500, stillFade: 200,
  /** The ring stage.mark draws around the lotus, the least rim of the picture, and the gap kept past the farthest ally. */
  firstRing: 56, leastReach: 140, margin: 24,
  glow: 420, underglow: 240, sparks: 72,
} as const;
const CELL = 4, PIXEL = 2, SPARK_INSET = 6;
const SPARKS = [PALETTE.leafLight, PALETTE.gold, PALETTE.white, PALETTE.heal] as const;

export type HealSpark = Point & { readonly at: number; readonly life: number; readonly tone: number; readonly size: number };
export type HealWavePlan = {
  /** How far the wave runs: past the farthest healed ally, and never less than the least rim. */
  readonly reach: number;
  readonly burstAt: number; readonly arriveAt: number;
  readonly sparks: readonly HealSpark[];
};
/** Where and when one healing wave shows. The wave leaves the first ring on the burst and settles on a rim past the farthest ally,
 *  and no sparkle lies outside the rim. With motion off nothing travels: every time is 0. */
export function planHealWave(cast: { readonly seed: number; readonly x: number; readonly y: number; readonly allies: readonly Point[];
  readonly density: number; readonly still: boolean }): HealWavePlan {
  const random = scatter(cast.seed), first = HEAL_WAVE.firstRing;
  const farthest = Math.max(0, ...cast.allies.map(ally => Math.hypot(ally.x - cast.x, ally.y - cast.y)));
  const reach = Math.ceil(Math.max(HEAL_WAVE.leastReach, farthest + HEAL_WAVE.margin) / CELL) * CELL;
  const burstAt = cast.still ? 0 : HEAL_WAVE.bloom, wave = { reach, burstAt, arriveAt: burstAt + (cast.still ? 0 : HEAL_WAVE.travel) };
  const count = cast.still ? 0 : Math.round(HEAL_WAVE.sparks * cast.density), outer = reach - SPARK_INSET;
  const sparks = Array.from({ length: count }, (_, index) => {
    const turn = index * 2.399963 + random() * .8, far = Math.sqrt(first ** 2 + (outer ** 2 - first ** 2) * (index + random()) / count);
    return { x: cast.x + Math.cos(turn) * far, y: cast.y + Math.sin(turn) * far, at: glowAt(wave, far) + random() * 60,
      life: 260 + random() * 160, tone: index % SPARKS.length, size: 1 + Math.floor(random() * 3) };
  });
  return { ...wave, sparks };
}
/** When the front reaches a point `far` pixels from Samyeong: on the burst inside the first ring, as the wave settles at or past the
 *  rim, and in between the inverse of frontAt, so it passes a near ally almost at once and a far one late. */
export function glowAt(plan: Pick<HealWavePlan, "reach" | "burstAt" | "arriveAt">, far: number): number {
  if (far >= plan.reach) return plan.arriveAt;
  const travelled = Math.max(0, far - HEAL_WAVE.firstRing) / (plan.reach - HEAL_WAVE.firstRing);
  return plan.burstAt + (plan.arriveAt - plan.burstAt) * (1 - Math.sqrt(1 - travelled));
}
/** How far the wave's front has run `age` milliseconds after the cast: it waits on the first ring, bursts out and eases onto the rim. */
export function frontAt(plan: Pick<HealWavePlan, "reach" | "burstAt" | "arriveAt">, age: number): number {
  if (age >= plan.arriveAt) return plan.reach;
  if (age <= plan.burstAt) return HEAL_WAVE.firstRing;
  return HEAL_WAVE.firstRing + (plan.reach - HEAL_WAVE.firstRing) * (1 - (1 - (age - plan.burstAt) / (plan.arriveAt - plan.burstAt)) ** 2);
}

const LOTUS_SPAN = 52, PETAL_RIM = 1.6, VEIN = 1.2;
const TONE = { rim: 0, petal: 1, vein: 2, sepal: 3, sepalRim: 4 } as const;
const PETALS = [{ turn: 0, from: 14, to: 44, width: 7.5, sepal: false }, { turn: Math.PI / 4, from: 14, to: 44, width: 7.5, sepal: false },
  { turn: Math.PI / 8, from: 31, to: 51, width: 4.2, sepal: true }] as const;
function lotusTone(x: number, y: number): number {
  for (const petal of PETALS) {
    const along = x * Math.cos(petal.turn) + y * Math.sin(petal.turn), across = Math.abs(y * Math.cos(petal.turn) - x * Math.sin(petal.turn));
    if (along < petal.from || along > petal.to) continue;
    // An almond: pointed at both ends and widest two fifths of the way out.
    const inside = petal.width * Math.sin(Math.PI * ((along - petal.from) / (petal.to - petal.from)) ** .75) - across;
    if (inside < 0) continue;
    if (petal.sepal) return inside < PETAL_RIM ? TONE.sepalRim : TONE.sepal;
    return inside < PETAL_RIM ? TONE.rim : across < VEIN && along > petal.from + 5 && along < petal.to - 9 ? TONE.vein : TONE.petal;
  }
  return -1;
}
export type LotusCell = Point & { readonly far: number; readonly tone: number };
/** The lotus as 2px cells around (0, 0), each named by its centre: eight jade petals on the axes and diagonals and eight short gold
 *  sepals between them. One eighth of a turn is measured and mirrored, so the flower is exactly the same in all eight directions.
 *  `far` opens it from the heart outward. */
export function lotusCells(): LotusCell[] {
  const cells = new Map<string, LotusCell>();
  for (let y = 1; y <= LOTUS_SPAN; y += PIXEL) for (let x = y; x <= LOTUS_SPAN; x += PIXEL) {
    const tone = lotusTone(x, y), far = Math.hypot(x, y);
    if (tone < 0) continue;
    for (const [mx, my] of [[x, y], [y, x]]) for (const sx of [1, -1]) for (const sy of [1, -1])
      cells.set(`${mx * sx},${my * sy}`, { x: mx * sx, y: my * sy, far, tone });
  }
  return [...cells.values()];
}

/** Each lotus tone's paint, and whether it is drawn over bodies. The fill lies on the ground, so no body and no red mark is hidden;
 *  only the thin rims and veins are drawn above them. */
const LOTUS_PAINT: readonly { readonly paint: Paint; readonly alpha: number; readonly over: boolean }[] = [
  { paint: PALETTE.jade, alpha: .95, over: true }, { paint: PALETTE.leafLight, alpha: .85, over: false }, { paint: PALETTE.cream, alpha: .9, over: true },
  { paint: PALETTE.gold, alpha: .9, over: false }, { paint: PALETTE.brass, alpha: .95, over: true }];
const FLOWER = lotusCells(), LOTUS = LOTUS_PAINT.map((_, tone) => FLOWER.filter(cell => cell.tone === tone));
const MOTES = [PALETTE.leafLight, PALETTE.heal, PALETTE.gold, PALETTE.leafLight, PALETTE.white] as const;
const DUSK = { rise: 80, share: .65 } as const, SHINE = { ms: 150, width: 3 } as const, BLINK_MS = 60, SPARK_RISE = 14;
const PLUS = { arm: 4, pop: 6, popMs: 70, lift: 26, chief: 40, rise: 8, fade: 160 } as const;
const SHOUT_LIFT = 46, TIPS = 16, RIM_MOTES = 28, MOTES_PER_ALLY = 5, ALLY_MOTES = 120;
const UNDERGLOW = [-2, -1, 0, 1, 2].flatMap(i => [-2, -1, 0, 1, 2].filter(j => Math.abs(i) + Math.abs(j) <= 2).map(j => [i, j] as const));

type Layer = SkillStage["ground"];
type GroundCell = Point & { readonly odd: boolean };
type Spoke = Point & { readonly step: number };
type Ring = { readonly cells: GroundCell[]; readonly spokes: Spoke[] };
type Wave = { readonly figures: HealFigures; readonly plan: HealWavePlan; readonly caster: Readonly<Point>; readonly centre: Point; readonly first: Reach; readonly rings: readonly Ring[];
  readonly castAt: number; readonly channels: ShowChannels; readonly density: number; readonly litAt: (number | undefined)[]; burst: boolean; called: boolean };

/** Every 4px ground cell inside the rim, grouped by how many cells it lies from the centre, with the eight spokes named apart.
 *  Cells off the field are left out. */
function wheel(centre: Point, reach: number): Ring[] {
  const count = Math.floor(reach / CELL), rings: Ring[] = Array.from({ length: count }, () => ({ cells: [], spokes: [] }));
  for (let j = -count; j <= count; j++) for (let i = -count; i <= count; i++) {
    const ring = Math.floor(Math.hypot(i, j)), x = centre.x + i * CELL - CELL / 2, y = centre.y + j * CELL - CELL / 2;
    if (ring >= count || x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
    rings[ring].cells.push({ x, y, odd: (i + j) % 2 !== 0 });
    if (i === 0 || j === 0 || Math.abs(i) === Math.abs(j)) rings[ring].spokes.push({ x, y, step: Math.max(Math.abs(i), Math.abs(j)) });
  }
  return rings;
}
/** A crisp plus sign with a dark rim. Its bars never overlap, so its alpha stays even. */
function plus(layer: Layer, x: number, y: number, arm: number, paint: Paint, alpha: number): void {
  const cx = Math.round(x), cy = Math.round(y);
  layer.fillStyle(PALETTE.outline, alpha * .9).fillRect(cx - arm - 2, cy - 2, arm * 2 + 4, 4).fillRect(cx - 2, cy - arm - 2, 4, arm).fillRect(cx - 2, cy + 2, 4, arm);
  layer.fillStyle(paint, alpha).fillRect(cx - arm - 1, cy - 1, arm * 2 + 2, 2).fillRect(cx - 1, cy - arm - 1, 2, arm).fillRect(cx - 1, cy + 1, 2, arm);
}
function underglow(ground: Layer, spot: Point, since: number): void {
  const x = Math.floor(spot.x / CELL) * CELL, y = Math.floor(spot.y / CELL) * CELL, fresh = since < PLUS.popMs;
  ground.fillStyle(fresh ? PALETTE.leafLight : PALETTE.jade, fresh ? .75 : .6 * (1 - since / HEAL_WAVE.underglow));
  for (const [i, j] of UNDERGLOW) ground.fillRect(x + i * CELL, y + j * CELL, CELL, CELL);
}

/** Samyeong's healing wave as a dharma wheel: a lotus opens under him inside its first ring, a jade and gold wave bursts out to a rim
 *  past the farthest ally and draws the wheel's eight spokes behind it, each ally lights up with a plus and rising motes as the front
 *  reaches it, and when it has reached them all the rules' heal ratio is called over him. The rules have already healed; this only draws. */
class HealWaveShow implements SkillShow {
  readonly general = HEAL_WAVE_GENERAL;
  readonly accent = PALETTE.jade;
  /** The wave's rim round 사명대사, past the farthest ally the rules healed; the effect's value is the healed share, not a radius. */
  areas(skill: Effect, run: Readonly<Run>): readonly Area[] {
    const { allies } = healFigures(skill, run);
    return [{ x: skill.x, y: skill.y, radius: planHealWave({ seed: 0, x: skill.x, y: skill.y, allies, density: 0, still: true }).reach }];
  }
  private waves: Wave[] = [];

  cast(stage: SkillStage, { skill, run, squad, from, channels, density }: CastContext): void {
    const figures = healFigures(skill, run);
    // The wheel turns on the middle of a ground cell, so its ring, spokes and lotus are the same in every direction.
    const centre = { x: Math.floor(from.x / CELL) * CELL + CELL / 2, y: Math.floor(from.y / CELL) * CELL + CELL / 2 };
    const plan = planHealWave({ seed: Math.floor(stage.random() * 0x100000000), ...centre, allies: figures.allies, density, still: !channels.motion });
    this.waves.push({ figures, plan, caster: squad, centre, first: stage.reach(centre.x, centre.y, HEAL_WAVE.firstRing), rings: wheel(centre, plan.reach),
      castAt: stage.now, channels, density, litAt: figures.allies.map(() => undefined), burst: false, called: false });
    for (const spark of plan.sparks) if (spark.x >= 0 && spark.x < WIDTH && spark.y >= 0 && spark.y < HEIGHT)
      stage.mote(spark, 0, -SPARK_RISE, 0, spark.life, SPARKS[spark.tone], true, spark.at, spark.size);
  }

  update(stage: SkillStage, frame: FrameContext): void {
    if (!this.waves.length) return;
    for (const wave of this.waves) this.draw(stage, wave, frame);
    this.waves = this.waves.filter(wave => frame.now - wave.castAt < (wave.channels.motion
      ? wave.plan.arriveAt + HEAL_WAVE.hold + HEAL_WAVE.fade : HEAL_WAVE.still + HEAL_WAVE.stillFade));
  }

  /** The show holds no pooled picture of its own: its motes and its number belong to the stage, which takes them back itself. */
  clear(): void { this.waves = []; }

  private draw(stage: SkillStage, wave: Wave, frame: FrameContext): void {
    const { plan, channels } = wave, age = frame.now - wave.castAt, still = !channels.motion;
    const stands = still ? HEAL_WAVE.still : plan.arriveAt + HEAL_WAVE.hold, fall = still ? HEAL_WAVE.stillFade : HEAL_WAVE.fade;
    const strength = envelope(age, 0, stands, fall);
    stage.veil(DUSK.share * envelope(age, DUSK.rise, stands - DUSK.rise, fall), channels);
    stage.mark(wave.first, { age, since: still ? -1 : age - plan.burstAt, alpha: strength, channels });
    // The number is called as the wave reaches the rim, and at that same moment with motion off, over Samyeong where he stands by
    // then: the wheel stays where he cast it, but he walks on. The cut-in band covers the ground over a commander at his usual post
    // for its 720 ms, so a number called any sooner would be hidden behind it.
    if (!wave.called && age >= HEAL_WAVE.bloom + HEAL_WAVE.travel) {
      wave.called = true;
      const over = frame.at(wave.caster);
      stage.shout(over.x, over.y - SHOUT_LIFT, healShout(wave.figures), PALETTE.leafLight, frame.cssPixel, channels.motion);
      if (!still) this.crown(stage, wave);
    }
    if (!still && !wave.burst && age >= plan.burstAt) { wave.burst = true; stage.shake(.004, 0); this.shed(stage, wave); }
    this.wheel(stage, wave, age, strength);
    if (!still) this.lotus(stage, wave, age, strength);
    this.bless(stage, wave, frame, age, strength);
  }

  /** The ground wheel. Eight dashed gold spokes run out behind the wave; the wave is a gold lip, a jade body, a dithered leaf wake and
   *  one echo; on the rim it stands as the wheel's felloe, blinks, and a last pale ripple runs out to meet it (neither with flashes off).
   *  Motion off keeps a still rim. */
  private wheel(stage: SkillStage, wave: Wave, age: number, strength: number): void {
    const { plan, rings, channels } = wave, ground = stage.ground, hub = Math.floor(HEAL_WAVE.firstRing / CELL), rim = rings.length - 1;
    const band = (ring: number, paint: Paint, alpha: number, dithered = false) => {
      if (ring < hub || ring > rim) return;
      ground.fillStyle(paint, alpha * strength);
      for (const cell of rings[ring].cells) if (!dithered || cell.odd) ground.fillRect(cell.x, cell.y, CELL, CELL);
    };
    if (!channels.motion) { band(rim - 1, PALETTE.leafLight, .5, true); band(rim, PALETTE.jade, .85); return; }
    if (age < plan.burstAt) return;
    const edge = Math.min(rim, Math.floor(frontAt(plan, age) / CELL)), settled = age - plan.arriveAt, march = Math.floor(age / 70);
    ground.fillStyle(PALETTE.gold, .55 * strength);
    for (let ring = hub; ring <= edge - 3; ring++) for (const spoke of rings[ring].spokes)
      if ((spoke.step - march & 3) < 2) ground.fillRect(spoke.x, spoke.y, CELL, CELL);
    for (let back = 6; back >= 3; back--) band(edge - back, PALETTE.leafLight, .55 - (back - 3) * .12, true);
    band(edge - 10, PALETTE.leafLight, .4);
    band(edge - 2, PALETTE.jade, .6); band(edge - 1, PALETTE.jade, .85);
    band(edge, PALETTE.gold, channels.flash && settled >= 0 && settled < BLINK_MS * 4 && Math.floor(settled / BLINK_MS) % 2 === 0 ? .5 : .95);
    if (channels.flash && settled >= 0 && settled < HEAL_WAVE.hold)
      band(hub + Math.floor((rim - 3 - hub) * settled / HEAL_WAVE.hold), PALETTE.cream, .5 * (1 - settled / HEAL_WAVE.hold));
  }

  private lotus(stage: SkillStage, { centre, plan, channels }: Wave, age: number, strength: number): void {
    const opened = LOTUS_SPAN * (1 - (1 - Math.min(1, age / HEAL_WAVE.bloom)) ** 2);
    LOTUS.forEach((cells, tone) => {
      const { paint, alpha, over } = LOTUS_PAINT[tone], layer = over ? stage.field : stage.ground;
      layer.fillStyle(paint, alpha * strength);
      for (const cell of cells) if (cell.far <= opened) layer.fillRect(centre.x + cell.x - 1, centre.y + cell.y - 1, PIXEL, PIXEL);
    });
    if (!channels.flash) return;
    // One white shine runs out along the petals on the burst, and once more as the wave settles on the rim.
    for (const since of [age - plan.burstAt, age - plan.arriveAt]) {
      const shine = since / SHINE.ms * LOTUS_SPAN;
      if (shine < 0 || shine > LOTUS_SPAN + SHINE.width) continue;
      stage.field.fillStyle(PALETTE.white, .9 * strength);
      for (const cell of FLOWER) if (Math.abs(cell.far - shine) < SHINE.width) stage.field.fillRect(centre.x + cell.x - 1, centre.y + cell.y - 1, PIXEL, PIXEL);
    }
  }

  /** As the wave settles, the rim sheds a ring of rising gold and leaf chips. */
  private crown(stage: SkillStage, { centre, plan, density }: Wave): void {
    const count = Math.round(RIM_MOTES * density), far = plan.reach - CELL / 2;
    for (let index = 0; index < count; index++) {
      const turn = (index + stage.random()) * Math.PI * 2 / count, x = centre.x + Math.cos(turn) * far, y = centre.y + Math.sin(turn) * far;
      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;
      stage.mote({ x, y }, 0, -(22 + stage.random() * 30), -16, 300 + stage.random() * 140, index % 2 ? PALETTE.gold : PALETTE.leafLight, true,
        stage.random() * 90, 1 + Math.floor(stage.random() * 3));
    }
  }

  /** On the burst the flower throws one gold or leaf chip from each of its sixteen tips. */
  private shed(stage: SkillStage, { centre, density }: Wave): void {
    for (let tip = 0; tip < TIPS; tip++) {
      if (stage.random() >= density) continue;
      const sepal = tip % 2 === 1, turn = tip * Math.PI * 2 / TIPS, far = PETALS[sepal ? 2 : 0].to, ux = Math.cos(turn), uy = Math.sin(turn);
      stage.mote({ x: centre.x + ux * far, y: centre.y + uy * far }, ux * 46, uy * 46 - 24, -30, 340 + stage.random() * 120,
        sepal ? PALETTE.gold : PALETTE.leafLight, true, stage.random() * 50, PIXEL);
    }
  }

  /** Each ally the heal reached lights up where it is drawn as the front reaches it there: light under it, a plus that pops and rises
   *  over it, and green motes. An ally that walked past the rim lights as the wave settles. Motion off keeps a still plus. */
  private bless(stage: SkillStage, wave: Wave, frame: FrameContext, age: number, strength: number): void {
    const { figures, plan, centre, channels, litAt } = wave;
    figures.allies.forEach((ally, index) => {
      const spot = frame.at(ally);
      let lit = litAt[index];
      if (lit === undefined) {
        if (age < glowAt(plan, Math.hypot(spot.x - centre.x, spot.y - centre.y))) return;
        lit = litAt[index] = age;
        if (channels.motion) this.rise(stage, wave, spot);
      }
      const since = age - lit, top = spot.y - (ally.kind === "general" ? PLUS.chief : PLUS.lift);
      if (!channels.motion) { plus(stage.field, spot.x, top, PLUS.arm, PALETTE.leafLight, strength); return; }
      if (channels.flash && since < HEAL_WAVE.underglow) underglow(stage.ground, spot, since);
      if (since >= HEAL_WAVE.glow) return;
      const popped = since < PLUS.popMs;
      plus(stage.field, spot.x, top - PLUS.rise * (1 - (1 - since / HEAL_WAVE.glow) ** 2), popped ? PLUS.pop : PLUS.arm,
        popped && channels.flash ? PALETTE.white : PALETTE.leafLight, Math.min(1, (HEAL_WAVE.glow - since) / PLUS.fade));
    });
  }

  private rise(stage: SkillStage, wave: Wave, spot: Point): void {
    const count = Math.round(Math.max(2, Math.min(MOTES_PER_ALLY, ALLY_MOTES / wave.figures.allies.length)) * wave.density);
    for (let index = 0; index < count; index++)
      stage.mote({ x: spot.x + (stage.random() - .5) * 18, y: spot.y - 2 - stage.random() * 16 }, (stage.random() - .5) * 12, -(24 + stage.random() * 34), -20,
        340 + stage.random() * 180, MOTES[index % MOTES.length], true, stage.random() * 130, 1 + Math.floor(stage.random() * 3));
  }
}

export const show: SkillShow = new HealWaveShow();
