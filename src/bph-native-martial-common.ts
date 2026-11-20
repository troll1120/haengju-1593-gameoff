import type { BphActor, BphFxContext } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { beginBphCast } from "./bph-effects-entry";
import type { Point } from "./geometry";
import type { Enemy, Unit } from "./rules";

/** A resolved basic attack, after the parent's critical/buff/projectile modifiers. */
export type MartialAttack = {
  readonly unit: Unit;
  readonly target: Enemy;
  readonly amount: number;
  readonly critical: boolean;
  readonly extraProjectiles: number;
  readonly bounces: number;
  readonly attackId?: number;
  readonly origin?: Point;
};

export const martialUnits = (ctx: BphFxContext): Unit[] =>
  ctx.run.squads.flatMap(squad => [squad, ...squad.soldiers]);

export function martialSum(ctx: BphFxContext, unit: Unit, kind: string): number {
  const info = ctx.unitInfo(unit);
  if (!info) return 0;
  const profile = BPH_PROFILES[info.profileId];
  return ctx.effects.filter(effect => {
    if (effect.type !== kind || effect.nodeId.startsWith("FOIL_")) return false;
    const target = effect.targets.targetHero;
    // The authored visual variant is the same Warlord ability family.
    if (target && target !== info.profileId && !(target === "Hero7_Warlord"
      && info.profileId === "Hero7_Warlord_Spiked")) return false;
    const heroClass = Number(effect.targets.targetClass ?? 0);
    return (heroClass === 0 || ctx.originalClasses(unit).includes(heroClass))
      && (effect.targets.useTargetRarity !== "1" || Number(effect.targets.targetRarity) === profile.rarity);
  }).reduce((sum, effect) => sum + effect.value, 0);
}

export function martialActor(ctx: BphFxContext,
  attack: Omit<MartialAttack, "target"> & { readonly target: Enemy | Unit }, spellId: string): BphActor {
  const origin = attack.origin ?? attack.unit;
  const cast = beginBphCast(ctx, { spellId, source: attack.unit, target: attack.target,
    position: { x: origin.x, y: origin.y }, foil: ctx.unitInfo(attack.unit)?.foil ?? false,
    power: attack.amount, ...(attack.attackId === undefined ? {} : { attackId: attack.attackId }) });
  const actor: BphActor = {
    id: ctx.run.nextId++, ownerId: attack.unit.id, kind: "beam", x: origin.x, y: origin.y,
    toX: attack.target.x, toY: attack.target.y, startedAt: ctx.run.time, until: Infinity,
    power: attack.amount, radius: 0, targets: [], cast,
    ...(attack.attackId === undefined ? {} : { attackId: attack.attackId }),
    data: { fromX: origin.x, fromY: origin.y, lifeId: cast.sourceLifeId ?? 0,
      critical: Number(attack.critical) },
  };
  ctx.state.actors.push(actor);
  return actor;
}

/** Never attribute a delayed actor to the next incarnation of a reused unit. */
export function martialOwner(ctx: BphFxContext, actor: BphActor): Unit | undefined {
  return martialUnits(ctx).find(unit => unit.id === actor.ownerId && unit.hp > 0
    && ctx.unitInfo(unit)?.lifeId === actor.data.lifeId);
}

export function segmentFraction(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  return length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0;
}

export function segmentDistance(point: Point, from: Point, to: Point): number {
  const t = segmentFraction(point, from, to);
  return Math.hypot(point.x - from.x - (to.x - from.x) * t, point.y - from.y - (to.y - from.y) * t);
}
