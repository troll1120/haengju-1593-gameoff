import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import type { ChaosSkillEvent } from "../chaos-contract";
import type Phaser from "phaser";
import { CENTER, HEIGHT, WIDTH, fortRect } from "../geometry";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import type { General } from "../roster";
import type { Run } from "../rules";
import { skillVfx } from "../skill-vfx";
import type { SkillVfx } from "../skill-vfx";
import { envelope, scatter } from "../skill-show";
import type { ShowChannels } from "../skill-show";
import type { CastContext, FrameContext, SkillShow, SkillStage } from "../skill-stage";

export const BELL_GENERAL: General = "사명대사";
const RULES = CHAOS_RULES.skills.bell, HZ = CHAOS_RULES.simulationHz, CELL = 4;
type Layer = SkillStage["ground"];

/** Display-only staging of 사명대사's great bell. The rules own every size, count and time: where a toll rings, how far and how fast its
 *  ring runs (the event's own radius, currentRadius and ticks) and how many tolls a cast rings and how far apart (CHAOS_RULES.skills.bell).
 *  These only shade, lean and time the picture laid over them. */
export const BELL_SHOW = {
  /** Shares of a toll's real radius: the ring's body and wake behind its front. */
  body: .022, wake: .04,
  /** The dusk's share, and the picture's rise and fall over a toll's own life in milliseconds. */
  dusk: .6, rise: 90, fall: 260,
  /** Pixels the lip leans, swings per toll interval, and pixels the striker rests off the flank. */
  sway: 4, swings: 1.5, rest: 10,
  /** The strike's shake, its dust chips at full density, and the ticks after which a toll first met is not struck late. */
  shake: .008, chips: 14, stale: 6,
  /** The cast bell's chip size (36px tall, about one general's height), pixels from a general's feet up to the top of his drawn head,
   *  the gap the bell keeps off him and off the castle wall, and by band how much wider each ring is drawn and how many ripples one
   *  toll carries. */
  scale: 1, head: 28, gap: 2, ringWidth: [1, 1, 1, 1.2, 1.5, 2], ripples: [1, 1, 1, 1, 1.5, 2],
} as const;

export type Toll = {
  readonly event: Readonly<ChaosSkillEvent>;
  /** Ticks since the rules started it, with the share of the next tick already under way. */
  readonly age: number;
  /** The rules' currentRadius carried on by that share of a tick, never past the real radius: display interpolation only. */
  readonly front: number;
  readonly passive: boolean;
};
/** The bell tolls the rules have started and not yet dropped; a scheduled toll is not read before its startedTick.
 *  The runtime's trigger owns routing, even when earlier manual waves have expired or several army tolls coexist. */
export function bellTolls(run: Pick<Run, "chaosSkills">): Toll[] {
  const state = run.chaosSkills;
  if (!state) return [];
  const bells = state.events.filter(event => event.kind === "bell"), ahead = Math.min(1, Math.max(0, state.remainder) * HZ);
  return bells.filter(event => event.startedTick <= state.tick).map(event => ({ event, age: state.tick + ahead - event.startedTick,
    front: event.resolved ? event.radius : Math.min(event.radius, event.currentRadius + event.radius * ahead / (event.impactTick - event.startedTick)),
    passive: event.trigger === "army" }));
}

export type FieldCell = Point & { readonly far: number; readonly odd: boolean };
const measured = new Map<string, readonly FieldCell[]>();
/** Every 4px ground cell of the field sorted nearest the bell first, which ringBand's search relies on; measured once per bell place and
 *  field size. The bell rings where 사명대사 stands, so the last few places are kept. */
