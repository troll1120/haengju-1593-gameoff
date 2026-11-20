#!/bin/bash
# Usage: bash scripts/capture-survival-skills.sh <preview URL|absolute dist path> <output> [cast second]
set -eu
repo="$(cd "$(dirname "$0")/.." && pwd)"
source="${1:?pass the built preview URL or absolute dist path}"
out="${2:?pass the capture output directory}"
cast_second="${3:-9}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
cd "$repo"
status=0
for entry in gwonyul:권율 shinrip:신립 songsanghyeon:송상현 hwangjin:황진 gwakjaeu:곽재우 \
  yisunsin:이순신 kimsimin:김시민 samyeong:사명대사; do
  slug="${entry%%:*}"
  general="${entry#*:}"
  mkdir -p "$out/$slug"
  code=0
  "${BUN_BIN:-bun}" scripts/review-skill.ts "$general" "$slug" "$out/$slug" "$source" "$cast_second" fx \
    > "$out/$slug/capture.log" 2>&1 || code=$?
  printf '%s\n' "$code" > "$out/$slug/capture.exit"
  printf 'FX_CAPTURE %s exit=%s\n' "$slug" "$code"
  if [ "$code" -ne 0 ]; then status=1; fi
done
exit "$status"
