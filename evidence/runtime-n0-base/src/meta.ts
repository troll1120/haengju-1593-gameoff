import { GENERALS } from "./roster";
import type { General, SoldierKind } from "./roster";
import { CLASS_BRANCHES, META_NODES } from "./meta-nodes";
import type { MetaNode } from "./meta-nodes";
import type { BphSave } from "./bph-contract";
import { parseBphSave } from "./bph-save";
export { META_NODES, TREE_NODES, GENERAL_NODES, HIDDEN_NODES } from "./meta-nodes";
export type { MetaNode } from "./meta-nodes";

/** Kept only to refund saves written before the tree. */
export const UPGRADES = {
  wall: { step: .12, costs: [30, 60, 100, 150, 220] }, troops: { step: 1, costs: [80, 200, 400] },
  skill: { step: .1, costs: [30, 60, 100, 150, 220] }, gold: { step: .12, costs: [30, 60, 100, 150, 220] },
} as const;
export type UpgradeId = keyof typeof UPGRADES;
export const UPGRADE_IDS: UpgradeId[] = ["wall", "troops", "skill", "gold"];
/** Mutable account state; purchases are immutable node IDs. */
export type Meta = {
  bph?: BphSave; bossesReached?: number; bossesKilled?: number;
  version: number; merit: number; earned: number; runs: number; unlocked: number; nodes: string[];
  bestSeconds: number; losses: number; wins: number; stagnation: number; tiers: Record<UpgradeId, number>;
};
export type Caps = { party: number; troops: number; arrow: boolean; hwacha: boolean; weapon: number; drill: number; hero: number; tactics: number; evolution: boolean; naval: boolean; recruitCount: number };
export type MetaBonuses = {
  wallHp: number; startTroops: number; skillCharge: number; goldGain: number;
  caps?: Caps; power?: number; heroHp?: number; heroBasic?: number; skillPower?: number;
  startGold?: number; startArrow?: number; startHwacha?: number; startFire?: boolean;
  classDamage?: Partial<Record<SoldierKind, number>>; classExtra?: Partial<Record<SoldierKind, number>>;
  classGuard?: Partial<Record<SoldierKind, number>>; archerFire?: boolean; hwachaRadius?: number;
  generalMastery?: readonly General[]; generalAwaken?: readonly General[]; startLegends?: readonly SoldierKind[];
  navalStart?: number; navalPower?: number; navalTurtle?: boolean; endless?: boolean; wallStart?: number;
};
const STORE = "haengju1593-meta", STARTERS = 4;
export const freshMeta = (): Meta => ({ version: 2, merit: 0, earned: 0, runs: 0, unlocked: STARTERS, nodes: [], bestSeconds: 0, losses: 0, wins: 0, stagnation: 0, tiers: { wall: 0, troops: 0, skill: 0, gold: 0 } });
export function meritFor(kills: number, seconds: number, bosses: number): number {
  const raw = Math.floor(kills / 10) + Math.floor(seconds / 10) + bosses * 25;
  // Keep early purchases at the designed prices. The merged battle earns more
  // kills than the prototype; taper late income to preserve the owner's 3 h / 8 h curve.
  const credit = 1 - .35 * Math.max(0, Math.min(1, (seconds - 300) / 300));
  return Math.max(50, Math.floor(raw * credit));
}
export const openGenerals = (meta: Meta, roster: number): number => Math.min(roster, meta.unlocked);
export const generalCost = (meta: Meta, roster: number): number | null =>
  meta.unlocked >= roster ? null : meta.unlocked === 4 ? 0 : 80 + (meta.unlocked - 5) * 20;