export function bellField(at: Point): readonly FieldCell[] {
  const key = `${at.x},${at.y},${WIDTH},${HEIGHT}`, known = measured.get(key);
  if (known) return known;
  const cells: FieldCell[] = [];
  for (let y = 0; y < HEIGHT; y += CELL) for (let x = 0; x < WIDTH; x += CELL)
    cells.push({ x, y, far: Math.hypot(x + CELL / 2 - at.x, y + CELL / 2 - at.y), odd: (x + y) / CELL % 2 === 1 });
  cells.sort((a, b) => a.far - b.far);
  if (measured.size >= 16) measured.delete(measured.keys().next().value as string);
  measured.set(key, cells);
  return cells;
}
export type RingBand = { readonly near: number; readonly far: number; readonly paint: Paint; readonly alpha: number; readonly dashed?: boolean };
// The adaptive quality guard's one visual concession: under sustained overruns each ring keeps only its
// bright lip, and the ambient tolls drop their ink band. Rules, damage and stun never change.
let leanRings = false;
export function setBellLean(lean: boolean): void { leanRings = lean; }
export function bellLean(): boolean { return leanRings; }
/** Fills the cells whose middles lie from `near` up to `far` pixels from the bell; a dashed band keeps every other cell. */
const rowCells = new Map<number, number[]>();
export function ringBand(layer: Layer, cells: readonly FieldCell[], band: RingBand): void {
  if (band.alpha <= 0 || band.far <= band.near) return;
  let low = 0, high = cells.length;
  while (low < high) {
    const middle = low + high >> 1;
    if (cells[middle].far < band.near) low = middle + 1; else high = middle;
  }
  layer.fillStyle(band.paint, band.alpha);
  if (band.dashed) {
    for (; low < cells.length && cells[low].far < band.far; low++) if (cells[low].odd) layer.fillRect(cells[low].x, cells[low].y, CELL, CELL);
    return;
  }
  // A solid band crosses each row in one or two stretches, so one fillRect per stretch of neighbouring
  // cells paints the very same pixels with a fraction of the canvas calls.
  rowCells.clear();
  for (let i = low; i < cells.length && cells[i].far < band.far; i++) {
    const cell = cells[i], xs = rowCells.get(cell.y);
    if (xs) xs.push(cell.x); else rowCells.set(cell.y, [cell.x]);
  }
  for (const [y, xs] of rowCells) {
    xs.sort((a, b) => a - b);
    let start = xs[0], end = xs[0] + CELL;
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] <= end) { if (xs[i] + CELL > end) end = xs[i] + CELL; continue; }
      layer.fillRect(start, y, end - start, CELL);
      if (i < xs.length) { start = xs[i]; end = xs[i] + CELL; }
    }
  }
}

const TONES = [PALETTE.outline, PALETTE.gold, PALETTE.brass, PALETTE.ochre, PALETTE.timber, PALETTE.leather, PALETTE.bark, PALETTE.cream, PALETTE.timberLight] as const;
/** PREVIEW ONLY (owner choice clip): ?pv=spin replaces the bell's rings with the staged staff whirlwind. Off by default. */
const PREVIEW_SPIN = typeof location === "undefined" ? false : new URLSearchParams(location.search).get("pv") === "spin";
/** Each art mark's TONES index by column, lit from the left; a one-character entry is the same in every column. */
const SHADES: Readonly<Record<string, string>> = { o: "0", b: "22221112222222222223333333444444", k: "55555555555666666666666666666666",
  p: "33333333333333334444444444444444", s: "7", c: "7", m: "6", r: "5", h: "7", l: "8", t: "4" };
/** A Korean temple bell's left half, one mark a chip, mirrored about its axis: the dragon loop it hangs by, a round shoulder, the upper
 *  band (k), a panel of nine studs (s on p), the lotus striking seat (m round c) and the lower band over a slightly flared lip. The
 *  striker is its log (l, t) on two ropes (r), struck face (h) toward the bell. */
const BELL = ["............oooo", "...........obbbb", "...........obooo", "...........obo..", "...........obo..", ".........ooooooo",
  ".......oobbbbbbb", ".....oobbbbbbbbb", "....obbbbbbbbbbb", "...obbbbbbbbbbbb", "...okkkkkkkkkkkk", "...okkkkkkkkkkkk",
  "...obbbbbbbbbbbb", "..obbbbbbbbbbbbb", "..obpppppppbbbbb", "..obpspspspbbbbb", "..obpppppppbbbbb", "..obpspspspbbbbb",
  "..obpppppppbbbbb", "..obpspspspbbbbb", "..obpppppppbbbbb", "..obbbbbbbbbbbbb", ".obbbbbbbbbbbbbb", ".obbbbbbbbbbbbbb",
  ".obbbbbbbbbbbbmm", ".obbbbbbbbbbbmcc", ".obbbbbbbbbbbmcc", ".obbbbbbbbbbbmcc", ".obbbbbbbbbbbmcc", ".obbbbbbbbbbbbmm",
  ".obbbbbbbbbbbbbb", ".obbbbbbbbbbbbbb", ".okkkkkkkkkkkkkk", ".okkkkkkkkkkkkkk", ".obbbbbbbbbbbbbb", "..oooooooooooooo"]
  .map(half => half + [...half].reverse().join(""));
