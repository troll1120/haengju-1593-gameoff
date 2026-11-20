import type { Run } from "./rules";
import { BPH_TOMES } from "./bph-data";
import { bphEffectValue } from "./bph";
import { bphFxContext } from "./bph-fx-dispatch";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { beginBphCast } from "./bph-effects-entry";

/** CORE's required 1% book. STATUS owns the other original spellbook behaviors. */
export function tickBphSpells(run: Run, dt: number): void {
  const battle = run.bph, context = bphFxContext(run);
  if (!battle || !context) return;
  for (const active of battle.tomes.filter(tome => tome.id === "Tome_Thunderstorm")) {
    active.clock -= dt;
    if (active.clock > 0) continue;
    const tome = BPH_TOMES[active.id];
    active.clock += tome.intervalMin + context.random() * (tome.intervalMax - tome.intervalMin);
    const power = 1 + bphEffectValue(battle.upgrades, "TomeEffectPower", tome.id);
    const casts = tome.casts + bphEffectValue(battle.upgrades, "TomeChannelCastsPerTickBonus", tome.id);
    for (let cast = 0; cast < casts; cast++) {
      const alive = run.enemies.filter(e => e.hp > 0 && e.kind !== "ship");
      const target = alive[Math.floor(context.random() * alive.length)];
      if (!target) continue;
      const provenance = beginBphCast(context, { spellId: "Spell_Thunderbolt", source: null, target,
        position: { x: target.x, y: target.y }, tomeId: tome.id, foil: active.foil ?? null, power });
      context.applyDamage({ target, amount: 1.5 * power, spellId: "Spell_Thunderbolt", cast: provenance });
      context.emit({ kind: "shot", x: target.x, y: target.y, fromX: target.x,
        fromY: target.y - BPH_WORLD_TO_PX, value: 0, by: "hwacha" });
    }
  }
}
export function bphTouchDamage(run: Run): number {
  const tome = BPH_TOMES.Tome_CursorDPS;
  const stacks = run.bph?.tomes.find(t => t.id === tome.id)?.stacks ?? 0;
  return 1 + stacks * Number(tome.raw.cursorDpsDamageBonusPercent);
}
