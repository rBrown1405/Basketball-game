# Pro BBALL Coach — Match Engine ⇄ Match View contract

This file is the contract between the **game simulation engine** (`js/core/sim.js`, namespace `PBC.Sim`)
and the **visual match view** (`js/match/*.js`, namespace `PBC.Match`). The engine decides *what happens*
(stats-accurate, possession by possession). The view *acts it out* on a fake-3D 2D court and reports
back when each event visibly happens so the scoreboard / play-by-play stay in sync.

Everything is plain browser JavaScript loaded with classic `<script src>` tags (no ES modules, no bundler,
no network) so `index.html` works by double-clicking. Every file is an IIFE that attaches to `window.PBC`.

---

## 1. Court coordinate system (feet)

```
 y=50  ┌──────────────────────────────────────────────┐  far sideline (away from camera)
       │                                              │
 y=25  │ ◯ left rim (5.25,25)      right rim (88.75,25) ◯│
       │                                              │
 y=0   └──────────────────────────────────────────────┘  near sideline (closest to camera)
      x=0                     x=47                  x=94
```

* `x` along the length (0 → 94), `y` across the width (0 near → 50 far), `z` up.
* Rim centers: `(5.25, 25, 10)` and `(88.75, 25, 10)`. Rim radius 0.75 ft. Ball radius 0.39 ft.
* Backboard face at `x = 4` / `x = 90`, 6 ft wide (y 22–28), bottom z 9.5, top z 13.
* Lane 16 ft wide (y 17–33); free-throw line 15 ft from the backboard face (x = 19 / 75); FT circle r = 6.
* Restricted-area arc r = 4 ft from rim center. Center circle r = 6 (inner r = 2). Half-court line x = 47.
* 3-point line (per league, given in `ctx.threePt`): men arc 23.75 ft, corners 22 ft; women arc 22.15 ft, corners 21.65 ft.
* **Attack direction:** the home team (index 0) attacks the **right** basket (x = 88.75) in periods 1–2 and the
  **left** basket in periods 3+ (all overtimes included). The away team (index 1) is the opposite.
  `PBC.Sim.attacksRight(teamIdx, period)` returns `true` when that team shoots at the right basket.

## 2. Game context given to the view

```js
const ctx = {
  league: 'men' | 'women',
  periodLen: 720,                 // seconds per quarter (women: 600); OT = 300
  threePt: { arc: 23.75, corner: 22 },
  home: TeamLook, away: TeamLook,
  players: { [id]: PlayerLook },  // every player on both rosters (bench included)
  lineups: [[5 ids], [5 ids]],    // on court at tip-off; later changes arrive as 'sub' events
  defScheme: ['man','zone23'],    // per team, can change between possessions (see possession.defScheme)
};

TeamLook = {
  id, abbr: 'BOS', city: 'Boston', name: 'Colonials',
  colors: { primary: '#0b6e4f', secondary: '#f2c14e', trim: '#ffffff' },
  uniform: { jersey: '#ffffff', number: '#0b6e4f', trim: '#0b6e4f', shorts: '#ffffff' }, // home wears light, away wears color
  court: { paint: '#0b6e4f', logoText: 'BOS', wood: 'light' | 'medium' | 'dark' }   // home team's court is used
};

PlayerLook = {
  id, teamIdx: 0 | 1, first: 'Marcus', last: 'Hill', num: 23, pos: 'PG'|'SG'|'SF'|'PF'|'C',
  height: 76,          // inches (men 72–88, women 66–80)
  weight: 205,         // lbs
  hand: 'R' | 'L',
  gender: 'm' | 'f',
  look: {
    skin: 0..7,                       // 0 = lightest … 7 = darkest
    hair: 'buzz'|'fade'|'afro'|'braids'|'locs'|'bald'|'hightop'|'curly'|'waves'|'mohawk'|'twists'|
          'ponytail'|'bun'|'long'|'bob'|'puffs',
    hairColor: '#1b1410',
    beard: 'none'|'stubble'|'full'|'goatee'|'mustache',
    headband: null | '#hex',
    armSleeve: 'none'|'left'|'right'|'both',
    legSleeve: 'none'|'left'|'right'|'both',
    shoe: '#hex', shoeAccent: '#hex',
    build: 0..1,                      // 0 slim → 1 muscular/heavy
    tattoo: 'none'|'arms'|'sleeve'|'chest'
  },
  // ratings the view may use for motion flavour (all 25–99):
  speed, agility, vert, handle
};
```

