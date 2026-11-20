import { expect, test } from "bun:test";
import { AWAKENING_OFFER_MISS_LIMIT, createRun, drawCards, reelCards } from "./rules";

const fixture = () => {
  const run = createRun(7, "권율");
  run.level = 5;
  return run;
};
const hasAwakening = (cards: readonly string[]) => cards.some(card => card.startsWith("awaken-"));
const naturalRng = (awakening: boolean) => {
  for (let rng = 1; rng <= 100; rng++) {
    const run = fixture();
    run.rng = rng;
    if (hasAwakening(drawCards(run)) === awakening) return rng;
  }
  throw new Error("The ordinary random pool must support both hits and misses");
};

test("awakening pity never forces the first eight misses and guarantees the next offer", () => {
  expect(AWAKENING_OFFER_MISS_LIMIT).toBe(8);
  const run = fixture(), misses = naturalRng(false);
  for (let offer = 1; offer <= 8; offer++) {
    run.rng = misses;
    expect(hasAwakening(drawCards(run))).toBe(false);
    expect(run.awakeningOfferMisses).toBe(offer);
  }
  run.rng = misses;
  expect(hasAwakening(drawCards(run))).toBe(true);
  expect(run.awakeningOfferMisses ?? 0).toBe(0);
  // The card was only offered, never selected.
  expect(run.squads[0].tier).toBe(1);
  run.rng = misses;
  expect(hasAwakening(drawCards(run))).toBe(false);
  expect(run.awakeningOfferMisses).toBe(1);
});

test("a naturally offered awakening resets pity before the guarantee threshold", () => {
  const run = fixture();
  run.awakeningOfferMisses = 7;
  run.rng = naturalRng(true);
  expect(hasAwakening(drawCards(run))).toBe(true);
  expect(run.awakeningOfferMisses ?? 0).toBe(0);
});

test("pity waits for an eligible awakening and never invents a maxed-general card", () => {
  const run = fixture();
  run.level = 1;
  for (let offer = 0; offer < 12; offer++) expect(hasAwakening(drawCards(run))).toBe(false);
  expect(run.awakeningOfferMisses).toBe(8);
  run.level = 5;
  run.rng = naturalRng(false);
  expect(hasAwakening(drawCards(run))).toBe(true);
  run.level = 10;
  run.squads[0].tier = 3;
  run.awakeningOfferMisses = 8;
  expect(hasAwakening(drawCards(run))).toBe(false);
  expect(run.awakeningOfferMisses).toBe(8);
});

test("reel previews never count as missed level-up offers", () => {
  const run = fixture();
  for (let frame = 0; frame < 30; frame++) for (let slot = 0; slot < 3; slot++) reelCards(run, slot);
  expect(run.awakeningOfferMisses ?? 0).toBe(0);
});
