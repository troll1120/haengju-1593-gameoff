import type { BphFxContext, BphFxEvent } from "./bph-contract";
import { onBphNativePortal } from "./bph-native-summons-portal";
import { onBphNativeIllusionist } from "./bph-native-passives-illusionist";
import { onBphNativeTreant } from "./bph-native-passives-treant";
import { onBphNativeBeastmaster } from "./bph-native-summons-beastmaster";
import { onBphNativeBloodMage } from "./bph-native-passives-bloodmage";
import { onBphNativeSkeleton } from "./bph-native-passives-skeleton";
import { onBphNativeDoppelganger } from "./bph-native-passives-doppelganger";

/** Parent calls once from the profile consumer; this module registers no kinds. */
export function onBphNativePassives(ctx: BphFxContext, event: BphFxEvent): void {
  onBphNativePortal(ctx, event);
  onBphNativeIllusionist(ctx, event);
  onBphNativeTreant(ctx, event);
  onBphNativeBeastmaster(ctx, event);
  onBphNativeBloodMage(ctx, event);
  onBphNativeSkeleton(ctx, event);
  onBphNativeDoppelganger(ctx, event);
}
