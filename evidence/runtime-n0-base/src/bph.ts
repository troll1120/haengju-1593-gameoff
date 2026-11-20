import type { BphDrawResult, BphEffect, BphPack, BphPackInstance, BphSave } from "./bph-contract";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { bphChance } from "./bph-fx-dispatch";
import { grantBphMastery } from "./bph-account";
import { discoverBphCodex } from "./bph-codex-rewards";

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
    if (card?.discoveryResource === "mastery")
      grantBphMastery(save, { receiptId: `discovery:${id}`, amount: card.discoveryBonus, source: "discovery" });
    else if (card) save.resources[card.discoveryResource] += card.discoveryBonus;
  }
  if (foil) {
    const newFoil = !save.foils.includes(id);
    if (newFoil) {
      save.foils.push(id);
      const rawBonus = card?.raw.binderFoiliumDiscoveryBonus;
      save.resources.foilium += typeof rawBonus === "number" ? rawBonus : 0;
    }
    const openBonus = card?.raw.foilOpenFoilium;
    save.resources.foilium += typeof openBonus === "number" ? openBonus : 1;
  }
  if (id === "Tome_Thunderstorm") save.firstThunderstorm = true;
  if (id === "Hero1_Squire" && foil) save.firstSquireFoil = true;
  discoverBphCodex(save, id);
  return isNew;
}
/** Policies for unobserved precedence are documented in review/p10/contract.md. */
export function openBphPack(save: BphSave, input: {
  readonly packId: string; readonly effects: readonly BphEffect[]; readonly instance?: BphPackInstance;
}): BphDrawResult {
  const pack = BPH_PACKS[input.packId];
  if (!pack?.pool.length) throw new BphPackError(input.packId);
  const counter = save.packs[pack.id] ??= { opened: 0, sinceNewHero: 0, sinceNewFoil: 0 };
  counter.opened++; counter.sinceNewHero++; counter.sinceNewFoil++; save.totalOpened++;
  const opening = pack.opening.find(item => item.ordinal === counter.opened && item.dimension === save.dimension);
  const basic = pack.id === "Pack1_Basic";
  const unknownHeroes = pack.pool.filter(item => BPH_PROFILES[item.id] && !save.discovered.includes(item.id));
  let reason: BphDrawResult["reason"] = "weighted";
  let ids: string[];
  if (opening) { ids = [...opening.ids]; reason = "opening"; }
  else if (basic && !save.firstThunderstorm && counter.opened >= 21) {
    ids = ["Tome_Thunderstorm"]; reason = "scheduled";
  } else if (pack.heroMax > 0 && counter.sinceNewHero >= pack.heroMax && unknownHeroes.length) {
    ids = [weighted(save, unknownHeroes)]; reason = "hero-pity";
  } else ids = Array.from({ length: pack.count }, () => weighted(save, pack.pool));
  const unknownFoils = pack.pool.filter(item =>
    (BPH_PROFILES[item.id] || BPH_TOMES[item.id]) && !save.foils.includes(item.id));
  const foilPity = pack.foilMax > 0 && counter.sinceNewFoil >= pack.foilMax && unknownFoils.length > 0;
  const firstFoilDue = basic && !save.firstSquireFoil
    && (counter.opened >= 27 || (save.foils.length === 0 && foilPity));
  let guaranteedFoil = false;
  if (!opening && (firstFoilDue || foilPity)) {
    // A new hero is also an undiscovered foil: satisfy both windows on that card.
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
  let newHero = false, newFoil = false;
  const cards = ids.map((id, index) => {
    const foil = (index === 0 && guaranteedFoil)
      || bphRandom(save) < bphChance(.008 + (input.instance?.foilChanceBonus ?? 0), input.effects);
    newHero ||= !!BPH_PROFILES[id] && !save.discovered.includes(id);
    newFoil ||= foil && !save.foils.includes(id);
    const copies = 1 + Math.max(0, Math.floor(bphEffectValue(input.effects, "PackSpawnExtraTargetHeroCopies", id)));
    const giant = !!input.instance?.giantChance && bphRandom(save) < bphChance(input.instance.giantChance, input.effects);
    return { profileId: id, foil, copies, discovered: discover(save, id, foil), ...(giant ? { giant: true } : {}) };
  });
  if (newHero) counter.sinceNewHero = 0;
  if (newFoil) counter.sinceNewFoil = 0;
  grantBphMastery(save, { receiptId: `pack:${save.nextResultId}`, amount: pack.mastery, source: "pack" });
  const multiplier = input.instance?.multiplier;
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
