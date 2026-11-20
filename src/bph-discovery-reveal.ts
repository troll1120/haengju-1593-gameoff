import type { BphDrawResult } from "./bph-contract";

type BphDrawCard = BphDrawResult["cards"][number];
import { BPH_PROFILES, BPH_TOMES } from "./bph-data";

/**
 * The BPH discovery hits, played in place on the recruit result card above the button (owner DM 1794929475 "팝업하지
 * 말랬잖아"): no dialog, no backdrop, no pause. A first discovery, or a foil of any unit/tome card, lands as the "?"
 * silhouette on its first appearance; each tap on that card tremors it and stacks one more card-scale aura ray,
 * and the third tap bursts it open.
 */
export const BPH_DISCOVERY_HITS = 3;

/** First discoveries crack open; repeat foils show immediately. Legacy pending receipts retain their reveal. */
export function bphDiscoveryHolds(result: BphDrawResult): boolean {
  const card = result.cards[0];
  return card.discovered || (card.foil && card.foilDiscovered !== false
    && Boolean(BPH_PROFILES[card.profileId] || BPH_TOMES[card.profileId]));
}

/** The burst tag: a first discovery announces 새 발견!, a foil of an already-owned card announces 무지개 (owner DM 1794926405). */
export function bphDiscoveryTag(card: BphDrawCard): string {
  return card.discovered ? "새 발견!" : "무지개";
}

/** One static frame of the approved join-fx burst sheet per hit, its frame and size (multiples of the card) growing with the stack. */
const DISCOVERY_RAY_FRAMES = [2, 4, 3] as const;
const DISCOVERY_RAY_SCALES = [1.25, 1.5, 1.75] as const;

export type BphDiscoveryStage = {
  readonly hits: number;
  readonly rays: readonly number[];
  readonly revealed: boolean;
};

export function bphDiscoveryStage(hits: number): BphDiscoveryStage {
  const landed = Math.max(0, Math.min(hits, BPH_DISCOVERY_HITS));
  return { hits: landed, rays: DISCOVERY_RAY_FRAMES.slice(0, landed), revealed: landed >= BPH_DISCOVERY_HITS };
}

/** The static ray markup for one hit: the 4x2 burst sheet as a still frame sized to the card (--reveal), no drawn shapes. A foil card's rays carry one rainbow hue each. */
export function bphDiscoveryRay(index: number, foil: boolean): string {
  const frame = DISCOVERY_RAY_FRAMES[index], column = frame % 4, row = Math.floor(frame / 4);
  return `<span class="bph-discovery-ray r${index + 1}${foil ? " foil" : ""}" aria-hidden="true" style="--ray:${DISCOVERY_RAY_SCALES[index]};`
    + `background-position:${column / 3 * 100}% ${row * 100}%"></span>`;
}
