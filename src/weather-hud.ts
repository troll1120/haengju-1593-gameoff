import { language } from "./i18n";
import { weatherView } from "./weather";
import type { Weather } from "./weather";
import "./weather.css";

/** Layout: top-right 48px control below settings; its explanation wraps below both HUD rows.
 * The arena owns the field; this overlay never scrolls or occupies the bottom skill/recruit dock.
 */
export function mountWeatherHud(parent: HTMLElement) {
  const button = document.createElement("button");
  button.id = "weather";
  button.type = "button";
  button.className = "weather-button icon-button";
  button.hidden = true;
  button.setAttribute("aria-controls", "weather-banner");
  button.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 17v-6h4V7h12v4h6v6H4Z M8 21v5h3v-5Z M15 20v7h3v-7Z M22 21v5h3v-5Z"/></svg>';
  const banner = document.createElement("div");
  banner.id = "weather-banner";
  banner.setAttribute("role", "status");
  banner.hidden = true;
  parent.append(button, banner);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Weather = "맑음";
  const hide = () => {
    banner.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };
  const relabel = () => {
    const view = weatherView(current, language());
    banner.textContent = view.explanation;
    button.setAttribute("aria-label", view.explanation);
    button.title = view.explanation;
  };
  const show = () => {
    clearTimeout(timer);
    relabel();
    banner.hidden = false;
    button.setAttribute("aria-expanded", "true");
    timer = setTimeout(hide, weatherView(current, language()).bannerMs);
  };
  button.addEventListener("click", show);
  button.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
  return {
    start(weather: Weather, playing: boolean) {
      clearTimeout(timer);
      current = weather;
      hide();
      const view = weatherView(weather, language());
      button.hidden = !playing || !view.icon;
      if (playing && view.bannerMs > 0) show();
    },
    relabel,
  };
}
