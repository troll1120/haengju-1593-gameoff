import type { Run } from "./rules";
import type { BphBuffRequest, BphEffect, BphEffectConsumer, BphFxContext, BphFxEvent, BphFxState, BphSave } from "./bph-contract";
import type { Enemy, Unit } from "./rules";
import { BPH_BUILDING_CONSUMERS } from "./bph-fx-buildings";
import { BPH_STATUS_CONSUMERS } from "./bph-fx-status";
import { BPH_PROFILE_CONSUMERS } from "./bph-fx-profiles";
import { BPH_EFFECT_UNITS } from "./bph-effects-entry";
import { recordBphCodexEvent } from "./bph-codex-rewards";

type BphBinding = {
  readonly context: BphFxContext;
  readonly consumers: readonly BphEffectConsumer[];
  readonly routes: readonly { readonly consumer: BphEffectConsumer; readonly effects: readonly BphEffect[] }[];
};
const bindings = new WeakMap<Run, BphBinding>();
const accounts = new WeakMap<BphSave, Run>();
export const bphConsumers = (): readonly BphEffectConsumer[] =>
  [...BPH_BUILDING_CONSUMERS, ...BPH_STATUS_CONSUMERS, ...BPH_PROFILE_CONSUMERS,
    ...BPH_EFFECT_UNITS().flatMap(entry => entry.consumers)];

export class DuplicateBphConsumerError extends Error {
  constructor(readonly effectKind: string) { super(`Two consumers own ${effectKind}`); this.name = "DuplicateBphConsumerError"; }
}
function routeEffects(effects: readonly BphEffect[], consumers: readonly BphEffectConsumer[]) {
  return consumers.map(consumer => ({ consumer, effects: effects.filter(effect => consumer.kinds.includes(effect.type)) }));
}
export function bindBphConsumers(context: BphFxContext, consumers = bphConsumers(), startBattle = true): void {
  const kinds = new Set<string>();
  for (const consumer of consumers) for (const kind of consumer.kinds) {
    if (kinds.has(kind)) throw new DuplicateBphConsumerError(kind);
    kinds.add(kind);
  }
  bindings.set(context.run, { context, consumers, routes: routeEffects(context.effects, consumers) });
  accounts.set(context.save, context.run);
  if (startBattle) dispatchBphEffects(context.run, { kind: "run-start" });
}
/** No consumers means an unimplemented lane, never a report of consumed effects. */
export function dispatchBphEffects(run: Run, event: BphFxEvent): void {
  const binding = bindings.get(run);
  if (!binding) return;
  recordBphCodexEvent(binding.context, event);
  for (const { consumer, effects } of binding.routes) {
    consumer.onEvent?.(binding.context, event);
    for (const effect of effects) consumer.consume(binding.context, event, effect);
  }
}
export function bphRegisteredKinds(): readonly string[] {
  return bphConsumers().flatMap(consumer => consumer.kinds);
}
export function bphFxContext(run: Run): BphFxContext | undefined {
  return bindings.get(run)?.context;
}
export function updateBphPointer(run: Run, position: { readonly x: number; readonly y: number }): void {
  const context = bphFxContext(run);
  if (!context) return;
  context.pointer.x = position.x; context.pointer.y = position.y;
}
export function dispatchBphAccountEvent(save: BphSave, event: BphFxEvent): void {
  const run = accounts.get(save);
  if (run) dispatchBphEffects(run, event);
}
export function refreshBphEffects(save: BphSave, effects: readonly BphEffect[]): void {
  const run = accounts.get(save), binding = run && bindings.get(run);
  if (run && binding) bindings.set(run, { ...binding, context: { ...binding.context, effects },
    routes: routeEffects(effects, binding.consumers) });
}
/** Global probability effects modify thresholds, never the uniform random stream. */
export function bphChance(base: number, effects: readonly BphEffect[]): number {
  const multiplier = 1 + effects.filter(effect => effect.type === "GlobalChanceEffectMultiplier")
    .reduce((sum, effect) => sum + effect.value, 0);
  return Math.max(0, Math.min(1, base * multiplier));
}
export const freshBphFxState = (): BphFxState => ({
  timers: {}, counters: {}, buildings: [], relics: [], statuses: [], spells: [],
  castleShield: { hp: 0, maxHp: 0 }, resourceSurge: 0, actors: [], consumptions: [],
});
export function applyBphBuff(run: Run, request: BphBuffRequest): void {
  const ctx = bphFxContext(run);
  if (!ctx) return;
  ctx.state.statuses.push({ targetId: request.target.id, id: request.id,
    until: run.time + request.duration, power: request.power, stacks: request.stacks,
    side: request.side,
    ...(request.cast ? { cast: request.cast,
      ...(request.cast.sourceId === null ? {} : { sourceId: request.cast.sourceId }) }
      : request.source ? { sourceId: request.source.id } : {}) });
  dispatchBphEffects(run, { kind: "buff-applied", request });
}
export function consumeBphCorpse(run: Run, request: {
  readonly source: Unit; readonly target: Unit | Enemy; readonly phase: "start" | "end";
}): boolean {
  const ctx = bphFxContext(run);
  if (!ctx || request.target.hp > 0) return false;
  const previous = ctx.state.consumptions.find(entry => entry.targetId === request.target.id);
  if (request.phase === "start") {
    if (previous) return false;
    ctx.state.consumptions.push({ sourceId: request.source.id, targetId: request.target.id, phase: "start" });
  } else {
    if (!previous || previous.sourceId !== request.source.id || previous.phase !== "start") return false;
    previous.phase = "end";
  }
  dispatchBphEffects(run, { kind: "consume", ...request });
  return true;
}
export function bphOriginalClasses(run: Run, unit: Unit): readonly number[] {
  const ctx = bphFxContext(run), info = ctx?.unitInfo(unit);
  if (!ctx || !info) return [];
  const classes = new Set([info.originalClass]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const effect of ctx.effects) if (effect.type === "HeroClassAlsoCountsAs") {
      const first = Number(effect.targets.targetClass), second = Number(effect.targets.secondTargetClass);
      if (!first || !second || (!classes.has(first) && !classes.has(second))) continue;
      const previous = classes.size; classes.add(first); classes.add(second); changed ||= previous !== classes.size;
    }
  }
  return [...classes];
}
