import { expect, test } from "bun:test";
import { bphCodexCards } from "./bph-codex";
import { bphConsumers, bphFxContext, bindBphConsumers } from "./bph-fx-dispatch";
import { parseBphSave } from "./bph-save";
import { createBphRun, ensureBphSave } from "./bph-session";
import { freshMeta } from "./meta";
import { advance } from "./rules";
import { deferFixtureBarracks } from "./bph-barracks-fixture";

const cards = [
  { id: "Monster4_Sentinel", kind: "guard", name: "호위병", variant: "Monster4_Sentinel2" },
  { id: "Monster4_Bandit", kind: "samurai", name: "무사", variant: "Monster4_Bandit2" },
] as const;

test.each([[1, 1], [7, 1], [1593, 1], [1593, 4]] as const)(
  "seed %i chapter %i encounters both enemy cards and saves their discoveries",
  (seed, chapter) => {
    const meta = freshMeta();
    const save = ensureBphSave(meta);
    save.chapter = chapter - 1;
    expect(bphCodexCards(save, "enemies", "spearman").slice(2, 4).map(card => [card.key, card.label]))
      .toEqual(cards.map(({ id }) => [id, "???"]));
    const run = createBphRun(meta, { seed, general: "권율", upgrades: [] });
    const context = bphFxContext(run)!;
    const observed = new Map<string, { kind: string; time: number }>();
    bindBphConsumers(context, [...bphConsumers(), {
      id: "enemies", kinds: [], consume() {},
      onEvent({ run }, event) {
        if (event.kind !== "enemy-spawn") return;
        const { bphProfileId, kind } = event.enemy;
        if (bphProfileId && !observed.has(bphProfileId)) observed.set(bphProfileId, { kind, time: run.time });
      },
    }], false);
    // Isolate the encounter/save contract from castle defeat and combat choices.
    deferFixtureBarracks(run);
    run.squads = [];
    run.shieldUntil = Infinity;
    const deadline = chapter === 1 ? 152 : 15;
    while (run.time < deadline && run.phase === "playing") {
      advance(run, .05);
      run.enemies = [];
    }
    for (const card of cards) {
      const spawn = observed.get(chapter === 1 ? card.id : card.variant);
      expect(spawn?.kind).toBe(card.kind);
      expect(spawn?.time ?? Infinity).toBeLessThanOrEqual(deadline);
      if (chapter === 1) expect(spawn?.time ?? 0).toBeGreaterThan(30);
    }
    const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
    expect(bphCodexCards(restored, "enemies", "spearman").slice(2, 4)
      .map(card => [card.key, card.label, card.discovered]))
      .toEqual(cards.map(({ id, name }) => [id, name, true]));
  },
);
