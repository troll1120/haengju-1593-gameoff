export type HealthBar = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Keep thin head bars separate when neighboring sprites bunch together. */
export function reserveHealthBar(wanted: HealthBar, occupied: HealthBar[]): HealthBar {
  let y = wanted.y;
  while (occupied.some(box => wanted.x < box.x + box.width && box.x < wanted.x + wanted.width
    && y < box.y + box.height + 1 && box.y < y + wanted.height + 1)) y -= wanted.height + 2;
  const box = { ...wanted, y };
  occupied.push(box);
  return box;
}
