# Unique survival skills, owner request castle 349

Base: `4d40a85b5fe3ef9b8727eb3cfebebd961dae7d03`.
Owner DM: `1794827354.025489`. The growth lane owns request 350.

The lead approved comparing the two new attacks with the average of the three
land damage skills, rather than treating healing, shielding and naval damage as
equivalent damage outputs. All numbers below are base casts before account
skill power, weather, boss resistance and growth modifiers. `M` means `might(run)`.

| Skill | Base damage | Cooldown | Damage per second |
| --- | --- | --- | --- |
| Gwon Yul, Volley | 5 M per enemy in its circle | 8 s | 0.625 M |
| Sin Rip, Return Breakthrough | 8 M per enemy hit on both legs | 10 s | 0.8 M |
| Hwang Jin, War Stomp | 4 M per nearby enemy | 10 s | 0.4 M |
| Three-attack mean | | | 0.608333 M |
| Song Sanghyeon, Hold Dongnae | Five 1.08 M pulses per enemy remaining on the line | 9 s | 0.6 M |
| Gwak Jaeu, Militia Ambush | Four militia, two 0.7 M strikes each per contacted enemy | 8 s | 0.7 M |

The line is 1.37% below the reference mean; the ambush is 15.07% above it.
Both are inside the requested +/-20%, compared per enemy as with the reference attacks.
This is a full-contact damage budget, not a claim that every cast hits everything.
Volley, charge and stomp can hit multiple enemies. The ambush has a 5.6 M
per-enemy cap and an 11.2 M total cast cap at base tier; the line pays out
only while enemies occupy it.

Hold Dongnae lasts 5 seconds, spans 144 pixels along the threatened wall and is
32 pixels deep, centered 40 pixels outside the wall. Movement inside is 60% of
normal, without altering base speed or stacking slow multipliers. Five damage
pulses occur at 0.5, 1.5, 2.5, 3.5 and 4.5 seconds.
The standard held-wave fixture places six durable enemies across that strip:
it measures **30 enemy-seconds at 40% slow** (12 full-speed-equivalent
enemy-seconds denied) and **32.4 M total damage**, or **5.4 M per enemy**.
This fixture is a full-contact upper bound. A moving wave may leave the strip
earlier; kills, stagger from normal hits, approach angle and other controls change
its realized occupancy. There is no lingering slow after leaving or expiry.

Militia Ambush creates four temporary `uibyeong` actors around the aim point.
Each selects its nearest living land enemy within 72 pixels, breaking ties by
enemy id, at 0.3 and 1.8 seconds. Its short melee strike can hit two enemies
within 18 pixels of the target, using the retained spearman cleave dimensions.
Total base damage is **5.6 M per cast against one durable enemy**, or
**11.2 M maximum across two contacted enemies per strike**. These are damage
budgets; misses, deaths, position and resistance reduce realized damage.
Bodies disappear at 3 seconds; they are not added
to recruitment, merges, population, healing or loot eligibility. The general
does not charge, teleport or gain a charge lane.
The ambush appears near a threatened ladder carrier first, otherwise a caster,
boss, elite or crowd. Ladder targets shift the ambush point 40 pixels outward.
The arrival staggers enemies within 72 pixels for 1 second using the native
stun path (0.5 seconds for bosses and ladders), including cast cancellation.
Ladders within 120 pixels of a militia body target that decoy for its lifetime,
without changing their original wall destination or crossing intact walls.
A decoy attack consumes the ladder's normal two-second attack clock, so a
ladder that just attacked can need up to two more seconds after expiry to swing
again, in addition to walking back. This control value is separate from damage.
Summons can defend a breached courtyard and their feet stay above the river.

Existing tier damage factors are preserved: both skills retain
`1 + GENERAL_GROWTH.skill * (tier - 1)`; Song also retains his former
`1 + awakened * 0.25` factor. Gwak's original charge had no such extra factor.
His existing first awakening, Red Fury, still grants eight seconds of double
basic attack after his skill completes. It starts once at ambush expiry.
The growth lane owns the added militia at higher growth tiers and their single
activation hook; this change adds no alternate growth calculation.

Kim Simin remains a six-second damage shield on a twelve-second cooldown;
Samyeong remains a 30% maximum-HP heal on twelve seconds. Their direct damage is
zero, so percentage comparisons with attack damage are not meaningful.
Yi Sunsin remains the separate naval burst: 300 damage per enemy ship on a
twelve-second cooldown, with a 1.2-second turtle-ship presentation.
The two new land skills explicitly exclude ships.

The new module consumes no random values. State is stored in `Run`, so cloning a
run retains every deadline and target decision. Native `damage` still owns
resistance, shields, hit feedback, kill rewards, metrics and BPH event dispatch.
Effects pause with simulation time and disappear when their run is replaced.

Growth integration: both exported activation functions accept optional
`UniqueSkillMods`. `lineLengthBonus` adds total line length; `militiaCountBonus`
adds actors. Missing keys default to zero. Tests use a local growth fixture for
0/24/48 pixels and 0/1/2 additional militia. There is no production `growthFor`
call or import here; the growth lane passes its `mods` through the two dispatches.

Visuals reuse `palisade-crosses` and the existing `uibyeong` ally sprite.
The existing skill buttons and screen layout are retained; descriptions use the
existing Korean/English translator and button tooltips. Mobile and desktop QA
checks the persistent line, four summoned bodies, attack frames and expiry.

## Handoff limitation

The final candidate uses four militia, a three-second lifetime and a one-second
arrival stun. Seed 7 wins, but the unchanged veteran fixture fails at
`src/rules.test.ts:855`: it records 19 enemy telegraphs against the required
`> 20`. The fixture and this assertion are not relaxed. The lead explicitly
requested committing this best candidate with the failure disclosed while
awaiting the owner's decision. Baseline 4d40a85 wins at 571 seconds with
22 telegraphs; the two requested lighter-control trials produced a win with
15 telegraphs (0.7-second stun) and a loss with 19 (active casters excluded).
Neither trial is the delivered version.

## Shared registration edits (delivered line numbers)

- `src/roster.ts:52,54`: new KO skill names.
- `src/roster.ts:58`: `hold` and `ambush` kind variants.
- `src/roster.ts:69,76`: Gwak and Song registrations.
- `src/roster.ts:93,100`: matching awakening text.
- `src/rules.ts:29-30`: mechanics and state imports.
- `src/rules.ts:165`: optional run-owned unique-skill state.
- `src/rules.ts:471`: expose the unchanged native stagger operation.
- `src/rules.ts:898-899`: aim dispatch.
- `src/rules.ts:943-944`: activation dispatch; growth adds its optional second argument here.
- `src/rules.ts:1288`: movement multiplier at the original movement step.
- `src/rules.ts:1355-1363`: ladder decoy targeting.
- `src/rules.ts:1751-1753`: fixed-step ticks through native damage.

`COOLDOWNS` is unchanged. `src/skill-growth.ts` is not touched.
