import { bphFxContext } from "./bph-fx-dispatch";
import type { Run } from "./rules";

/** Keep the fixture's authored roster while running the normal combat and spawn ticks. */
export function deferFixtureBarracks(run: Run): void {
  const context = bphFxContext(run);
  if (!context) throw new TypeError("Missing barracks fixture effect context");
  // Keep the clock below READY for the entire scenario, including serialized fixture frames.
  context.state.counters["barracks:clock"] = -1e9;
}
