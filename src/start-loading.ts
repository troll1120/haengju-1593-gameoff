import { t, tr } from "./i18n";

const button = document.querySelector<HTMLButtonElement>("#start");
const label = document.querySelector<HTMLElement>("#start b");
export let loadingFailed = false;

export function startProgress(share: number): void {
  if (!button || !label || loadingFailed) return;
  label.removeAttribute("data-ko");
  label.textContent = tr`로딩 중 ${Math.round(share * 100)}%`;
  button.setAttribute("aria-label", label.textContent);
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
}

export function startReady(): void {
  if (!button || !label || loadingFailed) return;
  label.dataset.ko = "서바이벌";
  label.textContent = t("서바이벌");
  button.setAttribute("aria-label", t("서바이벌"));
  button.disabled = false;
  button.setAttribute("aria-busy", "false");
}

export function startFailed(): void {
  if (!button || !label || loadingFailed) return;
  loadingFailed = true;
  label.dataset.ko = "다시 시도";
  label.textContent = t("다시 시도");
  button.dataset.koAriaLabel = "다시 시도";
  button.setAttribute("aria-label", t("다시 시도"));
  button.disabled = false;
  button.setAttribute("aria-busy", "false");
  button.addEventListener("click", event => {
    event.stopImmediatePropagation();
    location.reload();
  }, { capture: true, once: true });
}
