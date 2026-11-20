import type { BphFxContext, BphFxEvent } from "./bph-contract";
import { nativeTotal, nativeUnits } from "./bph-native-passives-common";
import { beastmasterFriendSelection } from "./bph-fx-troops";
import { BPH_PROFILES } from "./bph-data";

const animals = new Set(["Hero_Rat", "Hero_Bear", "Hero_Jaguar", "Hero_Monkey"]);

export function onBphNativeBeastmaster(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "unit-spawn") {
    const info = ctx.unitInfo(event.unit);
    if (event.unit.hp > 0 && info?.profileId === "Hero5_Beastmaster"
      && (!event.life || event.life.lifeId === info.lifeId)
      && nativeTotal(ctx, event.unit, "BeastmasterFriendDeathRespawn") > 0) {
      // Suppress the legacy batched fallback, which associates every base Rat
      // with the last Beastmaster when several owners are spawned together.
      const key = `troops:friends:${event.unit.id}:${info.lifeId}`;
      if (ctx.state.counters[key]) return;
      ctx.state.counters[key] = 1;
      const selected = beastmasterFriendSelection(ctx, event.unit);
      const roster = selected.length ? selected
        : Array<string>(Number(BPH_PROFILES.Hero5_Beastmaster.raw.beastmasterFriendCount)).fill("Hero_Rat");
      for (const profileId of roster) ctx.spawnProfile(profileId, 1, {
        packId: info.packId, ...(info.resultId === null ? {} : { resultId: info.resultId }),
        parentId: event.unit.id, cause: "summon", foil: info.foil, position: event.unit,
      });
      return;
    }
    if (!info || !animals.has(info.profileId) || info.parentId === null
      || info.cause !== "summon" || (event.life && event.life.lifeId !== info.lifeId)) return;
    const parent = nativeUnits(ctx).find(unit => unit.id === info.parentId);
    const parentInfo = parent && ctx.unitInfo(parent);
    if (!parent || parentInfo?.profileId !== "Hero5_Beastmaster"
      || nativeTotal(ctx, parent, "BeastmasterFriendDeathRespawn") <= 0) return;
    const key = `native:friend:${event.unit.id}`;
    if (ctx.state.counters[`${key}:parent-life`] !== undefined) return;
    ctx.state.counters[`${key}:parent-life`] = parentInfo.lifeId;
    ctx.state.counters[`${key}:used`] = 0;
  }
  if (event.kind === "unit-death" && event.unit.hp <= 0) {
    const info = ctx.unitInfo(event.unit), key = `native:friend:${event.unit.id}`;
    if (!info || !animals.has(info.profileId) || ctx.state.counters[`${key}:parent-life`] === undefined) return;
    // Defer until the next step so all death observers see the dead life.
    ctx.state.counters[`${key}:pending`] = info.lifeId;
  }
  if (event.kind !== "step" || ctx.run.phase !== "playing") return;
  for (const unit of nativeUnits(ctx)) {
    const key = `native:friend:${unit.id}`, deadLife = ctx.state.counters[`${key}:pending`];
    if (deadLife === undefined) continue;
    delete ctx.state.counters[`${key}:pending`];
    const info = ctx.unitInfo(unit);
    if (!info || !unit.bph || unit.hp > 0 || info.lifeId !== deadLife) continue;
    const parent = nativeUnits(ctx).find(other => other.id === info.parentId);
    const parentInfo = parent && ctx.unitInfo(parent);
    if (!parent || parent.hp <= 0 || parentInfo?.profileId !== "Hero5_Beastmaster"
      || parentInfo.lifeId !== ctx.state.counters[`${key}:parent-life`]) continue;
    const used = ctx.state.counters[`${key}:used`] ?? 0;
    if (used >= Math.floor(nativeTotal(ctx, parent, "BeastmasterFriendDeathRespawn"))) continue;
    ctx.state.counters[`${key}:used`] = used + 1;
    unit.bph = { ...unit.bph, lifeId: info.lifeId + 1, cause: "revive" };
    unit.hp = unit.maxHp; unit.downUntil = 0; unit.strikeAt = 0; unit.clock = 0;
    ctx.state.statuses = ctx.state.statuses.filter(status => status.targetId !== unit.id);
    ctx.emitEvent({ kind: "unit-spawn", unit, profileId: info.profileId,
      life: { unitId: unit.id, lifeId: info.lifeId + 1, profileId: info.profileId,
        parentId: info.parentId, cause: "revive" } });
  }
}
