import type { BphFxContext, BphFxEvent } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { beginBphCast } from "./bph-effects-entry";
import { nativeCollectionPool, nativeTotal, nativeUnits } from "./bph-native-passives-common";

export function onBphNativePortal(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind !== "step" || ctx.run.phase !== "playing") return;
  for (const unit of nativeUnits(ctx)) {
    const info = ctx.unitInfo(unit);
    if (unit.hp <= 0 || info?.profileId !== "Hero3_Portal") continue;
    const raw = BPH_PROFILES.Hero3_Portal.raw;
    const key = `native:portal:${unit.id}:${info.lifeId}`;
    const interval = Number(raw.spellCastInterval) / (1 + nativeTotal(ctx, unit, "HeroSpellCastSpeed"));
    let elapsed = (ctx.state.timers[key] ?? 0) + event.dt;
    const cap = Number(raw.spawnerMaxSummons);
    while (elapsed >= interval && (!cap || (ctx.state.counters[key] ?? 0) < cap)) {
      elapsed -= interval;
      const bonus = nativeTotal(ctx, unit, "SpawnerHigherRaritySpawnWeight");
      // Rarity enum: common=0, uncommon=1, rare=2, epic=3.
      const pool = nativeCollectionPool(ctx).map(entry => ({
        ...entry, weight: entry.weight * (1 + bonus * BPH_PROFILES[entry.id].rarity),
      }));
      if (!pool.length) continue;
      let roll = ctx.random() * pool.reduce((sum, entry) => sum + entry.weight, 0);
      const chosen = pool.find(entry => { roll -= entry.weight; return roll < 0; }) ?? pool[pool.length - 1];
      beginBphCast(ctx, { spellId: "Spell_SpawnerSummon", source: unit, target: null,
        position: unit, foil: info.foil, power: Number(raw.spellPower) });
      ctx.spawnProfile(chosen.id, 1, { packId: info.packId,
        ...(info.resultId === null ? {} : { resultId: info.resultId }),
        parentId: unit.id, cause: "summon", position: { x: unit.x, y: unit.y } });
      ctx.state.counters[key] = (ctx.state.counters[key] ?? 0) + 1;
      if (cap && ctx.state.counters[key] >= cap)
        ctx.state.timers[`${key}:expire`] = ctx.run.time - elapsed + Number(raw.spawnerExpireDuration);
    }
    ctx.state.timers[key] = elapsed;
    const expires = ctx.state.timers[`${key}:expire`];
    if (expires !== undefined && ctx.run.time >= expires) {
      unit.hp = 0; unit.strikeAt = 0; unit.downUntil = Infinity;
      ctx.run.metrics.soldierDowns++;
      ctx.emitEvent({ kind: "unitKilled", side: "ally", unit, source: null,
        critical: false, position: { x: unit.x, y: unit.y }, origin: "effect" });
      ctx.emitEvent({ kind: "unit-death", unit, killer: null });
      ctx.emit({ kind: "down", x: unit.x, y: unit.y, value: 0, target: unit.id });
    }
  }
}
