import { afterEach, expect, test } from "bun:test";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else Reflect.deleteProperty(globalThis, "localStorage");
});
function storage(initial: Record<string, string>) {
  const items = new Map(Object.entries(initial));
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) } });
  return items;
}
const fresh = () => import(`./display-scale?case=${Math.random()}`) as Promise<typeof import("./display-scale")>;

test("amounts are scaled by the one display factor and rounded", async () => {
  const { DISPLAY_SCALE, shownAmount } = await fresh();
  expect(DISPLAY_SCALE).toBe(10);
  expect(shownAmount(7)).toBe(70);
  expect(shownAmount(1.08)).toBe(11);
});

test("damage numbers default to off, persist the switch and ignore junk and the old three-way key", async () => {
  const items = storage({ "haengju1593.damageNumbers": "all" });
  const first = await fresh();
  expect(first.damageNumbersOn()).toBe(false);
  expect(first.damageNumbersMode()).toBe("off");
  expect(first.damageNumberShown(false)).toBe(false);
  expect(first.damageNumberShown(true)).toBe(false);
  first.setDamageNumbersOn(true);
  expect(items.get("haengju1593.damageNumbersOn")).toBe("on");
  const again = await fresh();
  expect(again.damageNumbersMode()).toBe("all");
  expect(again.damageNumberShown(false)).toBe(true);
  storage({ "haengju1593.damageNumbersOn": "loud" });
  expect((await fresh()).damageNumbersOn()).toBe(false);
  expect(first.damageNumberShown(false, "all")).toBe(true);
  expect(first.damageNumberShown(true, "off")).toBe(false);
});
