import { expect, test } from "bun:test";
import { BPH_ARRIVAL, BPH_CRATE, bphArrival, bphCratePoint, bphCrates, tapBphCrate } from "./bph-combat";
import { bphFxContext } from "./bph-fx-dispatch";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { advance } from "./rules";
import { prepareBphFieldShop } from "./bph-shop-session";
import { restockBphRecruit } from "./bph-supply";
import { bphRecruitBusy, pressBphRecruit, tapBphRecruit } from "./bph-view";
import { contains, fortRect, HEIGHT, setFieldSize, WIDTH } from "./geometry";
import { riverBank } from "./river";

function battle(seed = 144) {
  const run = createBphRun(freshMeta(), { seed, general: "권율", upgrades: [] });
  const context = bphFxContext(run);
  if (!context || !run.bph) throw new Error("Production run must bind effects");
  // Nobody defends in these crate scenes, and breachers now strike the keep they surround (enemy-keep-crowd.test.ts),
  // so an idle keep would fall near 20 s; it is made unbreakable so the crate clocks run their full course.
  run.base = run.maxBase = Number.MAX_SAFE_INTEGER;
  return { run, context, battle: run.bph };
}
const fromReceipt = (run: ReturnType<typeof battle>["run"], id: number) =>
  run.squads[0].soldiers.filter(unit => unit.bph?.resultId === id).length;
const copiesOf = (receipt: { readonly cards: readonly { readonly copies: number }[]; readonly multiplier?: number }) =>
  receipt.cards.reduce((sum, card) => sum + card.copies, 0) * (receipt.multiplier ?? 1);

test.each([[390, 650], [370, 800], [390, 560]])("crates at %ix%i land on open ground: off the walls, off the river, inside the field", (width, height) => {
  const [oldWidth, oldHeight] = [WIDTH, HEIGHT];
  setFieldSize(width, height);
  try {
    for (let id = 0; id < 400; id++) {
      const at = bphCratePoint(id);
      expect(contains(fortRect(0, 8), at)).toBe(false);
      expect(at.y).toBeLessThanOrEqual(riverBank() - BPH_CRATE.bank);
      expect(at.x).toBeGreaterThanOrEqual(24); expect(at.x).toBeLessThanOrEqual(width - 24);
      expect(at.y).toBeGreaterThanOrEqual(40);
    }
  } finally { setFieldSize(oldWidth, oldHeight); }
});

test("a building pack drops as a crate that a tap opens on the reels; nothing turns into a recruit-button charge", () => {
  const { run, context, battle: field } = battle();
  context.grantPack("Pack1_Basic", 1);
  const [crate] = bphCrates(run);
  expect(crate).toMatchObject({ hp: 2, landAt: run.time, ...bphCratePoint(crate.id) });

  const [receipt] = tapBphCrate(run, crate.id);
  expect(bphCrates(run)).toEqual([]);
  expect(field.save.inventory).toEqual([]);
  const arrival = bphArrival(run, receipt.id)!;
  expect(arrival.at - arrival.start).toBeCloseTo(BPH_ARRIVAL.numberStop, 9);
  while (run.time < arrival.at) { expect(fromReceipt(run, receipt.id)).toBe(0); advance(run, .05); }
  expect(fromReceipt(run, receipt.id)).toBe(copiesOf(receipt));
  expect(tapBphCrate(run, crate.id)).toEqual([]);
});

test("tapped unit crates roll the recruit roulette; the same seed and taps give the same bytes", () => {
  const play = () => {
    const { run, context } = battle(7);
    const multipliers: number[] = [];
    for (let draw = 0; draw < 200; draw++) {
      context.grantPack("Pack1_Basic", 1);
      const [receipt] = tapBphCrate(run, bphCrates(run)[0].id);
      multipliers.push(receipt.multiplier ?? 1);
    }
    return { multipliers, bytes: JSON.stringify(run) };
  };
  const first = play(), second = play();
  expect(second.bytes).toBe(first.bytes);
  expect(first.multipliers.every(n => n >= 1 && n <= 5)).toBe(true);
  expect(new Set(first.multipliers).size).toBeGreaterThanOrEqual(3);
  const mean = first.multipliers.reduce((sum, n) => sum + n, 0) / first.multipliers.length;
  expect(mean).toBeGreaterThan(1.3); expect(mean).toBeLessThan(1.9);
});

