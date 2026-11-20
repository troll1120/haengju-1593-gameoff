import { language, t } from "./i18n";

/** Static bindings retain their source, so toggling back never translates an English result. */
export function relabelDom(): void {
  document.documentElement.lang = language();
  document.title = t("행주 1593");
  document.querySelectorAll<HTMLElement>("[data-ko]").forEach(node => {
    node.textContent = t(node.dataset.ko ?? "");
  });
  document.querySelectorAll<HTMLElement>("[data-ko-aria-label]").forEach(node => {
    node.setAttribute("aria-label", t(node.dataset.koAriaLabel ?? ""));
  });
}
