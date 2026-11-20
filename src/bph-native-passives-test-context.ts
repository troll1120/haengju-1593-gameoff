import type { BphEffect, BphEffectConsumer, BphFxContext, BphFxEvent, BphSpawnOrigin } from "./bph-contract";
import { bindBphConsumers, bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { BPH_PROFILE_CONSUMERS } from "./bph-fx-profiles";
import { createBphRun } from "./bph-session";
import { freshBphSave } from "./bph-save";
import { freshMeta } from "./meta";
import { bphStats } from "./bph-combat";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { bphEffectCombat, createRun } from "./rules";
import type { Unit } from "./rules";

export function originalNativeEffects(...nodes: string[]): readonly BphEffect[] {
  return nodes.flatMap(id => {
    const node = BPH_UPGRADE_NODES[id];
    if (!node) throw new Error(`Missing original node ${id}`);
    return node.effects;
  });
}

export function nativeFixture(onEvent: (ctx: BphFxContext, event: BphFxEvent) => void,
  effects: readonly BphEffect[] = [], rolls: readonly number[] = [],
  consumers: readonly BphEffectConsumer[] = []) {
  const meta = freshMeta();
  meta.bph = freshBphSave();
  const run = createBphRun(meta, { seed: 1593, general: "권율", upgrades: [] });
  const native = bphFxContext(run);
  if (!native || !run.bph) throw new Error("Production context must exist");
  const queued = [...rolls], events: BphFxEvent[] = [];
  let draws = 0;
  const ctx: BphFxContext = { ...native, ...bphEffectCombat(run, run.bph.fxEvents), effects,
    random: () => {
      draws++;
      const roll = queued.shift();
      if (roll === undefined) throw new Error("Unexpected combat RNG");
      return roll;
    } };
  bindBphConsumers(ctx, [...consumers, {
    id: "profiles", kinds: [], consume: () => {},
    onEvent: (context, event) => {
      events.push(event);
      // The parent's profile consumer already embeds the native passives entry;
      // binding the family handler again would run every family twice.
      if (consumers !== BPH_PROFILE_CONSUMERS) onEvent(context, event);
    },
  }], false);
  const send = (event: BphFxEvent) => dispatchBphEffects(run, event);
  return { ctx, run, events, draws: () => draws, send,
    spawn(id: string, origin: Partial<BphSpawnOrigin> = {}): Unit {
      const before = run.squads[0].soldiers.length;
      ctx.spawnProfile(id, 1, { packId: "Pack1_Basic", ...origin });
      const unit = run.squads[0].soldiers[before];
      if (!unit) throw new Error(`No materialized ${id}`);
      unit.emerging = false;
      return unit;
    },
    step(dt: number) { run.time += dt; send({ kind: "step", dt }); },
    death(unit: Unit) {
      unit.hp = 0;
      send({ kind: "unit-death", unit, killer: null });
    },
    stats(unit: Unit) {
      const stats = bphStats(unit, run);
      if (!stats) throw new Error("Expected native profile stats");
      return stats;
    },
    enemy(x = 0, y = 0) {
      const enemy = { ...createRun(4).enemies[0], id: run.nextId++, hp: 100, maxHp: 100, x, y };
      run.enemies.push(enemy);
      return enemy;
    },
  };
}
