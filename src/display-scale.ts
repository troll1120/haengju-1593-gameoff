/** Display-only scale for every health and damage amount the player reads: popups, skill totals, codex and card stats.
 *  The simulation never sees it, so battle results are unchanged. Counts, times, waves, prices, ranges and percents stay as they are. */
export const DISPLAY_SCALE = 10;
export const shownAmount = (value: number): number => Math.round(value * DISPLAY_SCALE);

/** "big" is only the frame-lean fallback of "all"; the player switches between off and all. */
export type DamageNumbersMode = "all" | "big" | "off";
/** Off by default, switched on in settings (owner DM 1794960368, ledger 594). A new key, so an earlier three-way choice does not carry over. */
export const DAMAGE_NUMBERS_STORE = "haengju1593.damageNumbersOn";
let on: boolean | null = null;

export function damageNumbersOn(): boolean {
  if (on !== null) return on;
  on = false;
  try { on = (typeof localStorage === "undefined" ? null : localStorage.getItem(DAMAGE_NUMBERS_STORE)) === "on"; } catch { return on; }
  return on;
}
export function setDamageNumbersOn(next: boolean): void {
  on = next;
  try { localStorage.setItem(DAMAGE_NUMBERS_STORE, next ? "on" : "off"); } catch { return; }
}
export function damageNumbersMode(): DamageNumbersMode {
  return damageNumbersOn() ? "all" : "off";
}
export function damageNumberShown(big: boolean, current = damageNumbersMode()): boolean {
  return current === "all" || current === "big" && big;
}