const STRIKER = ["...r......r...", "...r......r...", "...r......r...", "...r......r...", "oooooooooooooo", "ohlllllllllkko", "ohttttttttttko",
  "ohttttttttttko", "oooooooooooooo"];
/** In chips of the bell's own grid: the row laid on the toll's place, the upper band that counts the tolls, and where the striker meets the flank. */
const ART = { columns: 32, anchorRow: 18, band: { row: 10, rows: 2, column: 4, columns: 24 }, striker: { row: 20, column: 31 } } as const;
type ChipRun = { readonly x: number; readonly y: number; readonly width: number };
function toneRuns(rows: readonly string[]): ChipRun[][] {
  const tone = (row: string, x: number): number => { const shade = SHADES[row[x]]; return shade ? Number(shade[Math.min(x, shade.length - 1)]) : -1; };
  const runs: ChipRun[][] = TONES.map(() => []);
  rows.forEach((row, y) => {
    for (let from = 0, x = 1; x <= row.length; x++) {
      if (x < row.length && tone(row, x) === tone(row, from)) continue;
      if (tone(row, from) >= 0) runs[tone(row, from)].push({ x: from, y, width: x - from });
      from = x;
    }
  });
  return runs;
}
const BELL_RUNS = toneRuns(BELL), STRIKER_RUNS = toneRuns(STRIKER);

export type BellLook = { readonly scale: number; readonly alpha: number;
  /** Pixels the lip leans: the bell hangs from its loop, so each row leans by its share of the way down. */
  readonly sway: number;
  /** Pixels between the striker and the flank; without it no striker is drawn. */
  readonly gap?: number;
  /** The upper band as the cast's count: the tolls it rings, those rung, and whether the last has only just rung. */
  readonly tolls?: { readonly count: number; readonly rung: number; readonly fresh: boolean } };
/** Where the bell hangs for a toll rung at `at` (사명대사's feet): just over his head, or where that would lie on the castle, on his
 *  outer side beside or below him. A manual cast also clears the bell's sway and the striker's entire swing. Returned as drawBell's anchor. */
export function bellPlace(at: Point, fort: number, scale: number, manual = false): Point {
  at = { x: Math.round(at.x), y: Math.round(at.y) };
  const half = ART.columns / 2 * scale, up = ART.anchorRow * scale, down = (BELL.length - ART.anchorRow) * scale, { head, gap } = BELL_SHOW;
  const left = half + (manual ? BELL_SHOW.sway : 0);
  const right = manual ? Math.max(left, (ART.striker.column - ART.columns / 2 + STRIKER[0].length) * scale + BELL_SHOW.rest) : half;
  const wall = fortRect(fort, gap), side = at.x < CENTER.x ? -1 : 1;
  const spots = [{ x: at.x, y: at.y - head - gap - down },
    ...(manual && (at.x <= wall.left || at.x >= wall.right) ? [{
      x: side < 0 ? Math.min(at.x, wall.left - right) : Math.max(at.x, wall.right + left), y: at.y - head - gap - down,
    }] : []),
    at.y > CENTER.y ? { x: at.x, y: at.y + gap + up } : { x: at.x, y: at.y - head - gap - down },
    { x: at.x + side * (head / 2 + gap + (side < 0 ? right : left)), y: at.y - head / 2 }];
  const clear = ({ x, y }: Point): boolean => x + right <= wall.left || x - left >= wall.right || y + down <= wall.top || y - up >= wall.bottom;
  return spots.find(clear) ?? spots[spots.length - 1];
}
export function drawBell(layer: Layer, at: Point, look: BellLook): void {
  const { scale, alpha } = look, left = Math.round(at.x) - ART.columns / 2 * scale, top = Math.round(at.y) - ART.anchorRow * scale;
  const lean = (row: number): number => Math.round(look.sway * row / (BELL.length - 1));
  const fill = (runs: readonly ChipRun[][], from: Point, shift: (row: number) => number): void => runs.forEach((tone, index) => {
    layer.fillStyle(TONES[index], alpha);
    for (const run of tone) layer.fillRect(from.x + run.x * scale + shift(run.y), from.y + run.y * scale, run.width * scale, scale);
  });
  fill(BELL_RUNS, { x: left, y: top }, lean);
  if (look.tolls) {
    const { count, rung, fresh } = look.tolls, band = ART.band, width = band.columns * scale, x = left + band.column * scale + lean(band.row);
    for (let index = 0; index < count; index++) {
      const from = Math.floor(index * width / count) + 1, to = Math.floor((index + 1) * width / count) - 1;
      layer.fillStyle(index >= rung ? PALETTE.ochre : fresh && index === rung - 1 ? PALETTE.white : PALETTE.gold, alpha)
        .fillRect(x + from, top + band.row * scale, to - from, band.rows * scale);
    }
  }
  if (look.gap !== undefined)
    fill(STRIKER_RUNS, { x: left + ART.striker.column * scale + Math.round(look.gap), y: top + ART.striker.row * scale - Math.round(look.gap / 4) }, () => 0);
}

