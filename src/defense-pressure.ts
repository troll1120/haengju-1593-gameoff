import type { Run } from "./rules";

/** Post-hook, prearmor pressure attributed sequentially to the commander's kit. */
export type DefensePressure = {
  readonly kind: "unit" | "castle";
  readonly incoming: number;
  readonly prevented: number;
};

const observers = new WeakMap<Run, (event: DefensePressure) => void>();

/** Measurement stays outside Run, including at N0; never emits combat events. */
export function subscribeDefensePressure(run: Run, observer: (event: DefensePressure) => void): () => void {
  observers.set(run, observer);
  return () => { observers.delete(run); };
}

export function recordDefensePressure(run: Run, kind: DefensePressure["kind"], incoming: number, prevented: number): void {
  observers.get(run)?.({ kind, incoming, prevented });
}
