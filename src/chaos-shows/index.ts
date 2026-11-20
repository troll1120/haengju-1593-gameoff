import type { AmbientShow } from "../skill-stage";
import { ambient as healPools } from "./heal-pools";
import { ambient as stompRings } from "./stomp-rings";
import { ambient as chargeTrails } from "./charge-trails";
import { ambient as militia } from "./militia";
import { ambient as fleetPasses } from "./fleet-passes";
import { ambient as wallBelt } from "./wall-belt";

/** Pictures of the army-level state in run.chaos, drawn every frame under the cast shows. */
export const CHAOS_SHOWS: readonly AmbientShow[] = [healPools, stompRings, chargeTrails, militia, fleetPasses, wallBelt]
  .filter((show): show is AmbientShow => show !== undefined);
