/** IDs are the original asset m_Name, not translated display names. */
import type { BphCast, BphObservation, BphPackOrigin, BphQuestClaim, BphUnitDamageRequest, BphUnitLife } from "./bph-effects-entry";
import type { BphShop } from "./bph-shop";
/** 40px existing spear reach / 0.3 original Squire reach; seconds stay seconds. */
export const BPH_WORLD_TO_PX = 40 / 0.3;
export type BphClass = "spearman" | "archer" | "militia" | "monk"
  | "hwacha" | "chongtong" | "joseon_cavalry" | "panokseon";
export type BphEnemyKind = "yari" | "teppo" | "samurai" | "cavalry" | "guard" | "ship";
export type BphEnemyMapping = {
  readonly kind: BphEnemyKind;
  readonly bossId: import("./bosses").BossId | null;
  readonly source: string;
  readonly role: string;
};
export type BphMonster = {
  readonly id: string; readonly hp: number; readonly damage: number;
  readonly towerDamage: number; readonly range: number; readonly attackSpeed: number;
  readonly moveSpeed: number; readonly mastery: number; readonly coins: number;
  readonly raw: Readonly<Record<string, number | string>>;
};
export type BphResource = "mastery" | "skull" | "coinIncome" | "zenith"
  | "ink" | "fruit" | "foilium" | "shard"
  | "runeA" | "runeB" | "runeC" | "prestigePoint" | "relic";
export type BphWallet = Record<BphResource, number>;
/** Mutable account counters, updated only when a purchased pack opens. */
export type BphCounters = { opened: number; sinceNewHero: number; sinceNewFoil: number };
export type BphEffect = {
  readonly nodeId: string; readonly type: string; readonly value: number;
  readonly effectPower: number; readonly effectPowerScale: number;
  readonly stackCap: number; readonly countStep: number;
  readonly targets: Readonly<Record<string, string>>;
};
export type BphDrawResult = {
  readonly id: number; readonly packId: string; readonly ordinal: number;
  readonly cards: readonly {
    readonly profileId: string; readonly foil: boolean;
    readonly copies: number; readonly discovered: boolean; readonly giant?: boolean;
  }[];
  readonly frenzy: boolean;
  readonly reason: "opening" | "scheduled" | "hero-pity" | "weighted";
  readonly multiplier?: number; readonly spawned?: number;
};
/** Mutable persisted account state; no chapter transition clears these fields. */
export type BphSave = {
  version: 1; rng: number; coins: number; income: number;
  resources: BphWallet;
  packs: Record<string, BphCounters>;
  discovered: string[]; foils: string[]; seen: string[];
  purchasedNodes: string[]; purchasedPlacements: string[];
  questProgress: Record<string, number>; questActivatedAt: Record<string, number>;
  firstThunderstorm: boolean; firstSquireFoil: boolean;
  totalOpened: number; totalKills: number; chapter: number; dimension: number;
  inventory: BphPackInstance[];
  nextPackId: number; nextResultId: number;
  pendingResults: BphDrawResult[];
  unlockedGenerals: string[];
  relicState: { owned: string[]; discovered: string[]; equipped: string[]; destroyed: string[]; slots: number; recoveries: number };
  lifecycle: { campaignAttempt: number; managementVisit: number; claimed: string[] };
  salaryApplied: number;
  shop?: BphShop;
  hiddenUpgradeRefund?: { version: 1; count: number; resources: BphWallet; announced: boolean };
  codexRewards?: { version: 1; claimed: string[]; pendingGold: number };
};
export type BphPackInstance = {
  id: number; packId: string; box: boolean;
  sourceBuilding?: string; sourceWave?: string; foilChanceBonus?: number; giantChance?: number;
  multiplier?: number;
};
export type BphSpawnOrigin = {
  readonly packId: string; readonly resultId?: number; readonly parentId?: number;
  readonly foil?: boolean; readonly giant?: boolean;
  readonly cause?: "pack" | "summon" | "duplicate" | "revive" | "transform" | "effect";
  readonly position?: import("./geometry").Point;
};
export type BphActor = {
  attackId?: number;
  id: number; ownerId: number; kind: "dash" | "hook" | "wheel" | "mine" | "beam" | "blade" | "seed";
  x: number; y: number; toX: number; toY: number; startedAt: number; until: number;
  power: number; radius: number; targets: number[]; data: Record<string, number>;
  cast?: BphCast;
};
export type BphBuffRequest = {
  readonly target: import("./rules").Unit | import("./rules").Enemy; readonly side: "ally" | "enemy";
  readonly id: string; readonly duration: number; readonly power: number; readonly stacks: number;
  readonly source?: import("./rules").Unit;
  readonly cast?: BphCast;
};
export type BphProgressEvent =
  | { readonly kind: "pack-opened"; readonly packId: string; readonly count: number }
  | { readonly kind: "enemy-killed"; readonly enemyId: string; readonly count: number }
  | { readonly kind: "card-discovered"; readonly profileId: string; readonly foil: boolean }
  | { readonly kind: "run-ended"; readonly seconds: number; readonly won: boolean }
  | { readonly kind: "chapter-entered"; readonly chapter: number; readonly dimension: number };
