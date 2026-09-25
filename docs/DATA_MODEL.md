# Pro BBALL Coach — data model & core API

Browser game, plain JS, classic `<script>` tags, everything under `window.PBC`. Core logic lives in `js/core/*.js`
and never touches the DOM (it runs in Node too — see `test/harness.js`, which loads every `js/core/*.js` it finds,
in this order: util, names, config, player, league, stats, ai, sim, season, coach, draft, offseason, storage).

Read the source for details — this is the map.

## Modules

| Namespace | File | What |
|---|---|---|
| `PBC.U` | util.js | seeded RNG (`rand, int, range, gauss, chance, pick, pickW, pickKey, shuffle`), math (`clamp, lerp, sigmoid, logit, sum, avg, maxBy, minBy, sortBy`), formatting (`money, height, pct, pct3, num, ordinal, clock, periodName, seasonLabel, esc, shade, rgba, textOn`) |
| `PBC.Names` | names.js | name pools, colleges, countries |
| `PBC.Config` | config.js | `RATINGS` (27 ratings), `POSITIONS`, `LEAGUES.men / .women` (league rules, money, roster sizes, playoff format), team lists, `OFFENSES` (12), `DEFENSES` (12), `TEMPOS`, `FOCUS`, `CRASH`, `PRESSURE`, `AWARDS`, `ACHIEVEMENTS` |
| `PBC.Player` | player.js | `create`, `calcOvr`, `ovrAt`, `marketValue(p, L)`, `maxSalary`, `contractYears`, `rookieSalary(pick, round, L)`, `progress(p)` (one offseason of development; call after `age++`), `addTraining`, `genInjury`, `injuryLabel`, `name`, `shortName`, `isInjured`, `assignNumber(S, p)`, `strengths`, `weaknesses` |
| `PBC.League` | league.js | `create(opts)` → new state `S`; `cfg(S)`; `roster(S, tid)` (sorted by OVR); `freeAgents(S)`; `prospects(S)`; `newSeasonSetup(S)`; `makeSchedule`; `standings(S)`; `sorted(S, conf)`; `teamStrength(S, tid)`; `projectedWinPct`; `powerRankings(S)`; postseason (`startPostseason`, `postseasonGamesToday`, `recordPostseasonGame`, `roundName`, `playoffResult`); `dateLabel(S, day)` |
| `PBC.Stats` | stats.js | box-score application, season/career lines (`season(p, year, po)`, `career(p, po)`), `leaders`, records (`S.records`), `computeAwards`, `grantAwards`, `gmsc` |
| `PBC.AI` | ai.js | `autoRotation(S, tid)`, `chooseStrategy(S, tid)`, `setupTeam`, `fillRoster(S, tid, opts)`, `release(S, p)`, `payroll(S, tid)`, `daily(S)` |
| `PBC.Sim` | sim.js | the possession engine (see `docs/MATCH_API.md`) |
| `PBC.Season` | season.js | `news(S, text, type, tid)`, `startRegularSeason`, `simDay`, `endDay`, `advanceToUserGame`, `quickSim`, `completeGame`, practice (`practiceAvailable`, `applyPractice`), `endRegularSeason`, `finishPostseason`, `endSeason` |
| `PBC.Coach` | coach.js | the user's career: `create`, `setExpectations`, `recordGame`, `unlock(S, achievementId)`, `endSeason` (review/firing), `jobOffers`, `acceptJob` |
| `PBC.Store` | storage.js | `save(S)`, `load(id)`, `list()`, `remove(id)`, `exportString`, `importString` |

## The state object `S` (one career = one save)

