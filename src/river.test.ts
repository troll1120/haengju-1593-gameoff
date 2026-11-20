import { expect, test } from "bun:test";
import { fortRect, setFieldSize } from "./geometry";
import { riverBank, SHIP_TURN, TRANSPORT_TIERS, transportLoad, transportTier, transportView } from "./river";

test("the shore stays below the castle on every field the game and the sims use", () => {
  for (const [width, height] of [[370, 800], [390, 844], [390, 650], [390, 520]]) {
    setFieldSize(width, height);
    expect(riverBank()).toBeLessThanOrEqual(height - 136);
    for (const level of [0, 1, 2]) expect(riverBank() - 8 - fortRect(level).bottom).toBeGreaterThanOrEqual(36);
  }
  setFieldSize(370, 800);
  expect(riverBank()).toBe(536);
  setFieldSize(390, 650);
});

test("enemy transports escalate from kobaya to sekibune to atakebune, and bosses bring the flagship early", () => {
  expect([0, 299, 300, 599, 600, 1200].map(time => transportTier(time, false)))
    .toEqual(["kobaya", "kobaya", "sekibune", "sekibune", "atakebune", "atakebune"]);
  expect([120, 240, 450].map(time => transportTier(time, true))).toEqual(["kobaya", "atakebune", "atakebune"]);
  const [small, medium, large] = (["kobaya", "sekibune", "atakebune"] as const).map(tier => TRANSPORT_TIERS[tier]);
  for (const [a, b] of [[small, medium], [medium, large]]) {
    expect(b.capacity).toBeGreaterThan(a.capacity); expect(b.hull).toBeGreaterThan(a.hull); expect(b.scale).toBeGreaterThan(a.scale);
  }
  expect(transportLoad("atakebune", 900)).toEqual({ capacity: 12, hull: 1.2 });
  expect(transportLoad("atakebune", 1500)).toEqual({ capacity: 17, hull: 1.2 * 1.5 });
  expect(transportLoad("atakebune", 99999).capacity).toBe(20);
});

test("a transport sails in side-on, turns bow-on and lands on its simulated spot", () => {
  setFieldSize(370, 800);
  const lane = riverBank() + SHIP_TURN;
  const far = transportView({ x: 100, y: 804 });
  expect(far).toEqual({ x: 100 - (804 - lane), y: lane, direction: "side", faceLeft: false });
  expect(transportView({ x: 300, y: 700 }).faceLeft).toBe(true);
  expect(transportView({ x: 100, y: lane })).toEqual({ x: 100, y: lane, direction: "back", faceLeft: false });
  expect(transportView({ x: 100, y: riverBank() })).toMatchObject({ x: 100, y: riverBank(), direction: "back" });
  setFieldSize(390, 650);
});
