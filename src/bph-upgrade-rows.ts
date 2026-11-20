import type { BphUpgradeTreeNode } from "./bph-upgrade-tree-nodes";
import { currencyIcons, upgradeIcon } from "./bph-prep-detail";
import { BPH_RESOURCE_LABELS } from "./bph-upgrades";
import { language, t } from "./i18n";
import { pixelIcon } from "./icons";
import "./bph-upgrade-rows.css";

let strips = 0;

/**
 * Upgrade icons side by side. Tapping an icon explains it in the strip's one tip; each arrow invokes its screen's
 * purchase function once, then the strip redraws from the resulting save.
 */
export function createUpgradeRows<Id extends string>(options: {
  nodes: () => readonly BphUpgradeTreeNode<Id>[];
  buy?: (id: Id) => boolean;
}) {
  const element = document.createElement("div"), list = document.createElement("ul"), detail = document.createElement("div");
  element.className = "upgrade-rows"; element.setAttribute("role", "group");
  list.className = "ur-list";
  detail.className = "ur-detail"; detail.id = `ur-detail-${++strips}`; detail.hidden = true;
  detail.setAttribute("aria-live", "polite");
  // Where popovers exist the tip floats over its icon; elsewhere it opens under the strip.
  const floating = typeof detail.showPopover === "function";
  if (floating) detail.popover = "auto";
  element.append(list, detail);
  let selected: Id | undefined, watching: AbortController | undefined;
  const open = () => floating ? detail.matches(":popover-open") : !detail.hidden;
  const describe = (n: BphUpgradeTreeNode<Id>) => {
    const name = document.createElement("strong"), effect = document.createElement("span");
    name.textContent = n.label;
    effect.textContent = [n.description, [n.currentText, n.nextText].filter(Boolean).join(" → ")]
      .filter((text,index,all) => text && all.indexOf(text) === index).join(" · ");
    detail.replaceChildren(name, effect);
  };
  const settle = () => {
    watching?.abort(); watching = undefined; selected = undefined; detail.hidden = true;
    list.querySelectorAll(".ur-icon").forEach(face => face.setAttribute("aria-expanded", "false"));
  };
  const hide = () => {
    if (floating && open()) detail.hidePopover();
    settle();
  };
  const place = (face: HTMLElement) => {
    const gap = parseFloat(getComputedStyle(detail).getPropertyValue("--ur-tip-gap")) || 0;
    detail.style.left = "0px"; detail.style.top = "0px";
    const anchor = face.getBoundingClientRect(), box = detail.getBoundingClientRect(), center = anchor.left + anchor.width / 2;
    const column = (face.closest(".upgrade-row") ?? face).getBoundingClientRect();
    const left = Math.max(gap, Math.min(center - box.width / 2, document.documentElement.clientWidth - gap - box.width));
    const above = anchor.top - gap - box.height >= gap;
    detail.dataset.side = above ? "above" : "below";
    detail.style.left = `${left}px`;
    detail.style.top = `${above ? anchor.top - gap - box.height : column.bottom + gap}px`;
    detail.style.setProperty("--ur-caret", `${center - left}px`);
  };
  const show = (n: BphUpgradeTreeNode<Id>, face: HTMLElement) => {
    selected = n.id; describe(n); detail.hidden = false;
    list.querySelectorAll(".ur-icon").forEach(other => other.setAttribute("aria-expanded", String(other === face)));
    if (!floating) return;
    if (!open()) {
      detail.showPopover();
      watching = new AbortController();
      // A fixed tip cannot follow its icon, so any scroll outside the tip or a resize closes it.
      const away = (event: Event) => { if (!(event.target instanceof Node && detail.contains(event.target))) hide(); };
      window.addEventListener("scroll", away, { capture: true, passive: true, signal: watching.signal });
      window.addEventListener("resize", hide, { signal: watching.signal });
    }
    place(face);
  };
  if (floating) detail.addEventListener("toggle", () => { if (!open()) settle(); });
  element.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !open()) return;
    event.preventDefault(); event.stopPropagation(); hide();
  });
  const row = (n: BphUpgradeTreeNode<Id>) => {
    const item = document.createElement("li");
    item.className = "upgrade-row"; item.dataset.nodeId = n.id;
    item.dataset.testid = `upgrade-row-${n.id}`;
    const progress = n.max === null ? `Lv ${n.rank}` : `${n.rank}/${n.max}`;
    item.setAttribute("aria-label", `${n.label} ${progress}`);
    const face = document.createElement("button"), level = document.createElement("span");
    face.type = "button"; face.className = "ur-icon";
    face.dataset.testid = `upgrade-info-${n.id}`; face.setAttribute("aria-label", n.label);
    face.setAttribute("aria-controls", detail.id); face.setAttribute("aria-expanded", "false");
    // As the tip's invoker, a tap on another icon retargets the open tip instead of light-dismissing it.
    if (floating) face.setAttribute("popovertarget", detail.id);
    level.className = "ur-level"; level.textContent = n.max === null ? progress : String(n.rank);
    face.append(upgradeIcon(n.icon), level);
    face.onclick = event => {
      event.preventDefault();
      if (selected === n.id && open()) hide(); else show(n, face);
    };
    const button = document.createElement("button");
    button.type = "button"; button.className = "ur-buy"; button.disabled = !n.buyable || !options.buy;
    button.dataset.testid = `upgrade-buy-${n.id}`;
    const maxed = n.max !== null && n.rank >= n.max && n.nextText === null;
    const complete = n.purchased && n.nextText === null;
    const costs = n.costs.map(c => `${t(BPH_RESOURCE_LABELS[c.currency])} ${c.amount.toLocaleString(language())}`);
    button.setAttribute("aria-label", [n.label, progress, maxed ? t("최대") : t("강화"), ...costs].join(" · "));
    if (maxed || complete) {
      const mark = document.createElement("span");
      mark.className = "ur-max"; mark.textContent = maxed ? t("최대") : "✓"; button.append(mark);
    } else {
      const up = document.createElement("img");
      up.src = pixelIcon("up"); up.alt = ""; up.className = "ur-arrow"; button.append(up);
      for (const c of n.costs) {
        const cost = document.createElement("span");
        cost.className = "ur-cost";
        if (c.currency !== "mastery") {
          const currency = document.createElement("img");
          currency.src = pixelIcon(currencyIcons[c.currency]); currency.alt = t(BPH_RESOURCE_LABELS[c.currency]); cost.append(currency);
        }
        cost.append(c.amount.toLocaleString(language(), c.amount >= 100_000 ? { notation: "scientific", maximumFractionDigits: 1 } : {})); button.append(cost);
      }
      if (!costs.length) {
        const cost = document.createElement("span"); cost.className = "ur-cost"; cost.textContent = "0"; button.append(cost);
      }
    }
    button.onclick = () => {
      options.buy?.(n.id);
      refresh();
      const next = element.querySelector<HTMLButtonElement>(`[data-node-id="${CSS.escape(n.id)}"] .ur-buy`);
      if (next && !next.disabled) next.focus({ preventScroll: true });
    };
    item.append(face, button);
    return item;
  };
  const refresh = () => {
    const nodes = options.nodes();
    list.replaceChildren(...nodes.map(row));
    const current = nodes.find(n => n.id === selected);
    const face = current && list.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(current.id)}"] .ur-icon`);
    if (current && face && open()) show(current, face); else if (selected !== undefined) hide();
  };
  refresh();
  return { element, refresh };
}
