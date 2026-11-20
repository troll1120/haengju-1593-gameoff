import type { BphUpgradeTreeNode } from "./bph-upgrade-tree-nodes";
import { implementedEffectDescription } from "./bph-upgrade-effects";
import { activeBphEffects, BPH_PLACEMENTS, BPH_RESOURCE_LABELS, BPH_UPGRADE_NODES } from "./bph-upgrades";
import type { BphSave } from "./bph-contract";
import { language, t } from "./i18n";
import { pixelIcon } from "./icons";
import "./bph-prep-detail.css";

let panels = 0;

export const currencyIcons = { mastery: "mastery", zenith: "fame", ink: "military-order", foilium: "foil",
  runeA: "sword", runeB: "shield", runeC: "crossbow", relic: "relic" } as const;

export function placementEffect(save: BphSave, node: BphUpgradeTreeNode): string {
  if (node.concealed) return node.currentText;
  const placement = BPH_PLACEMENTS.get(node.id);
  const definition = placement?.nodeId ? BPH_UPGRADE_NODES[placement.nodeId] : undefined;
  if (!placement || !definition || definition.type === 4 || (node.max ?? 0) < 2) return node.currentText;
  const effect = definition.effects[0];
  if (definition.effects.length === 1 && (effect.type === "BattleGoldGainBonus" || effect.type === "GoldPouchSpawnChanceBonus")) {
    const value = activeBphEffects(save).filter(entry => entry.nodeId === definition.id && entry.type === effect.type
      && BPH_PLACEMENTS.get(entry.targets.placementId ?? "")?.gridId === placement.gridId).reduce((sum, entry) => sum + entry.value, 0);
    return implementedEffectDescription({ ...effect, value }) ?? node.currentText;
  }
  return node.rank === 0 ? node.currentText : `${node.rank} × ${node.description ?? node.currentText}`;
}

export function createPlacementTooltip(now: BphUpgradeTreeNode, beforeEffect: string, nowEffect: string,
  options: { readonly short: boolean; readonly localMax: boolean }): HTMLElement {
  const tip = document.createElement("section");
  tip.id = "bph-placement-tooltip";
  tip.className = "bph-placement-tooltip";
  tip.dataset.placementTooltip = now.id;
  tip.dataset.short = String(options.short);
  tip.setAttribute("popover", "manual");
  tip.setAttribute("role", "tooltip");
  const name = document.createElement("strong");
  name.textContent = now.label;
  const level = document.createElement("span");
  level.className = "bph-placement-level";
  level.textContent = options.localMax ? "1/1" : now.max === null
    ? `Lv ${now.rank}` : `${now.rank}/${now.max}`;
  const effect = document.createElement("p");
  effect.className = "bph-placement-effect";
  effect.textContent = beforeEffect === nowEffect ? nowEffect : `${beforeEffect} → ${nowEffect}`;
  const price = document.createElement("div");
  price.className = "bph-placement-cost";
  if (options.localMax || now.rank === now.max) {
    price.textContent = t("최대");
  } else {
    for (const { currency, amount } of now.costs) {
      const item = document.createElement("span"), icon = document.createElement("img");
      icon.src = pixelIcon(currencyIcons[currency]);
      icon.alt = t(BPH_RESOURCE_LABELS[currency]);
      item.append(icon, amount.toLocaleString(language()));
      price.append(item);
    }
  }
  tip.append(name, level, effect);
  if (price.hasChildNodes()) tip.append(price);
  return tip;
}

export function positionPlacementTooltip(tip: HTMLElement, anchor: HTMLElement): void {
  const node = anchor.getBoundingClientRect(), { width, height } = tip.getBoundingClientRect();
  const gap = 6, edge = 8;
  const below = node.bottom + gap;
  const flipped = below + height > window.innerHeight;
  const x = node.left + (node.width - width) / 2;
  tip.dataset.side = flipped ? "above" : "below";
  tip.style.left = `${Math.max(edge, Math.min(x, window.innerWidth - edge - width))}px`;
  tip.style.top = `${flipped ? Math.max(0, node.top - gap - height) : below}px`;
}

/** An upgrade's picture: the first frame of a unit or ship sheet or a whole icon, with the stat badge a placement raises. */
export function upgradeIcon(face: BphUpgradeTreeNode["icon"]): HTMLElement {
  const box = document.createElement("span"), crop = document.createElement("span"), art = document.createElement("img");
  box.className = face.sheet ? `ur-face ${face.sheet}` : "ur-face";
  crop.className = "ur-crop";
  art.className = "ur-art"; art.src = face.url; art.alt = ""; art.draggable = false;
  crop.append(art); box.append(crop);
  if (face.badge) {
    const badge = document.createElement("img");
    badge.className = "ur-badge"; badge.src = face.badge; badge.alt = ""; badge.draggable = false;
    box.append(badge);
  }
  return box;
}

/** The one detail panel every prep node opens: portrait, name and summary on top, then the caller's live upgrade groups. */
export function createPrepDetail(options: {
  readonly title: string;
  readonly description: string;
  readonly portrait: HTMLElement;
  readonly groups: readonly HTMLElement[];
  readonly onClose: () => void;
}): HTMLElement {
  const id = `bph-prep-detail-${++panels}`;
  const panel = document.createElement("section"), head = document.createElement("header");
  const portrait = document.createElement("div"), copy = document.createElement("div"), title = document.createElement("h2");
  const close = document.createElement("button"), cross = document.createElement("img"), groups = document.createElement("div");
  panel.className = "bph-prep-detail"; panel.setAttribute("aria-labelledby", `${id}-title`);
  head.className = "bph-prep-detail-head";
  portrait.className = "bph-prep-detail-portrait"; portrait.setAttribute("aria-hidden", "true"); portrait.append(options.portrait);
  copy.className = "bph-prep-detail-copy";
  title.className = "bph-prep-detail-title"; title.id = `${id}-title`; title.textContent = options.title;
  copy.append(title);
  if (options.description) {
    const text = document.createElement("p");
    text.className = "bph-prep-detail-text"; text.id = `${id}-text`; text.textContent = options.description;
    copy.append(text); panel.setAttribute("aria-describedby", text.id);
  }
  close.type = "button"; close.className = "bph-prep-detail-close"; close.dataset.action = "close-prep-detail";
  close.setAttribute("aria-label", t("닫기")); close.onclick = () => options.onClose();
  cross.src = pixelIcon("plus"); cross.alt = ""; close.append(cross);
  groups.className = "bph-prep-detail-groups"; groups.append(...options.groups);
  head.append(portrait, copy, close); panel.append(head, groups);
  return panel;
}
