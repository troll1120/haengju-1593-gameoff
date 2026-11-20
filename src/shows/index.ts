import type { SkillShow } from "../skill-stage";
import { volleyShow } from "../volley-show-view";
import { show as chargeShow } from "./charge-show";
import { show as dongnaeShow } from "./dongnae-show";
import { show as jingakShow } from "./jingak-show";
import { show as ironWallShow } from "./iron-wall-show";
import { show as ambushShow } from "./ambush-show";
import { show as healWaveShow } from "./heal-wave-show";
import { show as turtleShipShow } from "./turtle-ship-show";

/** Every general whose skill is staged on the shared stage; a general missing here keeps the plain skill burst. */
export const SKILL_SHOWS: readonly SkillShow[] = [volleyShow, chargeShow, dongnaeShow, jingakShow, ironWallShow, ambushShow, healWaveShow, turtleShipShow]
  .filter((show): show is SkillShow => show !== undefined);
