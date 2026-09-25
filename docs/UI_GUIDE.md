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
UI.avatar(player, size=36)             // SVG portrait markup (skin/hair/jersey)
UI.ovr(value), UI.potLabel(p)          // chips; potLabel respects scouting knowledge
UI.playerLink(p) / UI.teamLink(t)      // clickable names (open the player card / team page)
UI.openPlayer(pid), UI.openTeam(tid), UI.openBox(gid)
UI.table(container, { columns: [{ key, label, num, fmt(row), sort(row), title }], rows, sort: 'key', desc: true,
                      rowClass(row), onRow(row, ev), compact })
UI.save()                              // autosave (debounced) — call after changing S
UI.money = PBC.U.money
```

Screens should read state from `UI.S`, mutate it through the core modules, then call `UI.save()` and `UI.refresh()`.
