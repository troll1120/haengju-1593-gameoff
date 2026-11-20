import "./painted-icons.css";

/** Each file is a hand-cleaned pixel image with a preserved painted original. */
const MAPS = {
  "motion": "./art/icons/motion.webp",
  "flash": "./art/icons/flash.webp",
  "touch": "./art/icons/touch.webp",
  "hourglass": "./art/icons/hourglass.webp",
  "skull": "./art/icons/skull.webp",
  "play": "./art/icons/play.webp",
  "resume": "./art/icons/resume.webp",
  "gear": "./art/icons/gear.webp",
  "lang-ko": "./art/icons/lang-ko.webp",
  "lang-en": "./art/icons/lang-en.webp",
  "retry": "./art/icons/retry.webp",
  "home": "./art/icons/home.webp",
  "infinity": "./art/icons/infinity.webp",
  "up": "./art/icons/up.webp",
  "skill-shield": "./art/icons/skill-shield.webp",
  "trophy": "./art/icons/trophy.webp",
  "sound": "./art/icons/sound.webp",
  "mute": "./art/icons/mute.webp",
  "plus": "./art/icons/plus.webp",
  "lock": "./art/icons/lock.webp",
  "back": "./art/icons/back.webp",
  "merit": "./art/icons/merit.webp",
  "heart": "./art/icons/heart.webp",
  "supply": "./art/icons/supply.webp",
  "unit-cap": "./art/icons/unit-cap.webp",
  "reserve": "./art/icons/reserve.webp",
  "reinforce": "./art/icons/reinforce.webp",
  "wall-archer": "./art/icons/wall-archer.webp",
  "wall-hwacha": "./art/icons/wall-hwacha.webp",
  "coin": "./art/icons/coin-hud-pixels.webp",
  "star": "./art/icons/star.webp",
  "star-empty": "./art/icons/star-empty.webp",
  "shield": "./art/icons/shield.webp",
  "sword": "./art/icons/sword.webp",
  "pierce": "./art/icons/pierce.webp",
  "rift": "./art/icons/rift.webp",
  "jackpot": "./art/icons/jackpot.webp",
  "crossbow": "./art/icons/crossbow.webp",
  "rocket-cart": "./art/icons/rocket-cart.webp",
  "skill-up": "./art/icons/skill-up.webp",
  "card": "./art/icons/card.webp",
  "mastery": "./art/icons/star-mastery.webp",
  "foil": "./art/icons/jackpot-foil.webp",
  "shard": "./art/icons/skill-shield-shard.webp",
  "fame": "./art/icons/star-fame.webp",
  "grain": "./art/icons/supply-grain.webp",
  "relic": "./art/icons/unit-cap-relic.webp",
  "military-order": "./art/icons/card-order.webp",
  "attack": "./art/icons/png-attack.webp",
} as const;
export type IconName = keyof typeof MAPS;

export function paint(rows: string[], tones: Record<string, string>): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = rows[0].length; canvas.height = rows.length;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("아이콘 생성 실패");
  rows.forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell === ".") return;
    context.fillStyle = tones[cell]; context.fillRect(x, y, 1, 1);
  }));
  return canvas;
}

export function pixelIcon(name: IconName): string {
  return MAPS[name];
}

export function chargeRing(kind: "plate" | "portrait" | "urgent"): string {
  return `./art/icons/charge-ring-${kind}-strip.webp`;
}

export const HEAD_RING = "./art/icons/head-ring.webp";
export const BOSS_MARKS = { arrow: "boss-mark-arrow", melee: "boss-mark-melee", artillery: "boss-mark-artillery" } as const;

export function timberFrame(): string {
  return "./art/icons/timber-frame.webp";
}
