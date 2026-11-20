import type { BphDrawResult, BphEffect, BphPack, BphPackInstance, BphSave } from "./bph-contract";
import { BPH_MONSTERS, BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { bphChance } from "./bph-fx-dispatch";
import { grantBphMastery } from "./bph-account";
import { bphMergedReward } from "./bph-cost-merge";
import { discoverBphCodex } from "./bph-codex-rewards";
import { bphDrawFoilEligible, bphDrawPrestige, bphDrawWindowChance } from "./bph-draw-policy";
import { bphDrawPool } from "./bph-tome-availability";

/** Account draw RNG is independent of combat and never called by presentation. */
export function bphRandom(save: BphSave): number {
  save.rng = (save.rng + 0x6d2b79f5) >>> 0;
  let value = Math.imul(save.rng ^ save.rng >>> 15, save.rng | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
export class BphPackError extends Error {
  constructor(readonly packId: string) { super(`Unknown or empty pack: ${packId}`); this.name = "BphPackError"; }
}
export function bphEffectValue(effects: readonly BphEffect[], type: string, target?: string): number {
  return effects.filter(effect => effect.type === type
    && (target === undefined || Object.values(effect.targets).includes(target)))
    .reduce((sum, effect) => sum + effect.value, 0);
}
/** Native OpenTargetPackFoilChance is an additive chance, global when targetPack is absent. */
export function bphFoilChance(save: BphSave, packId: string, profileId: string,
  effects: readonly BphEffect[], instanceBonus = 0): number {
  const prestige = bphDrawPrestige(save.dimension), card = BPH_PROFILES[profileId] ?? BPH_TOMES[profileId];
  const misses = card ? save.questProgress[`draw:foil-misses:${profileId}`] ?? 0 : 0;
  const base = BPH_MONSTERS[profileId] ? prestige.monsterFoilChance
    : card ? prestige.foilChance + misses * prestige.foilPity : 0;
  const bonus = effects.filter(effect => effect.type === "OpenTargetPackFoilChance"
    && (!effect.targets.targetPack || effect.targets.targetPack === packId))
    .reduce((sum, effect) => sum + effect.value, 0);
  return bphChance(base + bonus + instanceBonus, effects);
}
function weighted(save: BphSave, pool: BphPack["pool"]): string {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let point = bphRandom(save) * total;
  for (const entry of pool) { point -= entry.weight; if (point < 0) return entry.id; }
  return pool[pool.length - 1].id;
}
function discover(save: BphSave, id: string, foil: boolean): boolean {
  const card = BPH_PROFILES[id] ?? BPH_TOMES[id];
  const isNew = !save.discovered.includes(id);
  if (isNew) {
    save.discovered.push(id);
    const reward = card && bphMergedReward(card.discoveryResource, card.discoveryBonus);
    if (reward?.resource === "mastery")
      grantBphMastery(save, { receiptId: `discovery:${id}`, amount: reward.amount, source: "discovery" });
    else if (reward) save.resources[reward.resource] += reward.amount;
  }
  if (foil) {
    const newFoil = !save.foils.includes(id);
    if (newFoil) {
      save.foils.push(id);
      const rawBonus = card?.raw.binderFoiliumDiscoveryBonus;
      save.resources.foilium += typeof rawBonus === "number" ? rawBonus : 0;
    }
    if (!BPH_PROFILES[id] || bphDrawPrestige(save.dimension).foilHeroesDropFoilium) {
      const openBonus = card?.raw.foilOpenFoilium;
      save.resources.foilium += typeof openBonus === "number" ? openBonus : 1;
    }
  }
  if (id === "Tome_Thunderstorm") save.firstThunderstorm = true;
  if (id === "Hero1_Squire" && foil) save.firstSquireFoil = true;
  discoverBphCodex(save, id, isNew);
  return isNew;
}
/** Native source and explicitly inferred ordering: review/rarity/pity.md. */
export function openBphPack(save: BphSave, input: {
  readonly packId: string; readonly effects: readonly BphEffect[]; readonly instance?: BphPackInstance;
  readonly firstOfBattle?: boolean;
}): BphDrawResult {
  const pack = BPH_PACKS[input.packId];
  if (!pack?.pool.length) throw new BphPackError(input.packId);
  const counter = save.packs[pack.id] ??= { opened: 0, sinceNewHero: 0, sinceNewFoil: 0 };
  counter.opened++; save.totalOpened++;
  const opening = pack.opening.find(item => item.ordinal === counter.opened && item.dimension === save.dimension);
  const basic = pack.id === "Pack1_Basic";
  // Original effect values are relative weight bonuses; candidate subsets normalize
  // the resulting weights in weighted(), rather than adding probability points.
  const rarityBonuses = [0, bphEffectValue(input.effects, "PackRareWeightBoost"),
    bphEffectValue(input.effects, "PackEpicWeightBoost"), bphEffectValue(input.effects, "PackLegendaryWeightBoost")];
  const pool = bphDrawPool(pack).map(item => {
    const card = BPH_PROFILES[item.id] ?? BPH_TOMES[item.id];
    const rarity = card ? rarityBonuses[card.rarity] : 0;
    const profile = BPH_PROFILES[item.id];
    const classBonus = profile ? input.effects.filter(effect =>
      effect.type === "BoosterPackTargetHeroWeightDouble" && effect.value > 0
      && (effect.targets.targetHaengjuClass
        ? effect.targets.targetHaengjuClass === profile.classId
        : Number(effect.targets.targetClass) === Number(profile.raw.heroClass))).length : 0;
    // The old tome-pity row had no counting contract. Its relic now adds a modest
    // relative draw weight instead of introducing a second guarantee system.
    const tomeBonus = BPH_TOMES[item.id] && input.effects.some(effect =>
      effect.type === "BoosterPackTargetTomePityStacks" && effect.value > 0) ? .5 : 0;
    const weight = item.weight * (1 + rarity) * (1 + classBonus + tomeBonus);
    return weight === item.weight ? item : { ...item, weight };
  });
  // The original "new unit" window covers both heroes and tomes.
  const unknownUnits = pool.filter(item =>
    (BPH_PROFILES[item.id] || BPH_TOMES[item.id]) && !save.discovered.includes(item.id));
  // Pity candidates are every hero/tome whose foil is still unrevealed; the
  // copiesBeforeFoilByRarity gate belongs to natural rolls only (pity.md:
  // a guaranteed foil bypasses the natural copy gate).
  const unknownFoils = pool.filter(item =>
    (BPH_PROFILES[item.id] || BPH_TOMES[item.id]) && !save.foils.includes(item.id));
  if (unknownUnits.length) counter.sinceNewHero++;
  if (unknownFoils.length) counter.sinceNewFoil++;
  const heroWindow = bphDrawWindowChance(counter.sinceNewHero, pack.heroMin, pack.heroMax);
  let reason: BphDrawResult["reason"] = "weighted";
  let ids: string[];
  if (opening) { ids = [...opening.ids]; reason = "opening"; }
  else if (basic && !save.firstThunderstorm && counter.opened >= 21) {
    ids = ["Tome_Thunderstorm"]; reason = "scheduled";
  } else if (unknownUnits.length && (heroWindow === 1 || (heroWindow > 0 && bphRandom(save) < heroWindow))) {
    ids = [weighted(save, unknownUnits)]; reason = "hero-pity";
  } else ids = Array.from({ length: pack.count }, () => weighted(save, pool));
  const foilWindow = bphDrawWindowChance(counter.sinceNewFoil, pack.foilMin, pack.foilMax);
  const foilPity = !opening && unknownFoils.length > 0
    && (foilWindow === 1 || (foilWindow > 0 && bphRandom(save) < foilWindow));
  const firstFoilDue = basic && !save.firstSquireFoil
    && (counter.opened >= 27 || (counter.opened >= 24 && save.foils.length === 0 && foilPity));
  let guaranteedFoil = false;
  if (!opening && (firstFoilDue || foilPity)) {
    // Preserve the existing collision rule: a guaranteed new unit can also be
    // the guaranteed foil, bypassing the natural-roll copy gate.
    // Only the explicitly scheduled Squire can replace the hero (contract §2.5).
    if (firstFoilDue) ids[0] = "Hero1_Squire";
    else if (reason !== "hero-pity") ids[0] = weighted(save, unknownFoils);
    guaranteedFoil = true;
  }
  const extras = input.effects.filter(effect => effect.type === "OpenTargetPackExtraHeroChance"
    && effect.targets.targetPack === pack.id);
  for (const hero of new Set(extras.map(effect => effect.targets.targetHero))) {
    const chance = extras.filter(effect => effect.targets.targetHero === hero).reduce((n, effect) => n + effect.value, 0);
    if (hero && bphRandom(save) < bphChance(chance, input.effects)) ids.push(hero);
  }
  const replacement = input.effects.find(effect => effect.type === "FirstPackOpenReplaceWithTargetHero"
    && effect.value > 0 && BPH_PROFILES[effect.targets.targetHero]);
  if (replacement && input.firstOfBattle) {
    ids = [replacement.targets.targetHero];
    guaranteedFoil = false;
  }
  let newUnit = false, newFoil = false;
  const cards = ids.map((id, index) => {
    const card = BPH_PROFILES[id] ?? BPH_TOMES[id];
    const missKey = `draw:foil-misses:${id}`, copiesKey = `draw:foil-copies:${id}`;
    const misses = card ? save.questProgress[missKey] ?? 0 : 0;
    const chance = bphFoilChance(save, pack.id, id, input.effects, input.instance?.foilChanceBonus);
    const foil = (index === 0 && guaranteedFoil)
      || (bphRandom(save) < chance
        && (card ? bphDrawFoilEligible(save, id) : !!BPH_MONSTERS[id]));
    if (card) {
      // Numeric, namespaced counters use the existing persisted counter bag.
      // The discovery copy is excluded; roulette/extra copies aren't extra rolls.
      if (save.discovered.includes(id)) save.questProgress[copiesKey] = (save.questProgress[copiesKey] ?? 0) + 1;
      save.questProgress[missKey] = foil ? 0 : misses + 1;
    }
    newUnit ||= !!card && !save.discovered.includes(id);
    newFoil ||= foil && !save.foils.includes(id);
    const copies = 1 + Math.max(0, Math.floor(bphEffectValue(input.effects, "PackSpawnExtraTargetHeroCopies", id)));
    const giant = !!input.instance?.giantChance && bphRandom(save) < bphChance(input.instance.giantChance, input.effects);
    const foilDiscovered = foil && !save.foils.includes(id);
    return { profileId: id, foil, foilDiscovered, copies, discovered: discover(save, id, foil), ...(giant ? { giant: true } : {}) };
  });
  if (newUnit) counter.sinceNewHero = 0;
  if (newFoil) counter.sinceNewFoil = 0;
  grantBphMastery(save, { receiptId: `pack:${save.nextResultId}`, amount: pack.mastery, source: "pack" });
  const multiplier = replacement && input.firstOfBattle ? undefined : input.instance?.multiplier;
  const result: BphDrawResult = { id: save.nextResultId++, packId: pack.id, ordinal: counter.opened,
    cards, reason, frenzy: bphRandom(save) < bphChance(pack.frenzy, input.effects),
    ...(multiplier !== undefined && multiplier > 1 ? { multiplier } : {}) };
  save.pendingResults.push(result);
  return result;
}
/** Presentation consumes this immutable receipt; no RNG or account is accepted. */
export function bphReelFrame(result: BphDrawResult, elapsed: number, presentation: {
  readonly seconds: number; readonly cells: number; readonly skipped: boolean;
}): { readonly resultId: number; readonly index: number; readonly done: boolean; readonly profileId: string } {
  const progress = presentation.skipped ? 1 : Math.min(1, Math.max(0, elapsed / presentation.seconds));
  return { resultId: result.id, index: Math.floor((1 - (1 - progress) ** 3) * presentation.cells),
    done: progress >= 1, profileId: result.cards[0].profileId };
}
