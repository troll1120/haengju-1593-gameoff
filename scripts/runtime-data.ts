import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/** Source tables remain intact for audits and tests; only production literals are projected. */
export function runtimeData(): Plugin {
  const source = resolve(process.cwd(), "src");
  const consumers = readdirSync(source).filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts")
    && name !== "bph-data.ts" && name !== "bph-upgrade-data.ts")
    .map(name => readFileSync(resolve(source, name), "utf8")).join("\n");
  const fields = new Set([...consumers.matchAll(/\braw\.([A-Za-z0-9_]+)/g)].map(match => match[1]));
  // These fields are selected dynamically by tomeBonus().
  for (const name of ["cursorDpsDamageBonusPercent", "cursorDpsAreaBonusPercent",
    "heroFrenzyDamageBonusPercent", "heroFrenzyAttackSpeedBonusPercent",
    "heroFrenzyMoveSpeedBonusPercent", "heroFrenzyAreaBonusPercent",
    "heroFrenzyDamageReductionBonusPercent"]) fields.add(name);
  return {
    name: "bph-runtime-data",
    enforce: "pre",
    apply: "build",
    resolveId(id, importer) {
      if (id === "./bph-upgrade-data" && importer?.endsWith("/bph-upgrades.ts")) return "\0bph-upgrade-runtime";
    },
    load(id) {
      if (id !== "\0bph-upgrade-runtime") return;
      return `export let BPH_DEFAULT_GRID = "_SkillTreeMain_Demo";
export let BPH_UPGRADE_NODES = {};
export let BPH_UPGRADE_GRIDS = [];
let loading;
export function loadBphUpgradeData() {
  return loading ??= import(${JSON.stringify(resolve(source, "bph-upgrade-data.ts"))}).then(data => {
    BPH_UPGRADE_NODES = data.BPH_UPGRADE_NODES;
    BPH_UPGRADE_GRIDS = data.BPH_UPGRADE_GRIDS;
  });
}`;
    },
    transform(code, id) {
      if (!/\/bph-(?:upgrade-)?data\.ts$/.test(id)) return;
      const upgrade = id.endsWith("/bph-upgrade-data.ts");
      return code.split("\n").map(line => {
        const match = line.match(/^(\s*(?:"[^"]+": )?)(\{.*\}|\[.*\])(,?)$/);
        if (!match) return line;
        const project = (value: unknown): unknown => {
          if (Array.isArray(value)) return value.map(project);
          if (!value || typeof value !== "object") return value;
          return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
            if (key === "raw") return upgrade ? [] : [[key, Object.fromEntries(
              Object.entries(child).filter(([field]) => fields.has(field)),
            )]];
            if (upgrade && (key === "values" || key === "targets")) return [[key, Object.fromEntries(
              Object.entries(child).filter(([field]) => new RegExp(`\\b${field}\\b`).test(consumers)),
            )]];
            return [[key, project(child)]];
          }));
        };
        return `${match[1]}${JSON.stringify(project(JSON.parse(match[2])))}${match[3]}`;
      }).join("\n");
    },
  };
}
