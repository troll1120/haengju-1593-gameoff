import packs from "./data/bph-packs.json";
import tunables from "./data/tunables.json";

/** Every data file whose values steer the simulation. A new data file joins this list so a change to it moves DATA_STAMP. */
export const DATA_FILES = { "bph-packs": packs, tunables } as const;

/** JSON with object keys sorted at every depth, so reordering keys in a data file does not move the stamp. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** 64-bit FNV-1a over the UTF-16 code units, as 16 hex digits: synchronous, so the browser can stamp at startup. */
export function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index++) hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(index))) * 0x100000001b3n);
  return hash.toString(16).padStart(16, "0");
}

/** The data version a run was played on. Recorded hash baselines carry the stamp they were taken under. */
export const DATA_STAMP = fnv1a64(canonicalJson(DATA_FILES));
