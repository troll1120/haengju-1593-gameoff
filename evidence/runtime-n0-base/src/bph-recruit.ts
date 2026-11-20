import type { BphPackInstance } from "./bph-contract";
import { BPH_PACKS, BPH_PROFILES } from "./bph-data";
import { bphOfferPrice, buyBphOffer } from "./bph-shop";
import type { BphOffer, BphShop } from "./bph-shop";
import type { Run } from "./rules";

/**
 * Recruit roulette gameplay table. Owner-approved gameplay (DM 1794842189 "랜덤으로 x5 까지",
 * DM 1794842272 "모집 비용을 조금씩 올려"), odds and curve tuned by the lead; tune here only.
 *
 * multiplier: how many copies of the drawn unit a UNIT pack delivers (weights, not percents).
 *   x1 60% / x2 25% / x3 10% / x4 4% / x5 1%  →  mean 1.61 units per draw.
 *   Tome packs (a pool without profiles, e.g. Pack_Tomes) never multiply.
 * price: in-run escalation per pack id, reset every run and never saved (BphBattle.bought):
 *   price(n) = base + floor(n / every) × ceil(base × stepRatio), n = purchases of that pack so far this run.
 *   base 2 → 2, 2, 3, 3, 4, 4, 5 …   base 5 → 5, 5, 8, 8, 11 …   The first purchase is always the base price.
 */
export const BPH_RECRUIT_TABLE = {
  multiplier: [
    { count: 1, weight: 60 }, { count: 2, weight: 25 }, { count: 3, weight: 10 },
    { count: 4, weight: 4 }, { count: 5, weight: 1 },
  ],
  price: { every: 2, stepRatio: .5 },
} as const;
export type BphRecruitTable = {
  readonly multiplier: readonly { readonly count: number; readonly weight: number }[];
  readonly price: { readonly every: number; readonly stepRatio: number };
};
export function bphRecruitMean(table: BphRecruitTable = BPH_RECRUIT_TABLE): number {
  const total = table.multiplier.reduce((sum, entry) => sum + entry.weight, 0);
  return table.multiplier.reduce((sum, entry) => sum + entry.count * entry.weight, 0) / total;
}
export function bphRecruitPrice(base: number, bought: number, table: BphRecruitTable = BPH_RECRUIT_TABLE): number {
  return base + Math.floor(Math.max(0, bought) / table.price.every) * Math.ceil(base * table.price.stepRatio);
}
export const bphUnitPack = (packId: string): boolean => (BPH_PACKS[packId]?.pool ?? []).some(item => BPH_PROFILES[item.id] !== undefined);
/**
 * Deterministic side stream keyed by the run seed and the purchase ordinal (mulberry32 step, the
 * same mixer as the run and account RNGs). It consumes neither run.rng nor save.rng: a run whose
 * rolls are all x1 stays byte-identical to a run without the roulette, and a reload rolls the same.
 */
export function bphRecruitRoll(seed: number, ordinal: number): number {
  let state = (Math.imul(seed >>> 0 || 1, 0x9e3779b1) ^ Math.imul(ordinal + 1, 0x85ebca77)) >>> 0;
  state = (state + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state ^ state >>> 15, state | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
export function bphRecruitMultiplier(seed: number, ordinal: number, table: BphRecruitTable = BPH_RECRUIT_TABLE): number {
  const total = table.multiplier.reduce((sum, entry) => sum + entry.weight, 0);
  let point = bphRecruitRoll(seed, ordinal) * total;
  for (const entry of table.multiplier) { point -= entry.weight; if (point < 0) return entry.count; }
  return table.multiplier[table.multiplier.length - 1].count;
}
export function bphRecruitAsk(run: Run, offer: BphOffer, table: BphRecruitTable = BPH_RECRUIT_TABLE): number {
  return bphRecruitPrice(bphOfferPrice(offer), run.bph?.bought[BPH_PACKS[offer.packId].id] ?? 0, table);
}
export function bphRecruitOfferPrice(run: Run, shop: BphShop, table: BphRecruitTable = BPH_RECRUIT_TABLE): number {
  const offer = shop.offers.find(offer => !offer.sold);
  if (!offer) return 0;
  return bphRecruitAsk(run, offer, table);
}
/** The roll rides on the pack instance (account inventory) and is stamped on the receipt when the pack opens. */
export function buyBphRecruit(run: Run, shop: BphShop, slot: number, table: BphRecruitTable = BPH_RECRUIT_TABLE): BphPackInstance | null {
  const battle = run.bph, offer = shop.offers[slot];
  if (!battle || !offer || offer.sold) return null;
  const pack = BPH_PACKS[offer.packId], bought = battle.bought[pack.id] ?? 0;
  const price = bphRecruitAsk(run, offer, table);
  const before = battle.save.inventory.length;
  battle.save.coins = run.gold;
  if (!buyBphOffer(battle.save, shop, slot, price, battle.recruitShop === shop ? "battle" : "visit")) return null;
  run.gold = battle.save.coins;
  const ordinal = Object.values(battle.bought).reduce((sum, count) => sum + count, 0);
  battle.bought[pack.id] = bought + 1;
  const instance = battle.save.inventory[before];
  if (bphUnitPack(pack.id)) {
    const multiplier = bphRecruitMultiplier(run.seed, ordinal, table);
    if (multiplier > 1) instance.multiplier = multiplier;
  }
  return instance;
}
