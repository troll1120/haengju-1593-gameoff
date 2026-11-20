import type { BphBuffRequest, BphEffectConsumer, BphFxContext, BphFxState } from "./bph-contract";
import type { BphCast, BphConditionEntry } from "./bph-effects-entry";

type InfectionState = BphFxState["statuses"][number] & { cast?: BphCast };

/** Duration belongs to the source-proven hit producer, never to a guessed status default. */
export const applyInfection: BphConditionEntry["applyInfection"] = (context, hit) => {
  if (hit.target.hp <= 0 || hit.duration <= 0) return;
  const until = context.run.time + hit.duration;
  const existing: InfectionState | undefined = context.state.statuses.find(status =>
    status.targetId === hit.target.id && status.id === "Infected" && status.until > context.run.time);
  if (existing) {
    // Match the existing applyStatus refresh contract: a shorter hit cannot shorten a live state.
    // Attribution follows the hit that owns the retained expiration, including a dead source's life.
    if (until > existing.until) {
      existing.until = until;
      existing.cast = hit.cast;
      if (hit.cast.sourceId === null) delete existing.sourceId;
      else existing.sourceId = hit.cast.sourceId;
    }
    return;
  }
  const request: BphBuffRequest & { readonly cast: BphCast } = {
    target: hit.target, side: "enemy", id: "Infected", duration: hit.duration,
    power: 0, stacks: 1, cast: hit.cast,
  };
  context.applyBuff(request);
};

export function conditionProvenance(status: InfectionState): BphCast | null {
  return status.cast ?? null;
}

/** Basic state lifetime only. T1 owns infection damage, slowing and death effects. */
export const CONDITION_CONSUMERS: readonly BphEffectConsumer[] = [{
  id: "status",
  kinds: [],
  onEvent: (context: BphFxContext, event) => {
    if (event.kind === "step") context.state.statuses = context.state.statuses.filter(status =>
      status.id !== "Infected" || status.until > context.run.time);
  },
  consume: () => { throw new RangeError("T0 has no upgrade effect kinds"); },
}];
