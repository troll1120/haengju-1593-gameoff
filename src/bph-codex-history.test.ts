import { expect, test } from "bun:test";
import { BPH_CODEX_TEXT } from "./bph-codex-data";
import {
  BPH_CODEX_BATTLE_SIDE_LABELS, BPH_CODEX_HISTORY, BPH_CODEX_HISTORY_LABELS,
  BPH_CODEX_HISTORY_SOURCES, BPH_CODEX_VERDICT_LABELS,
} from "./bph-codex-history";
import evidence from "../review/codex-history/sources.json";
import verdicts from "../review/codex-history/battle-verdicts.json";

test("history covers exactly the shipped survival text roster", () => {
  expect(Object.keys(BPH_CODEX_HISTORY).sort()).toEqual(Object.keys(BPH_CODEX_TEXT).sort());
});

test.each(Object.entries(BPH_CODEX_TEXT))("%s distinguishes troop background from individual achievements", (id, text) => {
  const history = Object.entries(BPH_CODEX_HISTORY).find(([key]) => key === id)?.[1];
  expect(history?.kind).toBe("text" in text ? "unit" : "person");
  if ("text" in text) {
    expect(history?.achievement).toBeNull();
    expect(history?.battles).toEqual([]);
  }
});

test("battle identity, side and outcome agree with the source review matrix", () => {
  const actual = Object.entries(BPH_CODEX_HISTORY).flatMap(([id, history]) =>
    history.battles.map(battle => [id, battle.id, battle.side, battle.verdict]));
  expect(actual.map(row => JSON.stringify(row)).sort())
    .toEqual(verdicts.rows.map(row => JSON.stringify(row.slice(0, 4))).sort());
});

test.each(verdicts.rows)("%s / %s cites the sources that establish this verdict", (id, event, _side, _verdict, ...sourceIds) => {
  const history = Object.entries(BPH_CODEX_HISTORY).find(([key]) => key === id)?.[1];
  const battle = history?.battles.find(item => item.id === event);
  expect(battle).toBeDefined();
  const required = sourceIds.map(sourceId => evidence.sources.find(source => source.id === sourceId)?.url);
  expect(required.every(url => url !== undefined)).toBe(true);
  expect(battle?.sourceUrls).toEqual(expect.arrayContaining(required));
});

test.each(Object.entries(BPH_CODEX_HISTORY))("%s attributes every claim to a read source about this entry", (id, history) => {
  const facts = history.achievement
    ? [history.achievement, history.anecdote, ...history.battles]
    : [history.anecdote];
  for (const fact of facts) {
    expect(fact.sourceUrls.length).toBeGreaterThan(0);
    for (const url of fact.sourceUrls) {
      const source = evidence.sources.find(item => item.url === url);
      expect(source?.status).toBe(200);
      expect(source?.htmlSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source?.rosterIds).toContain(id);
      expect(new URL(url).protocol).toBe("https:");
    }
  }
});

test("source catalogue has a read receipt for every exported URL", () => {
  const urls: string[] = Object.values(BPH_CODEX_HISTORY_SOURCES);
  expect(urls.sort())
    .toEqual(evidence.sources.map(source => source.url).sort());
});

test("presentation supplies Korean and English for the existing language contract", () => {
  const texts = [
    ...Object.values(BPH_CODEX_HISTORY_LABELS),
    ...Object.values(BPH_CODEX_VERDICT_LABELS),
    ...Object.values(BPH_CODEX_BATTLE_SIDE_LABELS),
    ...Object.values(BPH_CODEX_HISTORY).flatMap(history => [
      ...(history.achievement ? [history.achievement.text] : []),
      history.anecdote.text,
      ...history.battles.flatMap(battle => [battle.name, battle.text]),
    ]),
  ];
  for (const text of texts) {
    expect(text.ko.trim()).not.toBe("");
    expect(text.en.trim()).not.toBe("");
    expect(text.en).not.toMatch(/[가-힣]/);
    expect(text.en).not.toBe(text.ko);
  }
});
