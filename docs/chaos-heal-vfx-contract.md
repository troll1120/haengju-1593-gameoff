# Healing display and paired survival measurements

For a healing `skill` effect, display
`effect.actualHealRatio ?? actualManualHealRatio(run, squad)`, with the helper
imported from `rules.ts` and `squad` resolved from `effect.squad` at cast time.
The fraction includes base healing, awakening, manual growth and army growth.
It is the offered fraction of maximum HP, not the HP actually restored after
capping at maximum HP. For example, an 80% heal at 95/100 HP restores 5 HP.

`value` and the complete N0/legacy effect shape retain their historical values.
N1+ effects carry the ratio at cast time; the read-only helper supplies the
same arithmetic for N0/legacy consumers without mutating combat state.
The HP formula, eligible living targets, cooldown and random stream are unchanged.

The harness does not emit a per-heal `deathsPrevented` event. In
`scripts/chaos-retune-sim-comparison.ts`, `compareRetune(candidate, baseline)`
pairs the same general, seed, refill policy, manual policy and time cap.
It samples cumulative counters at the shorter run's final native tick:

- `soldierDeathsAvoided = baseline.soldierDeaths - candidate.soldierDeaths`
- `generalDownsAvoided = baseline.generalDowns - candidate.generalDowns`
- `deathsAvoided = baseline.deaths - candidate.deaths`

These are signed differences between complete builds, not proof that a
particular heal prevented a death. Do not clamp negative differences or use
them as a live VFX counter. The results artifact is their source.
Pool `unit-healed` events report restored HP; surviving for a window after
healing is not sufficient to infer a prevented death.
