import "./panel-motion.css";

const surfaces = "#intro, #result, #choice, #barracks, .building, .bph-management, .bph-web, .bph-codex, .bph-codex-popup, .bph-receipt, .bph-web-balances";
export function setupPanelMotion(): void {
const held = new Map<number, Animation[]>();
// A touch must retain its hit box until Chrome dispatches the compatibility click.
// Otherwise a scaling panel can move the release outside a small button.
document.addEventListener("pointerdown", event => {
  if (!(event.target instanceof Element)) return;
  const paused: Animation[] = [];
  for (let node: Element | null = event.target; node; node = node.parentElement) {
    if (!node.matches(surfaces)) continue;
    for (const animation of node.getAnimations()) if (animation.playState === "running"
      && animation.effect?.getComputedTiming().iterations !== Infinity) {
      animation.pause(); paused.push(animation);
    }
  }
  if (paused.length) held.set(event.pointerId, paused);
}, true);
const resume = (event: PointerEvent) => {
  const paused = held.get(event.pointerId);
  held.delete(event.pointerId);
  requestAnimationFrame(() => {
    for (const animation of paused ?? []) if (animation.playState === "paused") animation.play();
  });
};
document.addEventListener("pointerup", resume, true);
document.addEventListener("pointercancel", resume, true);
}

/** Removed panels need to finish fading before losing their rendered box. */
export function closePanel(panel: HTMLElement, remove: () => void): void {
  panel.inert = true;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
    || document.querySelector("#toggle-motion")?.getAttribute("aria-pressed") === "true";
  const current = getComputedStyle(panel);
  const animation = panel.animate([
    { opacity: current.opacity, scale: current.scale }, { opacity: 0, scale: reduced ? "1" : ".98" },
  ], { duration: 100, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
  void animation.finished.then(() => { animation.cancel(); remove(); }, remove);
}