export function visibleNode(meta: Meta, entry: MetaNode): boolean {
  if (entry.branch === "의병") return meta.losses >= 5;
  if (entry.branch === "수군") return meta.bestSeconds >= 180;
  if (entry.branch === "전설 계승") return meta.nodes.includes("guard") && entry.requires.every(id => meta.nodes.includes(id));
  if (entry.branch === "왕도") return meta.wins > 0;
  return true;
}
export function canBuy(meta: Meta, id: string): boolean {
  const entry = META_NODES.find(candidate => candidate.id === id);
  return !!entry && !meta.nodes.includes(id) && visibleNode(meta, entry) && entry.cost <= meta.merit
    && entry.requires.every(parent => meta.nodes.includes(parent)) && (id !== `general-${GENERALS[4]}` || meta.runs > 0);
}
export function buyNode(meta: Meta, id: string): boolean {
  const entry = META_NODES.find(candidate => candidate.id === id);
  if (!entry || !canBuy(meta, id)) return false;
  meta.merit -= entry.cost; meta.nodes.push(id);
  if (id.startsWith("general-")) meta.unlocked = Math.max(meta.unlocked, GENERALS.findIndex(general => general === id.slice(8)) + 1);
  return true;
}
export function recruitGeneral(meta: Meta, roster: number): boolean {
  const next = GENERALS[openGenerals(meta, roster)];
  return !!next && buyNode(meta, `general-${next}`);
}
export function unlockProgress(meta: Meta, roster: number): number | null {
  const cost = generalCost(meta, roster);
  return cost === null ? null : cost === 0 ? 1 : Math.min(1, meta.merit / cost);
}
export const nextUnlocks = (meta: Meta): MetaNode[] => META_NODES.filter(entry => entry.spine && !meta.nodes.includes(entry.id) && entry.requires.every(parent => meta.nodes.includes(parent))).slice(0, 3);
export function award(meta: Meta, merit: number, result?: { seconds: number; won: boolean }): number {
  let payment = Math.max(meta.nodes.includes("militia2") ? 100 : meta.nodes.includes("militia1") ? 70 : 50, merit);
  if (result) {
    if (meta.stagnation >= 3) payment = Math.floor(payment * 1.25);
    for (let minute = 2; minute <= 9; minute++) if (meta.bestSeconds < minute * 60 && result.seconds >= minute * 60) payment += minute * 20;
    meta.stagnation = result.seconds > meta.bestSeconds ? 0 : meta.stagnation + 1;
    meta.bestSeconds = Math.max(meta.bestSeconds, result.seconds);
    if (result.won) meta.wins++; else meta.losses++;
  }
  meta.merit += payment; meta.earned += payment; meta.runs++;
  if (meta.runs === 1 && meta.unlocked === STARTERS) buyNode(meta, `general-${GENERALS[4]}`);
  return payment;
}
export const costOf = (meta: Meta, id: UpgradeId): number | null => UPGRADES[id].costs[meta.tiers[id]] ?? null;
/** Legacy caller compatibility; the lobby uses buyNode. */
export function buy(meta: Meta, id: UpgradeId): boolean {
  const entry = META_NODES.find(node => node.group === ({ wall: "wall", troops: "reserve", skill: "charge", gold: "loot" }[id]) && !meta.nodes.includes(node.id));
  return !!entry && buyNode(meta, entry.id);
}
export function bonusesOf(meta: Meta): MetaBonuses {
  const has = (id: string) => meta.nodes.includes(id), rank = (id: string) => [1, 2, 3].filter(n => has(`${id}${n}`)).length;
  const classDamage: Partial<Record<SoldierKind, number>> = {}, classExtra: Partial<Record<SoldierKind, number>> = {}, classGuard: Partial<Record<SoldierKind, number>> = {};
  for (const [kind] of CLASS_BRANCHES) {
    classDamage[kind] = 1.145 ** rank(`${kind}-power`);
    classExtra[kind] = Number(has(`${kind}-${kind === "hwacha" ? "second" : "shape"}`));
    classGuard[kind] = kind !== "archer" && kind !== "hwacha" && has(`${kind}-second`) ? .67 : 1;
  }
  return {
    wallHp: 1.119 ** rank("wall"), wallStart: has("militia3") ? 1.2 : 1,
    startTroops: Number(has("reserve")) + Number(has("reinforce")), skillCharge: 1.077 ** rank("charge"), goldGain: 1 + .1 * rank("loot"),
    caps: { party: has("party4") ? 4 : has("party3") ? 3 : has("party2") ? 2 : 1,
      troops: has("troops48") ? 48 : has("troops36") ? 36 : has("troops26") ? 26 : has("troops18") ? 18 : has("troops12") ? 12 : has("troops8") ? 8 : 4,
      arrow: has("bow"), hwacha: has("cannon"), weapon: has("weapon3") ? 3 : has("weapon2") ? 2 : has("bow") ? 1 : 0,
      drill: has("forge3") ? 2 : has("forge") ? 1 : 0, hero: has("hero3") ? 3 : has("hero2") ? 2 : 1,
      tactics: has("guard") ? 3 : has("storm") ? 2 : has("recruit3") ? 1 : 0, evolution: has("evolution"), naval: has("navy"), recruitCount: has("recruit3") ? 3 : 2 },
    power: 1.25 ** (Number(has("keep5")) + Number(has("keep6")) + Number(has("keep7"))),
    heroHp: 1.119 ** rank("body"), heroBasic: 1.145 ** rank("basic"), skillPower: 1.145 ** rank("skill"),
    startGold: has("purse") ? 150 : 0, startArrow: Number(has("startBow")), startHwacha: Number(has("startCannon")), startFire: has("startFire"),
    classDamage, classExtra, classGuard, archerFire: has("archer-second"), hwachaRadius: has("hwacha-shape") ? 1.5 : 1,
    generalMastery: GENERALS.filter(general => has(`master-${general}`)), generalAwaken: GENERALS.filter(general => has(`awake-${general}`)),
    startLegends: CLASS_BRANCHES.filter(([kind]) => has(`inherit-${kind}`)).map(([kind]) => kind),
    navalStart: has("navy2") ? 2 : 0, navalPower: 1.145 ** rank("navyPower"), navalTurtle: has("turtle"), endless: has("endless"),
  };
}
export function loadMeta(): Meta {
  const meta = freshMeta();
  if (typeof localStorage === "undefined") return meta;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return meta;
    const kept = stored as Partial<Meta>;
    const count = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
    meta.merit = count(kept.merit); meta.earned = count(kept.earned);
    meta.runs = kept.runs === undefined ? meta.earned < 1 ? 0 : 1 + Math.floor((Math.sqrt(1 + 4 * meta.earned / 150) - 1) / 2) : count(kept.runs);
    meta.unlocked = kept.unlocked === undefined ? Math.max(STARTERS, Math.min(8, 3 + meta.runs)) : Math.min(GENERALS.length, Math.max(STARTERS, count(kept.unlocked)));
    meta.bestSeconds = count(kept.bestSeconds); meta.losses = count(kept.losses); meta.wins = count(kept.wins); meta.stagnation = count(kept.stagnation);
    if ((kept.version === 2 || kept.version === 3 || kept.version === 4) && Array.isArray(kept.nodes)) meta.nodes = [...new Set(kept.nodes.filter(id => META_NODES.some(entry => entry.id === id)))];
    else for (const id of UPGRADE_IDS) meta.merit += UPGRADES[id].costs.slice(0, count(kept.tiers?.[id])).reduce((sum, cost) => sum + cost, 0);
    for (const general of GENERALS.slice(4, meta.unlocked)) if (!meta.nodes.includes(`general-${general}`)) meta.nodes.push(`general-${general}`);
    if (kept.bph) { meta.bph = parseBphSave(kept.bph); meta.version = 4; }
    meta.bossesReached = count(kept.bossesReached); meta.bossesKilled = count(kept.bossesKilled);
  } catch (error) { if (!(error instanceof SyntaxError)) throw error; return freshMeta(); }
  return meta;
}
export function keepMeta(meta: Meta): void {
  try { localStorage.setItem(STORE, JSON.stringify(meta)); } catch (error) { if (!(error instanceof DOMException)) throw error; }
}
export const getMetaBonuses = (): MetaBonuses => bonusesOf(loadMeta());
