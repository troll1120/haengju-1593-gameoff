import { expect, test } from "bun:test";
import { joinIdentityHashes } from "../scripts/general-join-identity";
import baseline from "./bph-join.identity.json";

// Retain the historical failure ID used by expected-22.txt. The obsolete
// timed-pick pin is no longer applicable after the paid hire cutover.
test("battles that never reach a join hand replay 0f412af, and a prompt pick replays the paused hand of 12c5861, byte for byte", async () => {
  const hashes = await joinIdentityHashes();
  expect(Object.fromEntries(Object.entries(baseline.hashes).map(([name]) => [name, hashes[name].hash]))).toEqual(baseline.hashes);
  expect(hashes["one-general-C1-full144-410s"].survival).toBeGreaterThanOrEqual(400);
  expect(hashes["eight-generals-C4-none-lost"]).toMatchObject({ phase: "lost" });
  expect(hashes["eight-generals-C4-none-lost"].survival).toBeLessThan(170);
}, 120000);
