import type {
  BphEffect, BphEffectConsumer, BphFxContext, BphPackInstance, BphSave, BphSpawnOrigin,
} from "./bph-contract";
import type { BphPlacement, BphUpgradeNode } from "./bph-upgrade-data";
import type { BphOffer, BphShop } from "./bph-shop";
import type { Point } from "./geometry";
import type { Enemy, Unit } from "./rules";
import { CONDITION_CONSUMERS } from "./bph-fx-conditions";
import { ENEMY_CONSUMERS } from "./bph-enemy-effects";
import { BPH_QUEST_ENTRY } from "./bph-quests";
import { TROOP_CONSUMERS } from "./bph-fx-troops";

/** Per-run sequence; never consumes combat/account RNG or native entity IDs. */
export type BphCast = {
  readonly attackId?: number;
  readonly id: number;
  readonly spellId: string;
  readonly sourceId: number | null;
  readonly sourceLifeId: number | null;
  readonly tomeId: string | null;
  readonly targetId: number | null;
  readonly position: Point;
  readonly foil: boolean | null;
  readonly power: number;
};
export type BphCastRequest = {
  readonly attackId?: number;
  readonly spellId: string;
  readonly source: Unit | null;
  readonly target: Enemy | Unit | null;
  readonly position: Point;
  readonly tomeId?: string;
  readonly foil: boolean | null;
  readonly power: number;
};
export function beginBphCast(context: BphFxContext, request: BphCastRequest): BphCast {
  const id = (context.state.counters["wiring:cast"] ?? 0) + 1;
  context.state.counters["wiring:cast"] = id;
  const cast: BphCast = Object.freeze({
    id, spellId: request.spellId, sourceId: request.source?.id ?? null,
    sourceLifeId: request.source ? context.unitInfo(request.source)?.lifeId ?? null : null,
    tomeId: request.tomeId ?? null, targetId: request.target?.id ?? null,
    position: Object.freeze({ x: request.position.x, y: request.position.y }),
    foil: request.foil, power: request.power,
    ...(request.attackId === undefined ? {} : { attackId: request.attackId }),
  });
  context.emitEvent({ kind: "spellCast", ...request, cast });
  return cast;
}

export type BphPackOrigin = {
  readonly instanceId: number;
  readonly packId: string;
  readonly box: boolean;
  readonly sourceBuilding?: string;
  readonly sourceWave?: string;
  readonly cast?: BphCast;
  readonly position: Point;
};
export type BphQuestClaim = {
  readonly placementId: string;
  readonly nodeId: string;
  readonly claim: number;
  readonly receiptId: string;
};
export type BphUnitLife = {
  readonly unitId: number;
  readonly lifeId: number;
  readonly profileId: string;
  readonly parentId: number | null;
  readonly cause: NonNullable<BphSpawnOrigin["cause"]>;
};
export type BphUnitDamageRequest = {
  readonly target: Unit;
  readonly source?: Enemy;
  readonly amount: number;
  readonly spellId?: string;
  readonly cast?: BphCast;
};
/** Events describe applied transitions; consumers choose authored counting units. */
export type BphObservation =
  | { readonly kind: "unit-healed"; readonly targetId: number; readonly sourceId: number | null;
      readonly actualHpRestored: number }
  | { readonly kind: "unit-sacrificed"; readonly life: BphUnitLife;
      readonly reason: "pack-replacement" | "pack-reward" | "pack-opened" }
  | { readonly kind: "ice-broken"; readonly targetId: number; readonly side: "enemy" | "pack";
      readonly cast: BphCast | null }
  | { readonly kind: "pack-transformed"; readonly instanceId: number; readonly fromPackId: string;
      readonly toPackId: string; readonly receiptId: string };

/** Only an original activation path may introduce a definition without a placement. */
export type BphDefinitionOrigin =
  | { readonly kind: "placement"; readonly placementId: string }
  | { readonly kind: "foil-tome"; readonly tomeId: string; readonly cast: BphCast }
  | { readonly kind: "relic"; readonly relicId: string }
  | { readonly kind: "modifier"; readonly modifierId: string; readonly sourceRef: string };
export type BphActiveDefinition = {
  readonly nodeId: string;
  readonly origin: BphDefinitionOrigin;
  readonly effects: readonly BphEffect[];
};
export type BphCapability =
  | { readonly state: "dormant_supported"; readonly nodeId: string; readonly implementationRef: string }
  | { readonly state: "active"; readonly nodeId: string; readonly implementationRef: string;
      readonly origin: BphDefinitionOrigin; readonly naturalAccessEvidence: string };
