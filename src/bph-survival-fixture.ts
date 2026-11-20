import { bphSurvivalBossGroup } from "./bph-survival";
import type { BphSurvivalState } from "./bph-survival";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

/** Commanders are drawn per run; these Witch encounters name her as the group's first member. */
export function witchLeads(state: BphSurvivalState, at: number): number {
  const group = BPH_SURVIVAL_TABLE.bosses.findIndex(beat => beat.at === at), drawn = bphSurvivalBossGroup(state, group);
  state.bossGroups[group] = ["Boss3_Witch", ...drawn.filter(id => id !== "Boss3_Witch")].slice(0, drawn.length);
  return drawn.length;
}
