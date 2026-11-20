import type { BphFxContext, BphFxEvent } from "./bph-contract";
import type { MartialAttack } from "./bph-native-martial-common";
import { martialDismount, tickDinoRiderArrows, tickMartialDismounts } from "./bph-native-projectiles-mounted";
import { martialProjectileAttack, tickMartialProjectiles } from "./bph-native-projectiles";
import { martialMeleeAttack, martialMeleeStats, tickMartialLeaps } from "./bph-native-martial-melee";
import { martialBlackHole, tickMartialImpulses } from "./bph-native-martial-motion";
import { martialFisherEvent } from "./bph-native-martial-fisher";
import { martialWarlordEvent } from "./bph-native-martial-warlord";
import { martialIceHit, tickMartialIce } from "./bph-native-martial-ice";

export { tickDinoRiderArrows };
export { fisherUsesMelee } from "./bph-native-martial-melee";
export { martialActorContact, martialWheelWobble, tickMartialWheel } from "./bph-native-martial-motion";
export { martialTauntTarget } from "./bph-native-martial-warlord";
export { martialIceHit } from "./bph-native-martial-ice";
export type { MartialAttack } from "./bph-native-martial-common";

/** Hook after profile/status stat modifiers; parent retains actor movement. */
export function martialEvent(ctx: BphFxContext, event: BphFxEvent): void {
  martialMeleeStats(ctx, event);
  martialDismount(ctx, event);
  martialFisherEvent(ctx, event);
  martialWarlordEvent(ctx, event);
  martialIceHit(ctx, event);
  martialBlackHole(ctx, event);
  if (event.kind !== "step") return;
  tickMartialProjectiles(ctx, event.dt);
  tickMartialLeaps(ctx);
  tickMartialDismounts(ctx);
  tickMartialIce(ctx, event.dt);
  tickMartialImpulses(ctx, event.dt);
}

/** True replaces the normal damage/shot branch, not attack accounting/events. */
export function martialResolvedAttack(ctx: BphFxContext, attack: MartialAttack): boolean {
  return martialProjectileAttack(ctx, attack) || martialMeleeAttack(ctx, attack);
}
