import { CHAOS_RULES } from "../chaos-contract";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import { bellField, bellLean, bellPlace, bellTolls, drawBell, ringBand } from "../shows/heal-wave-show";
import type { Toll } from "../shows/heal-wave-show";
import { envelope } from "../skill-show";
import type { ShowChannels } from "../skill-show";
import type { AmbientShow, FrameContext, SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";

const RULES = CHAOS_RULES.skills.bell, HZ = CHAOS_RULES.simulationHz, CELL = 4;
type Layer = SkillStage["ground"];

/** Display-only staging of the tolls 사명대사's army rings by its own attacks and of the daze any toll leaves. The rules own each
 *  toll's place, radius, ticks and stun; these only thin, shade and time the picture. */
export const BELL_TOLLS = {
  /** Rings that run out at once: of the army's tolls the rules start within one such share of their expansion time only the first
   *  is drawn, so the cost stays the same however often the army tolls. */
  rings: 4,
  /** A ripple's lead and ink alphas, and the share of the real radius its still ring stands at with motion off. */
  lead: .42, ink: .2, still: .5,
  /** The small bell while only the army tolls: a chip's pixels, and its rise and fall over a toll's life in milliseconds. */
  bell: { scale: 1, rise: 120, fall: 300 },
  /** The daze over a stunned foe: pixels over its place when it has no drawn body, the chips' orbit in pixels and ticks per turn. */
  daze: { head: 22, orbit: 6, turn: 14 },
} as const;

/** The first toll of each slot stands for the rest. The rules keep it for afterTicks past its own expansion, longer than a slot, so
 *  the pick never changes while a later toll of that slot is still running out. */
function slotLeaders(passive: readonly Toll[]): Toll[] {
  const slot = RULES.expand / BELL_TOLLS.rings, leaders = new Map<number, Toll>();
  for (const toll of passive) {
    const key = Math.floor(toll.event.startedTick / slot);
    if (!leaders.has(key)) leaders.set(key, toll);
  }
  return [...leaders.values()].filter(toll => toll.front < toll.event.radius);
}

/** The bell as the army rings it between casts, and the daze of every toll. Each passive toll the rules start runs out as one thin
 *  dashed ring on its real radius under a small bell, thinned to a few rings at once; motion off keeps one still ring. Over each foe a
 *  toll has stunned two chips circle for as long as the rules hold it. Read from run.chaosSkills every frame; nothing is written. */
class BellTolls implements AmbientShow {
  readonly id = "bell-tolls";
  readonly general = "사명대사";

  update(stage: SkillStage, frame: FrameContext): void {
    const tolls = bellTolls(frame.run);
    if (!tolls.length) return;
    const passive = tolls.filter(toll => toll.passive), castBellHangs = passive.length < tolls.length;
    if (passive.length) this.ripples(stage.ground, passive, frame.channels);
    if (passive.length && !castBellHangs) this.bell(stage.field, passive, frame.channels.motion, frame.run);
    this.daze(stage.field, frame, tolls);
  }

  clear(): void {}

  private ripples(ground: Layer, passive: readonly Toll[], { motion, flash }: ShowChannels): void {
    const lead = { paint: flash ? PALETTE.brass : PALETTE.ochre, alpha: BELL_TOLLS.lead, dashed: true };
    if (!motion) {
      const [{ event }] = passive, at = event.radius * BELL_TOLLS.still;
      ringBand(ground, bellField(event.to), { ...lead, near: at - CELL / 2, far: at + CELL / 2 });
      return;
    }
    for (const { event, front } of slotLeaders(passive)) {
      const cells = bellField(event.to);
      if (!bellLean()) ringBand(ground, cells, { near: front - CELL * 1.5, far: front - CELL / 2, paint: PALETTE.dark, alpha: BELL_TOLLS.ink });
      ringBand(ground, cells, { ...lead, near: front - CELL / 2, far: front + CELL / 2 });
    }
  }

  private bell(field: Layer, passive: readonly Toll[], motion: boolean, run: FrameContext["run"]): void {
    const look = skillVfx(run, run.squads.find(squad => squad.general === this.general));
    const ms = 1000 / HZ, { rise, fall } = BELL_TOLLS.bell, scale = BELL_TOLLS.bell.scale;
    const lit = motion ? Math.max(...passive.map(({ event, age }) => envelope(age * ms, rise, (event.untilTick - event.startedTick) * ms - rise - fall, fall))) : 1;
    const { event } = passive[0], caster = run.squads.find(squad => squad.id === event.squad) ?? event.to;
    drawBell(field, bellPlace(caster, run.fort, scale), { scale, alpha: lit * look.alpha, sway: 0 });
  }

  /** The rules stun silently below their interrupt threshold, so the bell's short stun is shown here. A foe is marked only while the
   *  rules hold it stunned, a toll has recorded it in `hits`, and that toll's own stun, counted from when its ring reached the foe,
   *  can still be running: a later ordinary hit's brief stagger is not the bell's. */
  private daze(field: Layer, frame: FrameContext, tolls: readonly Toll[]): void {
    const { head, orbit, turn } = BELL_TOLLS.daze, chips: Point[] = [];
    for (const enemy of frame.run.enemies) {
      if (enemy.hp <= 0 || enemy.stun <= 0) continue;
      const toll = tolls.find(({ event, age }) => {
        const since = age - (event.impactTick - event.startedTick) * Math.hypot(enemy.x - event.to.x, enemy.y - event.to.y) / event.radius;
        return event.stun > 0 && since >= 0 && since <= event.stun * HZ + 1 && event.hits.includes(enemy.id);
      });
      const body = frame.foe(enemy.id);
      if (!toll || body && !(body.active && body.visible)) continue;
      const x = body?.x ?? enemy.x, top = body ? body.y - body.displayHeight * body.originY : enemy.y - head;
      const angle = frame.channels.motion ? (toll.event.startedTick + toll.age) / turn * Math.PI * 2 + enemy.id : 0;
      for (const side of [0, Math.PI]) chips.push({ x: Math.round(x + Math.cos(angle + side) * orbit), y: Math.round(top + Math.sin(angle + side) * 2) });
    }
    if (!chips.length) return;
    field.fillStyle(PALETTE.outline, .9);
    for (const chip of chips) field.fillRect(chip.x - 2, chip.y - 2, 5, 5);
    chips.forEach((chip, index) => field.fillStyle(index % 2 ? PALETTE.cream : PALETTE.gold, 1).fillRect(chip.x - 1, chip.y - 1, 3, 3));
  }
}

export const ambient: AmbientShow = new BellTolls();
