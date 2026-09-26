# Pro BBALL Coach — Mini-games (`PBC.Mini`)

Game Impact Moments (GIM) and the eight weekly practice drills. Plain classic scripts (no modules, no libraries,
no images, no network), so everything runs from `file://`. Every file is an IIFE that attaches to `window.PBC.Mini`.

## Files & load order

```html
<link rel="stylesheet" href="css/mini.css">

<script src="js/mini/core.js"></script>          <!-- namespace, utils, grades, WebAudio sfx, Session / input lifecycle -->
<script src="js/mini/court.js"></script>         <!-- DPR canvas helper + fake-3D half-court projector, tokens, ball, flights -->
<script src="js/mini/meter.js"></script>         <!-- hold/release shot meter component + release judge -->
<script src="js/mini/gim.js"></script>           <!-- PBC.Mini.gimChoose, PBC.Mini.shotMeter -->
<script src="js/mini/drills.js"></script>        <!-- PBC.Mini.DRILLS + PBC.Mini.runDrill (intro / HUD / results) -->
<script src="js/mini/drills_shoot.js"></script>  <!-- shooting, freethrows -->
<script src="js/mini/drills_court.js"></script>  <!-- finishing, passing, rebounding -->
<script src="js/mini/drills_rhythm.js"></script> <!-- ballhandling, defense, conditioning -->
```

`core → court → meter → gim → drills` is required; the three `drills_*.js` files can load in any order after
`drills.js`. The mini-games do not depend on `PBC.Sim` / `PBC.Match` / UI code.

## Host requirements

* **Container**: pass any element. The overlay is `position:absolute; inset:0` inside it. If the container is
  `position: static`, the overlay sets it to `relative` while it is open and restores it afterwards (ref-counted).
  Pass `document.body` for a full-viewport (`position:fixed`) overlay. Give the container a real size;
  the layouts adapt to the *container* (CSS container queries), from phone portrait up to desktop.
