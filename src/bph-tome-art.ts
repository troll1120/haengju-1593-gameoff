/**
 * One book per tactic: the shared book art (icons/tome-book-svg.webp) with only its two cover colours swapped,
 * a distinct non-red pair each (owner DM 1794897067). Unknown ids keep the shared book.
 */
const RECOLOURED = new Set(["Tome_DragonsCall", "Tome_RaiseDead", "Tome_Thunderstorm", "Tome_Transmutation", "Tome_Blizzard",
  "Tome_BountyHunt", "Tome_CursorDPS", "Tome_Earthquake", "Tome_FortuneCache", "Tome_HeroFrenzy", "Tome_SpectralPact"]);
export function bphTomeArt(id: string): string {
  return RECOLOURED.has(id) ? `./art/tomes/${id}.png` : "./art/icons/tome-book-svg.webp";
}
