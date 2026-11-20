import { expect, test } from "bun:test";
import { canonicalJson, DATA_FILES, DATA_STAMP, fnv1a64 } from "./data-stamp";
import recorded from "./bph-survival-recruit.baseline.json";

test("the recorded survival hashes were taken on the current data files", () => {
  if (recorded.dataStamp !== DATA_STAMP) throw new Error(`data stamp ${DATA_STAMP} differs from the baseline's ${recorded.dataStamp}: `
    + "a data file changed, so re-record bph-survival-recruit.baseline.json together with its dataStamp, or revert the data change");
});

test("the stamp ignores key order and moves with any single value", () => {
  expect(fnv1a64(canonicalJson({ a: 1, b: [2, { c: 3, d: 4 }] }))).toBe(fnv1a64(canonicalJson({ b: [2, { d: 4, c: 3 }], a: 1 })));
  const tuned = structuredClone(DATA_FILES) as { tunables: { tapStrike: { radius: number } } };
  tuned.tunables.tapStrike.radius += 1;
  expect(fnv1a64(canonicalJson(tuned))).not.toBe(DATA_STAMP);
  expect(DATA_STAMP).toMatch(/^[0-9a-f]{16}$/);
});
