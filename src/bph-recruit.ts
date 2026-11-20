import type { BphPackInstance } from "./bph-contract";
import { BPH_PACKS } from "./bph-data";
import { bphOfferPrice, bphUnitPack, buyBphOffer } from "./bph-shop";
import type { BphOffer, BphShop } from "./bph-shop";
import type { Run } from "./rules";

/**
 * Recruit roulette gameplay table. Owner-approved gameplay (DM 1794842189 "랜덤으로 x5 까지",
 * DM 1794842272 "모집 비용을 조금씩 올려", ledger 1038 "카드가격 뽑을때마다 2배씩 올라가게 해 줘"),
 * odds tuned by the lead; tune here only.
 *
 * multiplier: how many copies of the drawn unit a UNIT pack delivers (weights, not percents).
 *   x1 60% / x2 25% / x3 10% / x4 4% / x5 1%  →  mean 1.61 units per draw.
 *   Tome packs (a pool without profiles, e.g. Pack_Tomes) never multiply.
 * price: every field purchase doubles all bottom slots together (base, 2x, 4x, 8x ...). BphBattle.bought
 * keeps the per-pack counts, resets each run and is never saved.
 */
export const BPH_RECRUIT_TABLE = {
  multiplier: [
    { count: 1, weight: 60 }, { count: 2, weight: 25 }, { count: 3, weight: 10 },
    { count: 4, weight: 4 }, { count: 5, weight: 1 },
  ],
  price: { every: 1, growth: 2 },
} as const;
/** growth multiplies the price per step; stepRatio adds ceil(base * stepRatio) per step. */
type BphRecruitCurve = { readonly every: number } & ({ readonly growth: number } | { readonly stepRatio: number });
export type BphRecruitTable = {
  readonly multiplier: readonly { readonly count: number; readonly weight: number }[];
  readonly price: BphRecruitCurve;
};
const VISIT_RECRUIT_TABLE: BphRecruitTable = {
  ...BPH_RECRUIT_TABLE, price: { every: 5, stepRatio: .5 },
};
const recruitTableFor = (run: Run, shop: BphShop) =>
  run.bph?.recruitShop === shop ? BPH_RECRUIT_TABLE : VISIT_RECRUIT_TABLE;
const purchaseCount = (bought: Readonly<Record<string, number>>) =>
  Object.values(bought).reduce((sum, count) => sum + count, 0);
export function bphRecruitMean(table: BphRecruitTable = BPH_RECRUIT_TABLE): number {
  const total = table.multiplier.reduce((sum, entry) => sum + entry.weight, 0);
  return table.multiplier.reduce((sum, entry) => sum + entry.count * entry.weight, 0) / total;
}
export function bphRecruitPrice(base: number, bought: number, table: BphRecruitTable = BPH_RECRUIT_TABLE): number {
  const curve = table.price, steps = Math.floor(Math.max(0, bought) / curve.every);
  return "growth" in curve ? base * curve.growth ** steps : base + steps * Math.ceil(base * curve.stepRatio);
}
export { bphUnitPack } from "./bph-shop";

const RECRUIT_BASE_PRICES: Readonly<Record<string, number>> = {
  Pack1_Basic: 2, Pack2_Advanced: 3, Pack6_Forest: 5, Pack5_Skeleton: 5,
  Pack3_Magic: 7, Pack7_Arctic: 9, Pack4_Royal: 14, Pack_Tomes: 5,
};
export function bphRecruitBasePrice(packId: string): number {
  if (Object.hasOwn(RECRUIT_BASE_PRICES, packId)) return RECRUIT_BASE_PRICES[packId];
  return BPH_PACKS[packId]?.price ?? 0;
}
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
  return bphRecruitPrice(bphOfferPrice(offer), run.bph ? purchaseCount(run.bph.bought) : 0, table);
}
export function bphRecruitOfferPrice(run: Run, shop: BphShop, table: BphRecruitTable = recruitTableFor(run, shop)): number {
  const offer = shop.offers.find(offer => !offer.sold);
  if (!offer) return 0;
  return run.bph?.recruitShop === shop ? bphRecruitAsk(run, offer, table)
    : bphRecruitPrice(bphOfferPrice(offer), run.bph?.bought[offer.packId] ?? 0, table);
}
/** The roll rides on the pack instance (account inventory) and is stamped on the receipt when the pack opens. */
export function buyBphRecruit(run: Run, shop: BphShop, slot: number, table: BphRecruitTable = recruitTableFor(run, shop)): BphPackInstance | null {
  const battle = run.bph, offer = shop.offers[slot];
  if (!battle || !offer || offer.sold) return null;
  const packId = offer.packId, bought = battle.bought[packId] ?? 0;
  const ordinal = purchaseCount(battle.bought);
  const price = bphRecruitPrice(bphOfferPrice(offer), battle.recruitShop === shop ? ordinal : bought, table);
  if (run.gold < price) return null;
  const before = battle.save.inventory.length;
  const previousCoins = battle.save.coins;
  battle.save.coins = run.gold;
  if (!buyBphOffer(battle.save, shop, slot, price, battle.recruitShop === shop ? "battle" : "visit")) {
    battle.save.coins = previousCoins;
    return null;
  }
  run.gold = battle.save.coins;
  battle.bought[packId] = bought + 1;
  const instance = battle.save.inventory[before];
  if (bphUnitPack(packId)) {
    const multiplier = bphRecruitMultiplier(run.seed, ordinal, table);
    if (multiplier > 1) instance.multiplier = multiplier;
  }
  return instance;
}

/** Select from the prepared field catalog. Unknown or locked products cannot be bought. */
export function buyBphRecruitPack(run: Run, packId: string, table: BphRecruitTable = BPH_RECRUIT_TABLE): BphPackInstance | null {
  const shop = run.bph?.recruitShop;
  if (!shop) return null;
  return buyBphRecruit(run, shop, shop.offers.findIndex(offer => offer.packId === packId), table);
}
