import type { BossKind, DeathCause, Track } from "./analytics-events";

const milestones: Readonly<Partial<Record<number, "survive_1m" | "survive_3m" | "survive_5m" | "survive_10m" | "survive_15m">>> = {
  1: "survive_1m", 3: "survive_3m", 5: "survive_5m", 10: "survive_10m", 15: "survive_15m",
};
const minuteBands = [
  "m00", "m01", "m02", "m03", "m04", "m05", "m06", "m07", "m08", "m09", "m10", "m11", "m12", "m13", "m14",
] as const;

function timeBands(seconds: number) {
  const minute = Math.floor(seconds / 60);
  return {
    minute_band: minuteBands[minute] ?? "m15_plus",
    survival_band: minute < 1 ? "lt1" : minute < 3 ? "1to3" : minute < 5 ? "3to5"
      : minute < 10 ? "5to10" : minute < 15 ? "10to15" : "15plus",
  } as const;
}

type BattleProgress = { readonly gold: number; readonly playerLevel: number };
type BattleFinish =
  | { readonly outcome: "won"; readonly gold?: number }
  | { readonly outcome: "lost"; readonly cause?: DeathCause; readonly bossKind?: BossKind; readonly gold?: number };

export function trackBattle(
  track: Track,
  win: Pick<Window, "addEventListener">,
  doc: Pick<Document, "addEventListener" | "visibilityState">,
  waveSeconds: number,
) {
  const waveInterval = Number.isFinite(waveSeconds) && waveSeconds > 0 ? waveSeconds : 30;
  let active = false, played = 0, playedSinceReport = false;
  let runSeconds = 0, wave = 0, minute = 0;
  const reportEnd = () => {
    if (!playedSinceReport) return;
    playedSinceReport = false;
    track("session_end", { seconds_played: Math.floor(played) });
  };
  win.addEventListener("pagehide", reportEnd);
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") reportEnd();
  });

  return {
    start(mode: "survival" | "endless"): void {
      active = mode === "survival";
      if (mode !== "survival") return;
      runSeconds = minute = 0;
      wave = 1;
      playedSinceReport = true;
      track("game_start", { mode });
      track("wave_reached", { wave });
    },
    progress(seconds: number, snapshot?: BattleProgress): void {
      if (!active || !Number.isFinite(seconds) || seconds <= runSeconds) return;
      played += seconds - runSeconds;
      runSeconds = seconds;
      playedSinceReport = true;
      let nextMinute = (minute + 1) * 60, nextWave = wave * waveInterval;
      while (Math.min(nextMinute, nextWave) <= seconds) {
        if (nextMinute <= nextWave) {
          ++minute;
          track("survival_minute", {
            minute,
            ...(snapshot && { gold: snapshot.gold, player_level: snapshot.playerLevel }),
          });
          const milestone = milestones[minute];
          if (milestone) track(milestone, {});
          nextMinute = (minute + 1) * 60;
        } else {
          track("wave_reached", { wave: ++wave });
          nextWave = wave * waveInterval;
        }
      }
    },
    finish(result: BattleFinish | string): void {
      if (!active) return;
      active = false;
      const legacy = typeof result === "string";
      const gold = legacy ? undefined : result.gold;
      const summary = {
        survival_seconds: Math.floor(runSeconds), wave, ...timeBands(runSeconds),
        ...(gold === undefined ? {} : { gold }),
      };
      if (legacy) {
        if (result === "victory") track("game_over", summary);
        else track("game_over", { ...summary, cause: "unknown", boss_kind: "unknown" });
        return;
      }
      switch (result.outcome) {
        case "won":
          track("game_over", summary);
          break;
        case "lost":
          track("game_over", { ...summary, cause: result.cause ?? "unknown", boss_kind: result.bossKind ?? "unknown" });
          break;
        default: {
          const unreachable: never = result;
          throw new TypeError(`Unsupported battle result: ${String(unreachable)}`);
        }
      }
    },
    quit(): void {
      if (!active) return;
      active = false;
      track("run_quit", {
        survival_seconds: Math.floor(runSeconds),
        minute_band: timeBands(runSeconds).minute_band,
        exit_kind: "quit_to_title",
      });
    },
  };
}
