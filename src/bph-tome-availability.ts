import type { BphPack } from "./bph-contract";

/** Tactic books whose data stays but which no recruit can draw yet (owner DM 1794914054.342769): no executed effect yet, or the
 *  skull book held back until a 도사-like class arrives (DM 1794911925.951029). They are also left out of the codex list. */
export const BPH_WITHHELD_TOMES: ReadonlySet<string> = new Set([
  "Tome_RaiseDead", "Tome_Transmutation", "Tome_SpectralPact", "Tome_FortuneCache",
]);

export function bphDrawPool(pack: BphPack): BphPack["pool"] {
  return pack.pool.filter(row => !BPH_WITHHELD_TOMES.has(row.id));
}
