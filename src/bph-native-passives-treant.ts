import type { BphFxContext, BphFxEvent } from "./bph-contract";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { beginBphCast } from "./bph-effects-entry";
import { nativeEffects, nativeTotal, nativeUnits } from "./bph-native-passives-common";
import type { Unit } from "./rules";

/** Producer only. bph-fx-profiles tickSeed remains the sole movement/bounce engine. */
export function startBphNativeSeeds(ctx: BphFxContext, unit: Unit, count: number): void {
  const info = ctx.unitInfo(unit);
  if (unit.hp <= 0 || info?.profileId !== "Hero5_Treant" || count <= 0) return;
  const candidates = nativeUnits(ctx).filter(other => other !== unit && other.hp > 0
    && Math.hypot(other.x - unit.x, other.y - unit.y) <= Number(BPH_PROFILES.Hero5_Treant.raw.seedRange) * BPH_WORLD_TO_PX)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id);
  if (!candidates.length) return;
  const effects = nativeEffects(ctx, unit, "TreantSeedBounce");
  const guaranteed = info.foil && unit.bph?.birthProfileId === "Hero5_Treant" ? 1 : 0;
  for (let n = 0; n < Math.floor(count); n++) {
    const target = candidates[n % candidates.length];
    const cast = beginBphCast(ctx, { spellId: "Spell_Seed", source: unit, target,
      position: unit, foil: info.foil, power: Number(BPH_PROFILES.Hero5_Treant.raw.spellPower) });
    ctx.state.actors.push({
      id: ctx.run.nextId++, ownerId: unit.id, kind: "seed", cast,
      x: unit.x, y: unit.y, toX: target.x, toY: target.y, startedAt: ctx.run.time,
      until: ctx.run.time + 0.800000011920929, power: cast.power, radius: 0, targets: [target.id],
      data: { profiles: 1, lifeId: info.lifeId, profile: Object.keys(BPH_PROFILES).indexOf(info.profileId),
        fromX: unit.x, fromY: unit.y, bounces: nativeTotal(ctx, unit, "TreantSeedBounce"), guaranteed,
        chance: Math.max(0, ...effects.map(effect => effect.effectPower)) },
    });
  }
}

export function onBphNativeTreant(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "after-attack")
    startBphNativeSeeds(ctx, event.unit, 1 + nativeTotal(ctx, event.unit, "TreantExtraSeedOnAttack"));
}