export type BphEvolution = {
  readonly kills: number; readonly profileId: string; readonly become: boolean;
};
export type BphProfile = {
  readonly id: string; readonly source: string; readonly name: string;
  readonly rarity: number; readonly classId: BphClass; readonly collectible: boolean;
  readonly hp: number; readonly damage: number; readonly cooldown: number;
  readonly range: number; readonly moveSpeed: number; readonly attackType: number;
  readonly area: number; readonly critChance: number; readonly critDamage: number;
  readonly blockChance: number; readonly reduction: number; readonly discoveryBonus: number;
  readonly discoveryResource: BphResource; readonly evolution: readonly BphEvolution[];
  readonly raw: Readonly<Record<string, number | string>>;
};
export type BphTome = {
  readonly id: string; readonly source: string; readonly name: string; readonly rarity: number;
  readonly collectible: boolean; readonly discoveryBonus: number;
  readonly discoveryResource: BphResource; readonly foilBonus: number;
  readonly interval: number; readonly intervalMin: number; readonly intervalMax: number;
  readonly casts: number; readonly effectKind: number;
  readonly raw: Readonly<Record<string, number | string>>;
};
export type BphPack = {
  readonly id: string; readonly source: string; readonly price: number;
  readonly hp: number; readonly count: number; readonly mastery: number;
  readonly boxPrice: number; readonly boxCount: number; readonly boxMastery: number;
  readonly boxUnlock: number; readonly maxPurchases: number; readonly maxBoxes: number;
  readonly frenzy: number; readonly power: number;
  readonly heroMin: number; readonly heroMax: number; readonly foilMin: number; readonly foilMax: number;
  readonly pool: readonly { readonly id: string; readonly weight: number }[];
  readonly opening: readonly { readonly ordinal: number; readonly dimension: number; readonly ids: readonly string[] }[];
};

