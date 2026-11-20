import { fielded } from "./rules";
import type { Effect, Squad } from "./rules";

/** The button's ready cue (its `.ready` glow): on from the moment the skill is ready until the tap that casts it resets the clock. */
export function skillReady(squad: Readonly<Squad>): boolean {
  return fielded(squad) && squad.skillClock <= 0;
}

const outlineTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** Only an accepted cast answers, for 120ms, without moving when motion is off. */
export function skillButtonCast(button: HTMLElement, cast: readonly Effect[], channels: { motion: boolean; flash: boolean }): void {
  if (!cast.length) return;
  const previous = outlineTimers.get(button);
  if (previous !== undefined) clearTimeout(previous);
  outlineTimers.delete(button);
  for (const animation of button.getAnimations())
    if (animation.id === "skill-cast") animation.cancel();
  button.style.outline = channels.motion ? "" : channels.flash ? "2px solid var(--gold-light)" : "2px solid currentColor";
  if (channels.motion) button.animate([{ transform: "scale(.92)" }, { transform: "scale(1)" }],
    { id: "skill-cast", duration: 120, easing: "ease-out" });
  else {
    const timer = setTimeout(() => {
      if (outlineTimers.get(button) !== timer) return;
      button.style.outline = "";
      outlineTimers.delete(button);
    }, 120);
    outlineTimers.set(button, timer);
  }
}