type Tone = { readonly width: number; readonly paint: Paint; readonly alpha: number; readonly dashed?: boolean };
/** From the front inward. The first band is centred on the real front; with flashes off nothing is white or cream. */
function ringTones(radius: number, bright: boolean, level: number): readonly Tone[] {
  const grow = BELL_SHOW.ringWidth[chaosSkillBand(level)];
  const body = Math.max(CELL, radius * BELL_SHOW.body * grow), wake = Math.max(CELL, radius * BELL_SHOW.wake * grow);
  return bright
    ? [{ width: CELL, paint: PALETTE.white, alpha: .85 }, { width: CELL, paint: PALETTE.cream, alpha: .7 }, { width: body, paint: PALETTE.gold, alpha: .55 },
      { width: body, paint: PALETTE.brass, alpha: .42 }, { width: CELL, paint: PALETTE.dark, alpha: .4 }, { width: wake, paint: PALETTE.ochre, alpha: .22, dashed: true }]
    : [{ width: CELL * 2, paint: PALETTE.copper, alpha: .5 }, { width: body, paint: PALETTE.ochre, alpha: .32 }, { width: CELL, paint: PALETTE.dark, alpha: .26 }];
}
const CHIPS = [PALETTE.sandLight, PALETTE.gold, PALETTE.cream, PALETTE.sand] as const;
/** A toll carries one ripple for each toll its cast rings at that level, evenly spaced inside its front, so a higher level shows more rings. */
const rippleShares = (level: number): number[] => {
  const band = chaosSkillBand(level), count = Math.round(RULES.waves[band] * BELL_SHOW.ripples[band]);
  return Array.from({ length: count }, (_, index) => (index + 1) / (count + 1));
};

/** 사명대사's great bell as the rules ring it. While a cast's tolls are live a bronze temple bell hangs where they ring: the striker
 *  swings in on each toll, the bell leans and settles, a bright ring runs out over the ground on the toll's real radius with fainter
 *  ripples behind it, and the upper band lights one segment for each toll rung of those the cast rings. Motion off keeps the bell
 *  upright over still rings at even shares of the real reach. The rules deal the damage and the stun; this only draws. */
class BellShow implements SkillShow {
  readonly general = BELL_GENERAL;
  readonly accent = PALETTE.gold;
  private density = 1;
  private readonly struck = new Set<number>();
  private foes: readonly { readonly x: number; readonly y: number }[] = [];
  private stage: SkillStage | undefined;
  private fort = 0;
  private squads: Run["squads"] = [];
  // PREVIEW ONLY (owner choice clip, ?pv=spin): the whirlwind's staged sprites, kept for the cast's life.
  private readonly spinners = new Map<number, { sprites: Phaser.GameObjects.Sprite[] }>();

  /** The picture is read from run.chaosSkills every frame, so a cast only brings this device's particle headroom. */
  cast(_stage: SkillStage, { density }: CastContext): void { this.density = density; }

  update(stage: SkillStage, frame: FrameContext): void {
    this.stage = stage; this.fort = frame.run.fort; this.squads = frame.run.squads;
    this.foes = frame.run.enemies.filter(enemy => enemy.hp > 0);
    const casts = new Map<number, Toll[]>();
    for (const toll of bellTolls(frame.run)) if (!toll.passive) casts.set(toll.event.castId, [...casts.get(toll.event.castId) ?? [], toll]);
    const live = new Set([...casts.values()].flat().map(toll => toll.event.id));
    for (const id of this.struck) if (!live.has(id)) this.struck.delete(id);
    for (const tolls of casts.values()) {
      const vfx = skillVfx(frame.run, frame.run.squads.find(squad => squad.id === tolls[0].event.squad));
      this.toll(stage, tolls, frame.channels, vfx);
    }
    for (const [castId, set] of this.spinners) if (!casts.has(castId)) {
      for (const sprite of set.sprites) stage.freeSprite(sprite);
      this.spinners.delete(castId);
    }
  }

