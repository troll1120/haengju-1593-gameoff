import type Phaser from "phaser";
import { CHAOS_RULES } from "../chaos-contract";
import type { Point } from "../geometry";
import { LAYER, PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import { SHIP_FRAME, SHIP_POSES } from "../river";
import type { General } from "../roster";
import type { Effect } from "../rules";
import { envelope, HELD_KINDS, scatter } from "../skill-show";
import type { ShowChannels } from "../skill-show";
import type { CastContext, FrameContext, Reach, SkillShow, SkillStage } from "../skill-stage";

export const TURTLE_GENERAL: General = "이순신";
/** Display-only staging of the turtle ship's ram, in milliseconds unless named otherwise. The rules resolve every pass on the
 *  cast tick; these numbers only time the picture that follows it. */
export const TURTLE_SHOW = {
  /** One pass: the bow crosses the lane's spine in the rules' own duration. */
  get pass() { return CHAOS_RULES.fleet.passSeconds * 1000; },
  /** After a pass the ship sails off the lane's end and its water settles. */
  exit: 160, settle: 300,
  dusk: { rise: 90, fall: 280 },
  mark: { rise: 60, fall: 260, still: 500 },
  /** Broadsides of one pass as shares of the crossing; each fires these guns, counted in pixels behind the bow, from both decks. */
  volleys: [.2, .42, .64, .86], guns: [34, 70], deck: { far: -20, near: 12 },
  chips: 5, maxRams: 24, insetPixels: 2,
} as const;

const WATER = [PALETTE.white, PALETTE.silverLight, PALETTE.ally, PALETTE.teal] as const;
const FLAME = [PALETTE.white, PALETTE.cream, PALETTE.gold, PALETTE.flame, PALETTE.ember] as const;
const EMBERS = [PALETTE.gold, PALETTE.flame, PALETTE.ember] as const, SPARKS = [PALETTE.white, PALETTE.cream, PALETTE.gold] as const;
const STEAM = [PALETTE.white, PALETTE.silverLight, PALETTE.silver] as const;
const DEBRIS = [PALETTE.sandLight, PALETTE.timberLight, PALETTE.cream, PALETTE.sand, PALETTE.white] as const;

type Struck = Pick<Effect, "kind" | "x" | "y" | "value" | "target">;
/** One held hit: inside the lane the bow rams the foe, a ship outside it takes a cannon shot. `first` opens its pass. */
export type Ram = { readonly at: number; readonly pass: number; readonly x: number; readonly y: number; readonly rammed: boolean; readonly first: boolean };
export type Chip = { readonly at: number; readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly life: number; readonly paint: Paint };
export type Gun = { readonly at: number; readonly x: number; readonly y: number; readonly side: -1 | 1; readonly smokes: boolean };
export type RamPlan = { readonly times: readonly number[]; readonly rams: readonly Ram[]; readonly chips: readonly Chip[]; readonly guns: readonly Gun[];
  readonly total: number; readonly passes: number };

/** Milliseconds from the cast until the bow of pass `pass` stands at `x`: every pass crosses the spine from `from` to `to` at one pace. */
export function bowTime(pass: number, x: number, from: number, to: number): number {
  return (pass + (to === from ? 0 : Math.max(0, Math.min(1, (x - from) / (to - from))))) * TURTLE_SHOW.pass;
}
/** Where a pass's bow stands that many milliseconds after it set out; past the lane's end it keeps its pace. */
export function bowAt(sailed: number, from: number, to: number): number {
  return from + (to - from) * sailed / TURTLE_SHOW.pass;
}

/** When each held result of a cast appears and what one pass throws up on the way. A hit lands as its pass's bow reaches the
 *  foe, the k-th hit on a foe in pass k; whatever follows a hit (its fall, its coin) is timed with it. The debris and the gun
 *  ports are decoration, never outside the real lane. With motion off everything shows at once and nothing is planned to move. */
export function planRam(cast: { readonly seed: number; readonly pass: number; readonly from: Point; readonly to: Point; readonly half: number;
  readonly density: number; readonly still: boolean; readonly results: readonly Struck[] }): RamPlan {
  const random = scatter(cast.seed), { from, to, half, still } = cast, lane = from.y;
  const left = Math.min(from.x, to.x), right = Math.max(from.x, to.x), room = Math.max(0, half - TURTLE_SHOW.insetPixels);
  const inside = (x: number, y: number): Point => {
    const along = Math.max(left, Math.min(right, x)), dx = x - along, dy = y - lane, far = Math.hypot(dx, dy);
    return far <= room ? { x, y } : { x: along + dx / far * room, y: lane + dy / far * room };
  };
  const blows = new Map<number, number>(), rams: { at: number; pass: number; x: number; y: number; rammed: boolean; first: boolean }[] = [];
  let last = 0, total = 0, passes = cast.pass + 1;
  const times = cast.results.map(result => {
    if (result.kind !== "hit") return last;
    const pass = result.target === undefined ? 0 : blows.get(result.target) ?? 0;
    if (result.target !== undefined) blows.set(result.target, pass + 1);
    last = still ? 0 : bowTime(pass, result.x, from.x, to.x);
    total += result.value; passes = Math.max(passes, pass + 1);
    rams.push({ at: last, pass, x: result.x, y: result.y, rammed: Math.abs(result.y - lane) <= half, first: false });
    return last;
  });
  for (let pass = 0; pass < passes; pass++) {
    const opener = rams.filter(ram => ram.pass === pass && ram.rammed).sort((a, b) => a.at - b.at)[0];
    if (opener) opener.first = true;
  }
  const count = still ? 0 : Math.round(TURTLE_SHOW.chips * cast.density);
  const chips = rams.filter(ram => ram.rammed).slice(0, TURTLE_SHOW.maxRams).flatMap(ram => Array.from({ length: count }, (_, chip) => {
    const spot = inside(ram.x + (random() - .5) * 10, ram.y - random() * 10);
    return { at: ram.at, x: spot.x, y: spot.y, vx: 70 + random() * 190, vy: -(80 + random() * 130), life: 300 + random() * 170, paint: DEBRIS[chip % DEBRIS.length] };
  }));
  const guns = still ? [] : TURTLE_SHOW.volleys.flatMap(share => TURTLE_SHOW.guns.flatMap((back, gun) => ([-1, 1] as const).map(side => {
    const sailed = share * TURTLE_SHOW.pass + gun * 50 + random() * 30;
    const spot = inside(bowAt(sailed, from.x, to.x) - back, lane + (side < 0 ? TURTLE_SHOW.deck.far : TURTLE_SHOW.deck.near));
    return { at: cast.pass * TURTLE_SHOW.pass + sailed, x: spot.x, y: spot.y, side, smokes: gun === 0 };
  })));
  return { times, rams, chips, guns, total, passes };
}

/** The side row of the ship sheet faces right; the picture is placed by its bow tip and the middle of its hull. */
const SHIP = { key: "geobukseon", side: 28, scale: 2, bow: 53, keel: 48 } as const;
/** On the field at the ship's scale: the hull from bow to stern, and the dragon's mouth from the bow tip. */
const HULL = 100, MOUTH = { x: -4, y: -20 } as const;
const SWELL = 16, GLOW = 40, WAKE = 96, STREAK = 84, RIPPLE = { ms: 260, width: 6, sweep: 16 } as const;
/** Over every body and the field layer, under the stage's motes, trails and bursts: spray and fire fly over the hull. */
const SHIP_DEPTH = LAYER.impact + 11;
/** The jet's cells cool through FLAME: a cell hotter than `bands[n]` takes colour n, the coolest the last. */
const FIRE = { length: 46, spread: .2, drop: .26, beat: 45, surge: [0, 6, 10, 4], bands: [.88, .74, .5, .3] } as const;
/** Motes per second at full density. */
const RATE = { spray: 150, embers: 60, steam: 36 } as const;
const SHELL_MS = 110, CHIP_PULL = 520, BURST_MS = 400, RAM_AHEAD = 6, SHOUT_INSET = 44;

type Sail = { ship: Phaser.GameObjects.Sprite | undefined; sprayed: number; breathed: number; steamed: number };
type Charge = { readonly reach: Reach; readonly lane: number; readonly from: number; readonly to: number; readonly half: number; readonly castAt: number;
  readonly channels: ShowChannels; readonly density: number; readonly grain: readonly number[]; readonly sails: Sail[];
  passes: number; total: number; shouted: boolean; rams: Ram[]; chips: Chip[]; guns: Gun[] };
/** A one-shot flash; one that rides keeps its place from the bow of its pass, so it stays on the ship instead of falling astern. */
type Burst = { readonly sprite: Phaser.GameObjects.Sprite; readonly until: number; readonly rides?: { readonly charge: Charge; readonly pass: number; readonly ahead: number } };
const byTime = (a: { readonly at: number }, b: { readonly at: number }) => a.at - b.at;

/** Yi Sun-sin's turtle ship ram: the lane floods, the ship plows it from end to end behind its dragon's fire with broadsides off
 *  both decks, every held hit lands as the bow reaches its foe, and the summed damage is called at the lane's end. */
class TurtleShipShow implements SkillShow {
  readonly general = TURTLE_GENERAL;
  readonly accent = PALETTE.teal;
  readonly waits = (effect: Effect) => HELD_KINDS.has(effect.kind);
  readonly handles = (skill: Effect) => skill.shape === "lane";
  private charges: Charge[] = [];
  private bursts: Burst[] = [];

  /** The rules emit one lane effect per pass on the same tick: the first starts the charge with every held result, the others add their pass. */
  cast(stage: SkillStage, { skill, results, channels, density }: CastContext): (effect: Effect, index: number) => number {
    const from = { x: skill.fromX ?? skill.x, y: skill.fromY ?? skill.y }, to = { x: skill.x, y: skill.y }, castAt = stage.now;
    const plan = planRam({ seed: Math.floor(stage.random() * 0x100000000), pass: skill.index ?? 0, from, to, half: skill.value, density, still: !channels.motion, results });
    let charge = this.charges.find(live => live.castAt === castAt && live.lane === from.y);
    if (!charge) {
      charge = { reach: stage.reach(to.x, to.y, skill.value, from), lane: from.y, from: from.x, to: to.x, half: skill.value, castAt, channels, density,
        grain: Array.from({ length: 256 }, () => stage.random()), sails: [], passes: 0, total: 0, shouted: false, rams: [], chips: [], guns: [] };
      this.charges.push(charge);
    }
    charge.passes = Math.max(charge.passes, plan.passes); charge.total += plan.total;
    charge.rams = [...charge.rams, ...plan.rams].sort(byTime);
    charge.chips = [...charge.chips, ...plan.chips].sort(byTime);
    charge.guns = [...charge.guns, ...plan.guns].sort(byTime);
    return (_effect, index) => plan.times[index] ?? 0;
  }

  update(stage: SkillStage, { now, cssPixel }: FrameContext): void {
    if (!this.charges.length && !this.bursts.length) return;
    this.charges = this.charges.filter(charge => this.sail(stage, charge, now, cssPixel));
    this.bursts = this.bursts.filter(({ sprite, until, rides }) => {
      if (now >= until || !sprite.anims.isPlaying) { stage.freeSprite(sprite); return false; }
      if (rides) sprite.setX(Math.round(bowAt(now - rides.charge.castAt - rides.pass * TURTLE_SHOW.pass, rides.charge.from, rides.charge.to)) + rides.ahead);
      return true;
    });
  }

  clear(stage: SkillStage): void {
    for (const charge of this.charges) this.dock(stage, charge);
    for (const burst of this.bursts) stage.freeSprite(burst.sprite);
    this.charges = []; this.bursts = [];
  }

  private dock(stage: SkillStage, charge: Charge): void {
    for (const sail of charge.sails) if (sail.ship) { stage.freeSprite(sail.ship); sail.ship = undefined; }
  }

  /** Draws one charge's frame; false once it is over and its ships are given back. Motion off keeps only the still lane for half a second. */
  private sail(stage: SkillStage, charge: Charge, now: number, cssPixel: number): boolean {
    const age = now - charge.castAt, { channels } = charge, end = channels.motion ? charge.passes * TURTLE_SHOW.pass : TURTLE_SHOW.mark.still;
    if (age >= end + TURTLE_SHOW.settle) { this.dock(stage, charge); return false; }
    stage.veil(envelope(age, TURTLE_SHOW.dusk.rise, end - TURTLE_SHOW.dusk.rise, TURTLE_SHOW.dusk.fall), channels);
    stage.mark(charge.reach, { age, since: age - end, alpha: envelope(age, TURTLE_SHOW.mark.rise, end - TURTLE_SHOW.mark.rise, TURTLE_SHOW.mark.fall), channels });
    if (!channels.motion) return true;
    for (let pass = 0; pass < charge.passes; pass++) {
      const sailed = age - pass * TURTLE_SHOW.pass;
      if (sailed >= 0 && sailed < TURTLE_SHOW.pass + TURTLE_SHOW.settle)
        this.plow(stage, charge, charge.sails[pass] ??= { ship: undefined, sprayed: 0, breathed: 0, steamed: 0 }, sailed);
    }
    // A ship outside the lane is struck by a shot from the deck that faces it, in the air for the last moments before its hit.
    for (const ram of charge.rams) {
      if (ram.rammed || ram.at - age > SHELL_MS) continue;
      const flown = 1 - (ram.at - age) / SHELL_MS, gunX = bowAt(ram.at - ram.pass * TURTLE_SHOW.pass, charge.from, charge.to) - HULL / 2;
      const gunY = charge.lane + (ram.y < charge.lane ? TURTLE_SHOW.deck.far : TURTLE_SHOW.deck.near);
      for (let tail = 0; tail < FLAME.length; tail++) {
        const share = Math.max(0, flown - tail * .07), size = tail ? 2 : 4;
        stage.trails.fillStyle(FLAME[tail], 1 - tail * .15)
          .fillRect(Math.round((gunX + (ram.x - gunX) * share) / 2) * 2 - size / 2, Math.round((gunY + (ram.y - gunY) * share) / 2) * 2 - size / 2, size, size);
      }
    }
    while (charge.guns.length && charge.guns[0].at <= age) this.broadside(stage, charge, charge.guns.shift()!, now);
    while (charge.chips.length && charge.chips[0].at <= age) {
      const chip = charge.chips.shift()!;
      stage.mote(chip, chip.vx, chip.vy, CHIP_PULL, chip.life, chip.paint, false, 0, 1 + Math.floor(stage.random() * 3));
    }
    while (charge.rams.length && charge.rams[0].at <= age) this.strike(stage, charge, charge.rams.shift()!, now);
    if (!charge.shouted && age >= end) {
      charge.shouted = true;
      if (charge.total) stage.shout(charge.to - SHOUT_INSET, charge.lane - charge.half - 4, String(charge.total), PALETTE.gold, cssPixel, true);
    }
    return true;
  }

  /** One pass at `sailed` milliseconds: the flooded lane, then the ship with its fire, wash, spray, embers and steam while it is afloat. */
  private plow(stage: SkillStage, charge: Charge, sail: Sail, sailed: number): void {
    const { lane, half, density } = charge, bow = bowAt(sailed, charge.from, charge.to), beyond = Math.max(0, sailed - TURTLE_SHOW.pass);
    this.churn(stage, charge, bow, sailed, Math.max(0, 1 - beyond / TURTLE_SHOW.settle));
    const afloat = Math.max(0, 1 - beyond / TURTLE_SHOW.exit);
    if (afloat <= 0) {
      if (sail.ship) { stage.freeSprite(sail.ship); sail.ship = undefined; }
      return;
    }
    sail.ship ??= stage.sprite(SHIP.key, SHIP.side)?.setOrigin(SHIP.bow / SHIP_FRAME.width, SHIP.keel / SHIP_FRAME.height).setScale(SHIP.scale).setDepth(SHIP_DEPTH);
    sail.ship?.setFrame(SHIP.side + SHIP_POSES.walk[0] + Math.floor(sailed / 70) % SHIP_POSES.walk[1])
      .setPosition(Math.round(bow), lane + Math.floor(sailed / 110) % 2 * SHIP.scale).setAlpha(afloat).setVisible(true);
    this.breathe(stage, charge, bow, sailed, afloat);
    this.wash(stage, charge, bow, afloat);
    if (beyond > 0) return;
    for (const wanted = Math.floor(sailed * RATE.spray / 1000 * density); sail.sprayed < wanted; sail.sprayed++)
      stage.mote({ x: bow + 2 + stage.random() * 10, y: lane + (stage.random() - .5) * 2 * (half - 4) }, 60 + stage.random() * 200, -(80 + stage.random() * 140), CHIP_PULL,
        300 + stage.random() * 160, WATER[sail.sprayed % WATER.length], false, 0, 2 + Math.floor(stage.random() * 2));
    for (const wanted = Math.floor(sailed * RATE.embers / 1000 * density); sail.breathed < wanted; sail.breathed++)
      stage.mote({ x: bow + 14 + stage.random() * 30, y: lane + MOUTH.y + 4 + stage.random() * 12 }, 380 + stage.random() * 180, -(10 + stage.random() * 60), -40,
        180 + stage.random() * 150, EMBERS[sail.breathed % EMBERS.length], true, 0, 1 + Math.floor(stage.random() * 2));
    for (const wanted = Math.floor(sailed * RATE.steam / 1000 * density); sail.steamed < wanted; sail.steamed++) {
      const x = bow - HULL - stage.random() * 50;
      if (x >= charge.from - half) stage.mote({ x, y: lane + (stage.random() - .5) * 2 * (half - 6) }, (stage.random() - .5) * 24, -(14 + stage.random() * 28), -12,
        420 + stage.random() * 220, STEAM[sail.steamed % STEAM.length], true, 0, 1 + Math.floor(stage.random() * 2));
    }
  }

  /** The lane floods under the charge: firelight and a swell bulging ahead of the bow, dark water under the hull and a churned wake
   *  thinning out behind the stern; at the launch a bright ripple runs the lane's length to show where the ship is going. Flashes
   *  off keeps it pale and unlit. */
  private churn(stage: SkillStage, charge: Charge, bow: number, sailed: number, alpha: number): void {
    const { half, channels, grain } = charge, ground = stage.ground, beat = Math.floor(sailed / 100);
    const ripple = channels.flash && sailed < RIPPLE.ms ? bowAt(sailed * TURTLE_SHOW.pass / RIPPLE.ms, charge.from, charge.to) : undefined;
    const foam = channels.flash ? PALETTE.white : PALETTE.ally, froth = channels.flash ? PALETTE.silverLight : PALETTE.ally;
    for (const cell of charge.reach.cells) {
      const behind = bow - cell.x - 2, off = Math.min(1, cell.far / half);
      if (ripple !== undefined && Math.abs(cell.x + 2 - ripple + off * RIPPLE.sweep) < RIPPLE.width)
        ground.fillStyle(PALETTE.white, .5 * (1 - sailed / RIPPLE.ms)).fillRect(cell.x, cell.y, 4, 4);
      if (behind < -SWELL - GLOW || behind >= HULL + WAKE) continue;
      const speck = grain[cell.x / 4 * 7 + cell.y / 4 * 13 + beat * 5 & 255];
      if (behind < 0) {
        const crest = SWELL * (1 - off * off) + behind;
        if (crest >= 0) ground.fillStyle(crest < 4 ? foam : speck < .4 ? froth : PALETTE.ally, (crest < 4 ? .9 : .7) * alpha).fillRect(cell.x, cell.y, 4, 4);
        else if (channels.flash && crest > -GLOW && speck < .7)
          ground.fillStyle(speck < .25 ? PALETTE.gold : PALETTE.flame, .32 * (1 + crest / GLOW) * alpha).fillRect(cell.x, cell.y, 4, 4);
      } else if (behind < HULL) ground.fillStyle(speck < .3 ? PALETTE.tealDeep : PALETTE.teal, .7 * alpha).fillRect(cell.x, cell.y, 4, 4);
      else {
        const thin = 1 - (behind - HULL) / WAKE, frothy = off > .75 || speck < .3 * thin;
        ground.fillStyle(frothy ? foam : speck > .85 ? PALETTE.tealDeep : PALETTE.teal, (frothy ? .8 : .6) * thin * alpha).fillRect(cell.x, cell.y, 4, 4);
      }
    }
  }

  /** The dragon's fire: a ragged jet of 2px cells that widens, sinks toward the lane and cools from white to ember ahead of the bow. */
  private breathe(stage: SkillStage, charge: Charge, bow: number, sailed: number, alpha: number): void {
    const { grain } = charge, beat = Math.floor(sailed / FIRE.beat), length = FIRE.length + FIRE.surge[beat % FIRE.surge.length];
    const mouthX = Math.floor(bow / 2) * 2 + MOUTH.x, mouthY = charge.lane + MOUTH.y, edge = Math.max(charge.from, charge.to) + charge.half;
    for (let along = 0; along < length && mouthX + along < edge; along += 2) {
      const spread = 2 + Math.floor(along * FIRE.spread / 2) * 2, centre = mouthY + Math.round(along * FIRE.drop / 2) * 2, cool = along / length;
      for (let across = -spread; across <= spread; across += 2) {
        const heat = (1 - cool) * (1 - (across / (spread + 2)) ** 2) + (grain[((along >> 1) - beat * 3) * 7 + (across >> 1) * 13 & 255] - .5) * .4;
        if (heat < .1) continue;
        const band = FIRE.bands.findIndex(least => heat > least);
        stage.trails.fillStyle(FLAME[band < 0 ? FIRE.bands.length : band], alpha * (band < 0 ? .8 : .95)).fillRect(mouthX + along, centre + across, 2, 2);
      }
    }
  }

  /** The wake over the bodies: two dashed foam lines spreading from the stern toward the lane's edges and a short one down the keel. */
  private wash(stage: SkillStage, charge: Charge, bow: number, alpha: number): void {
    const { lane, half } = charge, stern = Math.floor((bow - HULL) / 2) * 2 + 4, start = Math.min(charge.from, charge.to) - half;
    for (let back = 0; back < STREAK && stern - back >= start; back += 2) {
      const x = stern - back, share = back / STREAK;
      if ((x % 12 + 12) % 12 >= 8) continue;
      const spread = Math.round((half - 10 + 6 * share) / 2) * 2;
      stage.trails.fillStyle(WATER[Math.floor(share * WATER.length)], (1 - share) * .9 * alpha).fillRect(x, lane - spread, 2, 2).fillRect(x, lane + spread - 2, 2, 2);
      if (share < .5) stage.trails.fillRect(x, lane, 2, 2);
    }
  }

  /** A gun port fires: a muzzle flash that stays on its deck, sparks thrown outward and, from the leading gun, smoke left behind. */
  private broadside(stage: SkillStage, charge: Charge, gun: Gun, now: number): void {
    const flash = stage.sprite("muzzle", 0), pass = Math.floor(gun.at / TURTLE_SHOW.pass);
    if (flash) {
      flash.setPosition(gun.x, gun.y + gun.side * 8).setFlipY(gun.side > 0).setVisible(true).play("muzzle");
      this.bursts.push({ sprite: flash, until: now + BURST_MS,
        rides: { charge, pass, ahead: gun.x - Math.round(bowAt(now - charge.castAt - pass * TURTLE_SHOW.pass, charge.from, charge.to)) } });
    }
    for (let spark = 0; spark < Math.round(4 * charge.density); spark++)
      stage.mote({ x: gun.x, y: gun.y + gun.side * 6 }, (stage.random() - .5) * 70, gun.side * (90 + stage.random() * 90), 0, 130 + stage.random() * 90,
        SPARKS[spark % SPARKS.length], false, 0, 1 + Math.floor(stage.random() * 2));
    if (gun.smokes) stage.puff(gun.x, gun.y + gun.side * 10, 60);
  }

  /** A held hit lands (the stage releases it on this same clock): a burst that the bow carries on, or one where the shot struck, and
   *  the shake that opens a pass. */
  private strike(stage: SkillStage, charge: Charge, ram: Ram, now: number): void {
    if (ram.first) stage.shake(.012, 90);
    const burst = stage.sprite("boom", 0);
    if (!burst) return;
    burst.setPosition(ram.x, ram.y - 6).setScale(ram.first ? 2 : 1).setVisible(true).play("boom");
    this.bursts.push({ sprite: burst, until: now + BURST_MS, ...(ram.rammed ? { rides: { charge, pass: ram.pass, ahead: RAM_AHEAD } } : {}) });
  }
}

export const show: SkillShow = new TurtleShipShow();