export type BphEffectUnitEntry = {
  readonly unitId: string;
  readonly implementationRef: string;
  readonly capabilities: readonly BphCapability[];
  readonly consumers: readonly BphEffectConsumer[];
  readonly originalPlacements?: Readonly<Record<string, string>>;
};
const R1_PLACEMENTS: Readonly<Record<string, string>> = {
  SN_BeastmasterAddBear: "_SkillTreeNature:13:12",
  SN_BeastmasterAddJaguar: "_SkillTreeNature:12:11",
  SN_BeastmasterAddMonkey: "_SkillTreeNature:13:11",
};
/** Wiring owner activates each real producer and its manifest in the same commit. */
export const BPH_EFFECT_UNITS = (): readonly BphEffectUnitEntry[] => [
  { unitId: "T0", implementationRef: "src/bph-fx-conditions.ts", capabilities: [],
    consumers: CONDITION_CONSUMERS },
  { unitId: "E1", implementationRef: "src/bph-enemy-effects.ts",
    capabilities: ["Mod_Accelerate", "Mod_Infestation", "Mod_Infestation3x",
      "Mod_MonsterHpAndDamage125", "Mod_MonsterHpAndDamage200", "Mod_MonsterHpAndDamage300",
      "Mod_MonsterHpAndDamage500", "Mod_RiftUpgradeWaveSpeed"].map(nodeId => ({
        state: "dormant_supported", nodeId, implementationRef: "src/bph-enemy-effects.ts",
      })), consumers: ENEMY_CONSUMERS },
  { unitId: "Q1", implementationRef: "src/bph-quests.ts", capabilities: [],
    consumers: [{ id: "quests", kinds: [],
      onEvent: (context, event) => BPH_QUEST_ENTRY.observeQuestEvent(context.save, event),
      consume: () => { throw new RangeError("Q1 consumes observations, not effect kinds"); } }] },
  { unitId: "R1", implementationRef: "src/bph-fx-troops.ts",
    originalPlacements: R1_PLACEMENTS,
    capabilities: Object.keys(R1_PLACEMENTS).map(nodeId => ({
      state: "dormant_supported", nodeId, implementationRef: "src/bph-fx-troops.ts",
    })),
    consumers: TROOP_CONSUMERS },
  { unitId: "H1", implementationRef: "src/bph-shop.ts", capabilities: [], consumers: [] },
];

/** Producer contracts only. No absent module is imported or registered by W0. */
export type BphQuestEntry = {
  readonly observeQuestEvent: (save: BphSave, event: import("./bph-contract").BphFxEvent) => void;
  readonly questUnsupportedFields: (node: BphUpgradeNode) => readonly string[];
  readonly questAmount: (save: BphSave, placement: BphPlacement, node: BphUpgradeNode) => number;
  readonly claimQuestRewards: (save: BphSave, placement: BphPlacement, node: BphUpgradeNode, claim: BphQuestClaim) => void;
};
export type BphRecruitEntry = {
  readonly packOpeningState: (instance: BphPackInstance, effects: readonly BphEffect[]) =>
    { readonly hp: number; readonly frozen: boolean };
  readonly onPackOpened: (context: BphFxContext, receipt: import("./bph-contract").BphDrawResult,
    origin: BphPackOrigin) => void;
};
export type BphShopEntry = {
  readonly bphOfferPrice: (offer: BphOffer) => number;
  readonly buyBphOffer: (save: BphSave, shop: BphShop, slot: number) => boolean;
};
export type BphSpellEntry = {
  readonly consumers: readonly BphEffectConsumer[];
  readonly executeOriginalSpell: (context: BphFxContext, cast: BphCast) => void;
  readonly tickOriginalSpells: (context: BphFxContext, dt: number) => void;
};
export type BphConditionEntry = {
  readonly consumers: readonly BphEffectConsumer[];
  readonly applyInfection: (context: BphFxContext, hit: {
    readonly target: Enemy; readonly cast: BphCast; readonly duration: number;
  }) => void;
};
export type BphEnemyEntry = {
  readonly consumers: readonly BphEffectConsumer[];
  readonly effectiveWaveInterval: (context: BphFxContext, dt: number) =>
    { readonly after: number; readonly through: number; readonly countMultiplier?: number };
};
export type BphFogLight = {
  readonly sourceId: number;
  readonly kind: "cursor" | "tower" | "hero" | "pack" | "spectral";
  readonly position: Point;
  readonly radius: number;
};
export type BphFogProjection = {
  readonly width: number; readonly height: number;
  readonly worldToScreen: (point: Point) => Point;
};
export type BphProfileEntry = {
  readonly consumers: readonly BphEffectConsumer[];
  readonly fogLights: (context: BphFxContext) => readonly BphFogLight[];
  readonly renderBphFog: (projection: BphFogProjection, lights: readonly BphFogLight[]) => void;
};

/** Receipt hashes refer to exact Git inputs, never moving branch names. */
export type BphIntegrationRequest = {
  readonly unitId: string;
  readonly owner: string;
  readonly baseCommit: string;
  readonly producerCommit: string;
  readonly producerTree: string;
  readonly dependencyCandidates: Readonly<Record<string, string>>;
  readonly assignedIds: readonly string[];
  readonly sourceGates: Readonly<Record<string, {
    readonly state: "passed" | "blocked"; readonly evidence: readonly string[];
  }>>;
  readonly requestedHooks: readonly string[];
  readonly replacedKinds: readonly string[];
  readonly capabilities: readonly BphCapability[];
};