* **Theme**: reads the app's `:root` variables (`--bg --panel --panel2 --line --text --muted --accent --accent2
  --good --bad --gold --font-ui --font-display`), with the documented fallbacks. All CSS is scoped under `.pbc-mini`.
* **Modal input**: while a mini-game is open it captures keyboard events on `window` (capture phase) and stops their
  propagation, so host shortcuts do not fire. Space / arrows / Enter get `preventDefault` (no page scrolling).
  Esc cancels. Pointer events are used for mouse *and* touch (`touch-action: none` on the overlay).
  Touch devices also get a ✕ button in drills (no Esc key on phones).
* **One per container**: opening a mini-game in a container that already has one cancels the older one.
  If the host removes the container, a watchdog cancels the game within ~0.5 s so the promise still resolves.
  `PBC.Mini.cancelAll()` force-cancels everything (e.g. when leaving the screen).
* **Sound**: short WebAudio oscillator/noise blips. `PBC.Mini.muted = true` silences everything and
  `PBC.Mini.volume` (0..1, default 0.7) sets the level. No AudioContext is created before the first user gesture.
* Every call returns a Promise that **resolves exactly once** (never rejects). Listeners, rAF loops, timers,
  ResizeObservers and DOM are removed when it resolves (the overlay fades out over ~0.24 s).

## API

### `PBC.Mini.gimChoose(container, ctx) → Promise<{ index, auto?, cancelled? }>`

`ctx` is exactly what `PBC.Sim.gimOptions()` / `gimCheck()` returns:
`{ situation, teams:[{abbr,score,color},{…}], userTeam, options:[{label, player, num, detail, pct, pts, kind, …}], type:'clutch'|'buzzer', timeLimit? }`.
Shows 1–4 option cards (player, shot, points, colour-coded est. make %, expected points).
Keys `1`–`4`, arrows + Enter/Space, click or tap. Countdown `ctx.timeLimit` (default 12 s) → auto-picks option 0
with `auto:true`. Esc → `{ index: 0, cancelled: true }`.

### `PBC.Mini.shotMeter(container, opts) → Promise<{ quality, score, error, pos, auto?, cancelled? }>`

Transparent overlay (only the nameplate + meter UI) meant to sit on top of the paused match canvas.
Hold Space / mouse / touch anywhere to rise, release in the green window near the top.

| opt | default | meaning |
|---|---|---|
| `label`, `player`, `num`, `pts` | | nameplate text |
| `windowSize` | 0.09 | 0.03–0.16, fraction of the meter (bigger = easier). The inner 30 % is the gold PERFECT zone |
| `speed` | 1 | 0.8–1.3; fill time = 0.9 s / speed, ease-in (the bar accelerates) |
| `contest` | `'open'` | `'contested'` shakes a little, `'tight'` shakes more |
| `pressure` | 0 | 0–1: window starts slightly shifted and jitters while you shoot |
| `timeLimit` | 8 | seconds to start the shot, else `no_release` |
| `showHelp` | first time | force the instruction bubble on/off (default: shown until the first release, remembered in localStorage) |
| `feedbackMs` | 950 / 1150 | how long the RELEASE feedback stays before resolving |

Result: `quality` ∈ `perfect | good | early | late | very_early | very_late | no_release`; `score` 0..1
(1 = dead centre, window edge ≈ 0.6, misses ≤ 0.55 fading to 0); `error` = signed timing error in **seconds**
(negative = early; `null` for `no_release`); `pos` = meter position at release; `auto:true` if it was force-released
after holding far past the top. Esc → `{ quality:'no_release', score:0, error:null, cancelled:true }`.
The result object can be passed straight to `PBC.Sim.resolvePending(game, possession, result)`.

Typical GIM flow:

```js
const ctx = PBC.Sim.gimCheck(game);                      // null when no GIM
if (ctx) {
  const pick = await PBC.Mini.gimChoose(container, ctx);
  const opt = ctx.options[pick.index];
  const P = PBC.Sim.startGimPossession(game, opt);       // possession with a pending shot
  // …play it in the match view until it freezes on the pending shot, then:
  const shot = await PBC.Mini.shotMeter(container, {
    label: opt.label, player: opt.player, num: opt.num, pts: opt.pts,
    windowSize: 0.04 + 0.12 * shooterRating01 * contestFactor,   // host decides
    speed: 0.9 + 0.3 * pressure01, contest: 'contested', pressure: 0.8,
  });
  PBC.Sim.resolvePending(game, P, shot);
  view.resume();
}
```

### `PBC.Mini.runDrill(container, key, opts) → Promise<{ score, grade, details, cancelled? }>`

`opts = { difficulty: 0..1 (default .5), players: ['M. Hill', …] }` (names flavour the drill text).
Flow: intro card (title, how-to, trained ratings, difficulty; Space / Enter / tap to start) → live drill with HUD →
results card with the grade (Space / Enter / tap to continue; input is locked for 0.7 s so mashing can't skip it).
`score` 0–100 (integer), `grade` from `PBC.Mini.grade(score)`:
A+ ≥ 95, A ≥ 90, A- ≥ 85, B+ ≥ 80, B ≥ 75, B- ≥ 70, C+ ≥ 65, C ≥ 60, C- ≥ 55, D ≥ 45, F below.
Esc/✕ before the results → `{ score:0, grade:'F', details:{…partial}, cancelled:true }` (treat as "skipped", e.g.
sim it with `Season.applyPractice(…, auto=true)`). Esc on the results card keeps the earned grade.
Unknown key → resolves `{ score:0, grade:'F', details:{error}, cancelled:true }` with a console warning.

`PBC.Mini.DRILLS` — `[{ key, name, icon, desc, secs, trains:[rating keys] }]` (already read by `Season.applyPractice`):

| key | name | trains | how it plays | details |
|---|---|---|---|---|
| `shooting` | Catch & Shoot | three, mid, shotIQ | 10 catch-and-shoot spots, same hold/release meter; window shrinks 0.15→0.065 and speed varies; streak bonus (+1/+2/+3) | makes, perfects, bestStreak, avgErrorMs, shots[] |
| `freethrows` | Pressure Free Throws | ft, clutch | 10 FTs; crowd noise behind the basket makes the window wobble, louder each shot; last two are "game on the line" | made, pct, perfects, clutchMade, avgErrorMs, shots[] |
| `finishing` | Attack the Rim | layup, close, dunk | 6 drives; press as the shrinking ring hits the GATHER spot, press again at the top of the jump (second ring); early gather = travel, late = charge; both perfect on a dunk lane = slam | made, perfectSteps, avgGatherMs, avgReleaseMs, reps[] |
| `passing` | Find the Open Man | pass, vision | 12 reads; 4 numbered teammates + defenders drift; one breaks open for a shrinking window (≈1.15→0.72 s); pass with `1`–`4` or click/tap; covered man = turnover (−4) | assists, turnovers, late, avgReadMs, log[] |
| `ballhandling` | Combo Dribble | handle, agility | ~27 s rhythm highway (96–126 BPM) of named combos (crossover, spin…); ←↓↑→ / WASD / tap lane; PERFECT ±50 ms, GREAT ±100, GOOD ±150; misses & stray presses break the combo | perfect, great, good, miss, strays, maxCombo, movesDone |
| `defense` | Slide Drill | perD, agility, steal | 12 reps; attacker jab-fakes, drives left/right or stops for a pull-up; ←/→ (A/D) slide, ↑ (W) contest, or tap left/middle/right; ≤0.30 s = full points; reacting to a fake or before the move = beaten | lockdowns, avgReactionMs, bitOnFakes, log[] |
| `rebounding` | Box Out & Board | dreb, oreb, hustle | 8 misses (some rattle); click/tap the landing spot during the read window, or Space when the sliding marker is on it; ≤1.3 ft = full points; early good read +1 | boards, avgMissFt, reps[] |
| `conditioning` | Suicides | stamina, speed, hustle | 20 s; alternate ←/→ (A/D, or L/R pads) to keep the pace needle inside a moving green zone; mashing → GASSED, same side twice → stumble; score = 80 % time-in-zone + 20 % distance | inZonePct, distanceFt, legs, gassed, stumbles |

All drills are ~20–35 s, and scripted perfect play reaches 99–100. Difficulty shrinks timing windows and speeds
things up (meter windows, BPM, fake frequency, read windows, carom speed, zone width).

## Other exports (handy for the host)

* `PBC.Mini.grade(score)`, `PBC.Mini.RATING_LABELS`, `PBC.Mini.judgeRelease(v, center, window)`,
  `PBC.Mini.releaseLabel(quality)` → `[label, tone, sub]`, `PBC.Mini.isActive()`, `PBC.Mini.cancelAll()`.
* `PBC.Mini.Meter` (the meter component, `idealHold()` gives the dead-centre hold time for AI/tests),
  `PBC.Mini.Projector` / `PBC.Mini.court.*` (fake-3D half-court drawing), `PBC.Mini.sfx(name)`.

## Test bench

`mini_test.html` (project root): launch every drill (difficulty slider, player names, "run twice in a row"),
the GIM chooser (4 / 2 options, buzzer beater, 3 s timeout) and the shot meter (sliders for windowSize / speed /
pressure / timeLimit, contest select) over a fake "paused game" background; the returned JSON and a leak readout
(active sessions / overlays in DOM / container position) are shown in the sidebar.
`mini_test.html?vclock=1` swaps in a virtual clock (`__step(ms)`, `__spaceDown()`, `__holdIdeal()`…) for
deterministic automated tests (works in background tabs where rAF is paused). Drills expose read-only internals on
`.pm-drill__play.pbcDebug` and meters on `.pm-meter.pbcMeter` for such tests.

## Design notes

* Everything is 2D that fakes 3D (per the art direction): a perspective half-court projector, puck-style player
  tokens with shadows that lift off the floor when jumping, a ball with a ground shadow, parabolic flights.
  No procedurally animated humanoid figures.
* Canvases are devicePixelRatio-aware and redraw synchronously on resize (no blank frame).
* Honours `prefers-reduced-motion` (no shakes / entrance animations).
