# 🏀 Pro BBALL Coach

An NBA-style head-coach simulation in the spirit of *College BBALL Coach 2* — but pro, with a realistic
possession-by-possession game engine you can watch on a fake-3D broadcast court.

## Play

Double-click **`index.html`** (Chrome, Edge, Safari or Firefox). No install, no internet needed.
Your career saves automatically in the browser; use **Settings → Export save file** to back it up.

(Optional) serve the folder instead: `python3 -m http.server 8765` and open <http://localhost:8765>.

## What's in it

- **Men's (30 teams, 82 games) or Women's (12 teams, 44 games) pro league**, fictional teams in real cities.
- **27 player ratings**, 5 positions, archetypes, potential, personalities, contracts, injuries, aging.
- **Manage your team**: starting five, rotation minutes, go-to players, 12 offensive systems, 12 defensive
  schemes, tempo, shot focus, glass crashing and defensive pressure. Systems have *fit* with your personnel.
- **Live game engine**: every possession is simulated (sets, screens, passes, shots, blocks, fouls, free
  throws, rebounds, turnovers, subs, fatigue, foul trouble, timeouts, end-of-game fouling, heaves). Watch it in
  an original pixel arena with animated crowd, benches, cameras, free throws, distinct dunk animation and
  matching pixel player cards at 1×–16×; optionally enable the local Arena Voice button for spoken calls.
- **Game Impact Moments**: in clutch moments you draw up the play and hit the shot yourself with a shot meter.
- **Weekly practice mini-games** develop your players (focus players improve 3× faster).
- **Full season**: 82 games, All-Star selections, trade deadline, player of the week, play-in tournament,
  best-of-7 playoffs, awards (MVP, DPOY, ROY, 6th Player, MIP, Coach of the Year, All-League teams, Finals MVP).
- **Offseason**: draft lottery, scouting and the draft, re-signing, free agency with front-office actions, trades.
- **Preview magazine** every season.
- **Stats & records**: season and career stats, game logs, box scores, league/franchise records, champions,
  awards history, all-time greats, and your career record against every team.
- **Coaching career**: owner expectations, job security, contract extensions, getting fired and hired,
  achievements and a Hall of Fame meter.

## Engine calibration (men's league, per team per game)

About 115 points, 100 possessions, 48% FG, 37 three-point attempts at 36%, 22 free-throw attempts at 78%,
44 rebounds, 27 assists, 8.5 steals, 5 blocks, 14.5 turnovers — close to modern NBA averages.
Run `node test/calibrate.js men` to check.

## Project layout

```
index.html            the game
css/                  app, screens, live game, mini-games, magazine, offseason styles
js/core/              simulation (no DOM): ratings, league, engine, stats, season, coach, draft, offseason, storage
js/match/             fake-3D broadcast court view (Canvas 2D)
js/mini/              Game Impact Moment shot meter and practice drills
js/ui/                screens
docs/                 engine ⇄ view contract, data model, UI guide
test/                 Node test scripts (node test/season.js, test/calibrate.js …)
```
