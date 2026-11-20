import { BPH_GENERALS, type BphGeneral } from "./bph-commanders";
import type { BphSave } from "./bph-contract";
import { prepColumns, prepLinkPoints, PREP_HEIGHT as height, PREP_PITCH, PREP_STEP as step } from "./bph-prep-columns";
import { BPH_CODEX_UNKNOWN, bphArtElement, bphProfilePicture } from "./bph-codex-page";
import { BPH_PACKS, BPH_PROFILES } from "./bph-data";
import { BPH_SILHOUETTE_ART, BPH_UNKNOWN_NAME } from "./bph-locked-identity";
import { BPH_BASIC_MONK, bphPrepCardGroup, bphPrepPlacementGroup, type BphPrepTab } from "./bph-prep-card-groups";
import { bphUnlockedPacks } from "./bph-shop";
import { phrase } from "./bph-upgrade-effect-text";
import { recruitment } from "./bph-upgrade-labels";
import type { BphUpgradeTreeNode } from "./bph-upgrade-tree-nodes";
import { BPH_DEFAULT_GRID, type BphPlacement } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { activeBphEffects, adjacentBphPlacements, BPH_PLACEMENTS, BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES } from "./bph-upgrades";
import { language, t } from "./i18n";
import { pixelIcon } from "./icons";
import { generalPortrait } from "./roster";
import { unitDisplayName } from "./unit-codex-i18n";
import "./bph-prep-tree.css";

export type PrepSelection = { kind: "card"; id: string } | { kind: "placement"; id: string } | { kind: "general"; id: BphGeneral };
export type PrepTap = PrepSelection | { kind: "pack"; id: string };
type Face = PrepSelection | { kind: "pack"; id: string };
type TreeItem = {
  face: Face; label: string; dim: boolean; concealed: boolean; status: string;
  parents: Set<string>; icon?: BphUpgradeTreeNode["icon"];
  /** A placement the save has not revealed yet. It holds its fixed seat as an inert locked silhouette. */
  unrevealed?: true;
};
type Positioned = TreeItem & { row: number; x: number; columns: number };

const nodeOf = (p: BphPlacement) => p.nodeId ? BPH_UPGRADE_NODES[p.nodeId] : undefined;
const isConnector = (p: BphPlacement) => [1, 2, 3].includes(nodeOf(p)?.type ?? -1);
const isHidden = (p: BphPlacement) => BPH_HIDDEN_UPGRADES.has(p.nodeId ?? "");

/** Every placement a save could ever reveal for this tab, in a save-independent order: the walk
 * from each open grid's start cells through the authored adjacency, crossing into a rift grid at
 * its entrance cell. The prestige grids never open in survival, so they hold no seat. Positions are
 * laid out over this whole set, so a purchase or reveal can never move another cell (castle 1120). */
export function prepPlacementUniverse(tab: BphPrepTab): BphPlacement[] {
  const grids = [...BPH_UPGRADE_GRIDS].filter(g => !g.id.startsWith("_SkillTreePrestige"))
    .sort((a, b) => Number(b.id === BPH_DEFAULT_GRID) - Number(a.id === BPH_DEFAULT_GRID));
  const open = new Set(grids.map(g => g.id)), reached = new Set<string>(), queue: BphPlacement[] = [];
  const enter = (gridId: string) => {
    for (const p of BPH_PLACEMENTS.values()) if (p.gridId === gridId && p.start && nodeOf(p)) queue.push(p);
  };
  enter(BPH_DEFAULT_GRID);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (reached.has(p.id)) continue;
    reached.add(p.id);
    const rift = nodeOf(p)?.refs.riftSkillTreeGrid;
    if (rift && open.has(rift)) enter(rift);
    queue.push(...adjacentBphPlacements(p));
  }
  return grids.flatMap(g => g.placements.filter(p => {
    const node = nodeOf(p);
    if (!node || !reached.has(p.id) || isHidden(p) || isConnector(p)) return false;
    const group = bphPrepPlacementGroup(p.id);
    return group.tab === tab && !group.card;
  }));
}

/** The structural frontier of a cell: its nearest non-connector cells through connector runs. */
function structuralNeighbours(target: BphPlacement): string[] {
  const queue = [...adjacentBphPlacements(target)], visited = new Set([target.id]), found: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (visited.has(p.id)) continue;
    visited.add(p.id);
    if (isConnector(p)) queue.push(...adjacentBphPlacements(p)); else found.push(p.id);
  }
  return found;
}

