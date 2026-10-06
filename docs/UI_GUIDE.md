# Pro BBALL Coach — UI guide (for anyone adding screens)

The UI is plain DOM: screens render HTML strings into a root element and use delegated events.
Framework: `js/ui/core.js` (namespace `PBC.UI`). Styles: `css/app.css` (design tokens + components).
Each feature adds its own `js/ui/<feature>.js` and, if needed, `css/<feature>.css` (scope rules under a class,
e.g. `.mag-…`, `.fa-…`). Don't restyle global elements.

## Look & feel
Dark sports-broadcast app (think NBA app / ESPN): deep navy background, raised panels, bold condensed uppercase
headings, tabular numbers, team colors as accents. Clean, dense but readable, generous spacing. Must work from
~1100 px wide down to phone width (grids collapse to one column).

## Design tokens (css/app.css `:root`)
`--bg --bg2 --panel --panel2 --panel3 --line --line2 --text --muted --dim --accent --accent2 --good --bad --warn
--info --gold --team --team2 --radius --radius-sm --font-ui --font-display --font-num --shadow`
(`--team`/`--team2` = the user's team colors, set at runtime.)

## Component classes
- Page: `.page` (screen root), `.page-h` (header: `h1` + `.actions`), `.sub` (subtitle line under h1)
- Layout: `.grid.g2|.g3|.g4` (responsive columns), `.row` (flex, gap, wraps), `.col`, `.spacer`, `.stack` (vertical gap)
- Cards: `.card` > `.card-h` (`h3` + optional `.actions`) + `.card-b`; `.card.flat`, `.card.accent` (team-color top border)
- Buttons: `.btn`, `.btn.primary`, `.btn.ghost`, `.btn.danger`, `.btn.good`, `.btn.sm`, `.btn.lg`, `.btn.block`
- Tabs: `.tabs` > `button.tab` (+ `.active`)
- Tables: `table.tbl` (`.compact`, `.hover`); `th.num`/`td.num` right-aligned tabular numbers; `tr.me` = user's team row;
  sortable via `UI.table()`
- Badges: `UI.ovr(78)` → colored OVR chip; `.tag` (+ `.good .bad .warn .info .accent .gold`); `.pill`
- Meters: `.meter` > `.meter-fill` (set `style="width:62%"`; add `.good|.warn|.bad`); `UI.ratingBar(label, value)`
- Stat tiles: `.stat` > `.v` (big number) + `.l` (label); `.stats-row` lays tiles in a row
- Text: `.muted`, `.dim`, `.num`, `.big`, `.center`, `.right`, `.nowrap`, `.small`, `.up` (uppercase display font)
- Lists: `.list` > `.li` (row with hover); `.kv` (key/value grid)
- Empty state: `.empty`

## PBC.UI API
```js
UI.S                                   // current career state (getter), or null on the title screen
UI.register('key', { title, render(root, params), onLeave() })   // define a screen
UI.go('key', params)                   // navigate (re-renders the main area, updates the nav)
UI.refresh()                           // re-render the current screen (and the top bar)
UI.addNav({ key, label, icon, group, show(S) })   // add a sidebar link (show() decides visibility)
UI.registerPhase(phase, { label, screen, run(S) })  // what the top-bar CONTINUE button does in a phase
UI.h(html)                             // HTML string -> Element (first element)
UI.on(root, 'click', '[data-act="x"]', (ev, el) => {...})   // delegated events
UI.modal({ title, body, actions: [{ label, cls, onClick(close) }], wide, onClose }) -> { el, close }
UI.confirm(message, { ok: 'Yes', cancel: 'Cancel', danger }) -> Promise<boolean>
UI.toast(message, 'good'|'bad'|'info')
UI.teamBadge(team, size=28)            // SVG badge markup
UI.avatar(player, size=36, opts)       // pixel-art portrait <img> (PBC.Portrait): face, hair, jersey, personality expression
UI.portrait(player, size, opts)        // larger studio portrait for cards and the magazine (opts.bg, opts.face, opts.ctx.mood: 'win' | 'loss' | 'clutch')
UI.ovr(value), UI.potLabel(p)          // chips; potLabel respects scouting knowledge
UI.playerLink(p) / UI.teamLink(t)      // clickable names (open the player card / team page)
UI.openPlayer(pid), UI.openTeam(tid), UI.openBox(gid)
UI.styleTag(p, nBadges=3)              // a player's play style (icon and label) and best badges as small chips (PBC.Style, PBC.Badges)
UI.badgeChip(badge, small)             // one badge from PBC.Badges.list(p) as a chip in its tier's color
UI.table(container, { columns: [{ key, label, num, fmt(row), sort(row), title }], rows, sort: 'key', desc: true,
                      rowClass(row), onRow(row, ev), compact })
UI.save()                              // after changing S: writes when the autosave policy allows it, otherwise marks the career unsaved
UI.saveNow({ silent })                 // always writes now (Save button, Ctrl/Cmd+S, new career)
UI.backupNow(reason), UI.saveAs()      // rotating backup / named save slot
UI.guardUnsaved(doing) -> Promise<bool>  // asks before leaving a career with unsaved changes
UI.teamUniform(t, home), UI.teamCourt(t), UI.teamArena(t)   // Team Editor look with defaults
UI.openTeamEditor(tid)
UI.openPlayerEditor(pid, { tab: 'ratings' | 'looks' | 'tend' | 'pers' | 'char' })   // the editor ('main' still opens the ratings)
UI.ModelView: new UI.ModelView(canvas, { look, team, move, view })   // a player's in-game 3D model on its own (js/ui/model3d.js):
                                       //   setLook(look, team), setMove(key), setView('full'|'upper'|'face'), spin(on), destroy();
                                       //   ModelView.MOVES, ModelView.VIEWS, ModelView.available(), ModelView.plainTeam()
UI.playerLook(p, teamIdx), UI.teamLookOf(t, home)   // a player / team dressed the way the live game dresses them (js/ui/live.js)
UI.PC.stats / log / awards / prog(S, p, el, go)     // the player card's career tabs (js/ui/pcareer.js); UI.PC.pills(p, n) the honors pills
UI.AWARD_KIND[type] -> { i (icon), l (label), g (group), o (order) }, UI.AWARD_LABEL[type]   // every award type
UI.money = PBC.U.money
```

Screens should read state from `UI.S`, mutate it through the core modules, then call `UI.save()` and `UI.refresh()`.

## The player card's career tabs (js/ui/pcareer.js, css/pcard.css)

- **Header**: the honors as pills (`UI.PC.pills`: "💍 2× Champion", the seasons in the tooltip; a click opens Awards).
- **Stats**: regular season or playoffs; per game, totals, per 36 or advanced (TS%, eFG%, 3PAr, FTr, AST/TO, game score,
  +/-, double- and triple-doubles). A row a season with his age and team; a trade season shows TOT and then each team;
  the career row and, for a player of several teams, his career with each. A stat title season has that cell in gold;
  ★ All-Star, 🏆 MVP, 💍 title by the season. "log" opens that season's games. This season and the career at a glance on top.
- **Game Log**: any player, any season kept (the season picker), all / regular season / playoffs; the summary and the
  season's highs, a bar a game (PTS, REB, AST, game score or +/-; wins and losses in their colors, the playoffs outlined,
  the average as a line), then every game (newest first, a line where he was traded, a gold box on a career high, a box score
  when the user's team kept one). It says so when a season's log was not kept (Settings → Save data → Game logs).
- **Awards**: the trophy case (a tile a kind: count and seasons; All-League by team), milestones and records, career highs
  (regular season and playoffs, with the date and the opponent), double- and triple-doubles, his three best games, and
  every season's honors.
- **Progression**: OVR (and potential where it is known: his own team, 28 and older, retired) over the seasons from where
  he started to now or to the ratings he retired with, the peak in gold; the story (peak, the last change, the career's,
  the biggest rating moves); every rating by season (the change from the year before or since the start, in green and red).

## The player editor (js/ui/editor.js, js/ui/model3d.js, css/editor.css)

The left column is the player as the game shows him: the in-game 3D model (the live game's own actor, ball, moves and
renderer in a world of one: drag or arrow keys to turn him, the wheel to zoom, a double click to reset; framed full body,
upper body or face; home or away uniform; stand, triple threat, dribble, dribble moves, jump shot, defense, jog, celebrate),
the portrait and the pixel sprite, the live OVR against what he was (and his OVR at his best positions, his play style),
the badges his ratings give him (new ones and tier changes marked, lost ones struck through), and the changes so far (the
list in the tooltip, Undo with Ctrl/Cmd+Z, Reset all). The tabs: Ratings (a slider and a number each, the change and ↺ back
to what it was, a group's or every rating ±1, Shift + arrows by 5, find a rating), Looks & Body (identity, body with
feet and inches, appearance, a random look), Tendencies, Personality, Contract & Health. Nothing is saved until Save.