```js
S = {
  v, saveId, created, updated,
  leagueKey: 'men' | 'women', seasonGames: 82, difficulty: 'easy'|'normal'|'hard'|'legend',
  season: 2026,               // the season is labelled 2026-27 (U.seasonLabel). Draft at the end of it = "2027 draft".
  phase: 'preseason' | 'regular' | 'playin' | 'playoffs' | 'postseason_done' | 'awards' | <offseason phases>,
  day: 0,                     // index into the regular-season calendar (and continues through the postseason)
  teams: [Team],              // index == team id
  players: { [id]: Player },  // EVERY player ever: active (tid>=0), free agents (-1), draft prospects (-2), retired (-3)
  nextPid, nextGid,
  schedule: [{ gid, day, h, a, played, hs, as, ot }],
  boxes: { [gid]: box },      // user's games this season
  playoffs: { round, rounds, playIn, series:[...], games:[...], champion, runnerUp, seeds:{tid:{seed,conf}}, done, fmvp },
  draftPicks: [{ season, round, orig, owner }],   // next 4 drafts; season = the draft year (S.season + 1 is the upcoming draft)
  userTid, coach: {...},      // see coach.js
  news: [{ season, day, phase, text, type, tid }],
  history: [{ season, champion, runnerUp, fmvp, awards, standings }],
  records, settings, practice, teamSeason: { [tid]: totals }, flags, preseasonProj: { [tid]: winPct },
  regularAwards,              // computed at the end of the regular season
}
```

### Team
```js
{ id, abbr, city, name, conf, div, market (1-5), colors: { primary, secondary, trim }, wood,
  strat: { off, def, tempo, focus, crash, pressure, goTo1, goTo2 },
  rot: { starters: [5 ids], minutes: { id: minutes }, auto: bool },
  owner: { patience, spend }, hype, history: [{ season, w, l, result, round, champ, seed }] }
```

### Player
```js
{ id, first, last, gender, age, born, pos, arch, hgt (in), wgt, wing, hand, num,
  r: { close, layup, dunk, post, mid, three, ft, drawFoul, shotIQ, handle, pass, vision, intD, perD, steal, block,
       helpD, oreb, dreb, speed, agility, strength, vert, stamina, hustle, clutch, durability },   // 25–99
  ovr, pot,                    // pot = true potential (hidden from the user for prospects / other teams unless scouted)
  tid,                         // team id, -1 free agent, -2 draft prospect, -3 retired
  contract: { amt, exp, rookie },   // amt per season; exp = last season covered (expiring when exp === S.season)
  look: {...}, pers: { money, win, loyal, pt, market, ego, work },   // personality 1–99 (for free agency)
  origin, draft: { year, round, pick, tid } | null,
  injury: { name, days, total } | null,
  stats: [{ season, tid, po, gp, gs, min, pts, fgm, fga, tpm, tpa, ftm, fta, orb, drb, ast, stl, blk, tov, pf, pm, dd, td, hiPts, hiReb, hiAst }],
  awards: [{ season, type, detail }], hist: [{ season, ovr, pot, tid, age }],
  morale (0–100), train, yearsPro, promise: null | { type:'starter'|'minutes', min, season },
  scout: { pts, known }        // prospects only: scouting knowledge 0–100 for the user
}
```

## Season flow

`League.create` → user picks a team → `Coach.create(S, name, tid)` → `S.userTid = tid` → preview magazine →
`Season.startRegularSeason(S)` → days (`Season.simDay` / live games + `Season.completeGame` + `Season.endDay`) →
`Season.endRegularSeason` (automatic) → play-in/playoffs → `Season.finishPostseason` → `Season.endSeason` → `S.phase = 'awards'`.

Offseason (owned by `js/core/offseason.js` + `js/core/draft.js`): `'awards'` → progression/aging/retirements →
`'draft_lottery'` → `'draft'` → `'resign'` → `'freeagency'` → new season (`S.season++`, `League.newSeasonSetup(S)`,
`S.phase = 'preseason'`) → preview magazine → `Season.startRegularSeason(S)`.

Money: `L = League.cfg(S)`; `L.cap`, `L.tax`, `L.apron`, `L.minSalary`, `L.maxPct`, `L.mle`, rookie scale via `Player.rookieSalary`.
The women's league uses much smaller numbers — always format with `U.money`.
