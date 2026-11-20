import type { BphFxContext, BphFxEvent } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { bphStats } from "./bph-combat";
import { nativeTotal, nativeUnits } from "./bph-native-passives-common";

export function onBphNativeIllusionist(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "unit-death" && event.unit.hp <= 0
    && ctx.profileId(event.unit) === "Hero3_Illusionist") {
    const info = ctx.unitInfo(event.unit);
    if (!info) return;
    const key = `native:illusion-death:${event.unit.id}:${info.lifeId}`;
    if (ctx.state.counters[key]) return;
    ctx.state.counters[key] = 1;
    // The shared executor creates the cast identity when this request executes.
    // AoeCircle base damage is 10; native explosion uses full effective attack.
    const damage = bphStats(event.unit, ctx.run)?.damage ?? BPH_PROFILES.Hero3_Illusionist.damage;
    ctx.state.spells.push({ id: "Spell_AoeCircle", sourceId: event.unit.id,
      x: event.unit.x, y: event.unit.y, power: damage / 10 });
  }
  if (event.kind !== "pack-opened") return;
  const cards = event.result.cards.filter(card => card.profileId === "Hero3_Illusionist" && card.foil && card.copies > 1);
  if (!cards.length) return;
  const parent = nativeUnits(ctx).find(unit => {
    const info = ctx.unitInfo(unit);
    return unit.hp > 0 && info?.profileId === "Hero3_Illusionist" && info.foil
      && info.resultId === event.result.id && info.cause === "pack";
  });
  if (!parent) return;
  const key = `native:illusion-pack:${event.result.id}`;
  if (ctx.state.counters[key]) return;
  const multiplier = nativeTotal(ctx, parent, "HeroExtraCopiesMultiplier");
  const copies = cards.reduce((sum, card) => sum + Math.floor((card.copies - 1) * multiplier), 0)
    * (event.result.multiplier ?? 1);
  ctx.state.counters[key] = 1;
  if (copies > 0) ctx.spawnProfile("Hero3_Illusionist", copies, {
    packId: event.result.packId, resultId: event.result.id, parentId: parent.id,
    foil: true, giant: ctx.unitInfo(parent)?.giant, cause: "duplicate", position: parent,
  });
}
