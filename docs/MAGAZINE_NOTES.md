# COURTSIDE — the season preview magazine

A 15-page digital preview magazine, generated from the league state at the start of every season. It follows College BBALL Coach 2's "15-page digital preview magazine".

## Files

| File | What |
|---|---|
| `js/core/magazine.js` | Content generator. Namespace `PBC.Magazine`, no DOM, runs in Node. |
| `js/ui/magazine.js` | The reader (full-screen overlay), the `'magazine'` screen and the "Preview Mag" nav link. |
| `css/magazine.css` | Print design and reader chrome. Everything is scoped under `.mg-…`. |
| `test/magazine.js` | Node tests: `node test/magazine.js [-v] [men\|women] [seed]`. |
| `mag_test.html` | Standalone visual test page (not part of the game). Query params: `?league=women&seasons=1&page=8`. It never writes saves. |

## Load order (index.html)

```html
<!--EXTRA_CSS-->  <link rel="stylesheet" href="css/magazine.css">
<!--CORE_EXTRA--> <script src="js/core/magazine.js"></script>   <!-- anywhere after stats.js/ai.js (e.g. after coach/draft/offseason/trade) -->
<!--UI_EXTRA-->   <script src="js/ui/magazine.js"></script>     <!-- after js/ui/core.js (after app.js is ideal) -->
```

The UI file registers the `'magazine'` screen right away. It adds the nav link on `DOMContentLoaded`, so the link lands at the end of the League group, after the app's own links. If it loads before `js/ui/core.js`, it waits for `DOMContentLoaded` before registering.

## API

```js
PBC.Magazine.build(S)          // -> { v, season, leagueKey, userTid, mast, title, seasonName, league, built, pages: [15] }  (pure; own seeded RNG)
PBC.Magazine.ensure(S)         // -> S.magazine, rebuilt only when stale (new season, different user team, old format)
PBC.Magazine.isStale(S)
PBC.Magazine.shouldAutoOpen(S) // true in 'preseason' until this season's issue has been opened once
PBC.Magazine.open(S?, { page, onClose }) // full-screen reader; S defaults to PBC.UI.S. Marks the issue seen and autosaves.
PBC.Magazine.close(), PBC.Magazine.isOpen()
PBC.Magazine.expectation(S)    // { label, wins, pct } — the owner's goal as the magazine computes it
```

- **Determinism:** the issue is seeded from `saveId + season + leagueKey`. Building never advances the game RNG (the test checks this), and the same save and season always print the same issue.
- **Storage:** `S.magazine` holds data only (strings, numbers, tids, pids), about 40–55 KB of JSON. The reader also stores `lastPage` and `seen` on it. Colors, badges and portraits come from `S` at render time, so nothing is duplicated in the save.

## Pages

Men: cover · editor's letter + contents · top storylines · power rankings 1–15 · 16–30 · East preview · West preview · your team · top 10 players · award predictions (with odds) · rookie class (or draft watch) · offseason report card (roster report card in year one) · coaches' corner · last season in review (five things to watch in year one) · bold predictions + Finals pick + ad parody.

Women's league: one power-rankings page (1–12), then a "position by position" feature to keep 15 pages. Conference previews show projected league-wide seeds, because the top 8 overall make the playoffs.

## Requests for the lead

1. **index.html:** add the three tags above.
2. **Harness:** add `'magazine'` to the `CORE` list in `test/harness.js`, after `'offseason'`. The test also loads the file itself if it's missing.
3. **Auto-open after the real offseason.** `App.beginCareer` and the fallback offseason already call `PBC.Magazine.open(S)`. The `PBC.Offseason` path doesn't yet: after `Offseason.finish` (or `autoAll`) lands in `'preseason'`, please call:
   ```js
   if (PBC.Magazine && PBC.Magazine.shouldAutoOpen(S)) PBC.Magazine.open(S);
   ```
4. **Optional data that would make the review page better:**
   - The Finals series score in `S.history[i]` (e.g. `finals: [4, 2]`), so the review page can say "in six".
   - Last season's preseason projection saved in history. `S.preseasonProj` is overwritten by `newSeasonSetup`, so the hot-seat and "biggest surprise / flop" logic currently compares each team's finish to its end-of-season roster rank instead.
5. **AI coach names:** if you ever fill `team.coachName`, the magazine uses it. Otherwise it prints a stable "Coach <Last name>" per team and save.
6. **Season label:** the magazine calls the women's season "2026", since it runs May–Sep in one calendar year. The rest of the app uses `U.seasonLabel` ("2026-27"). Say if you want them consistent.
7. **FYI, `UI.avatar` and `UI.teamBadge` use fixed gradient ids** (`av<pid>…`, `tbg<tid>…`). When the same player or team appears twice in the document and the first copy is inside `display:none`, Chrome stops painting the gradients on the other copies. The magazine uniquifies ids on every insertion; you may want to do the same in core.js. The magazine also overrides app.css `.av` (circle and background) inside its portraits.
8. **z-index:** the reader is `190`, above `#fullscreen` (50) and below modals (200), toasts (300) and `UI.busy` (400).

## Reader behaviour

- **Modes:**
  - **Spread:** two pages side by side with a 3D page flip. The cover sits alone on the right.
  - **Single:** one fixed page with a page-turn animation.
  - **Flow:** phones and short windows. Pages have natural height, scroll vertically, and turn with a horizontal swipe.
- **Readability:** fixed-layout pages need to be at least 560 px wide, otherwise the reader uses flow. The **Aa "Reading mode"** button (or `R`) forces flow with larger type; the choice persists in `localStorage` under `pbc_mag_reading`.
- **Auto-fit:** if a fixed page overflows, its type scale (`--k`) shrinks until it fits.
- **Keys:** ←/→, PgUp/PgDn, Space, Home/End, `T` for thumbnails, `R` for reading mode, Esc to close. Clicking a page's outer edge turns it.
- **Thumbnails:** the strip shows live miniatures of every page. It overlays the bottom of the stage and opens by default only on large screens.
- **Accessibility:** the reader is `role="dialog"` with a focus trap. Focus returns to where it was on close, and `prefers-reduced-motion` switches animations to a crossfade.
- **Robustness:** animations have a timeout fallback, so hidden tabs never leave the reader stuck.
