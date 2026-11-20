import { CHAOS_RULES } from "../chaos-contract";
import type { ChaosState } from "../chaos-contract";
import { WIDTH } from "../geometry";
import type { Point, Rect } from "../geometry";
import type { Area } from "../skill-show";

const lane = (from: Point, to: Point, width: number): Area => ({ x: to.x, y: to.y, radius: width / 2, from });

/** Every army picture standing on the field now, as the ground it covers, so the name banner keeps clear of them as it does of a
 *  cast's ground and enemy warnings: live and queued trails, rings and due stomps, pools, fleet bands until they clear, 김시민's belt. */
export function chaosAreas(state: Readonly<ChaosState> | undefined, wall: Rect): Area[] {
  if (!state) return [];
  const live = <T extends { readonly untilTick: number }>(items: readonly T[]): T[] => items.filter(item => state.tick < item.untilTick);
  const fleetWidth = state.mods.general === "이순신" ? state.mods.width : CHAOS_RULES.fleet.manualWidth;
  const areas: Area[] = [
    ...live(state.trails).map(trail => lane(trail.from, trail.to, trail.width)),
    ...state.pendingTrails.map(trail => lane(trail.from, trail.to, trail.width)),
    ...live(state.rings).map(ring => ({ x: ring.x, y: ring.y, radius: ring.radius })),
    ...state.stomps.map(stomp => ({ x: stomp.at.x, y: stomp.at.y, radius: stomp.radius })),
    ...live(state.pools).map(pool => ({ x: pool.x, y: pool.y, radius: pool.radius })),
    ...live(state.fleet).map(pass => lane({ x: 0, y: pass.lane }, { x: WIDTH, y: pass.lane }, pass.width ?? fleetWidth)),
  ];
  if (state.mods.general === "김시민") {
    const band = state.mods.width, y = (wall.top + wall.bottom) / 2;
    areas.push(lane({ x: wall.left - band, y }, { x: wall.right + band, y }, wall.bottom - wall.top + 2 * band));
  }
  return areas;
}
