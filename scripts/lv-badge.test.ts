import { expect, test } from "bun:test";
import { updateGeneralLevelBadge } from "../src/general-level-badge";
import { chaosArena } from "../src/chaos-test-fixture";
import { reachLevel, sharedLevel } from "../src/general-reach";
import { raiseChaosLevel } from "../src/chaos-growth";

function fixture() {
  const flashes: { frames: Keyframe[] | PropertyIndexedKeyframes | null; options?: number | KeyframeAnimationOptions }[] = [];
  const attributes: Record<string, string> = {};
  const badge = {
    textContent: "", dataset: {} as DOMStringMap, hidden: false,
    setAttribute(name: string, value: string) { attributes[name] = value; },
    animate(frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
      flashes.push({ frames, options }); return {} as Animation;
    },
  };
  return { badge, flashes, attributes };
}

test("renders actual battle levels and independent awakening state", () => {
  const { badge, flashes, attributes } = fixture(), run = chaosArena("권율", 0);
  for (const [level, tier] of [[1, 1], [7, 1], [20, 3]]) {
    raiseChaosLevel(run.chaos!, level);
    updateGeneralLevelBadge(badge, sharedLevel(run) === undefined ? undefined : reachLevel(run), tier, false, false);
    expect(badge.textContent).toBe(String(level));
    expect(badge.dataset.tier).toBe(String(tier));
    expect(attributes["aria-label"]).toBe(`레벨 ${level}`);
    expect(badge.hidden).toBe(false);
  }
  expect(flashes).toHaveLength(2);
  expect(flashes[0].options).toEqual({ duration: 520, easing: "ease-out", iterations: 1 });
  expect(flashes[0].frames).toEqual(expect.arrayContaining([
    expect.objectContaining({ boxShadow: expect.stringMatching(/^inset /) }),
  ]));
});

test("initial draw, same-level redraw, awakening, and level decrease never flash", () => {
  const { badge, flashes } = fixture();
  for (const [level, tier] of [[7, 1], [7, 1], [7, 3], [1, 3]])
    updateGeneralLevelBadge(badge, level, tier, false, false);
  expect(flashes).toHaveLength(0);
});

test.each([[true, false], [false, true], [true, true]])("suppresses level-up flash for preferences %s/%s", (off, reduced) => {
  const { badge, flashes } = fixture();
  updateGeneralLevelBadge(badge, 1, 1, off, reduced);
  updateGeneralLevelBadge(badge, 7, 1, off, reduced);
  expect(badge.textContent).toBe("7");
  expect(flashes).toHaveLength(0);
});

test("does not invent a level for a mode without a recorded pool", () => {
  const { badge, flashes } = fixture();
  updateGeneralLevelBadge(badge, 7, 1, false, false);
  updateGeneralLevelBadge(badge, undefined, 1, false, false);
  expect(badge.hidden).toBe(true);
  expect(badge.textContent).toBe("");
  updateGeneralLevelBadge(badge, 1, 1, false, false);
  expect(flashes).toHaveLength(0);
});
