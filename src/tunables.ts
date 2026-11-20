import raw from "./data/tunables.json";

/** Six values, one per chaos skill band (chaosSkillBand: L0, Lv1-4, Lv5-9, Lv10-14, Lv15-19, Lv20). */
export type Band = readonly number[];

/** Hand-tuned numbers kept in src/data/tunables.json so they change without touching code (owner DM 1794927364.683919).
 *  The bundled file is the baked-in value; tsc checks its shape against this type. Every value counts toward DATA_STAMP. */
export type Tunables = {
  /** Tap strike: a tap on the open field calls a castle arrow volley there (see bph-tap-strike). */
  readonly tapStrike: {
    /** Volleys held at the start of a battle and without charge upgrades. */
    readonly charges: number;
    /** Seconds to refill one volley at base recharge speed. */
    readonly rechargeSeconds: number;
    /** Seconds from the tap until the arrows land. */
    readonly travelSeconds: number;
    /** Battlefield pixels: a wide circle, so a rough tap still lands on the crowd. */
    readonly radius: number;
    /** Original HP damage units per enemy in the circle, before upgrades. */
    readonly damage: number;
    /** Seconds an enemy keeps burning after a fire-arrow volley. */
    readonly fireSeconds: number;
  };
  /** CSS pixels a finger must travel before a press turns into a drag-aim, and how far above the finger the ring then sits. */
  readonly tapAim: { readonly dragCss: number; readonly liftCss: number };
  readonly cursorTactics: {
    /** Seconds between casts at the pointer, per pointer tactic book. */
    readonly everySeconds: Readonly<Record<"Tome_Thunderstorm" | "Tome_Earthquake" | "Tome_DragonsCall" | "Tome_Blizzard", number>>;
    /** A tactic book without an authored duration lasts this long. */
    readonly defaultSeconds: number;
  };
  /** Display-only timing of the pointer tactics' pictures (see tactic-strike-show). */
  readonly tacticStrikeShow: {
    readonly boltMs: number; readonly foot: number; readonly quakeAfterMs: number; readonly quakeFadeMs: number;
    readonly maxBolts: number; readonly maxQuakes: number;
  };
  readonly wallBattery: {
    /** 김시민's cannon rules, CHAOS_RULES.skills.cannon. */
    readonly rules: {
      readonly count: Band; readonly waves: Band; readonly interval: number; readonly flight: number;
      readonly radius: Band; readonly arc: number; readonly power: Band; readonly siegeScaleCap: number;
      readonly push: number; readonly passiveEvery: Band; readonly passiveScale: number; readonly passiveReach: Band;
    };
    /** Display-only shares of the passive period at which a gun's fuse smoulders, burns and spits. */
    readonly show: { readonly smoulder: number; readonly burn: number; readonly spit: number };
  };
  /** Building packs dropped on the field as crates: seconds lying, seconds blinking, px off the walls, px off the river. */
  readonly fieldCrate: { readonly life: number; readonly blink: number; readonly gap: number; readonly bank: number };
};

export const TUNABLES: Tunables = raw;
