import type { Lang } from "./i18n";

export type Weather = "맑음" | "비" | "서풍";

const RAIN_FIRE_DAMAGE = .75;
const RAIN_ENEMY_SPEED = .9;

export function weatherDamage(weather: Weather, amount: number, fire: boolean): number {
  return amount * (weather === "비" && fire ? RAIN_FIRE_DAMAGE : 1);
}

export function weatherEnemySpeed(weather: Weather): number {
  return weather === "비" ? RAIN_ENEMY_SPEED : 1;
}
export function weatherView(weather: Weather, lang: Lang) {
  const explanation = lang === "ko"
    ? "🌧 비 — 불 공격 약화, 적 느려짐"
    : "Rain — fire attacks weaker, enemies slower";
  // Clear and west-wind runs have no modifier: keep the existing sparse HUD empty.
  return { icon: weather === "비", bannerMs: weather === "비" ? 1000 : 0, explanation };
}
