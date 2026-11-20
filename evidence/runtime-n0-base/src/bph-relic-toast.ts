import { bphRelicArt, bphRelicName } from "./bph-relics";
import { phrase } from "./bph-upgrade-effect-text";
import "./bph-relics.css";

const SHOWN_MS = 8000;
let shown: { readonly toast: HTMLElement; readonly timer: ReturnType<typeof setTimeout> } | undefined;
export function closeBphRelicToast(): void {
  if (!shown) return;
  clearTimeout(shown.timer); shown.toast.remove(); shown = undefined;
}
/** Announces relics gained since the last notice, with a shortcut into the relic tab. Callers show it out of combat. */
export function showBphRelicToast(host: HTMLElement, relicIds: readonly string[], showRelics: () => void): void {
  closeBphRelicToast();
  const [first] = relicIds;
  if (first === undefined) return;
  const toast = document.createElement("div"), art = document.createElement("span"), copy = document.createElement("span");
  const title = document.createElement("strong"), names = document.createElement("span"), go = document.createElement("button");
  toast.className = "bph-relic-toast"; toast.setAttribute("role", "status"); toast.dataset.relicToast = "";
  art.className = "bph-relic-toast-art"; copy.className = "bph-relic-toast-copy"; go.className = "bph-relic-toast-go";
  const image = document.createElement("img");
  image.src = bphRelicArt(first); image.alt = ""; image.draggable = false; art.append(image);
  const rest = relicIds.length - 1, name = bphRelicName(first);
  title.textContent = phrase("새 유물 획득!", "New relic!");
  names.textContent = rest ? phrase(`${name} 외 ${rest}개`, `${name} +${rest} more`) : name;
  go.type = "button"; go.textContent = phrase("유물 보기", "View relics");
  go.addEventListener("click", event => { event.stopPropagation(); closeBphRelicToast(); showRelics(); });
  toast.addEventListener("click", closeBphRelicToast);
  copy.append(title, names); toast.append(art, copy, go); host.append(toast);
  shown = { toast, timer: setTimeout(closeBphRelicToast, SHOWN_MS) };
}
