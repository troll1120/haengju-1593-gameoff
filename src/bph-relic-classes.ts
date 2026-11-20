import type { BphClass, BphEffect } from "./bph-contract";

// The imported rows retain the source game's categories. Haengju draws and
// combat use the profile's classId, which does not map 1:1 to raw.heroClass.
const relicClasses: Readonly<Record<string, readonly [BphClass, BphClass?]>> = {
  Relic1_CharmArcanist: ["monk"],
  Relic1_CharmMystic: ["monk"],
  Relic1_CharmOutcast: ["militia"],
  Relic1_CharmWarrior: ["spearman"],
  Relic_HuntersAreOutcast: ["archer", "militia"],
  R_ArcanistTomePower: ["monk"],
  R_CharmHunter: ["militia"],
  R_HunterPeriodicInvisibility: ["archer"],
  R_MysticSpawnFortify: ["spearman", "spearman"],
  R_WarriorAliveGiant: ["spearman"],
  Relic_ArcanistsAreHunters: ["monk", "archer"],
  Relic_MilitiaAreMystics: ["spearman", "monk"],
  Relic_MysticsAreArcanists: ["hwacha", "monk"],
  Relic_OutcastsAreMilitia: ["militia", "spearman"],
  "R_HunterArrowBounce - Demo": ["archer"],
  "R_WarriorsSpawnFortify - Demo": ["monk", "monk"],
};

export function withHaengjuRelicClasses(effect: BphEffect): BphEffect {
  const classes = relicClasses[effect.nodeId];
  if (!classes) return effect;
  const { targetClass, secondTargetClass, ...rest } = effect.targets;
  return { ...effect, targets: { ...rest,
    ...(targetClass && { targetHaengjuClass: classes[0] }),
    ...(secondTargetClass && classes[1] && { secondTargetHaengjuClass: classes[1] }),
  } };
}

// Cache the transitive ring links per immutable active-effect array. Draw
// weights deliberately use the profile's own class; the rings act in combat.
const ringLinks = new WeakMap<readonly BphEffect[], Map<BphClass, Set<string>>>();
export function bphRelicClassMatches(effects: readonly BphEffect[], actual: BphClass, target: string): boolean {
  if (actual === target) return true;
  let links = ringLinks.get(effects);
  if (!links) { links = new Map(); ringLinks.set(effects, links); }
  let classes = links.get(actual);
  if (!classes) {
    classes = new Set([actual]);
    const rings = effects.filter(e => e.type === "HeroClassAlsoCountsAs");
    let previous: number;
    do {
      previous = classes.size;
      for (const { targets: { targetHaengjuClass: a, secondTargetHaengjuClass: b } } of rings)
        if (a && b && (classes.has(a) || classes.has(b))) { classes.add(a); classes.add(b); }
    } while (previous !== classes.size);
    links.set(actual, classes);
  }
  return classes.has(target);
}
