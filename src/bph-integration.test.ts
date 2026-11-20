import { expect, test } from "bun:test";
import { addBphProfile } from "./bph-combat";
import { dispatchBphEffects } from "./bph-fx-dispatch";
import { createBphRun } from "./bph-session";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { freshMeta } from "./meta";
import { advance, createRun } from "./rules";

// Native Hero.GetSpellCastBaseDamage: hero-cast spells use the caster's effective
// attack damage (Pyromancer 3, Black Hole 25), not SpellDefinition.damage * spellPower.
const handoffs = [
  { node: "SN_FireMageCast", profile: "Hero2_Pyromancer", damage: 3 },
  { node: "SN_TeleporterDepartDamage", profile: "Hero9_BlackHole", damage: 25 },
  { node: "SN_TeleporterDoubleTeleport", profile: "Hero9_BlackHole", damage: 25 },
] as const;

for (const row of handoffs) for (const upgraded of [false, true]) {
  test(`${row.node} deals its final STATUS damage with upgrade=${upgraded}`, () => {
    const run = createBphRun(freshMeta(), {
      seed: 144, general: "권율",
      upgrades: upgraded ? BPH_UPGRADE_NODES[row.node].effects : [],
    });
    addBphProfile(run, { profileId: row.profile, copies: 1, foil: false, discovered: false },
      { packId: "Pack1_Basic", position: { x: 100, y: 200 } });
    const unit = run.squads[0].soldiers[0];
    const template = createRun(4).enemies[0];
    run.enemies = [150, 170].map(x => ({
      ...template, id: run.nextId++, x, y: 200, hp: 100, maxHp: 100, shielded: false,
    }));
    const attack = { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false };

    dispatchBphEffects(run, { kind: "before-attack", unit, target: run.enemies[0], attack });
    for (let tick = 0; tick < 5; tick++) {
      run.time += .05;
      dispatchBphEffects(run, { kind: "step", dt: .05 });
    }

    expect(attack.handled).toBe(true);
    const hp = 100 - row.damage * (upgraded ? 2 : 1);
    expect(run.enemies.map(enemy => enemy.hp)).toEqual([hp, hp]);
  });
}

for (const row of [
  { profileId: "Hero3_WitchDoctor", spellId: "Spell_InfectionBomb", kind: "mine" },
  { profileId: "Hero4_Stormcaller", spellId: "Spell_Tornado", kind: "mine" },
  { profileId: "Hero9_Quasar", spellId: "Spell_Quasar", kind: "beam" },
] as const) {
  test(`${row.profileId} casts its native attack spell through the real before-attack dispatch`, () => {
    const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
    addBphProfile(run, { profileId: row.profileId, copies: 1, foil: false, discovered: false },
      { packId: "Pack1_Basic", position: { x: 100, y: 200 } });
    const unit = run.squads[0].soldiers[0];
    const template = createRun(4).enemies[0];
    run.enemies = [{ ...template, id: run.nextId++, x: 150, y: 200, hp: 1000, maxHp: 1000, shielded: false }];
    const attack = { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false };

    dispatchBphEffects(run, { kind: "before-attack", unit, target: run.enemies[0], attack });

    expect(attack.handled).toBe(true);
    const actor = run.bph?.fx.actors.find(a => a.data.unitSpell === 1);
    expect(actor?.cast?.spellId).toBe(row.spellId);
    expect(actor?.kind).toBe(row.kind);
    if (row.spellId === "Spell_InfectionBomb") {
      for (let tick = 0; tick < 20; tick++) {
        run.time += .05;
        dispatchBphEffects(run, { kind: "step", dt: .05 });
      }
      // The jar lands after its .9s flight and infects the enemy it covered.
      expect(run.bph?.fx.statuses.some(status => status.targetId === run.enemies[0].id
        && status.id === "Infected")).toBe(true);
    }
  });
}
