import { afterEach, expect, test } from "bun:test";
import ts from "typescript";
import { language, setLanguage, t, tr } from "./i18n";
import { UI_ENGLISH } from "./i18n-ui";
import { cardText, createRun, GENERALS, SOLDIER_NAMES, SOLDIERS } from "./rules";
import type { CardId } from "./rules";
import { BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { BPH_UPGRADE_NODES, loadBphUpgradeData } from "./bph-upgrade-data";
import { upgradeDescription, upgradeName } from "./bph-upgrade-presentation";
import { META_NODES } from "./meta-nodes";

afterEach(() => setLanguage("ko"));

test("Korean UI bindings and literal translation calls have English copy", async () => {
  setLanguage("en");
  const missing = new Set<string>();
  const korean = /\p{Script=Hangul}/u;
  const check = (file: string, key: string, translated: string) => {
    if (korean.test(key) && korean.test(translated)) missing.add(`${file}: ${key}`);
  };
  const html = await Bun.file(`${import.meta.dir}/../index.html`).text();
  for (const [, key] of html.matchAll(/data-ko(?:-aria-label)?="([^"]+)"/g)) check("index.html", key, t(key));
  for await (const path of new Bun.Glob("**/*.ts").scan({ cwd: import.meta.dir })) {
    if (path.endsWith(".test.ts") || path.endsWith(".d.ts")) continue;
    const tree = ts.createSourceFile(path, await Bun.file(`${import.meta.dir}/${path}`).text(), ts.ScriptTarget.Latest);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
        const [arg] = node.arguments;
        if (arg && ts.isStringLiteralLike(arg)) check(path, arg.text, t(arg.text));
      }
      if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === "tr") {
        const template = node.template;
        const key = ts.isTemplateExpression(template)
          ? template.head.text + template.templateSpans.map((span, i) => `{${i}}${span.literal.text}`).join("")
          : template.text;
        check(path, key, UI_ENGLISH[key] ?? key);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  expect([...missing]).toEqual([]);
});

test("English sentences reorder values while Korean keeps the original order", () => {
  setLanguage("en");
  expect(tr`${"궁수"}사망 시 ${"창병"} ${2}명 소환`).toBe("Archer: Summon 2 Spearman on death");
  setLanguage("ko");
  expect(tr`${"궁수"}사망 시 ${"창병"} ${2}명 소환`).toBe("궁수사망 시 창병 2명 소환");
});

test("every recruit and upgrade renders English without changing its game identity", async () => {
  await loadBphUpgradeData();
  setLanguage("en");
  const shown = [
    ...Object.values(BPH_PROFILES).map(profile => t(profile.name)),
    ...Object.values(BPH_TOMES).map(tome => t(tome.name)),
    ...META_NODES.flatMap(node => [t(node.name), t(node.effect), t(node.branch)]),
    ...Object.values(BPH_UPGRADE_NODES).flatMap(node => [upgradeName(node), upgradeDescription(node)]),
  ];
  expect(shown.filter(text => /[가-힣]/.test(text))).toEqual([]);
});

test("a name reads in the chosen language, and one without an English reading stays Korean", () => {
  setLanguage("en");
  expect(t("권율")).not.toBe("권율");
  expect(t("사전에 없는 이름")).toBe("사전에 없는 이름");
  setLanguage("ko");
  expect([language(), t("권율")]).toEqual(["ko", "권율"]);
});

test("every general, soldier and card name the rules can put on screen has an English reading", () => {
  const cards: CardId[] = ["arrow", "hwacha", "quiver", "powder", "fire", "curse", "rift"];
  const shown = new Set<string>([...GENERALS, ...SOLDIERS.map(kind => SOLDIER_NAMES[kind]), ...cards.map(card => cardText(createRun(1), card).name)]);
  for (const general of GENERALS) for (const awakened of [0, 1]) {
    const run = createRun(1, general);
    run.squads[0].awakened = awakened;
    shown.add(cardText(run, `awaken-${general}`).name);
  }
  setLanguage("en");
  expect([...shown].filter(name => t(name) === name)).toEqual([]);
});