  clear(): void {
    if (this.stage) for (const set of this.spinners.values()) for (const sprite of set.sprites) this.stage.freeSprite(sprite);
    this.spinners.clear();
    this.struck.clear(); this.density = 1;
  }

  private toll(stage: SkillStage, tolls: readonly Toll[], channels: ShowChannels, vfx: SkillVfx): void {
    const last = tolls.reduce((latest, toll) => toll.event.wave > latest.event.wave ? toll : latest), { event } = last, { motion } = channels;
    const count = RULES.waves[chaosSkillBand(event.level)], ms = 1000 / HZ;
    const lit = motion ? Math.max(...tolls.map(toll => envelope(toll.age * ms, BELL_SHOW.rise,
      (toll.event.untilTick - toll.event.startedTick) * ms - BELL_SHOW.rise - BELL_SHOW.fall, BELL_SHOW.fall))) : 1;
    if (PREVIEW_SPIN) { this.whirlToll(stage, tolls, channels, last, event, lit, motion, vfx); return; }
    stage.veil(BELL_SHOW.dusk * lit, channels);
    if (motion) for (const toll of tolls) { this.strike(stage, toll); this.ring(stage.ground, toll, channels.flash, vfx); }
    else this.stand(stage.ground, event, vfx);
    // The striker springs back off the flank and, while the cast has another toll to ring, swings in again to meet it on that toll's tick.
    const swing = Math.min(1, last.age / RULES.interval), again = event.wave + 1 < count;
    // The bell stays over 사명대사 as he walks; each ring still runs out from where its toll was struck.
    drawBell(stage.field, bellPlace(this.squads.find(squad => squad.id === event.squad) ?? event.to, this.fort, BELL_SHOW.scale, true), { scale: BELL_SHOW.scale, alpha: lit * vfx.alpha,
      sway: motion ? -BELL_SHOW.sway * Math.sin(Math.PI * 2 * BELL_SHOW.swings * swing) * (1 - swing) : 0,
      gap: BELL_SHOW.rest * (!motion ? 1 : swing < .5 ? Math.sin(Math.PI * swing) : again ? 1 - (swing * 2 - 1) ** 2 : 1),
      tolls: { count, rung: event.wave + 1, fresh: motion && channels.flash && last.age < BELL_SHOW.stale } });
  }

  /** PREVIEW ONLY (owner choice clip, ?pv=spin): a staff whirlwind — the monk's charge at the heart, spinning slash arcs sweeping
   *  the crowd, afterimage slashes at the rim from army level 10, and hit sparks on the foes inside the sweep. Existing sprites only;
   *  the rules, damage and stun stay exactly the bell's own. */
  private whirlToll(stage: SkillStage, tolls: readonly Toll[], channels: ShowChannels,
    last: Toll, event: Readonly<ChaosSkillEvent>, lit: number, motion: boolean, vfx: SkillVfx): void {
    stage.veil(BELL_SHOW.dusk * .6 * lit, channels);
    if (motion) for (const toll of tolls) this.strike(stage, toll);
    const centre = event.to, reach = Math.max(60, Math.min(event.radius, 170));
    const spin = motion ? last.age * .85 : 0, band = chaosSkillBand(event.level);
    const arms = Math.ceil((band >= 3 ? 12 : 8) * vfx.density), ghosts = band >= 3 && vfx.heavy ? 4 : 0, sparks = Math.ceil(6 * vfx.density);
    let set = this.spinners.get(event.castId);
    if (!set) { set = { sprites: [] }; this.spinners.set(event.castId, set); }
    while (set.sprites.length < arms + ghosts + 1 + sparks) {
      const sprite = stage.sprite("slash", 0);
      if (!sprite) break;
      set.sprites.push(sprite);
    }
    let index = 0;
    for (let arm = 0; arm < arms && index < set.sprites.length; arm++, index++) {
      const sprite = set.sprites[index], turn = spin + arm * Math.PI * 2 / arms, far = reach * (.5 + .35 * (arm % 2));
      sprite.setTexture("slash", Math.floor(last.age * .8 + arm) % 4)
        .setPosition(centre.x + Math.cos(turn) * far, centre.y + Math.sin(turn) * far * .55)
        .setRotation(turn + Math.PI / 2).setScale(1.4).setAlpha(.95 * lit * vfx.alpha).setVisible(true);
    }
    for (let ghost = 0; ghost < ghosts && index < set.sprites.length; ghost++, index++) {
      const sprite = set.sprites[index], turn = spin - .5 - ghost * .25, far = reach * .85;
      sprite.setTexture("slash", (Math.floor(last.age * .8) + 2) % 4)
        .setPosition(centre.x + Math.cos(turn) * far, centre.y + Math.sin(turn) * far * .55)
        .setRotation(turn + Math.PI / 2).setScale(1.6).setAlpha(.35 * lit * vfx.alpha).setVisible(true);
    }
    if (index < set.sprites.length) {
      const sprite = set.sprites[index++];
      sprite.setTexture("charge", Math.floor(last.age) % 4).setPosition(centre.x, centre.y)
        .setRotation(spin).setScale(2).setAlpha(lit * vfx.alpha).setVisible(true);
    }
    const near = this.foes.filter(foe => Math.hypot(foe.x - centre.x, foe.y - centre.y) <= reach).slice(0, sparks);
    for (let spot = 0; spot < sparks && index < set.sprites.length; spot++, index++) {
      const sprite = set.sprites[index], foe = near[spot];
      if (!foe) { sprite.setVisible(false); continue; }
      sprite.setTexture("spark", Math.floor(last.age * 2 + spot) % 3)
        .setPosition(foe.x, foe.y - 8).setScale(1).setAlpha(.9 * lit * vfx.alpha).setVisible(true);
    }
    while (index < set.sprites.length) set.sprites[index++].setVisible(false);
  }

