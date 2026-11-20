import { tr } from "./i18n";

/** Presentation only. Undefined means this mode has no recorded level to display. */
export function updateGeneralLevelBadge(
  badge: Pick<HTMLElement, "textContent" | "dataset" | "hidden" | "setAttribute" | "animate">,
  level: number | undefined, tier: number, flashesOff: boolean, reducedMotion: boolean,
): void {
  badge.hidden = level === undefined;
  if (level === undefined) {
    badge.textContent = "";
    delete badge.dataset.level;
    return;
  }
  const previous = Number(badge.dataset.level);
  badge.textContent = String(level);
  badge.dataset.level = String(level);
  badge.dataset.tier = String(tier);
  badge.setAttribute("aria-label", tr`레벨 ${level}`);
  if (previous > 0 && level > previous && !flashesOff && !reducedMotion)
    badge.animate([{ background: "#fff2c6", color: "#39251b", boxShadow: "inset 0 0 0 1px #ffe29a" },
      { background: "#231d17", color: "#fff2c6", boxShadow: "none" }], { duration: 520, easing: "ease-out", iterations: 1 });
}