/** Shared mutable combat data, owned per battle rather than stored in module globals. */
export type BphFxState = {
  timers: Record<string, number>;
  counters: Record<string, number>;
  statuses: { targetId: number; id: string; until: number; power: number; stacks: number; side?: "ally" | "enemy"; sourceId?: number; cast?: BphCast }[];
  buildings: { id: string; x: number; y: number; clock: number; activations: number }[];
  relics: string[];
  spells: { id: string; x: number; y: number; power: number; sourceId?: number; targetId?: number; cast?: BphCast; attackId?: number }[];
  castleShield: { hp: number; maxHp: number };
  resourceSurge: number;
  actors: BphActor[];
  consumptions: { sourceId: number; targetId: number; phase: "start" | "end" }[];
};
export type BphFxEvent =
  | BphObservation
  | { readonly kind: "run-start" }
  | { readonly kind: "step"; readonly dt: number }
  | { readonly kind: "enemy-spawn"; readonly enemy: import("./rules").Enemy }
  | { readonly kind: "unit-spawn"; readonly unit: import("./rules").Unit; readonly profileId: string; readonly life?: BphUnitLife }
  | { readonly kind: "pack-opened"; readonly result: BphDrawResult; readonly origin?: BphPackOrigin }
  | { readonly kind: "unit-stats"; readonly unit: import("./rules").Unit; readonly profileId: string;
      readonly stats: { hp: number; damage: number; cooldown: number; range: number; area: number;
        moveSpeed: number; critChance: number; critDamage: number; blockChance: number; damageReduction: number } }
  | { readonly kind: "before-attack"; readonly unit: import("./rules").Unit; readonly target: import("./rules").Enemy;
      readonly attack: { multiplier: number; extraProjectiles: number; bounces: number; handled: boolean } }
  | { readonly kind: "after-attack"; readonly unit: import("./rules").Unit; readonly target: import("./rules").Enemy }
  | { readonly kind: "before-enemy-damage"; readonly enemy: import("./rules").Enemy; readonly source: import("./rules").Unit | null;
      readonly hit: { amount: number; prevented: boolean; critical: boolean }; readonly spellId?: string; readonly cast?: BphCast }
  | { readonly kind: "before-unit-damage"; readonly unit: import("./rules").Unit; readonly source: import("./rules").Enemy | null;
      readonly hit: { amount: number; prevented: boolean }; readonly spellId?: string; readonly cast?: BphCast }
  | { readonly kind: "enemy-killed"; readonly enemy: import("./rules").Enemy; readonly killer: import("./rules").Unit | null;
      readonly spellId?: string; readonly cast?: BphCast }
  | { readonly kind: "unit-death"; readonly unit: import("./rules").Unit; readonly killer: import("./rules").Enemy | null }
  | { readonly kind: "coins-gained"; readonly amount: number }
  | { readonly kind: "skill-used"; readonly squad: import("./rules").Squad }
  | { readonly kind: "towerAttacked"; readonly attacker: import("./rules").Enemy | null;
      readonly position: import("./geometry").Point; readonly amount: number; readonly hpLost: number }
  | { readonly kind: "shieldBroken"; readonly attacker: import("./rules").Enemy | null;
      readonly position: import("./geometry").Point; readonly absorbed: number }
  | { readonly kind: "spellCast"; readonly spellId: string; readonly source: import("./rules").Unit | null;
      readonly target: import("./rules").Enemy | import("./rules").Unit | null; readonly position: import("./geometry").Point; readonly cast?: BphCast }
  | { readonly kind: "spellHit"; readonly spellId: string; readonly source: import("./rules").Unit | null;
      readonly target: import("./rules").Enemy; readonly position: import("./geometry").Point; readonly amount: number; readonly cast?: BphCast }
  | { readonly kind: "unitKilled"; readonly side: "enemy"; readonly unit: import("./rules").Enemy;
      readonly source: import("./rules").Unit | null; readonly critical: boolean;
      readonly position: import("./geometry").Point; readonly origin: "attack" | "effect"; readonly spellId?: string; readonly cast?: BphCast }
  | { readonly kind: "unitKilled"; readonly side: "ally"; readonly unit: import("./rules").Unit;
      readonly source: import("./rules").Enemy | null; readonly critical: boolean;
      readonly position: import("./geometry").Point; readonly origin: "attack" | "effect" }
  | { readonly kind: "run-ended"; readonly won: boolean }
  | { readonly kind: "improvements-start"; readonly visitId: number }
  | { readonly kind: "campaign-start"; readonly attemptId: number }
  | { readonly kind: "quest-completed"; readonly placementId: string; readonly claim: number; readonly receipt?: BphQuestClaim }
  | { readonly kind: "mastery-gained"; readonly receiptId: string;
      readonly source: "pack" | "discovery" | "combat" | "quest" | "interest";
      readonly grant: { amount: number } }
  | { readonly kind: "wave-spawn-complete"; readonly waveId: string }
  | { readonly kind: "relic-recovered"; readonly relicId: string; readonly cost: number }
  | { readonly kind: "damage-dealt"; readonly side: "enemy" | "ally";
      readonly armyContribution?: number;
      readonly target: import("./rules").Unit | import("./rules").Enemy;
      readonly source: import("./rules").Unit | import("./rules").Enemy | null;
      readonly receiptId?: number;
      readonly attempted: number; readonly blocked: number; readonly dealt: number;
      readonly overkill: number; readonly critical: boolean; readonly spellId?: string; readonly cast?: BphCast }
  | { readonly kind: "dash-end"; readonly unit: import("./rules").Unit;
      readonly from: import("./geometry").Point; readonly to: import("./geometry").Point; readonly returning: boolean }
  | { readonly kind: "buff-applied"; readonly request: BphBuffRequest }
  | { readonly kind: "consume"; readonly source: import("./rules").Unit;
      readonly target: import("./rules").Unit | import("./rules").Enemy; readonly phase: "start" | "end" }
  | { readonly kind: "wave-pack-spawn"; readonly waveId: string; readonly instance: BphPackInstance }
  | { readonly kind: "hook-pull"; readonly actor: BphActor; readonly phase: "start" | "hit" | "end"; readonly target: import("./rules").Enemy }
  | { readonly kind: "wheel-edge"; readonly actor: BphActor; readonly side: import("./geometry").Direction }
  | { readonly kind: "mine-chain"; readonly actor: BphActor; readonly previous: BphActor | null };
