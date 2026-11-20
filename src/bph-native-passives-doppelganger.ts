import type { BphFxContext, BphFxEvent } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { BPH_CLASS_BODY, bphStats } from "./bph-combat";
import { nativeUnits } from "./bph-native-passives-common";

export function onBphNativeDoppelganger(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind !== "pack-opened") return;
  for (const unit of nativeUnits(ctx)) {
    if (unit.hp <= 0 || unit.bph?.birthProfileId !== "Hero8_Doppelganger") continue;
    const shapes = [...new Set(ctx.save.discovered)].flatMap(id => {
      const profile = BPH_PROFILES[id];
      return profile && id !== "Hero8_Doppelganger" ? [profile] : [];
    });
    if (!shapes.length) continue;
    const key = `native:shape:${unit.id}:${unit.bph.lifeId}`;
    if (ctx.state.counters[key] === event.result.id) continue;
    ctx.state.counters[key] = event.result.id;
    const profile = shapes[Math.floor(ctx.random() * shapes.length)];
    const ratio = unit.hp / unit.maxHp;
    unit.bph.profileId = profile.id;
    unit.kind = BPH_CLASS_BODY[profile.classId];
    unit.strikeAt = 0;
    for (const actor of ctx.state.actors) if (actor.ownerId === unit.id) actor.until = ctx.run.time;
    const stats = bphStats(unit, ctx.run);
    if (stats) { unit.maxHp = stats.hp; unit.hp = stats.hp * ratio; }
    unit.clock = stats?.cooldown ?? profile.cooldown;
    // Reset only timers belonging to this shape-changing life.
    delete ctx.state.timers[`native:portal:${unit.id}:${unit.bph.lifeId}`];
    delete ctx.state.timers[`native:portal:${unit.id}:${unit.bph.lifeId}:expire`];
    delete ctx.state.counters[`native:portal:${unit.id}:${unit.bph.lifeId}`];
    delete ctx.state.timers[`native:decay:${unit.id}:${unit.bph.lifeId}`];
  }
}