/** The grid-nearest cell that satisfies `seated`, crossing any other cell on the way. */
function nearestOnGrid(target: BphPlacement, seated: (id: string) => boolean): string | undefined {
  const queue = [...adjacentBphPlacements(target)], visited = new Set([target.id]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (visited.has(p.id)) continue;
    visited.add(p.id);
    if (seated(p.id)) return p.id;
    queue.push(...adjacentBphPlacements(p));
  }
}

/** Placement links come from the authored grid alone, never from purchase order or the live
 * frontier. Bidirectional candidates are alternatives; orient them outward from the start cells
 * (and a rift grid's entrance), without introducing a dependency across tabs. */
function placementEdges(items: Map<string, TreeItem>, universe: readonly BphPlacement[]) {
  const candidates = new Map(universe.map(p => [p.id,
    new Set(p.start ? [] : structuralNeighbours(p).filter(id => items.get(id)?.face.kind === "placement"))]));
  // Entry purchases gate a different grid, so its start has no same-grid frontier
  // prerequisite pointing to them. Project the authored entry onto that start.
  const entrances = new Map<string, string[]>();
  for (const p of universe) {
    const grid = nodeOf(p)?.refs.riftSkillTreeGrid;
    if (grid) entrances.set(grid, [...entrances.get(grid) ?? [], p.id]);
  }
  for (const p of universe) if (p.start) for (const from of entrances.get(p.gridId) ?? []) candidates.get(p.id)!.add(from);
  const adjacent = new Map(universe.map(p => [p.id, new Set<string>()]));
  for (const [child, parents] of candidates) for (const id of parents) {
    adjacent.get(id)!.add(child);
    adjacent.get(child)!.add(id);
  }
  const sorted = [...universe].sort((a, b) => Number(b.start) - Number(a.start) || a.id.localeCompare(b.id));
  const distance = new Map<string, number>();
  for (const root of sorted) {
    if (distance.has(root.id)) continue;
    const queue = [root.id];
    distance.set(root.id, 0);
    for (const id of queue) for (const next of adjacent.get(id)!) if (!distance.has(next)) {
      distance.set(next, distance.get(id)! + 1); queue.push(next);
    }
  }
  const precedes = (a: string, b: string) => distance.get(a)! - distance.get(b)! || a.localeCompare(b);
  // Keep one-way prerequisites first. A weaker reciprocal edge cannot reverse a
  // real one-way path. Cycles in the purchase frontier are not circular requirements.
  const reaches = (id: string, target: string, seen = new Set<string>()): boolean => {
    if (id === target) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return [...items.get(id)!.parents].some(parent => reaches(parent, target, seen));
  };
  for (const reciprocal of [false, true]) for (const [child, parents] of candidates) for (const parent of parents) {
    if (Boolean(candidates.get(parent)?.has(child)) !== reciprocal || (reciprocal && precedes(parent, child) >= 0)) continue;
    if (!reaches(parent, child)) items.get(child)!.parents.add(parent);
  }
}

/** The unit catalog, recruitment pools and evolution lists own their identities.
 * Special families below implement the native summon, mount and visual-upgrade
 * relationships. A shared class, tier or tab never establishes a parent. */
