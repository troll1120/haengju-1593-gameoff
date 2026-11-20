import { pixelIcon } from "./icons";
import type { IconName } from "./icons";
import { classCard } from "./cards";
import { generalPortrait } from "./roster";
import { canTrainClassCard, cardPools, growthTier } from "./rules";
import type { CardId, General, Roulette, Run, SoldierKind, WeaponId } from "./rules";
import { skillFace } from "./presentation";
import { bphArtPath, bphShipArt } from "./bph-art";
import type { BphGeneral } from "./bph-commanders";

const picture = (name: IconName) => `<img class="pixel-picture" width="${name === "coin" ? 48 : 64}" height="${name === "coin" ? 48 : 64}" src="${pixelIcon(name)}" alt="" />`;
const UP = `<img class="badge rise" src="${pixelIcon("up")}" alt="" />`;
export const stars = (count: number): string => `<span class="stars">${[1, 2, 3].map(step =>
  `<img width="24" height="24" src="${pixelIcon(step <= count ? "star" : "star-empty")}" alt="" />`).join("")}</span>`;
export function soldierArt(kind: SoldierKind | "uibyeong" | "chongtong" | "joseon_cavalry" | string, count = 1): string {
  const ship = bphShipArt(kind);
  const image = `<span class="soldier-frame${ship ? " ship" : ""}"><img src="./art/${bphArtPath(kind)}" alt="" /></span>`;
  return `<span class="soldier-group${count > 1 ? ` pair count-${count}` : ""}${ship ? " ship-group" : ""}">${image.repeat(count)}</span>`;
}
function weaponArt(weapon: WeaponId, level: number, rising = false): string {
  return `<span class="wall-weapon">${soldierArt(weapon === "arrow" ? "archer" : "hwacha")}<img class="wall-tile" src="./art/icons/png-terrain_wall.webp" alt="" /></span>`
    + (rising ? UP : "") + stars(level);
}
/** One picture per survival commander's skill, so two skills of one family never share a button face. */
export const SKILL_ICONS: Readonly<Record<BphGeneral, string>> = {
  권율: "fire-volley", 신립: "return-breakthrough", 송상현: "dongnae-volley", 황진: "war-stomp",
  김시민: "iron-wall", 곽재우: "militia-charge", 사명대사: "healing-wave", 이순신: "turtle-ship",
};
export const skillIconFile = (icon: string): string => `./art/skills/${icon}.webp`;
export function skillPicture(general: General): string {
  const icon = (SKILL_ICONS as Readonly<Partial<Record<General, string>>>)[general];
  if (icon) return `<span class="skill-picture skill-emblem"><img width="64" height="64" src="${skillIconFile(icon)}" alt="" /></span>`;
  const face = skillFace(general);
  if (face.file === "guard") return `<span class="skill-picture"><img class="skill-shield" width="48" height="48" src="${pixelIcon("skill-shield")}" alt="" /></span>`;
  return `<span class="skill-picture"><img src="./art/fx/${face.file}.png" alt="" style="width:${face.frames * 64}px;height:64px;margin-left:${-face.frame * 64}px" /></span>`;
}
function skillArt(general: General, tier: number): string {
  return skillPicture(general)
    + `<img class="badge owner" src="./art/portraits/${generalPortrait(general)}.png" alt="" />` + UP + stars(tier);
}
/** The same reward is composed once for cards and for every chest strip state. */
export function cardPicture(card: CardId, run: Run | null): string {
  const army = classCard(card);
  if (army) {
    const tier = (run?.drill[army.kind] ?? 0) + 1;
    if (card.startsWith("upgrade-")) {
      const training = run ? canTrainClassCard(run, army.kind) : true;
      return soldierArt(army.kind, training ? 1 : run?.meta.caps?.recruitCount ?? 2) + UP + stars(Math.min(3, tier + (training ? 1 : 0)));
    }
    if (card.startsWith("legend-")) return soldierArt(army.kind)
      + `<img class="badge" src="${pixelIcon(army.mode === "guard" ? "shield" : "sword")}" alt="" />` + stars(tier);
    // Legacy rare/epic rewards have no rarity cells or unrelated sword badge.
    return soldierArt(army.kind, card.startsWith("epic-") ? 1 : card.startsWith("rare-") ? 3 : run?.meta.caps?.recruitCount ?? 2) + stars(tier);
  }
  if (card.startsWith("recruit-")) return soldierArt(card.slice(8) as SoldierKind, 2) + stars(1);
  if (card.startsWith("awaken-")) {
    const general = card.slice(7) as General;
    return skillArt(general, (run?.squads.find(squad => squad.general === general)?.tier ?? 1) + 1);
  }
  if (card.startsWith("hero-")) return `<img class="single" src="./art/portraits/${generalPortrait(card.slice(5) as General)}.png" alt="" />` + stars(1);
  if (card.startsWith("promote-")) {
    const general = card.slice(8) as General;
    return `<img class="single" src="./art/portraits/${generalPortrait(general)}.png" alt="" />` + UP
      + stars(Math.min(3, (run?.squads.find(squad => squad.general === general)?.tier ?? 1) + 1));
  }
  switch (card) {
    case "gold40": return picture("coin");
    case "arrow": case "hwacha": return weaponArt(card, (run?.[card] ?? 0) + 1);
    case "quiver": return picture("pierce");
    case "powder": return `<span class="skill-picture"><img src="./art/fx/blast_big.png" alt="" style="width:384px;height:64px;margin-left:-128px" /></span>`;
    case "fire": return `<span class="skill-picture"><span class="tall-effect"><img src="./art/anim/fire_blaze.png" alt="" style="width:192px;height:48px;margin-left:-64px" /></span></span>`;
    case "rift": return picture("rift");
    // The unused curse no longer contributes an enemy portrait to the reel.
    case "curse": return "";
    default: return "";
  }
}
export function prizePicture(bonus: string, reward: Roulette, run: Run | null): string {
  if (reward.card) return cardPicture(reward.card, run);
  if (reward.evolution) return picture(reward.evolution === "arrow" ? "crossbow" : "rocket-cart");
  switch (bonus) {
    case "recruit": return soldierArt(reward.soldier, run?.meta.caps?.recruitCount ?? 2);
    case "weapon": {
      const card = run ? cardPools(run)[2].find(candidate => ["arrow", "hwacha", "quiver", "powder"].includes(candidate)) : undefined;
      return card === "arrow" || card === "hwacha" ? weaponArt(card, (run?.[card] ?? 0) + 1, true)
        : card ? cardPicture(card, run) : picture("coin");
    }
    case "awaken": {
      const eligible = run?.squads.filter(squad => squad.tier < Math.min(run.meta.caps?.hero ?? 3, growthTier(run.level))) ?? [];
      if (!eligible.length) return picture("coin");
      if (eligible.length === 1) return skillArt(eligible[0].general, eligible[0].tier + 1);
      // settle() chooses randomly. Show the eligible portraits, not a false winner.
      return picture("skill-up") + `<span class="eligible">${eligible.map(squad =>
        `<img width="16" height="16" src="./art/portraits/${generalPortrait(squad.general)}.png" alt="" />`).join("")}</span>`;
    }
    case "jackpot": return picture("jackpot") + `<span class="jackpot-recruits">${soldierArt(reward.soldier, run?.meta.caps?.recruitCount ?? 2)}</span>`;
    default: return picture("coin");
  }
}
