#!/bin/bash
set -u
mkdir -p out/skill-dim
bun install --offline --ignore-scripts > out/skill-dim/dependencies.log 2>&1
dependencies=$?
node_modules/.bin/tsc --noEmit > out/skill-dim/tsc.log 2>&1
tsc=$?
bun test ./src/skill-veil.test.ts ./src/skill-show.test.ts ./src/skill-vfx.test.ts \
  ./src/skill-growth-view.test.ts ./src/skill-growth.test.ts ./src/shows ./src/chaos-shows \
  ./src/volley-show.test.ts ./src/skills-unique.test.ts ./src/skills-yisunsin.test.ts \
  ./src/chaos-skills-v3.test.ts --timeout 120000 > out/skill-dim/related-tests.log 2>&1
related=$?
bun test ./src/skill-veil-parity.test.ts --timeout 120000 > out/skill-dim/parity.log 2>&1
parity=$?
bun scripts/measure-skill-dim.ts out/skill-dim/after.json > out/skill-dim/measure.log 2>&1
measure=$?
printf '{"dependencies":%s,"tsc":%s,"related":%s,"parity":%s,"measure":%s}\n' \
  "$dependencies" "$tsc" "$related" "$parity" "$measure" > out/skill-dim/exit-codes.json
cat out/skill-dim/exit-codes.json
test "$dependencies$tsc$related$parity$measure" = "00000"