function cardItems(save: BphSave, tab: BphPrepTab, items: Map<string, TreeItem>) {
  const discovered = new Set(save.discovered);
  for (const profile of Object.values(BPH_PROFILES)) if (bphPrepCardGroup(profile.id) === tab) {
    const id = profile.id, dim = !discovered.has(id);
    items.set(id, { face: { kind: "card", id }, dim, concealed: dim, parents: new Set(),
      status: dim ? phrase("미발견", "Undiscovered") : "",
      label: dim ? BPH_UNKNOWN_NAME : id === BPH_BASIC_MONK ? phrase("승려", "Monk") : unitDisplayName(id, language()) ?? t(profile.name) });
  }
  const link = (parent: string, child: string) => {
    if (items.has(parent)) items.get(child)?.parents.add(parent);
  };
  const unlocked = bphUnlockedPacks(save, activeBphEffects(save));
  for (const { id, pool } of Object.values(BPH_PACKS)) {
    const members = pool.filter(p => p.weight > 0 && items.has(p.id));
    if (!members.length) continue;
    const dim = !unlocked.has(id);
    items.set(id, { face: { kind: "pack", id }, label: dim ? BPH_UNKNOWN_NAME : t(recruitment[id]), dim, concealed: dim,
      status: "", parents: new Set() });
    for (const member of members) link(id, member.id);
  }
  for (const profile of Object.values(BPH_PROFILES)) {
    let parent = profile.id;
    for (const step of profile.evolution) { link(parent, step.profileId); parent = step.profileId; }
  }
  for (const friend of ["Hero_Rat", "Hero_Bear", "Hero_Jaguar", "Hero_Monkey"]) link("Hero5_Beastmaster", friend);
  link("Hero5_Rider", "Hero5_DinoRider"); link("Hero5_Dino", "Hero5_DinoRider");
  link("Hero7_Warlord", "Hero7_Warlord_Spiked");
}

/** Pack at most three siblings per row. Every edge goes to a later row,
 * including when a wide tier wraps. Unrelated components have no linking rail. */
export function prepTreeLayout(save: BphSave, activeTab: BphPrepTab, visibleNodes: readonly BphUpgradeTreeNode[]): Positioned[] {
  const items = new Map<string, TreeItem>();
  if (activeTab === "general") {
    for (const id of BPH_GENERALS) {
      const dim = !save.unlockedGenerals.includes(id);
      items.set(id, { face: { kind: "general", id }, label: dim ? BPH_UNKNOWN_NAME : t(id),
        dim, concealed: dim, status: dim ? t("미해금") : "", parents: new Set() });
    }
  } else if (activeTab !== "shared") cardItems(save, activeTab, items);
  const shown = new Map(visibleNodes.map(n => [n.id, n]));
  const universe = prepPlacementUniverse(activeTab);
  for (const p of universe) {
    const n = shown.get(p.id), face = { kind: "placement", id: p.id } as const;
    items.set(p.id, n ? { face, label: n.label, icon: n.icon,
      dim: !n.buyable && !n.purchased, concealed: Boolean(n.concealed), status: n.blockers.join(" · "), parents: new Set() }
      : { face, label: BPH_UNKNOWN_NAME, icon: { url: BPH_SILHOUETTE_ART, sheet: null, badge: null },
        dim: true, concealed: true, status: "", parents: new Set(), unrevealed: true });
  }
  placementEdges(items, universe);
  const neighbors = new Map([...items.keys()].map(id => [id, new Set<string>()]));
  for (const [id, item] of items) for (const p of item.parents) {
    neighbors.get(id)!.add(p); neighbors.get(p)!.add(id);
  }
  const seen = new Set<string>(), components: string[][] = [], singles: string[] = [];
  for (const id of items.keys()) {
    if (seen.has(id)) continue;
    const group = [id]; seen.add(id);
    for (const key of group) for (const next of neighbors.get(key)!) if (!seen.has(next)) {
      seen.add(next); group.push(next);
    }
    if (group.length === 1) singles.push(id); else components.push(group);
  }
  if (activeTab === "general") components.unshift(singles); else components.push(singles);
  const result: Positioned[] = [], depth = new Map<string, number>();
  const tier = (id: string): number => {
    if (!depth.has(id)) depth.set(id, Math.max(0, ...[...items.get(id)!.parents].map(p => 1 + tier(p))));
    return depth.get(id)!;
  };
  // A cell with no link in this tab (hidden upgrades or another tab's cells stand between it and
  // its neighbours) sits one band below the grid-nearest linked cell, not at the far end of the tree.
  const home = new Map(components.flatMap(c => c === singles ? [] : c.map(id => [id, c] as const)));
  for (const id of [...singles]) {
    const p = items.get(id)!.face.kind === "placement" ? BPH_PLACEMENTS.get(id) : undefined;
    const anchor = p && nearestOnGrid(p, n => home.has(n));
    if (!anchor) continue;
    depth.set(id, tier(anchor) + 1);
    home.get(anchor)!.push(id);
    singles.splice(singles.indexOf(id), 1);
  }
  let row = 0;
  for (const component of components) {
    const bands: string[][] = [];
    for (const id of component) (bands[tier(id)] ??= []).push(id);
    const placed = prepColumns(bands.flat().map(id => items.get(id)!));
    result.push(...placed.map(n => ({ ...n, row: row + n.row })));
    row += (placed.at(-1)?.row ?? -1) + 1;
  }
  return result;
}

