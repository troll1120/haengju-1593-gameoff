import type { BphFxContext, BphFxEvent, BphFxState } from "./bph-contract";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { nativeTotal, nativeUnits } from "./bph-native-passives-common";
import type { Unit } from "./rules";

const pending = new WeakMap<BphFxState, {
  source: Unit; sourceLife: number; target: Unit; targetLife: number; until: number;
}[]>();

export function onBphNativeBloodMage(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "unit-stats" && event.profileId === "Hero6_BloodMage") {
    const life = ctx.unitInfo(event.unit)?.lifeId;
    event.stats.damage *= 1 + (ctx.state.counters[`native:consume-growth:${event.unit.id}:${life}`] ?? 0);
  }
  if (event.kind === "consume" && event.phase === "end" && event.source.hp > 0
    && ctx.profileId(event.source) === "Hero6_BloodMage") {
    const bonus = nativeTotal(ctx, event.source, "BloodMageStackDamageOnConsume");
    if (bonus <= 0) return;
    const receipt = ctx.state.consumptions.find(entry => entry.sourceId === event.source.id
      && entry.targetId === event.target.id && entry.phase === "end");
    if (!receipt) return;
    const life = ctx.unitInfo(event.source)?.lifeId;
    const key = `native:consume-growth:${event.source.id}:${life}`;
    const receiptKey = `${key}:corpse:${event.target.id}`;
    if (ctx.state.counters[receiptKey]) return;
    ctx.state.counters[receiptKey] = 1;
    ctx.state.counters[key] = (ctx.state.counters[key] ?? 0) + bonus;
  }
  if (event.kind === "unit-death" && event.unit.hp <= 0) {
    if (ctx.state.consumptions.some(entry => entry.targetId === event.unit.id)) return;
    for (const source of nativeUnits(ctx)) {
      const info = ctx.unitInfo(source);
      if (source === event.unit || source.hp <= 0 || info?.profileId !== "Hero6_BloodMage") continue;
      const chance = nativeTotal(ctx, source, "BloodMageConsumeNearbyHeroDeathChance");
      // Inferred nearby radius: this hero's authored attackRange, never shared seedRange.
      if (chance <= 0 || Math.hypot(source.x - event.unit.x, source.y - event.unit.y)
        > BPH_PROFILES.Hero6_BloodMage.range * BPH_WORLD_TO_PX) continue;
      const list = pending.get(ctx.state) ?? [];
      if (list.some(entry => entry.source === source)
        || ctx.state.consumptions.some(entry => entry.sourceId === source.id && entry.phase === "start")) continue;
      if (ctx.random() >= ctx.chance(chance) || !ctx.beginConsume(source, event.unit)) continue;
      const raw = BPH_PROFILES.Hero6_BloodMage.raw;
      const duration = Number(raw.bloodMageConsumeHoldSeconds) + Number(raw.bloodMageConsumePauseSeconds)
        + Number(raw.bloodMageConsumeReturnSeconds);
      list.push({ source, sourceLife: info.lifeId, target: event.unit,
        targetLife: ctx.unitInfo(event.unit)?.lifeId ?? 0, until: ctx.run.time + duration });
      pending.set(ctx.state, list);
      source.clock = Math.max(source.clock, duration);
      break;
    }
  }
  if (event.kind !== "step") return;
  const list = pending.get(ctx.state);
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    if (entry.until > ctx.run.time) continue;
    list.splice(i, 1);
    if (entry.source.hp > 0 && ctx.unitInfo(entry.source)?.lifeId === entry.sourceLife
      && entry.target.hp <= 0 && (ctx.unitInfo(entry.target)?.lifeId ?? 0) === entry.targetLife)
      ctx.endConsume(entry.source, entry.target);
    else ctx.state.consumptions = ctx.state.consumptions.filter(receipt =>
      receipt.sourceId !== entry.source.id || receipt.targetId !== entry.target.id || receipt.phase !== "start");
  }
  if (!list.length) pending.delete(ctx.state);
}
