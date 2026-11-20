export type HealthBar = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Keep each bar on its own unit's head; crowded bars intentionally overlap. */
export function reserveHealthBar(wanted: HealthBar, occupied: HealthBar[]): HealthBar {
  occupied.push(wanted);
  return wanted;
}