  /** Once per toll, as the rules start it: a toll first met later than `stale` (a reset scene, a stalled frame) is not struck late. */
  private strike(stage: SkillStage, { event, age }: Toll): void {
    if (this.struck.has(event.id)) return;
    this.struck.add(event.id);
    if (age > BELL_SHOW.stale) return;
    stage.shake(BELL_SHOW.shake);
    const random = scatter(Math.imul(event.id, 0x9e3779b1) ^ 0x1593), count = Math.round(BELL_SHOW.chips * this.density);
    for (let index = 0; index < count; index++) {
      const turn = (index + random()) / count * Math.PI * 2, pace = 70 + random() * 60;
      stage.mote({ x: event.to.x + Math.cos(turn) * 24, y: event.to.y + 20 + Math.sin(turn) * 8 }, Math.cos(turn) * pace, Math.sin(turn) * pace * .5 - 24, 60,
        320 + random() * 160, CHIPS[index % CHIPS.length], false, random() * 50, 2 + index % 2);
    }
  }

  /** The lip lies on the toll's real front. Once the front has reached its radius the ripples run on out to it and the ring fades
   *  over the rest of the toll's life. */
  private ring(ground: Layer, { event, front, age }: Toll, bright: boolean, vfx: SkillVfx): void {
    const cells = bellField(event.to), spent = Math.max(0, age - (event.impactTick - event.startedTick)) / (event.untilTick - event.impactTick);
    const strength = Math.max(0, 1 - spent) * vfx.alpha;
    let far = front + CELL / 2;
    const tones = ringTones(event.radius, bright, event.level);
    for (const tone of leanRings || !vfx.heavy ? tones.slice(0, 1) : tones) {
      ringBand(ground, cells, { near: far - tone.width, far, paint: tone.paint, alpha: tone.alpha * strength, dashed: tone.dashed });
      far -= tone.width;
    }
    if (leanRings || !vfx.heavy) return;
    for (const share of rippleShares(event.level).filter((_, index, shares) => index < Math.ceil(shares.length * vfx.density))) {
      const at = front * (share + (1 - share) * spent);
      ringBand(ground, cells, { near: at - CELL / 2, far: at + CELL / 2, paint: bright ? PALETTE.brass : PALETTE.ochre, alpha: (.2 + .3 * share) * strength, dashed: true });
    }
  }

  /** Motion off: nothing travels. The reach stands as dashed rings at even shares of the real radius for as long as a toll is live. */
  private stand(ground: Layer, event: Readonly<ChaosSkillEvent>, vfx: SkillVfx): void {
    const cells = bellField(event.to);
    for (const share of rippleShares(event.level).filter((_, index, shares) => index < Math.ceil(shares.length * vfx.density))) {
      const at = event.radius * share;
      if (!leanRings && vfx.heavy) ringBand(ground, cells, { near: at - CELL * 1.5, far: at - CELL / 2, paint: PALETTE.dark, alpha: .3 * vfx.alpha });
      ringBand(ground, cells, { near: at - CELL / 2, far: at + CELL / 2, paint: PALETTE.gold, alpha: .8 * vfx.alpha, dashed: true });
    }
  }
}

export const show: SkillShow = new BellShow();
