# Chaos growth integration contract

Owner approval: DM 1794848528.091879. Initial base: 04c6394.
The lead subsequently approved contact retuning after the 252cae5 measurements.
The separate performance baseline is 77e339d, applied here as fef1a3d.

`src/chaos-contract.ts` owns army coefficients and visual state types.
`growthFor(general, run)` keeps manual tiers at 3/6 purchases; its army level is
the applicable unique placement count, clamped to 20. Army milestones are
1/5/10/20 as approved. Purchases between milestones still grant their original
stats. No new experience, currency, or run-time level selection is introduced.

The wave lane owns the entire 10-minute schedule, enemy density, boss curve and
intensity. This lane never scales enemies according to N.

## Renderer data

The optional `run.chaos` state exists only for a supported BPH commander at N>0.
All time fields ending in Tick are integer 30 Hz simulation ticks. Views read
state; they must not mutate it, consume RNG, or create combat IDs.

- `trails`: Shin Rip paths; damage in the first 12 ticks, fade until tick 36.
- `pendingTrails`: collision-only overflow when all six visual slots are busy.
  These paths start at their actual activation tick and sweep for twelve ticks
  immediately; they never wait for visual admission or replay old damage later.
  Both collections process once in creation order. Renderers keep reading only
  the maximum-six `trails`; completed overflow collision records are discarded.
- `rings`: Hwang Jin one-hit impact visuals, 12 ticks.
- `pools`: Samyeong fixed-position healing pools. Read each pool's radius,
  startedTick, untilTick and nextTick; cadence/lifetime come from army mods.
- `militia`: Gwak persistent militia, distinct from existing manual ambush actors.
- `fleet`: Yi support passes, 36 ticks travel then a 72-tick harmless trail.
- Kim's protection uses `state.mods.width` and includes the courtyard. Its
  small offensive pulse uses `state.mods.pulseWidth`, not the protection width.
  `chaosBeltPositions({run,state})` shares shield coordinates with combat.
- Gwon's real auxiliary arrows have `procDepth=1`, `sourceAttackId`, fan heading
  and a short fan flight segment. Their target is authoritative.
- Song's manual defense lines continue to use `run.uniqueSkills`; halfWidth is
  the actual strip half-width, and until is its actual deadline.
- `CHAOS_RULES` owns matching visual constants: manualWall.knockbackBand (44),
  fleet.passSeconds (1.2), passTicks (36), afterimageTicks (72), plus trail,
  ring, orbit and purification lifetimes, radii and caps. Renderers import it.
- A support fleet pass stores its actual width. Do not hardcode the manual 48px
  band for automatically triggered support fleets.

No renderer callback deals damage. Downed commanders stop new passive
activations; already-created entities finish their lifetime. No after-end hits.

## Retuning acceptance and initial rows

`CHAOS_POWER_CURVE` gives analytical bounds at N0/5/10/20, not measurements.
They assume sufficient distinct live targets and exclude the 20-node branch's
up to +10% attack, +10% attack speed, +10% HP and +10% movement.

Six damage commanders must reach at least 30% effective damage contribution from
manual skills plus army skills at N20 on the unchanged 24-unit comparison.
Mean skill DPS and share must increase from N0 to N10 to N20.
Kim instead targets 30% prevention and a survival gain; Samyeong targets 30%
effective healing coverage, fewer troop deaths at a matched time, and survival.
The same comparison also runs with deterministic 15-second army replacement.
These are acceptance goals, not claims that initial coefficients pass.

Defense telemetry uses one boundary at every level: post-hook, prearmor incoming
pressure and the portion prevented by the commander's shield or passive.
`subscribeDefensePressure` in `defense-pressure.ts` observes that boundary into
harness-owned counters outside `Run`, including N0. It emits no combat event and
does not add state keys or consume randomness. A native block gets zero kit
credit; a manual shield receives the whole post-hook pressure once, without
also crediting the passive. This is potential pressure prevention, not actual
HP saved. Effective unit HP damage and castle HP loss remain separate paired
diagnostics; mixing them into the pressure denominator is not an acceptance
metric.

At N>0, Kim's global shield expires at least 0.6 seconds before its effective
recast deadline, including account charge speed and awakening. The shield effect
reports this actual duration. This prevents permanent global immunity; N0
retains its historical timing. The ordinary 12-second cooldown is unchanged.

| Commander | N10 initial retune | N20 initial retune |
|---|---|---|
| Gwon | 6 auxiliary arrows, total 1.2D; 12 manual follow-ups | 10 auxiliaries, total 2.4D; 20 manual follow-ups; every second volley pierces |
| Shin | one 176px x 48px trail per 6 attacks, 0.8D | 224px x 64px per 3 attacks, 1.4D; 6-actor cap |
| Song | 2 seeking pierces at 0.65D; 240px x 80px line for 10s | 4 at 0.9D; 288px x 112px line for 14s plus second line |
| Hwang | radius96 pulse per6 attacks, 0.8D, 8 targets | radius148 per3, 1.4D, 12 targets; delayed 2.4M pulses |
| Kim | protection72px, unit/castle reduction20%, shield7.8s | protection96px, unit30%/castle35%, shield8.4s |
| Gwak | 8 moving militia, 0.35M/s/body, reach144px | 12 permanent moving militia, 0.5M/s/body, reach176px; rotating group |
| Samyeong | 4 pools radius64px, troop8% HP/s, manual48% | 6 pools radius96px, troop16% HP/s, manual60% |
| Yi | 72px support band every7s, 2 passes total5.5M | 96px bands every5s, 3 passes total10M |

Samyeong's pool healing on generals is one quarter of the troop rate.
Kim's offensive pulse width remains28/36px and power .24/.30M: protection,
not damage, is the main growth benefit. Manual 3/6 tier thresholds remain.
Gwon's arrows retarget the nearest living enemy if the original target dies;
manual follow-ups search beyond the killed impact cluster. Song's added paths
seek nearby off-axis targets, and original bounce damage is restored afterward.
Shin's distant-attack trail is centered across the actual target rather than
ending before reaching it. Gwak follows native wall routes without recruitment
or extra rewards. No coefficient scales enemy stats or reads measured DPS.

Clear rate and survival cannot be inferred from these isolated ratios: melee
contact, line occupancy, distinct arrow targets, HP and overkill matter. The
30-seed-per-general N0/10/20 simulation report will publish actual damage,
kills/second, survival seconds, wall/base loss, downs and outcome, with its exact
wave version and input sequence. The old 720-run matrix and 24-second video stay
frozen on 252cae5; retuned data is stored in the separate 2026-11-17 result folder.
