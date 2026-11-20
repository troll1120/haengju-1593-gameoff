import { strict as assert } from "node:assert";
import { mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { prepareBphUpgrades, recordBphProgress } from "../src/bph-upgrades";
import { bphReachabilityTargets } from "../src/bph-reachability-targets";
import { simulateSurvival, SURVIVAL_POLICY } from "./survival-sim";
import { manageReachabilityAccount, REACHABILITY_CAMPAIGN_POLICY } from "./reachability-campaign-management";

const root = fileURLToPath(new URL("../", import.meta.url));

async function assertCampaignSource(expected: string) {
  const actual = (await Bun.$`git -C ${root} rev-parse HEAD`.quiet().text()).trim();
  assert(actual === expected, `Source SHA mismatch: expected ${expected}, got ${actual}`);
  const dirty = (await Bun.$`git -C ${root} status --porcelain=v1 --untracked-files=all`.quiet().text()).trim();
  assert(dirty.length === 0, `Campaign requires a clean source worktree:\n${dirty}`);
}

async function writeExclusive(path: string, value: unknown) {
  const file = await open(path, "wx");
  try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); }
  finally { await file.close(); }
}

export async function runReachabilityCampaign(args: readonly string[]) {
  const { values } = parseArgs({
    args: [...args], strict: true, allowPositionals: false,
    options: {
      accounts: { type: "string", default: "2" }, runs: { type: "string", default: "20" },
      policy: { type: "string" }, out: { type: "string" }, "source-sha": { type: "string" },
    },
  });
  const accounts = Number(values.accounts), runs = Number(values.runs);
  assert(Number.isSafeInteger(accounts) && accounts > 0 && accounts <= 0xffffffff, "accounts must be positive uint32");
  assert(Number.isSafeInteger(runs) && runs > 0 && runs <= 0xffffffff, "runs must be positive uint32");
  assert(accounts * runs + 1593 <= 0xffffffff, "seed schedule exceeds uint32");
  const policy = values.policy;
  assert(policy === "active2Hz" || policy === "cursor0", "--policy must be active2Hz or cursor0");
  assert(values.out, "--out is required");
  const sha = values["source-sha"];
  assert(sha && /^[0-9a-f]{40}$/i.test(sha), "--source-sha must be a full 40-character SHA");
  const sourceSha = sha.toLowerCase(), out = resolve(values.out);
  // Check before creating anything. mkdir without recursive rejects an existing output.
  await assertCampaignSource(sourceSha);
  await prepareBphUpgrades();
  await mkdir(out);
  const targets = bphReachabilityTargets();
  await writeExclusive(resolve(out, "manifest.json"), {
    policyVersion: REACHABILITY_CAMPAIGN_POLICY, policy, sourceSha, accounts, runs,
    seedSchedule: "1593 + zeroBasedAccount * runs + zeroBasedRun",
    targets, simulation: SURVIVAL_POLICY,
    chapterPolicy: "Highest automatic progression unchanged; replay/recovery held for owner",
    grants: "Fresh product account only; no fixture grants, cheats, or price cuts",
  });
  for (let index = 0; index < accounts; index++) {
    const meta = freshMeta(), save = freshBphSave(1593 + index * runs);
    meta.bph = save;
    const account = { meta, save };
    let entryManagement: ReturnType<typeof manageReachabilityAccount> | null = manageReachabilityAccount(account);
    for (let runIndex = 0; runIndex < runs; runIndex++) {
      await assertCampaignSource(sourceSha);
      const seed = 1593 + index * runs + runIndex;
      const chapter = Math.min(save.chapter + 1, 4), openedBefore = save.totalOpened;
      const { account: _carried, ...battle } = await simulateSurvival({
        seed, chapter, general: "권율", state: "none", policy, account,
      });
      assert(!battle.capped, "Campaign attempt did not reach natural settlement");
      recordBphProgress(save, { kind: "run-ended", seconds: battle.survival, won: battle.phase === "won" });
      const afterManagement = manageReachabilityAccount(account);
      await assertCampaignSource(sourceSha);
      const checkpoint = {
        policyVersion: REACHABILITY_CAMPAIGN_POLICY, policy, sourceSha,
        accountIndex: index, runIndex, seed, chapter, highestChapterAfter: Math.min(save.chapter + 1, 4),
        chapterPolicy: "auto; replay/recovery held for owner",
        entryManagement, battle, afterManagement,
        packs: { openedBefore, openedAfter: save.totalOpened, openedDelta: save.totalOpened - openedBefore },
        account,
      };
      const filename = `account-${index + 1}-run-${String(runIndex + 1).padStart(2, "0")}.json`;
      await writeExclusive(resolve(out, filename), checkpoint);
      entryManagement = null;
      console.log(JSON.stringify({
        account: index + 1, run: runIndex + 1, seed, chapter,
        phase: battle.phase, survival: battle.survival, progress: afterManagement.progress,
        checkpoint: resolve(out, filename),
      }));
    }
  }
}

if (import.meta.main) await runReachabilityCampaign(Bun.argv.slice(2));
