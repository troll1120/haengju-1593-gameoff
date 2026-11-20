import type { BphFxContext, BphFxEvent } from "./bph-contract";
import { BPH_MONSTERS } from "./bph-data";
import { martialActor, martialOwner, martialSum, martialUnits } from "./bph-native-martial-common";

/** Lifetime is an adaptation: neither HeroDefinition nor the hook serializes it. */
export const MARTIAL_SPECTRE_LIFETIME = 10;

export function martialFisherEvent(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "enemy-killed") {
    const hook = ctx.state.actors.filter(actor => actor.kind === "hook" && actor.data.profiles === 1
      && actor.data.phase === 1 && actor.targets.includes(event.enemy.id) && actor.until >= ctx.run.time)
      .sort((a, b) => a.id - b.id).find(actor => {
        const owner = martialOwner(ctx, actor);
        return owner && ctx.profileId(owner) === "Hero7_AstralFisher"
          && martialSum(ctx, owner, "AstralFisherHookedKillSpectre") > 0;
      });
    if (!hook) return;
    const source = martialOwner(ctx, hook), key = `martial:spectre:${event.enemy.id}`;
    if (!source || ctx.state.counters[key]) return;
    const info = ctx.unitInfo(source);
    if (!info) return;
    ctx.state.counters[key] = 1;
    const monster = BPH_MONSTERS[event.enemy.bphProfileId ?? ""];
    const ranged = monster ? Number(monster.raw.attackType) === 1 : event.enemy.kind === "teppo" || event.enemy.kind === "ship";
    // HeroDefinition: melee resources.assets:1432; ranged resources.assets:1410.
    const template = ranged ? "Hero1_Archer" : "Hero_Skeleton";
    const before = new Set(martialUnits(ctx));
    ctx.spawnProfile(template, 1, { packId: info.packId, parentId: source.id, cause: "summon",
      foil: false, giant: false, position: { x: event.enemy.x, y: event.enemy.y } });
    for (const unit of martialUnits(ctx).filter(candidate => !before.has(candidate))) {
      const life = ctx.unitInfo(unit);
      if (!life) continue;
      const actor = martialActor(ctx, { unit: source, target: event.enemy, amount: 0, critical: false,
        extraProjectiles: 0, bounces: 0 }, "Hero7_AstralFisher");
      actor.kind = "seed"; actor.ownerId = unit.id;
      actor.x = actor.toX = unit.x; actor.y = actor.toY = unit.y;
      actor.until = ctx.run.time + MARTIAL_SPECTRE_LIFETIME;
      Object.assign(actor.data, { martialSpectre: 1, lifeId: life.lifeId,
        sourceLifeId: info.lifeId, sourceId: source.id, corpseId: event.enemy.id });
    }
  }
  if (event.kind !== "step") return;
  const done = new Set<number>();
  for (const actor of ctx.state.actors) {
    if (actor.data.martialSpectre !== 1) continue;
    const unit = martialOwner(ctx, actor);
    if (!unit) { done.add(actor.id); continue; }
    actor.x = actor.toX = unit.x; actor.y = actor.toY = unit.y;
    if (ctx.run.time < actor.until) continue;
    done.add(actor.id);
    // Natural summon expiration, not a damage hit or a new source incarnation.
    unit.hp = 0; unit.strikeAt = 0; unit.downUntil = Infinity;
    ctx.emitEvent({ kind: "unitKilled", side: "ally", unit, source: null, critical: false,
      position: { x: unit.x, y: unit.y }, origin: "effect" });
    ctx.emitEvent({ kind: "unit-death", unit, killer: null });
  }
  ctx.state.actors = ctx.state.actors.filter(actor => !done.has(actor.id));
}
