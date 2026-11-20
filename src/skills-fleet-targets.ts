import { riverLane } from "./river";
import type { Enemy } from "./rules";
import { CHAOS_RULES } from "./chaos-contract";

/** Sorted living land enemies; default 48px keeps manual targeting and ties. */
export function fleetLanes(land: readonly Enemy[], count: number, width: number = CHAOS_RULES.fleet.manualWidth): number[] {
  const candidates: { lane: number; density: number }[] = [];
  let left = 0;
  for (let right = 0; right < land.length; right++) {
    while (land[right].y - land[left].y > width) left++;
    candidates.push({ lane: (land[left].y + land[right].y) / 2, density: right - left + 1 });
  }
  candidates.sort((a, b) => b.density - a.density || a.lane - b.lane);
  const lanes: number[] = [];
  for (const candidate of candidates) {
    if (lanes.every(lane => Math.abs(lane - candidate.lane) >= width)) lanes.push(candidate.lane);
    if (lanes.length === count) break;
  }
  return lanes.length ? lanes : [riverLane()];
}
