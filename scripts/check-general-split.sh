#!/bin/bash
set -uo pipefail
mkdir -p artifacts
run() {
  local name="$1"
  shift
  "$@" > "artifacts/$name.log" 2>&1
  local result=$?
  printf '%s\n' "$result" > "artifacts/$name.exit"
  printf '%s exit=%s\n' "$name" "$result"
  return "$result"
}
run install bun install --frozen-lockfile || exit "$?"
run typecheck bun x --no-install tsc --noEmit || exit "$?"
run tests bun test ./src/general-attack-timers.test.ts ./src/general-basic.test.ts ./src/chaos-attacks.test.ts ./src/chaos-offense.test.ts ./src/chaos-support.test.ts ./src/chaos-fleet.test.ts ./src/skills-yisunsin.test.ts ./src/bph-join.test.ts --timeout 120000
tests=$?
run build bun --bun vite build || exit "$?"
bun scripts/measure-general-attacks.ts > artifacts/after-aps.json 2> artifacts/measure.log
measure=$?
printf '%s\n' "$measure" > artifacts/measure.exit
if [ "$measure" -ne 0 ]; then exit "$measure"; fi
run capture bun scripts/capture-general-split.ts artifacts "$1"
capture=$?
printf 'SPLIT_CHECK_ALL tests=%s capture=%s exit=%s\n' "$tests" "$capture" "$capture"
exit "$capture"
