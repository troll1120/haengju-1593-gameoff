import type { BphEffectConsumer, BphFxContext } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import type { Unit } from "./rules";

const FRIENDS: Readonly<Record<string, string>> = {
  SN_BeastmasterAddBear: "Hero_Bear",
  SN_BeastmasterAddJaguar: "Hero_Jaguar",
  SN_BeastmasterAddMonkey: "Hero_Monkey",
};
const FRIEND_KIND = "BeastmasterAddTargetHeroToPool";

/**
 * Original BuildSpawnRoster: append purchased replacements, then fill the
 * authored friend count with the base animal. No random selection is made.
 * An empty selection leaves the unchanged W0 summon path in charge.
 */
export function beastmasterFriendSelection(context: BphFxContext, owner: Unit): readonly string[] {
  const info = context.unitInfo(owner);
  if (owner.hp <= 0 || info?.profileId !== "Hero5_Beastmaster") return [];
  const selected: string[] = [];
  for (const effect of context.effects) {
    const target = FRIENDS[effect.nodeId];
    if (effect.type !== FRIEND_KIND || effect.value <= 0 || !target
      || effect.targets.targetHero !== target || selected.includes(target)) continue;
    selected.push(target);
  }
  if (selected.length === 0) return selected;
  const count = Number(BPH_PROFILES.Hero5_Beastmaster.raw.beastmasterFriendCount);
  return [...selected.slice(0, count), ...Array<string>(Math.max(0, count - selected.length)).fill("Hero_Rat")];
}

export const TROOP_CONSUMERS: readonly BphEffectConsumer[] = [{
  id: "troops",
  kinds: [FRIEND_KIND],
  consume(context, event) {
    if (event.kind !== "unit-spawn" || event.profileId !== "Hero5_Beastmaster") return;
    const info = context.unitInfo(event.unit);
    if (!info || (event.life && event.life.lifeId !== info.lifeId)) return;
    const selection = beastmasterFriendSelection(context, event.unit);
    if (selection.length === 0) return;
    const key = `troops:friends:${event.unit.id}:${info.lifeId}`;
    if (context.state.counters[key]) return;
    context.state.counters[key] = 1;
    for (const profileId of selection) {
      context.spawnProfile(profileId, 1, {
        packId: info.packId,
        resultId: info.resultId ?? undefined,
        parentId: event.unit.id,
        cause: "summon",
        position: { x: event.unit.x, y: event.unit.y },
        foil: info.foil,
      });
    }
  },
}];