const ns = "http://www.w3.org/2000/svg";
export function renderPrepTree(save: BphSave, activeTab: BphPrepTab, visibleNodes: readonly BphUpgradeTreeNode[],
  select: (item: PrepTap) => void): HTMLElement {
  const nodes = prepTreeLayout(save, activeTab, visibleNodes), lookup = new Map(nodes.map(n => [n.face.id, n]));
  const tree = document.createElement("div"); tree.className = "prep-tree"; tree.dataset.prepTree = activeTab;
  const board = document.createElement("div"); board.className = "prep-tree-board"; tree.append(board);
  if (!nodes.length) { board.textContent = phrase("표시할 강화가 없습니다.", "No upgrades to show."); return tree; }
  const boardHeight = nodes[nodes.length - 1].row * step + height;
  const columns = Math.max(...nodes.map(n => n.columns)), boardWidth = columns * PREP_PITCH;
  const center = (n: Positioned) => ({ ...n, x: n.x + (columns - n.columns) * PREP_PITCH / 2 });
  board.style.setProperty("--columns", String(columns));
  board.style.height = `${boardHeight}px`;
  const lines = document.createElementNS(ns, "svg");
  lines.setAttribute("viewBox", `0 0 ${boardWidth} ${boardHeight}`); lines.setAttribute("preserveAspectRatio", "none");
  lines.setAttribute("aria-hidden", "true"); board.append(lines);
  for (const n of nodes) {
    const { face, label } = n, y = n.row * step;
    for (const id of n.parents) {
      const p = lookup.get(id)!;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", "M" + prepLinkPoints(center(p), center(n)).map(([x, y]) => `${x} ${y}`).join("L"));
      path.dataset.unlocked = String(!p.dim && !n.dim);
      path.dataset.from = id; path.dataset.to = face.id; lines.append(path);
    }
    // Locked packs used to be inert divs: an undiscovered ??? face must answer taps with its unlock route (castle ledger 1047).
    const node = document.createElement(n.unrevealed || face.kind === "pack" && !n.dim ? "div" : "button");
    node.className = "prep-tree-node"; node.dataset[face.kind] = face.id;
    node.style.left = `${center(n).x / boardWidth * 100}%`; node.style.top = `${y}px`; node.style.height = `${height}px`;
    node.dataset.dim = String(n.dim);
    node.dataset.concealed = String(n.concealed);
    if (n.unrevealed) {
      // The seat is only held for a later reveal: nothing to read or tap yet.
      node.dataset.unrevealed = "true"; node.setAttribute("aria-hidden", "true");
    } else if (face.kind !== "pack") {
      const button = node as HTMLButtonElement;
      button.type = "button"; button.onclick = () => select(face);
      if (face.kind !== "placement") button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-label", [label, n.status].filter(Boolean).join(" · "));
    } else if (n.dim) {
      const button = node as HTMLButtonElement;
      button.type = "button"; button.onclick = () => select(face);
      button.setAttribute("aria-label", [label, n.status].filter(Boolean).join(" · "));
    }
    const art = document.createElement("span"); art.className = "prep-tree-art";
    if (face.kind === "card") art.append(bphArtElement(n.concealed ? BPH_CODEX_UNKNOWN : bphProfilePicture(face.id), true));
    else {
      const img = document.createElement("img"); img.alt = ""; img.draggable = false;
      if (face.kind === "general") img.src = n.concealed ? BPH_SILHOUETTE_ART
        : `./art/portraits/${generalPortrait(face.id)}.png`;
      else if (face.kind === "pack") img.src = n.concealed ? BPH_SILHOUETTE_ART : pixelIcon("unit-cap");
      else { img.src = n.icon!.url; if (n.icon!.sheet) art.dataset.sheet = n.icon!.sheet; }
      art.append(img);
    }
    const name = document.createElement("span"); name.className = "prep-tree-label"; name.textContent = label;
    node.append(art, name);
    if (face.kind !== "placement") node.title = [label, n.status].filter(Boolean).join(" · ");
    board.append(node);
  }
  return tree;
}
