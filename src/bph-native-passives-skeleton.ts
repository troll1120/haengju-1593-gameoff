import type { BphBuffRequest, BphFxContext, BphFxEvent } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { nativeEffects, nativeUnits } from "./bph-native-passives-common";

const skeletons = new Set(["Hero_Skeleton", "Hero_SkeletonUpgraded"]);
const immune = new Set(["Hero_Bear", "Hero_Jaguar", "Hero_Monkey", "Hero_Rat", ...skeletons]);

/** Call before status insertion or buff-applied dispatch, not after infection. */
export function bphNativeRejectsBuff(profileId: string | null, request: Pick<BphBuffRequest, "id" | "side">): boolean {
  return request.side === "ally" && request.id === "Infected" && profileId !== null
    && immune.has(profileId) && Number(BPH_PROFILES[profileId].raw.zombieImmune) === 1;
}

export function onBphNativeSkeleton(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "unit-death" && event.unit.hp <= 0) {
    const info = ctx.unitInfo(event.unit);
    if (!info || !skeletons.has(info.profileId)) return;
    const effects = nativeEffects(ctx, event.unit, "HeroDeathCastSpellChance")
      .filter(effect => effect.targets.targetSpell === "Spell_SkeletonBone");
    if (!effects.length) return;
    const key = `native:bone:${event.unit.id}:${info.lifeId}`;
    if (ctx.state.counters[key]) return;
    ctx.state.counters[key] = 1;
    // Each purchased original node owns one independent 25% request.
    for (const effect of effects) if (effect.value > 0 && ctx.random() < ctx.chance(effect.value))
      ctx.state.spells.push({ id: "Spell_SkeletonBone", sourceId: event.unit.id,
        x: event.unit.x, y: event.unit.y, power: Number(BPH_PROFILES[info.profileId].raw.spellPower) });
  }
  if (event.kind !== "step" || ctx.run.phase !== "playing") return;
  for (const unit of nativeUnits(ctx)) {
    const info = ctx.unitInfo(unit);
    if (!info || unit.hp <= 0 || !skeletons.has(info.profileId)) continue;
    // A Fisher spectre's martial actor owns its 10s expiry; the ordinary
    // skeleton HP drain must not run a second lifetime on it.
    if (ctx.state.actors.some(actor => actor.data.martialSpectre === 1 && actor.ownerId === unit.id)) continue;
    const raw = BPH_PROFILES[info.profileId].raw;
    const interval = Number(raw.survivePhaseHpLossTickIntervalSeconds);
    const key = `native:decay:${unit.id}:${info.lifeId}`;
    let clock = (ctx.state.timers[key] ?? 0) + event.dt;
    while (clock >= interval && unit.hp > 0) {
      clock -= interval;
      // Authored HP loss bypasses armor, shields, block RNG, and damage procs.
      unit.hp = Math.max(0, unit.hp - Number(raw.survivePhaseHpLossPerTick));
      if (unit.hp > 0) continue;
      unit.strikeAt = 0; unit.downUntil = Infinity;
      ctx.run.metrics.soldierDowns++;
      ctx.emitEvent({ kind: "unitKilled", side: "ally", unit, source: null,
        critical: false, position: { x: unit.x, y: unit.y }, origin: "effect" });
      ctx.emitEvent({ kind: "unit-death", unit, killer: null });
      ctx.emit({ kind: "down", x: unit.x, y: unit.y, value: 0, target: unit.id });
    }
    ctx.state.timers[key] = clock;
  }
}