export type BphDamageRequest = {
  readonly attackId?: number;
  readonly target: import("./rules").Enemy; readonly amount: number;
  readonly source?: import("./rules").Unit; readonly critical?: boolean;
  readonly spellId?: string; readonly position?: import("./geometry").Point; readonly cast?: BphCast;
};
export type BphFxContext = {
  readonly run: import("./rules").Run;
  readonly save: BphSave;
  readonly effects: readonly BphEffect[];
  readonly state: BphFxState;
  /** Current/last actual touch point in battlefield pixels, updated in place. */
  readonly pointer: { x: number; y: number };
  /** Combat stream only. Presentation must never receive this function. */
  readonly random: () => number;
  readonly emit: (effect: import("./rules").Effect) => void;
  /** Effect-caused damage does not recursively dispatch damage proc events. */
  readonly damage: (enemy: import("./rules").Enemy, amount: number, source?: import("./rules").Unit) => void;
  /** Original HP damage units, not pixels. Returns actual applied damage. */
  readonly applyDamage: (request: BphDamageRequest) => number;
  readonly applyUnitDamage: (request: BphUnitDamageRequest) => void;
  /** Spell consumers emit spellCast when the cast executes, not when queued. */
  readonly emitEvent: (event: BphFxEvent) => void;
  readonly heal: (unit: import("./rules").Unit, amount: number, source?: import("./rules").Unit) => void;
  readonly spawnProfile: (profileId: string, copies: number, origin?: BphSpawnOrigin) => void;
  readonly grantPack: (packId: string, count: number, metadata?: {
    readonly sourceBuilding?: string; readonly sourceWave?: string; readonly foilChanceBonus?: number; readonly giantChance?: number;
  }) => void;
  readonly profileId: (unit: import("./rules").Unit) => string | null;
  readonly unitInfo: (unit: import("./rules").Unit) => {
    readonly profileId: string; readonly foil: boolean; readonly giant: boolean; readonly originalClass: number;
    readonly packId: string; readonly resultId: number | null; readonly parentId: number | null;
    readonly lifeId: number; readonly cause: NonNullable<BphSpawnOrigin["cause"]>;
  } | null;
  /** Returns a probability threshold. Call random() separately, exactly once. */
  readonly chance: (base: number) => number;
  readonly applyBuff: (request: BphBuffRequest) => void;
  readonly beginConsume: (source: import("./rules").Unit, target: import("./rules").Unit | import("./rules").Enemy) => boolean;
  readonly endConsume: (source: import("./rules").Unit, target: import("./rules").Unit | import("./rules").Enemy) => boolean;
  readonly originalClasses: (unit: import("./rules").Unit) => readonly number[];
};
/** One module owns each effect kind. onEvent handles its baseline actor behavior. */
export type BphEffectConsumer = {
  readonly id: "buildings" | "status" | "profiles" | "quests" | "spells" | "packs" | "shop" | "enemies" | "conditions" | "troops";
  readonly kinds: readonly string[];
  readonly onEvent?: (context: BphFxContext, event: BphFxEvent) => void;
  readonly consume: (context: BphFxContext, event: BphFxEvent, effect: BphEffect) => void;
};