## 3. Possession object

`PBC.Sim.nextPossession(game)` returns one possession: from the moment the offense gets the ball until the
other team gains control (a made shot, defensive rebound, turnover, or end of period). Offensive rebounds do
**not** end a possession — the same object then contains more than one shot.

```js
{
  n: 57,                    // possession index in the game
  off: 0,                   // offensive team index (0 = home, 1 = away)
  period: 2,
  clockStart: 431.2,        // seconds left in the period when the possession starts
  clockEnd: 415.0,          // seconds left when it ends (0 when the period ends)
  start: 'jump_ball' | 'period_start' | 'made_basket' | 'ft_made' | 'dreb' | 'steal' | 'dead_ball',
  startSpot: { x, y },      // where the ball is when the possession starts (the rebound/steal spot,
                            // or the inbound spot for inbound starts)
  play: 'transition' | 'pnr' | 'iso' | 'post' | 'spot' | 'offscreen' | 'handoff' | 'cut' | 'none',
  setName: 'SPAIN PICK & ROLL',        // label for the TV graphic
  defScheme: 'man',                    // defense scheme key for this possession (see §5)
  events: [ Event, ... ],              // sorted by t
  endScore: [98, 95]                   // [home, away] after the possession
}
```

### Events

Every event has `type` and `t` = **game-clock seconds elapsed since the start of this possession** (so the
game clock at an event is `clockStart - t`). Events with the same `t` happen during a stoppage (free throws,
subs, timeouts) — the view inserts its own dead-ball time for those. Most events also carry `text` (a
play-by-play line) and `team` (team index).

| type | fields | meaning |
|---|---|---|
| `jump_ball` | `jumpers:[homeId, awayId]`, `winner` (team idx), `tipTo` (id) | opening tip / OT tip at center court |
| `sub` | `team`, `out`, `in` | substitution during a dead ball (appears at the start of a possession) |
| `timeout` | `team` | timeout (appears at the start of a possession, before the inbound) |
| `inbound` | `by`, `to`, `spot:'baseline'\|'sideline'`, `x`, `y` | inbound pass from out of bounds at (x,y) |
| `advance` | `handler` | ball crosses half court (backcourt → frontcourt) |
| `set` | `play`, `setName`, `handler`, `screener?`, `target?` | play is called (show the set name on screen) |
| `pass` | `from`, `to`, `kind:'chest'\|'bounce'\|'lob'\|'overhead'\|'outlet'\|'entry'\|'kick'\|'swing'\|'alley'` | a completed pass |
| `screen` | `screener`, `user`, `kind:'ball'\|'off_ball'` | a screen is set for `user` |
| `handoff` | `from`, `to` | dribble hand-off |
| `move` | `player`, `move:'crossover'\|'btl'\|'btb'\|'hesi'\|'spin'\|'jab'\|'stepback'\|'drive'\|'backdown'\|'size_up'` | dribble move / attack |
| `shot` | see below | field-goal attempt |
| `rebound` | `player` (id or `null` = team rebound), `team`, `off` (bool) | rebound secured |
| `turnover` | `player`, `kind`, `stealer?` | kinds: `bad_pass`, `lost_ball`, `offensive_foul`, `travel`, `out_of_bounds`, `shot_clock`, `three_seconds` |
| `foul` | `fouler`, `on`, `kind:'shooting'\|'personal'\|'loose_ball'\|'offensive'\|'intentional'`, `fts` (0–3) | whistle |
| `ft` | `shooter`, `made`, `num`, `of` | free throw |
| `period_end` | — | horn: period is over |

#### `shot` event

```js
{ type: 'shot', t: 12.4, team: 0,
  shooter: id,
  pts: 2 | 3,
  zone: 'rim' | 'paint' | 'mid' | 'c3' | 'ab3',
  kind: 'dunk' | 'layup' | 'reverse' | 'floater' | 'hook' | 'jumper' | 'pullup' | 'stepback' |
        'fadeaway' | 'tip' | 'alley' | 'catch_shoot',
  x: 83.1, y: 12.6,           // absolute court coords of the shooter's feet at release
  made: true,
  blocked: false, blocker: null,
  fouled: false, fouler: null, andOne: false,
  contest: 'open' | 'contested' | 'tight',
  defender: id,               // the closest defender (the one who contests)
  assist: id | null,
  pending: false,             // true only for Game Impact Moments (see §6)
  text: 'Hill makes 26-ft three (Brown assists)' }
```

