import type Phaser from "phaser";
import { CHAOS_RULES } from "../chaos-contract";
import { distance, fortRect, gapToRect } from "../geometry";
import type { Direction, Point, Rect } from "../geometry";
import { PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import type { General } from "../roster";
import type { Effect, Run } from "../rules";
import { envelope, scatter } from "../skill-show";
import type { Area, ShowChannels } from "../skill-show";
import type { CastContext, FrameContext, SkillShow, SkillStage } from "../skill-stage";

export const IRON_WALL_GENERAL: General = "김시민";
/** Display-only staging of the iron wall, in milliseconds from the cast unless named otherwise. The rules shove the foes and start
 *  the shield on the cast tick; these numbers only time the picture drawn around them. */
export const IRON_WALL_SHOW = {
  /** The rules shove every foe whose gap to the fort wall is under this many pixels. */
  get reach() { return CHAOS_RULES.manualWall.knockbackBand; },
  /** One plate for every this many pixels of wall. */
  spacing: 16,
  /** Each side's plates burst up from its middle to its corners. */
  firstPlate: 0, lastPlate: 50, jitter: 10, rise: 70,
  /** Every plate stands by here and the wall rings; the scene slides a shoved foe back over about as long. */
  slam: 130,
  kick: 130, ring: 260, flash: 100,
  /** The plates stand until here, then sink until only an iron lip is left on the walls; the slam is over when they are down. */
  stand: 520, sink: 180,
  dusk: { rise: 60, hold: 340, fall: 300 },
  mark: { rise: 50, fall: 200, still: 400, stillFall: 100 },
  /** In run seconds: the rim is gone this long after the rules' shield ends. */
  fade: .3,
} as const;

export type IronReach = {
  readonly wall: Rect;
  /** Every 4px ground cell outside the wall that the rules' shove reaches, with its gap to the wall. */
  readonly cells: readonly (Point & { readonly far: number })[];
  /** The same cells as loops one cell wide, from the wall's foot (0) out to the reach's edge, each in marching order. */
  readonly rings: readonly (readonly Point[])[];
  /** The same cells as whole rows, so the band fills in a few strokes. */
  readonly rows: readonly { readonly x: number; readonly y: number; readonly width: number }[];
};
/** The real reach on the 4px ground grid: the cells whose centre the rules shove, outside the wall itself. */
export function ironReach(wall: Rect): IronReach {
  const { reach } = IRON_WALL_SHOW, cells: (Point & { far: number })[] = [], rows: { x: number; y: number; width: number }[] = [];
  for (let y = Math.floor((wall.top - reach) / 4) * 4; y <= wall.bottom + reach; y += 4) {
    let row: { x: number; y: number; width: number } | undefined;
    for (let x = Math.floor((wall.left - reach) / 4) * 4; x <= wall.right + reach; x += 4) {
      const far = gapToRect(wall, { x: x + 2, y: y + 2 });
      if (far <= 0 || far >= reach) { row = undefined; continue; }
      cells.push({ x, y, far });
      if (row) row.width += 4; else rows.push(row = { x, y, width: 4 });
    }
  }
  const cx = (wall.left + wall.right) / 2, cy = (wall.top + wall.bottom) / 2, bearing = (cell: Point) => Math.atan2(cell.y + 2 - cy, cell.x + 2 - cx);
  const rings = Array.from({ length: Math.ceil(reach / 4) }, (_, ring) =>
    cells.filter(cell => Math.floor(cell.far / 4) === ring).sort((a, b) => bearing(a) - bearing(b)));
  return { wall, cells, rings, rows };
}

export type IronPlate = { readonly x: number; readonly y: number; readonly side: Direction; readonly riseAt: number };
/** Where the iron plates stand and when each bursts up: on the wall rectangle's own four sides, one every `spacing`, each side
 *  from its middle to its corners. With motion off nothing rises: the still variant is the reach mark alone. */
export function planPlates(cast: { readonly seed: number; readonly wall: Rect; readonly still: boolean }): IronPlate[] {
  if (cast.still) return [];
  const random = scatter(cast.seed), { wall } = cast, cascade = IRON_WALL_SHOW.lastPlate - IRON_WALL_SHOW.firstPlate;
  const side = (name: Direction, length: number, at: (along: number) => Point): IronPlate[] => {
    const count = Math.max(1, Math.round(length / IRON_WALL_SHOW.spacing));
    return Array.from({ length: count }, (_, index) => {
      const share = (index + .5) / count;
      return { ...at(share * length), side: name, riseAt: IRON_WALL_SHOW.firstPlate + Math.abs(share - .5) * 2 * cascade + random() * IRON_WALL_SHOW.jitter };
    });
  };
  const width = wall.right - wall.left, height = wall.bottom - wall.top;
  return [...side("위", width, along => ({ x: wall.left + along, y: wall.top })), ...side("좌", height, along => ({ x: wall.left, y: wall.top + along })),
    ...side("우", height, along => ({ x: wall.right, y: wall.top + along })), ...side("아래", width, along => ({ x: wall.left + along, y: wall.bottom }))];
}

/** How much of the quiet rim shows at a run time: all of it while the rules' shield is ahead, then less until it is gone `fade` after the shield ends. */
export function rimShare(time: number, shieldUntil: number): number {
  return Math.max(0, Math.min(1, 1 - (time - shieldUntil) / IRON_WALL_SHOW.fade));
}

/** A foe the rules have just shoved: it is still drawn inside the reach while the rules already hold it somewhere else. Walking never
 *  leaves a picture this far behind its foe. */
export function shoved(wall: Rect, drawn: Point, placed: Point): boolean {
  return gapToRect(wall, drawn) < IRON_WALL_SHOW.reach + SHOVE.slid
    && distance(drawn, placed) >= CHAOS_RULES.manualWall.knockbackPixels / 4;
}

type Plate = { readonly x: number; readonly foot: number; readonly lipFoot: number; readonly width: number; readonly height: number; readonly riseAt: number;
  readonly out: Point; readonly sweep: number; popped: boolean };
type Wall = {
  readonly reach: IronReach; readonly plates: readonly Plate[]; readonly centre: Point; readonly castAt: number; readonly seconds: number;
  readonly channels: ShowChannels; readonly density: number; readonly clangs: (Point & { readonly at: number })[];
  scanned: boolean; slammed: boolean; cutAt: number; glintAt: number;
};

/** A shoved foe's picture lags its place by the shove less two frames of the scene's slide; the least shove is a boss's quarter. */
const SHOVE = { slid: 8, inset: 9 } as const;
/** Plate sizes in field pixels. The north row and the side columns stand on the stone strip; the south row covers the gate face,
 *  and its lip stays up on the battlements so it never crosses a body standing before the gate. */
const PLATE = { width: 16, edge: 10, height: 24, front: 28, lip: 6, hop: 3, north: 12, inset: 7 } as const;
const OUT: Record<Direction, Point> = { 위: { x: 0, y: -1 }, 아래: { x: 0, y: 1 }, 좌: { x: -1, y: 0 }, 우: { x: 1, y: 0 } };
const STEEL = [PALETTE.silver, PALETTE.steelLight, PALETTE.silverLight, PALETTE.steelPale] as const;
const GLINTS = [PALETTE.silverLight, PALETTE.white, PALETTE.silver] as const;
const DUST = [PALETTE.sand, PALETTE.sandLight, PALETTE.cream] as const;
/** The shockwave's wake behind its front, a ring to a step: stepped, never a smooth gradient. */
const WAKE = [[PALETTE.white, .9], [PALETTE.silverLight, .8], [PALETTE.silver, .55], [PALETTE.silver, .4], [PALETTE.steelLight, .3], [PALETTE.steelMid, .2]] as const;
const COUNTS = { chips: 1, clangs: 14, flecks: 3, glints: 24 } as const;
const BEAT = { jolt: 70, white: 60, seam: 40, clang: 120, march: 90, lap: 1400, run: 5, glint: 150, twinkle: 80 } as const;
/** On the slam each top corner of the iron box flares: a four-point glint, its arm and thickness shrinking in three steps. */
const FLARE = { ms: 180, steps: [[18, 4, PALETTE.white], [13, 2, PALETTE.silverLight], [8, 2, PALETTE.silver]] } as const;
/** A sheen crosses the plates just after the slam, and the lip again every `every` while the shield holds. */
const SHEEN = { from: 60, ms: 300, every: 1500, width: .12 } as const;
const SHOUT = { size: 40, below: 18 } as const;
const SLAM_MS = IRON_WALL_SHOW.stand + IRON_WALL_SHOW.sink;

/** A plate bursting out of the ground: it clears the soil in the first seven tenths of its rise, hops, and settles. */
function lift(share: number, buried: number, hop: number): { readonly sink: number; readonly hop: number } {
  if (share >= 1) return { sink: 0, hop: 0 };
  return share < .7 ? { sink: Math.round(buried * (1 - share / .7) ** 2), hop: 0 } : { sink: 0, hop: Math.round(hop * Math.sin(Math.PI * (share - .7) / .3)) };
}

/** 김시민's iron wall. On the cast the real knockback reach lies marked in steel, a seam opens at the wall's foot and riveted iron plates
 *  burst up along all four walls while a thin front leaves the wall with the shoved foes; the plates slam home with a shake, a white
 *  ring across the reach and the shield's seconds over the fort, a sheen runs over them and they sink to an iron lip. That lip
 *  and a steel rim at the wall's foot shimmer for as long as the rules' shield is ahead, and go as it ends. */
class IronWallShow implements SkillShow {
  readonly general = IRON_WALL_GENERAL;
  readonly accent = PALETTE.steelLight;
  /** The fort and the rules' shove band round it; the effect's value is the shield's seconds, not its ground. */
  areas(_skill: Effect, run: Readonly<Run>): readonly Area[] {
    const wall = fortRect(run.fort), band = IRON_WALL_SHOW.reach, y = (wall.top + wall.bottom) / 2;
    return [{ x: wall.right + band, y, radius: (wall.bottom - wall.top) / 2 + band, from: { x: wall.left - band, y } }];
  }
  private walls: Wall[] = [];

  cast(stage: SkillStage, { skill, run, channels, density }: CastContext): void {
    const wall = fortRect(run.fort), castAt = stage.now, width = wall.right - wall.left, height = wall.bottom - wall.top;
    // A new wall takes over from the one before it: the older rim goes while this one slams.
    for (const old of this.walls) if (old.cutAt < 0) old.cutAt = castAt;
    const plates = planPlates({ seed: Math.floor(stage.random() * 0x100000000), wall, still: !channels.motion }).map((plate): Plate => {
      const upright = plate.side === "좌" || plate.side === "우";
      const x = plate.side === "좌" ? plate.x + PLATE.inset : plate.side === "우" ? plate.x - PLATE.inset : plate.x;
      const foot = plate.side === "위" ? plate.y + PLATE.north : plate.side === "아래" ? plate.y + 1 : plate.y + IRON_WALL_SHOW.spacing / 2;
      return { x: Math.round(x), foot: Math.round(foot), lipFoot: Math.round(plate.side === "아래" ? foot - PLATE.front + PLATE.lip : foot),
        width: upright ? PLATE.edge : PLATE.width, height: plate.side === "아래" ? PLATE.front : PLATE.height, riseAt: castAt + plate.riseAt, out: OUT[plate.side], sweep: (x - wall.left + (foot - wall.top) / 2) / (width + height / 2), popped: false };
    }).sort((a, b) => a.foot - b.foot || a.x - b.x);
    this.walls.push({ reach: ironReach(wall), plates, centre: { x: (wall.left + wall.right) / 2, y: (wall.top + wall.bottom) / 2 }, castAt,
      seconds: skill.value, channels, density, clangs: [], scanned: false, slammed: false, cutAt: -1, glintAt: 0 });
  }

  update(stage: SkillStage, { now, cssPixel, run, at }: FrameContext): void {
    if (!this.walls.length) return;
    this.walls = this.walls.filter(wall => this.draw(stage, wall, now, cssPixel, run, at));
  }

  /** The show takes no pooled picture: its motes, smoke and number are the stage's own, and it gives them back itself. */
  clear(): void { this.walls = []; }

  /** One frame of one wall; false once nothing of it is left on screen. */
  private draw(stage: SkillStage, wall: Wall, now: number, cssPixel: number, run: Readonly<Run>, at: FrameContext["at"]): boolean {
    const age = now - wall.castAt, { channels, reach } = wall;
    if (!channels.motion) {
      const alpha = envelope(age, 0, IRON_WALL_SHOW.mark.still, IRON_WALL_SHOW.mark.stillFall);
      stage.veil(alpha, channels);
      this.mark(stage, reach, alpha, 0);
      return age < IRON_WALL_SHOW.mark.still + IRON_WALL_SHOW.mark.stillFall;
    }
    if (!wall.scanned) { wall.scanned = true; this.scan(stage, wall, run, at, now); }
    if (!wall.slammed && age >= IRON_WALL_SHOW.slam) { wall.slammed = true; this.slam(stage, wall, cssPixel); }
    // A run that is over stops its clock, so its rim goes by the stage's clock instead.
    if (wall.cutAt < 0 && run.phase !== "playing" && run.phase !== "choice" && run.phase !== "general") wall.cutAt = now;
    const cut = wall.cutAt < 0 ? 1 : Math.max(0, 1 - (now - wall.cutAt) / (IRON_WALL_SHOW.fade * 1000));
    const share = rimShare(run.time, run.shieldUntil) * cut, slamming = age < SLAM_MS;
    if (slamming) {
      stage.veil(envelope(age, IRON_WALL_SHOW.dusk.rise, IRON_WALL_SHOW.dusk.hold, IRON_WALL_SHOW.dusk.fall), channels);
      this.mark(stage, reach, envelope(age, IRON_WALL_SHOW.mark.rise, IRON_WALL_SHOW.slam + IRON_WALL_SHOW.ring - IRON_WALL_SHOW.mark.rise, IRON_WALL_SHOW.mark.fall), age);
      this.waves(stage, wall, age);
    }
    // No glint born late in the hold may outlive the rim.
    const lasting = wall.cutAt < 0 ? Math.max(0, run.shieldUntil - run.time) * 1000 : 0;
    this.rim(stage, wall, now, age, share, lasting);
    this.plates(stage, wall, now, age, share);
    if (channels.flash) this.flare(stage, wall, age);
    for (const clang of channels.flash ? wall.clangs : []) {
      const since = now - clang.at;
      if (since >= BEAT.clang) continue;
      const arm = since < BEAT.clang / 3 ? 7 : since < BEAT.clang * 2 / 3 ? 5 : 3, x = Math.round(clang.x), y = Math.round(clang.y);
      stage.trails.fillStyle(PALETTE.silverLight, 1).fillRect(x - arm, y - 1, arm * 2, 2).fillRect(x - 1, y - arm, 2, arm * 2)
        .fillStyle(PALETTE.white, 1).fillRect(x - 2, y - 2, 4, 4);
    }
    return slamming || share > 0;
  }

  /** The real reach on the ground, in steel: the band filled pale and its outer edge marching. Never red, and under the danger marks. */
  private mark(stage: SkillStage, reach: IronReach, alpha: number, age: number): void {
    if (alpha <= 0) return;
    const { ground } = stage, edge = reach.rings[reach.rings.length - 1], phase = Math.floor(age / 70);
    ground.fillStyle(PALETTE.steelLight, .24 * alpha);
    for (const row of reach.rows) ground.fillRect(row.x, row.y, row.width, 4);
    ground.fillStyle(PALETTE.silver, .85 * alpha);
    edge.forEach((cell, index) => { if (Math.floor((index + phase) / 3) % 2 === 0) ground.fillRect(cell.x, cell.y, 4, 4); });
  }

  /** Two fronts cross the reach from the wall outward: a thin one on the cast, with the shoved foes, and on the slam a white flash
   *  and the heavy stepped shockwave. With flashes off only a dim front runs each time. */
  private waves(stage: SkillStage, wall: Wall, age: number): void {
    const { ground } = stage, { reach, channels } = wall, { rings } = reach;
    const loop = (ring: number, paint: Paint, alpha: number) => {
      const cells = rings[ring];
      if (!cells) return;
      ground.fillStyle(paint, alpha);
      for (const cell of cells) ground.fillRect(cell.x, cell.y, 4, 4);
    };
    if (age < IRON_WALL_SHOW.kick) {
      const front = Math.floor((rings.length + 2) * age / IRON_WALL_SHOW.kick);
      if (channels.flash) { loop(front, PALETTE.white, .85); loop(front - 1, PALETTE.silverLight, .5); loop(front - 2, PALETTE.silver, .25); }
      else loop(front, PALETTE.steelMid, .4);
    }
    const since = age - IRON_WALL_SHOW.slam;
    if (since < 0 || since >= IRON_WALL_SHOW.ring) return;
    if (channels.flash && since < IRON_WALL_SHOW.flash) {
      ground.fillStyle(PALETTE.silverLight, since < IRON_WALL_SHOW.flash / 2 ? .5 : .25);
      for (const row of reach.rows) ground.fillRect(row.x, row.y, row.width, 4);
    }
    const front = Math.floor((rings.length + WAKE.length) * (1 - (1 - since / IRON_WALL_SHOW.ring) ** 2));
    if (channels.flash) WAKE.forEach(([paint, alpha], step) => loop(front - step, paint, alpha));
    else loop(front, PALETTE.steelMid, .4);
  }

  /** The wall's foot: a dark seam while the plates burst from it, then the steel rim with its marching glints and two bright runs
   *  chasing each other round the fort for as long as the shield holds. */
  private rim(stage: SkillStage, wall: Wall, now: number, age: number, share: number, lasting: number): void {
    const { ground } = stage, foot = wall.reach.rings[0], plinth = wall.reach.rings[1];
    if (age < IRON_WALL_SHOW.slam) {
      ground.fillStyle(PALETTE.slateDeep, .75 * Math.min(1, age / BEAT.seam));
      for (const cell of foot) ground.fillRect(cell.x, cell.y, 4, 4);
      return;
    }
    if (share <= 0) return;
    ground.fillStyle(PALETTE.steelDeep, .45 * share);
    for (const cell of plinth) ground.fillRect(cell.x, cell.y, 4, 4);
    ground.fillStyle(PALETTE.steel, .9 * share);
    for (const cell of foot) ground.fillRect(cell.x, cell.y, 4, 4);
    const march = Math.floor(age / BEAT.march), lead = Math.floor(age % BEAT.lap / BEAT.lap * foot.length);
    ground.fillStyle(PALETTE.steelLight, .9 * share);
    foot.forEach((cell, index) => { if (Math.floor((index + march) / 3) % 2 === 0) ground.fillRect(cell.x, cell.y, 4, 4); });
    for (const start of [lead, lead + Math.floor(foot.length / 2)]) for (let step = 0; step < BEAT.run; step++) {
      const cell = foot[(start + step) % foot.length];
      ground.fillStyle(step === BEAT.run - 1 ? PALETTE.white : PALETTE.silverLight, share).fillRect(cell.x, cell.y, 4, 4);
    }
    if (wall.cutAt >= 0 || now < wall.glintAt || lasting <= 0) return;
    wall.glintAt = now + BEAT.glint / Math.max(.25, wall.density);
    const cell = foot[Math.floor(stage.random() * foot.length)];
    stage.mote({ x: cell.x + 2, y: cell.y + 2 }, (stage.random() - .5) * 8, -(14 + stage.random() * 18), -6,
      Math.min(420 + stage.random() * 280, lasting), GLINTS[Math.floor(stage.random() * GLINTS.length)], true, 0, 2);
  }

  /** The plates over the bodies: bursting up, standing through the slam, then down to the lip that stays while the shield holds. */
  private plates(stage: SkillStage, wall: Wall, now: number, age: number, share: number): void {
    const since = age - IRON_WALL_SHOW.slam, jolt = since >= 0 && since < BEAT.jolt ? 2 : 0;
    const gone = age <= IRON_WALL_SHOW.stand ? 0 : Math.min(1, (age - IRON_WALL_SHOW.stand) / IRON_WALL_SHOW.sink);
    const white = wall.channels.flash && since >= 0 && since < BEAT.white;
    const sweep = since < SHEEN.from ? -1 : (since - SHEEN.from) % SHEEN.every / SHEEN.ms, lip = Math.round(PLATE.lip * Math.min(1, gone * 2) * share);
    const twinkling = wall.channels.flash && since >= BEAT.white && gone === 0;
    wall.plates.forEach((plate, index) => {
      const rising = now - plate.riseAt;
      if (rising < 0) return;
      if (!plate.popped) { plate.popped = true; this.chip(stage, plate, wall.density); }
      const up = lift(rising / IRON_WALL_SHOW.rise, plate.height, PLATE.hop), shown = plate.height - Math.max(up.sink, Math.round(plate.height * gone ** 2));
      const lit = Math.abs(plate.sweep - sweep) < SHEEN.width;
      if (lip > 0) this.slab(stage.field, plate, lip, plate.lipFoot, false, lit);
      if (shown > 0) this.slab(stage.field, plate, shown, plate.foot - up.hop + jolt, white, lit);
      // A rivet here and there catches the light for a beat; which one is a fixed pattern, not a draw.
      if (!twinkling || (index * 7 + Math.floor((since + index * 37) / BEAT.twinkle) * 13) % 11) return;
      const x = plate.x - plate.width / 2 + (plate.width > PLATE.edge ? 4 : plate.width / 2), y = plate.foot - plate.height + 6;
      stage.trails.fillStyle(PALETTE.white, 1).fillRect(x - 3, y - 1, 6, 2).fillRect(x - 1, y - 3, 2, 6);
    });
  }

  private flare(stage: SkillStage, wall: Wall, age: number): void {
    const since = age - IRON_WALL_SHOW.slam, rect = wall.reach.wall;
    if (since < 0 || since >= FLARE.ms) return;
    const [arm, thick, paint] = FLARE.steps[Math.floor(since / FLARE.ms * FLARE.steps.length)];
    for (const x of [rect.left + PLATE.inset, rect.right - PLATE.inset]) for (const y of [rect.top + PLATE.north - PLATE.height, rect.bottom + 1 - PLATE.front])
      stage.trails.fillStyle(paint, 1).fillRect(x - arm, y - thick / 2, arm * 2, thick).fillRect(x - thick / 2, y - arm, thick, arm * 2)
        .fillStyle(PALETTE.white, 1).fillRect(x - 3, y - 3, 6, 6);
  }

  /** One riveted plate, its top `shown` rows standing out of the ground: a bright cap, a lit and a shaded edge, a band and rivets. */
  private slab(field: Phaser.GameObjects.Graphics, plate: Plate, shown: number, foot: number, white: boolean, lit: boolean): void {
    const { width, height } = plate, x = plate.x - width / 2, top = foot - shown;
    field.fillStyle(PALETTE.outline, 1).fillRect(x, top, width, shown);
    if (shown < 2) return;
    field.fillStyle(white ? PALETTE.white : lit ? PALETTE.steelLight : PALETTE.steel, 1).fillRect(x + 1, top + 1, width - 2, shown - 1);
    if (white) return;
    field.fillStyle(lit ? PALETTE.white : PALETTE.silver, 1).fillRect(x + 1, top + 1, width - 2, Math.min(2, shown - 1));
    if (shown <= 3) return;
    field.fillStyle(lit ? PALETTE.silverLight : PALETTE.steelLight, 1).fillRect(x + 1, top + 3, 1, shown - 3);
    field.fillStyle(PALETTE.steelDeep, 1).fillRect(x + width - 3, top + 3, 2, shown - 3);
    const band = Math.floor(height / 2);
    if (shown > band + 2) field.fillStyle(PALETTE.steelDeep, 1).fillRect(x + 1, top + band, width - 2, 2);
    for (const row of shown < 10 ? [3] : [5, height - 7]) {
      if (shown < row + 3) continue;
      for (const column of width > PLATE.edge ? [3, width - 5] : [width / 2 - 1])
        field.fillStyle(PALETTE.outline, 1).fillRect(x + column, top + row + 1, 2, 2).fillStyle(lit ? PALETTE.white : PALETTE.silverLight, 1).fillRect(x + column, top + row, 2, 2);
    }
  }

  /** Steel chips and a breath of dust thrown outward as a plate breaks the ground. */
  private chip(stage: SkillStage, plate: Plate, density: number): void {
    const foot = { x: plate.x, y: plate.foot }, { out } = plate;
    for (let chip = 0; chip < Math.round(COUNTS.chips * density); chip++) {
      const throwing = 40 + stage.random() * 60;
      stage.mote(foot, out.x * throwing + (stage.random() - .5) * 50, out.y * throwing - (50 + stage.random() * 60), 420,
        240 + stage.random() * 140, STEEL[Math.floor(stage.random() * STEEL.length)], false, 0, 2 + chip % 2);
    }
    if (stage.random() < density / 2)
      stage.mote(foot, out.x * 20 + (stage.random() - .5) * 20, out.y * 20 - (12 + stage.random() * 24), -20, 360 + stage.random() * 200, DUST[Math.floor(stage.random() * DUST.length)], false, stage.random() * 60, 2);
  }

  /** Sparks where the wall throws a foe back: a clang on the side of the foe that faces the wall, and flecks thrown the way it goes. */
  private scan(stage: SkillStage, wall: Wall, run: Readonly<Run>, at: FrameContext["at"], now: number): void {
    for (const enemy of run.enemies) {
      if (wall.clangs.length >= COUNTS.clangs) return;
      const drawn = at(enemy);
      if (enemy.hp <= 0 || !shoved(wall.reach.wall, drawn, enemy)) continue;
      const far = distance(drawn, enemy), ux = (enemy.x - drawn.x) / far, uy = (enemy.y - drawn.y) / far;
      const spot = { x: drawn.x - ux * SHOVE.inset, y: drawn.y - uy * SHOVE.inset };
      wall.clangs.push({ ...spot, at: now });
      for (let fleck = 0; fleck < Math.round(COUNTS.flecks * wall.density); fleck++) {
        const throwing = 60 + stage.random() * 80;
        stage.mote(spot, ux * throwing + (stage.random() - .5) * 60, uy * throwing - (30 + stage.random() * 50), 300,
          200 + stage.random() * 160, GLINTS[fleck % GLINTS.length], true, 0, 2);
      }
    }
  }

  /** The plates stand: the shield's seconds over the fort, one small shake, a streak thrown outward off every plate, glints rising
   *  off the reach and dust at the corners. */
  private slam(stage: SkillStage, wall: Wall, cssPixel: number): void {
    const { centre, density, reach } = wall, rect = reach.wall;
    stage.shout(centre.x, centre.y + SHOUT.below, String(Number(wall.seconds.toFixed(1))), PALETTE.silverLight, cssPixel, true, SHOUT.size);
    stage.shake(.008, 90);
    for (const plate of wall.plates) {
      if (stage.random() >= density) continue;
      const pace = 260 + stage.random() * 140;
      stage.mote({ x: plate.x, y: plate.foot - plate.height / 2 }, plate.out.x * pace, plate.out.y * pace, 0, 150 + stage.random() * 70,
        stage.random() < .5 ? PALETTE.white : PALETTE.silverLight, false, 0, 3);
    }
    for (let index = 0; index < Math.round(COUNTS.glints * density); index++) {
      const cell = reach.cells[Math.floor(stage.random() * reach.cells.length)];
      stage.mote({ x: cell.x + 2, y: cell.y + 2 }, (stage.random() - .5) * 16, -(24 + stage.random() * 40), -10,
        420 + stage.random() * 320, GLINTS[index % GLINTS.length], true, stage.random() * 160);
    }
    [[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]].forEach(([x, y], index) => stage.puff(x, y - 6, index * 40));
  }
}

export const show: SkillShow = new IronWallShow();
