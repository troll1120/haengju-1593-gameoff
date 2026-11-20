import type { Run } from "./rules";

// Observation identity must not consume combat RNG or become serialized battle state.
const sequences = new WeakMap<Run, number>();
export function nextBphDamageReceipt(run: Run): number {
  const next = (sequences.get(run) ?? 0) + 1;
  sequences.set(run, next);
  return next;
}
