# Procedural battle audio

All music, percussion, effects, and the review WAV are original WebAudio synthesis
written for this game. No recordings, external samples, or CC assets are used.
No third-party attribution or license is required.

The score is 132 BPM, 4/4, D-pyeongjo pentatonic (D, E, G, A, B), an eight-bar loop
(about 14.55 s). The battle hook is a dotted "long-long-short-short" figure repeated in
bars 1, 3, 5 and 7 over a gayageum-like plucked lead (bent attack, fast decay). Janggu and
buk carry the beat; a haegeum-like reed, kkwaenggwari ticks, and a gong add color.

Battle layers join with unpaused battle time: base at 0, layer 1 at 2 min (reed lead,
plucked arpeggio, extra buk and janggu), layer 2 at 5 min (octave reed line, kkwaenggwari
off-beats, eighth-note bass), layer 3 at 8 min (sixteenth janggu, high/low plucked doubling,
crash). Boss and siege threat from `setBgmIntensity` can raise the level earlier, never lower it.

The title has its own calm theme (slow reed melody, sparse gayageum arpeggio, one soft buk
per two bars) and plays no effects. The scene is inferred: the game calls `setBgmIntensity`
about twelve times a second in battle and once on the title; three calls within half a second
switch to battle and restart the clock. `stopBgm()` returns to the title scene.
`setBgmScene("title" | "battle")` overrides the inference.

The complete roulette sound lasts about 1.26 seconds: twelve fast ticks,
three slow ticks at 0.62, 0.81, and 1.02 seconds, then the stop punch at 1.16.
Large impacts and their low drum accent start at the event's audio-clock
onset, independently of the BGM beat.

The public API retains all names in `review/stage4-fable/audio-hooks.md`,
including `audioState()` telemetry. Each `tick` plays one visual reel tick;
the complete sequence is available only as explicit `roulette`. Coin
clinks include a short magnetic pickup glide; `magnet` also exposes the
longer standalone sweep. Card selection and growth offers have a pop
transient. `card`, `roulette`, and `impact` are also available as explicit events.

`playSfx(name, delaySeconds = 0)` schedules immediately by default; use
`playSfx(name, .05)` for a kill cue 50 ms after contact. Delay must be finite
and non-negative. `prepare` is a quiet 50 ms windup cue; `kill` is a distinct
100 ms finish cue. Use `playSfx("prepare", Math.max(0, windupSeconds - .08))`
when windup begins, `playSfx("kill", .05)` at contact, and `playSfx("crit")`
for immediate critical contact. Scheduling at `AudioContext.currentTime` adds no intentional
latency; the synthesis attack (2-12 ms), device output latency, and caller
timing still determine audible onset. The +/-16.7 ms visual/audio target
requires a real device capture and is not guaranteed by scheduling tests.

At most three event groups are admitted per rendered frame, keyed by
`document.timeline.currentTime` (the shared rAF timestamp). Non-browser
callers use 60 Hz performance-clock boundaries. Same-name onsets are at least
45 ms apart, retaining any longer recipe gaps. Voice overlap, retrigger gaps,
and the 100 ms normalization window use scheduled audio onset, including
delayed cues. Neighboring onsets share `1 / sqrt(count)` gain, including
5 ms smoothing of earlier event gains; sustained tails retain their last gain. Per-event pitch varies
by +/-3%, multiplied by the existing rising coin streak.
Out-of-order windups keep their own scheduled onsets. Pausing calls
`cancelPendingSfx()`; stopping music or entering the title also cancels
future cues and releases their retrigger stamps, while audible tails continue.
Fast visual reel ticks closer than 45 ms are intentionally thinned by the
minimum gap. Reel timing and card UI are unchanged.

At most four hit groups and twelve ordinary effect groups play at once.
Boss cues, siege horns, and result stings have priority and retain their
own retrigger gaps. A priority event replaces an ordinary event in a saturated frame
to make room for the priority
cue; its delayed onset and tail are silenced, though an already audible
transient cannot be recalled. Three priority events saturate the frame.
Muting
fades the master bus and persists in local storage. Stopping BGM fades
the music bus and cancels its scheduler.

Render on the Mac mini from the repository root:

```sh
bun src/audio/render-preview.ts out.wav [all|title|ramp|full]
# title/ramp/full: 30 s music-only previews (ramp steps layers 0-3 every 7.5 s)
```

The renderer launches an isolated headless Chrome profile and uses the same
WebAudio score and instruments as gameplay through `OfflineAudioContext`.
The profile and browser are released after rendering. The WAV is 60 seconds,
48 kHz, stereo, signed 16-bit PCM:

- 0-12 s: intensity 0
- 12-24 s: intensity 1
- 24-36 s: intensity 2
- 36-52 s: intensity 3
- 2-49 s: individual combat, skill, UI, roulette, and warning effects
- 52.2 s: victory sting
- 56 s: defeat sting

The preview generator rejects silent, clipped, or non-finite output.