test("a crate nobody taps blinks out and opens by itself at x1 when its time runs out", () => {
  const { run, context } = battle();
  context.grantPack("Pack1_Basic", 1);
  const [crate] = bphCrates(run), expiry = crate.landAt! + BPH_CRATE.life;
  while (run.time + .05 < expiry) { advance(run, .05); expect(bphCrates(run)).toHaveLength(1); }
  while (bphCrates(run).length) advance(run, .05);
  expect(run.time).toBeGreaterThanOrEqual(expiry);
  const receipt = run.bph!.receipts.at(-1)!;
  expect(receipt.multiplier).toBeUndefined();
  while (bphRecruitBusy(run)) advance(run, .05);
  expect(fromReceipt(run, receipt.id)).toBe(copiesOf(receipt));
});

test("a paid press while the reels spin changes nothing and is not queued", () => {
  const { run, battle: field } = battle();
  prepareBphFieldShop(run);
  const shop = restockBphRecruit(run);
  run.gold = 50;
  expect(pressBphRecruit(run, shop)).toBe(true);
  expect(bphRecruitBusy(run)).toBe(true);
  const before = JSON.stringify(run);

  expect(pressBphRecruit(run, shop)).toBe(false);
  expect(JSON.stringify(run)).toBe(before);
  expect([run.gold, field.save.rng]).toEqual([JSON.parse(before).gold, JSON.parse(before).bph.save.rng]);

  while (bphRecruitBusy(run)) advance(run, .05);
  expect(pressBphRecruit(run, shop)).toBe(true);
});

test("a recruit tap mid-spin lands that pull at once; the next tap pulls and starts its reels now", () => {
  const { run, battle: field } = battle();
  prepareBphFieldShop(run);
  const shop = restockBphRecruit(run);
  run.gold = 50;
  expect(tapBphRecruit(run, shop)).toBe("pull");
  const [receipt] = field.receipts;
  for (let i = 0; i < 3; i++) advance(run, .1);
  expect(fromReceipt(run, receipt.id)).toBe(0);
  const gold = run.gold, rng = field.save.rng;

  expect(tapBphRecruit(run, shop)).toBe("skip");
  expect(bphRecruitBusy(run)).toBe(false);
  expect(fromReceipt(run, receipt.id)).toBe(copiesOf(receipt));
  // No new draw and nothing spent; the landing's own opening rewards may still pay out.
  expect([run.gold >= gold, field.save.rng, field.receipts.length, field.applied.length]).toEqual([true, rng, 1, 1]);

  expect(tapBphRecruit(run, shop)).toBe("pull");
  const next = field.receipts.at(-1)!;
  expect(field.receipts).toEqual([next]);
  expect(bphArrival(run, next.id)!.start).toBe(run.time);
});

test("six rapid recruit taps give exactly the pulls the taps meant and nothing after them", () => {
  const { run, battle: field } = battle();
  prepareBphFieldShop(run);
  const shop = restockBphRecruit(run);
  run.gold = 500;
  const taps = [];
  for (let i = 0; i < 6; i++) { taps.push(tapBphRecruit(run, shop)); advance(run, .1); }
  expect(taps).toEqual(["pull", "skip", "pull", "skip", "pull", "skip"]);
  const pulled = field.applied.length, gold = run.gold;
  for (let t = 0; t < 10; t += .05) advance(run, .05);
  expect([field.applied.length, run.gold >= gold, bphRecruitBusy(run)]).toEqual([pulled, true, false]);
  expect(pulled).toBe(3);
});

test("a later crate starts its reels only after the earlier one has landed and held", () => {
  const { run, context } = battle();
  context.grantPack("Pack1_Basic", 2);
  const [a, b] = bphCrates(run);
  const [first] = tapBphCrate(run, a.id), [second] = tapBphCrate(run, b.id);
  const one = bphArrival(run, first.id)!, two = bphArrival(run, second.id)!;
  expect(two.start).toBeCloseTo(one.at + BPH_ARRIVAL.hold, 9);
  expect(two.at).toBeCloseTo(two.start + BPH_ARRIVAL.numberStop, 9);
});
