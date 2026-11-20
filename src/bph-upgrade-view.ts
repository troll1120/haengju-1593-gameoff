import type { BphSave } from "./bph-contract";
import { BPH_GENERAL_CLASS } from "./bph-commanders";
import type { BphMilestones } from "./bph-commanders";
import { bphLockedCardCondition, bphLockedGeneralCondition, bphLockedPackCondition, bphConcealmentConditions } from "./bph-unlock-condition";
import { BPH_CLASS_NAMES, BPH_PROFILES } from "./bph-data";
import { BPH_BASIC_MONK, BPH_PREP_TABS, bphPrepCardGroup, bphPrepPlacementGroup, bphPrepTabLabel as tabLabel, bphPrepTabLock } from "./bph-prep-card-groups";
import type { BphPrepTab } from "./bph-prep-card-groups";
import { renderPrepTree, type PrepSelection } from "./bph-prep-tree";
import { createPlacementTooltip, createPrepDetail, placementEffect, positionPlacementTooltip } from "./bph-prep-detail";
import { bphArtElement, bphProfilePicture, bphGeneralArt, el } from "./bph-codex-page";
import { bphCodexTraits } from "./bph-codex-details";
import { bphCommanderSkill } from "./bph-commander-info";
import { bphUnlockedPacks } from "./bph-shop";
import { buyBphGeneralUpgrade } from "./bph-general-upgrades";
import { upgradeLock } from "./bph-upgrade-lock";
import { bphGeneralUpgradeNodes } from "./bph-upgrade-tree-nodes";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { phrase } from "./bph-upgrade-effect-text";
import { buyBphUnitUpgrade } from "./bph-unit-upgrades";
import { createUpgradeRows } from "./bph-upgrade-rows";
import { bphPrepUpgradeNodes, bphUnitUpgradeNodes } from "./bph-upgrade-tree-nodes";
import type { BphUpgradeTreeNode } from "./bph-upgrade-tree-nodes";
import { activeBphEffects, BPH_PLACEMENTS, BPH_RESOURCE_LABELS, BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES, buyBphNode, visibleBphPlacements } from "./bph-upgrades";
import { t } from "./i18n";
import { pixelIcon } from "./icons";
import "./bph-upgrades.css";

const grids = [...BPH_UPGRADE_GRIDS].sort((a, b) => Number(b.id === BPH_DEFAULT_GRID) - Number(a.id === BPH_DEFAULT_GRID));
const openerSelector = '[data-bph-tab="upgrades"]';

// The balance package supplies both the descriptor and all economic decisions after integration.
type GrowthModule = {
  GENERAL_GROWTH_UPGRADE: { id: string; name: string; costs: readonly number[]; secondsPerRank: number };
  generalGrowthRank(save: BphSave): number;
  generalGrowthSecondsSaved(save: BphSave): number;
  generalGrowthUpgradePrice(save: BphSave): number | undefined;
  buyGeneralGrowthUpgrade(save: BphSave): boolean;
};
const growth = Object.values(import.meta.glob<GrowthModule>("./bph-general-growth-upgrade.ts", { eager: true })).at(0);

function growthNodes(save: BphSave): BphUpgradeTreeNode[] {
  if (!growth) return [];
  const def = growth.GENERAL_GROWTH_UPGRADE, rank = growth.generalGrowthRank(save);
  const price = growth.generalGrowthUpgradePrice(save), saved = growth.generalGrowthSecondsSaved(save);
  const effect = (seconds: number) => phrase(`${seconds}초 단축`, `${seconds}s faster`);
  return [{ id: def.id, label: phrase(def.name, "General growth speed"),
    icon: { url: pixelIcon("hourglass"), sheet: null, badge: null }, rank, max: def.costs.length,
    cost: price ?? null, currency: "mastery", costs: price === undefined ? [] : [{currency:"mastery",amount:price}],
    purchased: rank > 0, buyable: price !== undefined && price <= save.resources.mastery,
    currentText: effect(saved), nextText: price === undefined ? null : effect(saved + def.secondsPerRank),
    description: null, prereqs: [], requiredPrereqCount: 0, thresholds: [], blockers: [], tier: 1 }];
}

