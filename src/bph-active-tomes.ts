import type { BphFxContext, BphFxState } from "./bph-contract";

type ActiveTome = { readonly id: string; readonly foil: boolean };
const active = new WeakMap<BphFxState, {
  readonly time: number; readonly serial: number; readonly tomes: readonly ActiveTome[];
}>();

/** Activation alone adds a tome lifetime and increments status:tome-serial.
 * Channel ticks alter clock/interval only. Time and serial therefore invalidate
 * this identity list even when a new tome opens during the same combat tick.
 */
export function aliveBphTomes(ctx: BphFxContext): readonly ActiveTome[] {
  const serial = ctx.state.counters["status:tome-serial"] ?? 0, previous = active.get(ctx.state);
  if (previous?.time === ctx.run.time && previous.serial === serial) return previous.tomes;
  const tomes = Object.entries(ctx.state.timers).filter(([key, until]) =>
    key.startsWith("status:tome:") && key.endsWith(":until") && until > ctx.run.time)
    .map(([key]) => ({ id: key.split(":")[3], foil: ctx.state.counters[`${key.slice(0, -6)}:foil`] === 1 }));
  active.set(ctx.state, { time: ctx.run.time, serial, tomes });
  return tomes;
}
