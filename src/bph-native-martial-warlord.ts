import { BPH_WORLD_TO_PX } from "./bph-contract";
import type { BphFxContext, BphFxEvent } from "./bph-contract";
import { martialSum } from "./bph-native-martial-common";
import { freezeMartialEnemy } from "./bph-native-martial-ice";
import type { Enemy, Unit } from "./rules";

export type MartialTaunt = {
  readonly unit: Unit;
  readonly prey: [number, number];
  readonly distance: number;
};

type TauntSource = { readonly unit: Unit; readonly squadId: number; readonly index: number; readonly radius: number };
// Radius comes from battle-static upgrade effects and unit identity; one scan of the roster per tick answers
// every enemy's query, and hp and distance stay live per call.
const tauntRoster = new WeakMap<object, { time: number; sources: readonly TauntSource[] }>();

/** Query in enemy target selection, including when a previous windup resolves. */
export function martialTauntTarget(ctx: BphFxContext, enemy: Enemy): MartialTaunt | null {
  if (enemy.hp <= 0) return null;
  let memo = tauntRoster.get(ctx.state);
  if (!memo || memo.time !== ctx.run.time) {
    const sources: TauntSource[] = [];
    for (const squad of ctx.run.squads) {
      for (const [index, unit] of [[-1, squad] as const, ...squad.soldiers.map((soldier, i) => [i, soldier] as const)]) {
        const id = ctx.profileId(unit);
        if (id !== "Hero7_Warlord" && id !== "Hero7_Warlord_Spiked") continue;
        // Spell_HammerTaunt sharedassets1.assets:2685, aoeRadius=1.
        sources.push({ unit, squadId: squad.id, index,
          radius: (1 + martialSum(ctx, unit, "PaladinTauntArea")) * BPH_WORLD_TO_PX });
      }
    }
    memo = { time: ctx.run.time, sources };
    tauntRoster.set(ctx.state, memo);
  }
  let selected: MartialTaunt | null = null;
  for (const source of memo.sources) {
    if (source.unit.hp <= 0 || ctx.state.statuses.some(status => status.targetId === source.unit.id &&
      status.id === "Invisibility" && status.until > ctx.run.time)) continue;
    const distance = Math.hypot(enemy.x - source.unit.x, enemy.y - source.unit.y);
    if (distance <= source.radius && (!selected || distance < selected.distance))
      selected = { unit: source.unit, prey: [source.squadId, source.index], distance };
  }
  return selected;
}

export function martialWarlordEvent(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind !== "before-unit-damage" || !event.source || event.source.hp <= 0 || event.hit.amount <= 0) return;
  const id = ctx.profileId(event.unit);
  if (id !== "Hero7_Warlord" && id !== "Hero7_Warlord_Spiked") return;
  const probability = ctx.chance(martialSum(ctx, event.unit, "HeroAttackedFreezeIntoIceCubeChance"));
  if (probability <= 0 || ctx.state.actors.some(actor => actor.data.martialIce === 1
    && actor.targets[0] === event.source?.id && actor.until > ctx.run.time)) return;
  if (ctx.random() < probability) freezeMartialEnemy(ctx, event.unit, event.source);
}