/** Both entrances mount this map. The caller owns the save and navigation back to its screen. */
export function renderBphUpgrades(host: HTMLElement, context: {
  readonly save: BphSave; readonly initial?: PrepSelection; readonly onChange: () => void; readonly onClose: () => void;
  readonly milestones: BphMilestones;
  readonly onPurchase?: (purchase: { readonly nodeId: string; readonly level: number }) => void;
}): () => void {
  const { save, initial } = context;
  const root = el("section", "bph-web bph-prep-upgrades wood-frame"), header = el("header", "bph-map-header");
  root.setAttribute("aria-label", t("강화"));
  const title = el("strong", "bph-map-title", t("강화")), wallet = el("div", "bph-web-wallet"), balance = el("span");
  const coin = el("img"); coin.src = pixelIcon("mastery"); coin.alt = t(BPH_RESOURCE_LABELS.mastery);
  wallet.append(coin, balance);
  const close = el("button", "icon-button bph-map-close"); close.type = "button"; close.dataset.closeUpgradeMap = "";
  close.setAttribute("aria-label", t("닫기")); const cross = el("img"); cross.src = pixelIcon("plus"); cross.alt = ""; close.append(cross);
  function leave() {
    const opener = root.closest(".bph-management")?.querySelector<HTMLElement>(openerSelector);
    context.onClose(); opener?.focus({ preventScroll: true });
  }
  close.onclick = leave;
  const tabs = el("div", "bph-prep-tabs"); tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", t("강화"));
  const content = el("div", "bph-prep-content"), board = el("div");
  header.append(title, wallet, close, tabs); content.append(board); root.append(header, content);
  let selected = initial, panel: HTMLElement | undefined;
  /** `bought` names the placement whose open tooltip was drawn right after its own purchase, so a
   * re-tap of that tile keeps the post-purchase reading instead of falling back to the local max. */
  let tooltip: { tip: HTMLElement; anchor: HTMLElement; bought?: string } | undefined;
  const events = new AbortController();
  const requested: BphPrepTab = initial?.kind === "card" ? bphPrepCardGroup(initial.id) ?? "militia" : initial?.kind === "general" ? "general" : "shared";
  let unlockedPacks = bphUnlockedPacks(save, activeBphEffects(save));
  const lockFor = (tab: BphPrepTab) => bphPrepTabLock(save, tab, unlockedPacks);
  let active: BphPrepTab = lockFor(requested) ? "shared" : requested;
  if (active !== requested) selected = undefined;
  let placements: readonly BphUpgradeTreeNode[] = [];
  const tabButtons = new Map<BphPrepTab, HTMLButtonElement>();
  function closeDetail(focus = true) {
    const previous = selected;
    selected = undefined; panel?.remove(); panel = undefined;
    content.inert = false;
    if (focus && previous) board.querySelector<HTMLElement>(`[data-${previous.kind}="${CSS.escape(previous.id)}"]`)?.focus({ preventScroll: true });
  }
  function closeTooltip() {
    if (!tooltip) return;
    tooltip.anchor.removeAttribute("aria-describedby");
    tooltip.tip.remove();
    tooltip = undefined;
  }
  function placeTooltip() {
    if (tooltip) positionPlacementTooltip(tooltip.tip, tooltip.anchor);
  }
  /** Selecting a placement never spends by itself: the tooltip explains the effect, carries the cost,
   * and offers one explicit upgrade button (castle ledger 1041). Concealed nodes explain their
   * discovery route instead and never expose the button (1043-1045). */
  function tapPlacement(id: string) {
    const node = placements.find(item => item.id === id);
    /** Withholding that button also locks away a reward that is already waiting behind a concealed node:
     * a finished quest asks for nothing, so the tap itself claims it and the refreshed panel reveals what
     * arrived in its own popup. That popup is the reveal, so the tooltip closes instead of covering it.
     * Anything with a price still waits for the explicit button. */
    if (node?.concealed && node.buyable && !node.costs.length && buyBphNode(save, id)) {
      context.onPurchase?.({ nodeId: id, level: save.questProgress[`claims:${id}`] ?? 1 });
      context.onChange();
      drawTree();
      closeTooltip();
      return;
    }
    showPlacement(id);
  }
  function showPlacement(id: string, purchased = false) {
    const before = placements.find(node => node.id === id);
    const selector = `[data-placement="${CSS.escape(id)}"]`;
    const focus = document.activeElement === board.querySelector(selector);
    if (!before) return;
    const beforeEffect = placementEffect(save, before);
    const afterEffect = before.nextText ?? beforeEffect;
    /** Further placements of this definition are one rank each and share the post-purchase price, so a
     * purchase and every re-tap of its still-open tooltip keep the node's real rank and next price
     * instead of the one-rank local max a cold tap on a taken tile shows. */
    const bought = purchased || tooltip?.bought === id;
    const short = !bought && before.nextText !== null && before.costs.some(({ currency, amount }) => save.resources[currency] < amount);
    const localMax = !bought && before.purchased && !before.thresholds.length;
    const tip = createPlacementTooltip(before, beforeEffect, afterEffect, { short, localMax });
    const definition = BPH_PLACEMENTS.get(id);
    const node = definition?.nodeId ? BPH_UPGRADE_NODES[definition.nodeId] : undefined;
    if (before.concealed && node) {
      tip.dataset.concealedTooltip = id;
      const routes = el("ul", "bph-placement-conditions");
      for (const line of bphConcealmentConditions(save, node)) {
        const item = el("li"); item.textContent = line; routes.append(item);
      }
      tip.append(routes);
    } else if (before.nextText !== null) {
      if (!before.buyable && node && definition) {
        const routes = el("ul", "bph-placement-conditions");
        for (const reason of before.blockers) {
          const lock = upgradeLock(save, definition, node, reason);
          const item = el("li"); item.textContent = lock.count ? `${lock.hint} (${lock.count})` : lock.hint;
          routes.append(item);
        }
        tip.append(routes);
      }
      const action = el("button", "bph-placement-buy");
      action.type = "button"; action.dataset.testid = `placement-buy-${id}`;
      action.disabled = !before.buyable;
      const up = el("img"); up.src = pixelIcon("up"); up.alt = "";
      action.append(up, document.createTextNode(t("강화")));
      action.onclick = event => {
        event.stopPropagation();
        if (!buyBphNode(save, id)) return;
        context.onPurchase?.({ nodeId: id, level: save.questProgress[`claims:${id}`] ?? 1 });
        context.onChange();
        drawTree();
        if (focus) board.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
        showPlacement(id, true);
      };
      tip.append(action);
    }
    const anchor = board.querySelector<HTMLElement>(selector);
    if (!anchor) return;
    openTooltip(tip, anchor, bought ? id : undefined);
  }
  function openTooltip(tip: HTMLElement, anchor: HTMLElement, bought?: string) {
    closeTooltip();
    tooltip = { tip, anchor, bought };
    root.append(tip);
    anchor.setAttribute("aria-describedby", tip.id);
    tip.showPopover();
    placeTooltip();
  }
  function showLockedCondition(item: Exclude<PrepSelection, { kind: "placement" }> | { kind: "pack"; id: string }, anchor: HTMLElement,
    target: "card" | "general" | "tab" = item.kind === "pack" ? "tab" : item.kind) {
    const condition = item.kind === "card" ? bphLockedCardCondition(save, item.id)
      : item.kind === "pack" ? bphLockedPackCondition(item.id)
      : bphLockedGeneralCondition(save, context.milestones, item.id)?.line ?? "";
    const tip = el("section", "bph-placement-tooltip", condition);
    tip.dataset.lockedTooltip = target;
    tip.id = "bph-placement-tooltip";
    tip.setAttribute("role", "tooltip"); tip.setAttribute("popover", "manual");
    openTooltip(tip, anchor);
  }
  function drawTree() {
    closeTooltip();
    placements = bphPrepUpgradeNodes(save, grids.flatMap(grid => visibleBphPlacements(save, grid.id)));
    board.dataset.prepGroup = active;
    // Every cell keeps its seat across a purchase, so the reader keeps their place too.
    const scroll = content.scrollTop;
    board.replaceChildren(renderPrepTree(save, active, placements, item => {
      if (item.kind === "placement") { tapPlacement(item.id); return; }
      if (item.kind === "pack") {
        closeTooltip();
        const anchor = board.querySelector<HTMLElement>(`[data-pack="${CSS.escape(item.id)}"]`);
        if (anchor) showLockedCondition(item, anchor, "tab");
        return;
      }
      closeTooltip();
      selected = item; drawDetail();
    }));
    content.scrollTop = scroll;
    balance.textContent = save.resources.mastery.toLocaleString();
    unlockedPacks = bphUnlockedPacks(save, activeBphEffects(save));
    for (const [key, button] of tabButtons) {
      button.setAttribute("aria-pressed", String(key === active));
      button.toggleAttribute("data-locked", Boolean(lockFor(key)));
    }
  }
  function drawDetail() {
    const item = selected; if (!item) return;
    if (item.kind === "placement") { selected = undefined; showPlacement(item.id); return; }
    const hidden = item.kind === "card" ? !save.discovered.includes(item.id) : item.kind === "general" && !save.unlockedGenerals.includes(item.id);
    if (hidden) {
      selected = undefined;
      const anchor = board.querySelector<HTMLElement>(`[data-${item.kind}="${CSS.escape(item.id)}"]`);
      if (anchor) showLockedCondition(item, anchor);
      return;
    }
    let name: string, description: string, portrait: HTMLElement;
    const groups: HTMLElement[] = [], refreshers: (() => void)[] = [];
    const add = <Id extends string>(nodes: () => readonly BphUpgradeTreeNode<Id>[], purchase: (id: Id) => boolean, label: string,
      report: (id: Id) => { nodeId: string; level: number }) => {
      if (!nodes().length) return;
      const rows = createUpgradeRows({nodes, buy: id => {
        if (!purchase(id)) return false;
        context.onPurchase?.(report(id));
        context.onChange(); drawTree();
        for (const refresh of refreshers) if (refresh !== rows.refresh) refresh();
        return true;
      }});
      rows.element.setAttribute("aria-label", label); refreshers.push(rows.refresh); groups.push(rows.element);
    };
    const placementsFor = (predicate: (node: BphUpgradeTreeNode) => boolean) => add(() => placements.filter(predicate), id => buyBphNode(save, id), phrase("배치 강화", "Placement upgrades"),
      id => ({ nodeId: id, level: save.questProgress[`claims:${id}`] ?? 1 }));
    if (item.kind === "card") {
      const id = item.id, profile = BPH_PROFILES[id];
      name = id === BPH_BASIC_MONK ? phrase("승려", "Monk") : t(profile.name);
      description = [t(BPH_CLASS_NAMES[profile.classId]), ...bphCodexTraits(id).map(s => t(s))].join(" · ");
      portrait = bphArtElement(bphProfilePicture(id));
      add(() => bphUnitUpgradeNodes(save, id),
        track => buyBphUnitUpgrade(save, id, track), phrase("병력 강화", "Unit upgrades"),
        track => ({ nodeId: `${id}:${track}`, level: save.unitUpgrades[id]?.[track] ?? 1 }));
      placementsFor(node => bphPrepPlacementGroup(node.id).card === id);
    } else if (item.kind === "general") {
      const general = item.id;
      name = t(general); description = [t(BPH_CLASS_NAMES[BPH_GENERAL_CLASS[general]]), t(bphCommanderSkill(general).line)].join(" · ");
      portrait = bphArtElement(bphGeneralArt(general));
      add(() => bphGeneralUpgradeNodes(save, general),
        track => buyBphGeneralUpgrade(save, general, track), tabLabel("general"),
        track => ({ nodeId: `general:${general}:${track}`, level: save.generalUpgrades?.[general]?.[track] ?? 1 }));
      add(() => growthNodes(save), () => growth!.buyGeneralGrowthUpgrade(save), phrase("장수 성장 속도", "General growth speed"),
        id => ({ nodeId: id, level: growth!.generalGrowthRank(save) }));
    } else return;
    panel?.remove();
    panel = createPrepDetail({title:name, description, portrait, groups, onClose: () => closeDetail()});
    content.inert = true; root.append(panel);
    panel.querySelector<HTMLElement>('[data-action="close-prep-detail"]')?.focus({ preventScroll: true });
  }
  for (const tab of BPH_PREP_TABS) {
    const button = el("button", "", tabLabel(tab)); button.type = "button"; button.dataset.prepTab = tab;
    const lock = el("img", "bph-prep-tab-lock"); lock.src = pixelIcon("lock"); lock.alt = phrase("잠김", "Locked");
    button.append(lock);
    tabButtons.set(tab, button); tabs.append(button);
    button.onclick = () => {
      const locked = lockFor(tab);
      if (locked) { showLockedCondition(locked, button, "tab"); return; }
      closeDetail(false); active = tab; drawTree(); content.scrollTop = 0; centreBoard();
    };
  }
  root.onkeydown = event => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault(); event.stopPropagation();
    if (tooltip) closeTooltip(); else if (selected) closeDetail(); else leave();
  };
  document.addEventListener("pointerdown", event => {
    if (tooltip && !event.composedPath().includes(tooltip.anchor) && !event.composedPath().includes(tooltip.tip)) closeTooltip();
  }, { capture: true, signal: events.signal });
  content.addEventListener("scroll", () => {
    if (!tooltip) return;
    if (tabs.contains(tooltip.anchor)) { placeTooltip(); return; }
    const bounds = content.getBoundingClientRect(), node = tooltip.anchor.getBoundingClientRect();
    if (node.bottom <= bounds.top || node.top >= bounds.bottom) closeTooltip();
    else placeTooltip();
  }, { passive: true, signal: events.signal });
  window.addEventListener("resize", placeTooltip, { signal: events.signal });
  /** The fixed tree can be wider than a phone: open each tab with its first revealed cell centred. */
  function centreBoard() {
    const first = board.querySelector<HTMLElement>(".prep-tree-node:not([data-unrevealed])");
    if (!first) return;
    const box = content.getBoundingClientRect(), node = first.getBoundingClientRect();
    // Rects follow the panel's opening scale; scrollLeft is in layout pixels.
    content.scrollLeft += (node.left + node.width / 2 - box.left - box.width / 2) * content.offsetWidth / box.width;
  }
  host.replaceChildren(root); drawTree(); drawDetail();
  const frame = requestAnimationFrame(() => {
    if (root.isConnected) centreBoard();
    if (!selected && root.isConnected) tabButtons.get(active)?.focus({ preventScroll: true });
  });
  return () => { cancelAnimationFrame(frame); events.abort(); closeTooltip(); root.remove(); };
}