A `shot` is followed (same or slightly later `t`) by either nothing (made, no foul — possession ends), a
`foul`+`ft` sequence (and-one or missed-shot foul), or a `rebound`.

### Typical sequences

* Made basket → next possession: `start:'made_basket'`, first events `inbound` (baseline, under the basket that
  was just scored on, by a big) → `advance` → `set` → … → `shot`.
* Defensive rebound → `start:'dreb'`, `startSpot` = where the rebounder caught it; usually `advance` quickly,
  often `play:'transition'`.
* Steal → `start:'steal'` → almost always `play:'transition'`.
* Non-shooting foul not in the bonus → possession continues with `foul` (fts 0) → `inbound` (sideline) → play
  resumes (shot clock resets to at least 14).
* Offensive rebound → `rebound {off:true}` then either a quick `shot {kind:'tip' | 'layup' | 'dunk'}` (putback)
  or a reset: more `pass`/`set` events and a later shot.
* End of period: last event is `period_end`; `clockEnd` is 0. The next possession starts with
  `start:'period_start'` (inbound at the half-court sideline) or `jump_ball` for overtime.

## 4. View API (`PBC.Match`)

```js
const view = new PBC.Match.View(canvas, ctx, options);   // options: { quality:'high'|'low', pixelMode:false, camera:'broadcast' }
view.play(possession, { onEvent(ev){}, onDone(){} });     // act out a possession
view.update(dtSeconds);    // advance the simulation by dt of *game presentation time* (host multiplies by speed)
view.render();             // draw a frame
view.clock();              // game clock (seconds left in period) currently shown by the animation
view.shotClock();          // shot clock currently shown
view.isIdle();             // true when no possession is playing
view.resume();             // continue after a pending GIM shot (see §6)
view.setOption(key, val);  // 'camera' | 'pixelMode' | 'quality' | 'showNames'
view.setDefScheme(teamIdx, scheme);
view.celebrate(teamIdx);   // optional end-of-game reaction
view.destroy();
```

* `onEvent(ev)` fires at the moment the event *visibly* happens: `pass` when the ball leaves the hand,
  `shot` when the ball is released, the made-basket moment is reported by calling
  `onEvent({type:'score', team, pts, shotEvent})` when the ball goes through the net, `rebound` when the ball is
  secured, `ft` when the free throw drops/misses, `sub` when the player checks in, etc.
* `onDone()` fires once the possession has been fully shown (ball secured by the next offense).
* The host drives time: `view.update(dt * speed)` then `view.render()` each animation frame. Speeds up to 16×
  must stay stable (sub-step internally). The view must never soft-lock: if choreography can't reach a spot in
  time it compresses gracefully; every `play()` ends with `onDone()`.

## 5. Defensive scheme keys

`man`, `switch`, `drop`, `blitz`, `zone23`, `zone32`, `zone131`, `boxone`, `press`, `packline`, `nothree`, `pressure`.
Zones (`zone23`, `zone32`, `zone131`) and `boxone` position defenders in zone spots that shift with the ball.
`press` picks up full court after made baskets / free throws, then falls back to man. Everything else is man-to-man
with different screen coverage (`switch` switches, `drop` sags the big, `blitz` traps the ball handler).

## 6. Game Impact Moments (GIM)

For a GIM the engine returns a possession whose final `shot` event has `pending: true` and no result yet
(`made`, `blocked`, etc. are undefined, and nothing follows it). The view plays the possession normally, and when
the shooter reaches the gather/set point of that shot it **freezes the action** (players hold their poses, crowd
keeps moving), fires `onEvent(shotEvent)` and waits. The host shows the shot-meter mini-game, then calls
`PBC.Sim.resolvePending(game, possession, quality)`, which fills in the shot result and appends the remaining
events (rebound / fouls / free throws) to `possession.events`, and finally calls `view.resume()`.
