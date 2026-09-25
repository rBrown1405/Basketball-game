# 🏀 Pro BBALL Coach

An NBA-style head-coach simulation in the spirit of *College BBALL Coach 2*, but pro, with a realistic
possession-by-possession game engine you can watch as a pixel-art TV broadcast.

## Play

Double-click **`index.html`** (Chrome, Edge, Safari or Firefox). No install, no internet needed.
(Optional) serve the folder instead: `python3 -m http.server 8765` and open <http://localhost:8765>.

## Saving

- **Autosave** after every change by default. In **Settings → Save data** you can switch it to after each game,
  weekly, at each new phase, or off.
- **Save** button in the top bar (or **Ctrl/Cmd+S**), **Save As** named slots (Ctrl/Cmd+Shift+S) and rotating
  **backups** (every week, every playoff day, each new phase and before the offseason).
- The **Saves** screen lists every career with its slots and backups: load, restore, rename, delete, export to
  a file and import. The title screen's **Continue** picks up your latest save.

## What's in it

- **Men's (30 teams, 82 games) or Women's (12 teams, 44 games) pro league**, fictional teams in real cities.
- **27 player ratings**, 5 positions, archetypes, potential, contracts, injuries, aging and **personalities**
  (Easygoing, Floor General, Fierce Competitor, Showman, Cocky, Hothead, Cold-Blooded and more).
- **Detailed pixel-art portraits** everywhere, with facial expressions that match each player's personality
  (a warm smile, a smirk, a cocky grin, a mean mug) and moods for big moments.
- **Manage your team**: starting five, rotation minutes, go-to players, 12 offensive systems, 12 defensive
  schemes, tempo, shot focus, glass crashing and defensive pressure. Systems have *fit* with your personnel.
- **Watch Live, like a TV broadcast**: pixel-art arena with an animated crowd, benches and cameras, player
  animations for dribbles, passes, dunks, blocks, free throws and celebrations, an auto-zooming broadcast camera,
  **instant replays** of big plays, a score bug with shot clock, timeouts and bonus, play-call tags, player
  lower thirds, run graphics, quarter recaps and a timeout team-stats panel. Arena sound: crowd, sneakers,
  swishes, horns and whistles.
- **Two-person commentary booth**: a play-by-play voice and a color analyst call the game with captions and
  spoken voices. The game picks the most natural voices your device has (Microsoft Edge's free "Natural" voices
  sound best). Optional **premium AI announcers** with your own OpenAI or ElevenLabs key (stored only in your
  browser, never in save files).
- **Playoffs feel bigger**: towels, giveaway shirts and floor decals, a louder building, a series strip on the
  score bug, and teams that tighten rotations, play harder defense and ride their stars, more so each round
  up to a Finals Game 7. A huge favorite still wins almost every game, but a hot underdog can steal one.
- **Game Impact Moments**: in clutch moments you draw up the play and hit the shot yourself with a shot meter.
- **Gameplay sliders** (League Settings): pace, fast breaks, three-point rate and accuracy, shooting by zone,
  dunks, fouls, turnovers, steals, blocks, defense, rebounding, fatigue, injuries, star usage, clutch, home
  court, upsets and playoff intensity, with presets, plus difficulty handles for your own team.
- **League behaviour settings**: player progression, rookie development, aging, morale sensitivity and trade
  requests (unhappy players can ask out), contract demands, loyalty, AI trade frequency and trade difficulty.
- **Player editor**: ratings and looks, **tendencies** (threes, mid-range, attacking the rim, dunking, pull-ups,
  step-backs, drawing fouls, isolation, pick and roll, post-ups, passing, pushing the pace, crashing, gambling,
  blocking, fouling), personality type, facial expression and characteristics.
- **Team editor**: city, name, abbreviation, colors, badge shape, home and away uniforms, court wood, paint and
  logo, arena name, market size, owner and default systems.
- **Weekly practice mini-games** develop your players (focus players improve 3× faster).
- **Full season**: All-Star selections, trade deadline, player of the week, play-in tournament, best-of-7
  playoffs, awards (MVP, DPOY, ROY, 6th Player, MIP, Coach of the Year, All-League teams, Finals MVP).
- **Offseason**: draft lottery, scouting and the draft, re-signing, free agency with front-office actions, trades.
- **COURTSIDE preview magazine** every season.
- **Stats & records**: season and career stats, game logs, box scores, league and franchise records, champions,
  awards history, all-time greats, and your career record against every team.
- **Coaching career**: owner expectations, job security, contract extensions, getting fired and hired,
  achievements and a Hall of Fame meter.

## Engine calibration (men's league, per team per game)

About 115 points, 100 possessions, 48% FG, 37 three-point attempts at 36%, 22 free-throw attempts at 77%,
44 rebounds, 27 assists, 8.5 steals, 5 blocks and 14.5 turnovers, close to modern NBA averages.
Run `node test/calibrate.js men` to check.

## Project layout

```
index.html            the game
css/                  app, screens, live game and broadcast, mini-games, magazine, offseason, editor, sliders
js/core/              simulation (no DOM): ratings, personalities, tendencies, sliders, league, engine, stats,
                      season, coach, draft, offseason, trades, magazine content, storage
js/match/             fake-3D broadcast court view (Canvas 2D) with the pixel-art renderer and replays
js/mini/              Game Impact Moment shot meter and practice drills
js/lib/procanim.js    standalone procedural animation module (dribble, crossover, chest pass, layup, two-bone IK);
                      no dependencies, works with Three.js or any engine. Demo: procanim_demo.html
js/ui/                screens, portraits, TV graphics, arena audio and the commentary booth
docs/                 engine ⇄ view contract, data model, UI guide
test/                 Node test scripts (node test/calibrate.js men, node test/procanim.js …)
```

## Credits

The 3D players are built from the MakeHuman 1.1 base mesh, targets and skeleton weights, released under CC0 1.0 by the
MakeHuman project (https://github.com/makehumancommunity/makehuman). `tools/human/build.js` regenerates
`js/match/human_data.js` from them.
