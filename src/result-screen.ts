import { t, tr } from "./i18n";
import { generalPortrait } from "./roster";
import type { General } from "./roster";
import "./result-screen.css";

/** Presentation only: settlement has already saved every unlock before this opens. */
export function showResultUnlocks(generals: readonly General[], returnFocus: HTMLElement): void {
  if (!generals.length) return;
  const dialog = document.createElement("dialog"), content = document.createElement("div");
  const counter = document.createElement("p"), icon = document.createElement("img");
  const name = document.createElement("h2"), description = document.createElement("p");
  const confirm = document.createElement("button");
  dialog.className = "result-unlock-modal wood-frame"; dialog.id = "result-unlock-modal";
  dialog.setAttribute("aria-labelledby", "result-unlock-name");
  dialog.setAttribute("aria-describedby", "result-unlock-description result-unlock-counter");
  content.setAttribute("aria-live", "polite"); content.setAttribute("aria-atomic", "true");
  counter.id = "result-unlock-counter"; counter.hidden = generals.length === 1;
  icon.alt = ""; name.id = "result-unlock-name";
  description.id = "result-unlock-description";
  description.textContent = t("출전할 때 선택할 수 있는 장수입니다.");
  confirm.type = "button"; confirm.className = "menu-button primary";
  confirm.textContent = t("확인"); confirm.autofocus = true;
  let index = 0;
  const render = () => {
    const general = generals[index];
    counter.textContent = `${index + 1}/${generals.length}`;
    icon.src = `./art/portraits/${generalPortrait(general)}.png`;
    name.textContent = tr`${general} 해금`;
  };
  const next = () => {
    if (index + 1 < generals.length) { index++; render(); return; }
    dialog.close(); dialog.remove(); returnFocus.focus();
  };
  confirm.addEventListener("click", next);
  dialog.addEventListener("keydown", event => {
    if (event.key === "Tab") { event.preventDefault(); confirm.focus(); return; }
    if (event.key !== "Enter") return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat) next();
  });
  dialog.addEventListener("cancel", event => event.preventDefault());
  content.append(counter, icon, name, description); dialog.append(content, confirm);
  document.body.append(dialog); render(); dialog.showModal();
}
