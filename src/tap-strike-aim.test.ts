import { expect, test } from "bun:test";
import { TAP_AIM, TapAim } from "./tap-strike-aim";

test("a quick tap fires where it landed and never shows a ring", () => {
  const aim = new TapAim();
  aim.touch({ x: 100, y: 200 });
  aim.drag({ x: 104, y: 203 }, 1);
  expect(aim.ring).toBeNull();
  expect(aim.release()).toEqual({ x: 100, y: 200 });
  expect(aim.ring).toBeNull();
});

test("a drag shows the ring lifted above the finger and the release fires at the ring", () => {
  const aim = new TapAim();
  aim.touch({ x: 100, y: 200 });
  aim.drag({ x: 140, y: 230 }, 2);
  const ring = { x: 140, y: 230 - TAP_AIM.liftCss * 2 };
  expect(aim.ring).toEqual(ring);
  expect(aim.release()).toEqual(ring);
});

test("a mouse ring follows the cursor and clears when it leaves the field", () => {
  const aim = new TapAim();
  aim.hover({ x: 50, y: 60 });
  expect(aim.ring).toEqual({ x: 50, y: 60 });
  aim.hover(null);
  expect(aim.ring).toBeNull();
  expect(aim.release()).toBeNull();
});

test("dismissing the aim ring after a cast keeps the release point and hides stale previews", () => {
  const aim = new TapAim();
  aim.touch({ x: 100, y: 200 });
  aim.drag({ x: 140, y: 230 }, 1);
  const point = { x: 140, y: 230 - TAP_AIM.liftCss };
  expect(aim.ring).toEqual(point);
  aim.dismissRing();
  expect(aim.ring).toBeNull();
  expect(aim.release()).toEqual(point);
  aim.hover(point);
  expect(aim.ring).toEqual(point);
  aim.cancel();
  expect(aim.ring).toBeNull();
});
