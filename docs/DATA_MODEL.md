# Pro BBALL Coach — data model & core API

Browser game, plain JS, classic `<script>` tags, everything under `window.PBC`. Core logic lives in `js/core/*.js`
and never touches the DOM (it runs in Node too — see `test/harness.js`, which loads every `js/core/*.js` it finds,
in this order: util, names, config, player, persona, tendency, sliders, league, stats, ai, sim, season, coach, draft,
offseason, trade, desk, desk_events, staff, legacy, media, media_text, magazine, storage).

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
| `PBC.Coach` | coach.js | the user's career: `create`, `setExpectations`, `recordGame`, `unlock(S, achievementId)`, `endSeason` (review/firing), `jobOffers`, `acceptJob`; coaching skills (see `docs/LONG_GAME_NOTES.md`): `SKILLS`, `skill(S, key)`, `skillFor(S, tid, key)`, `addSP`, `canLearn`, `learn`, `seasonsCoached(S, p)` |
| `PBC.Tendency` | tendency.js | player tendencies (`KEYS`, `GROUPS`, `get(p)`, `generate`, `refresh`, `reset`, `sim`), generated from ratings, position, archetype and personality; the engine uses them for shot selection, play types, passing, crashing, gambling and fouling |
| `PBC.Style` | style.js | play styles (`LIST`: 18 of them, Floor General to Hustle Big; `of(p)` his style, `detect(p)` the one his ratings fit, `set(p, key \| 'auto')`, `mods(p)` / `modsOf(key)` what it changes, `court(p)` the live court's part, `leagueMean(S)` for centering); the engine reads them for usage, play calls, roles, shot zones and kinds, passing and the shot he waits for, the court for attacking, dribble combos, passing flair, off-ball movement, post moves and on-ball defense |
| `PBC.Badges` | badges.js | badges in tiers (`TIERS` Bronze, Silver, Gold, Hall of Fame; `LIST`: 29 in six categories; `of(p)` → `{ key: tier }`, `list(p)`, `counts(p)`, `tierOf`, `progress(p, key)`; `K` what each tier does in the engine; `leagueMean(S)` the league's mean tiers for centering; `court(p)` the live court's part); earned from ratings (a few from personality), the Badge Impact slider scales them |
| `PBC.Sliders` | sliders.js | gameplay sliders and league behaviour (`GROUPS`, `DEFS`, `PRESETS`, `get(S)`, `set`, `applyPreset`, `reset`, `simMods(S)` for the engine, `league(S)` for progression, aging, morale, trade requests, contracts, loyalty and AI trades) |
| `PBC.Desk` | desk.js, desk_events.js | the front office inbox (see `docs/DESK_NOTES.md`): items (decisions, offers, messages) from templates with triggers, cooldowns, deadlines and default answers; follow-ups; effects (`fx`: morale, team chemistry, the owner's trust, fans, the media, confidence, training, promises); `daily`, `weekly`, `afterGame`, `phase(S, key)`, `review` (hooked from season.js and offseason.js); `answer(S, id, k)` → `{ text, nav, fx }`; `open`, `stopping`, `shouldStop`, `autoAll`; team chemistry `chem(S, tid)` and the engine's `confMod(S, tid)`; `pitchBonus` (free agency) |
| `PBC.Media` | media.js, media_text.js | the league's press (see `docs/MEDIA_NOTES.md`): writers, stories and articles from detectors on every game (`game`), day (`daily`), week (`weekly`) and the season's moments (`trade`, `request`, `allStar`, `deadline`, `endRegular`, `champion`, `offseason`, `quote`); `render(S, article)` → `{ h, d, b, by }`; `front`, `ladders`, `boothLines`, `onThisDay`; `newSeason` archives |
| `PBC.Staff` | staff.js | the head coaches as people (see `docs/LEGACY_NOTES.md`): `ensure`, `of(S, tid)`, `endSeason`, `carousel` (firings, retirements, hires), `userTakes`, `vacated`, `all` (every coach and you, ranked), `score`, `coachIn(S, season, tid)` |
| `PBC.Legacy` | legacy.js | the league's history: `profile` / `greats` (the all-time players), `summer` (the Hall of Fame class, retired numbers, last season's ranks), `induct`, `retireNumbers`, `retiredNums`, `refreshLeaders` / `passed` (career records as they fall), `decades`, `compact` (the save over decades) |
| `PBC.Office` | office.js | owners with personalities (`TYPES`, `owner(S, tid)`, `review`, `patience`, `heat`) and every team's facilities (`FAC`, `fac(S, tid)`, `upgrade`, `summer`, `newSeason`, and the effects `devBonus`, `practiceMult`, `injuryMult`, `recoveryMult`, `scoutPoints`, `scoutBank`, `draftNoise`, `fanBonus`, `appeal`); see `docs/LONG_GAME_NOTES.md` |
| `PBC.Rivals` | rivals.js | rivalries: heat between pairs of teams (`game`, `series`, `move`, `trash`, `add`, `weekly`, `summer`), `level(S, a, b)`, `h2h`, `of(S, tid)`, `top(S)`, `historyLine` |
| `PBC.AllStar` | allstar.js | All-Star weekend: `announce` (the invitations, with the rosters), `due`/`run` (the contests and the game on the first day of the break), `userInvites`, `holdOut`, `latest` |
| `PBC.Story` | story.js | the season documentary: `season(S)` → `{ title, chapters: [{ kick, h, p }], heads }` (see `docs/POLISH_NOTES.md`) |
| `PBC.Persona` | persona.js | player personality types (`TYPES`, `of(p)`, `info`, `face(p, { mood })`, `blurb`) used by portraits, the booth and the player card |
| `PBC.Store` | storage.js | saves in IndexedDB (localStorage fallback). Latest save per career: `save(S, { backup, backupCount })`, `load(id)`, `list()`; named slots and rotating backups: `saveSlot`, `saveBackup`, `pruneBackups`, `listAll()`, `listCareer(id)`; `remove`, `removeCareer`, `rename`, `copy`; files: `exportString`, `importString` (new id). Each record is `{ id, data, meta }` plus a small index record `'#meta:' + id` so lists never load full saves. Ids: main = `S.saveId`, slot = `saveId::slot::<time>`, backup = `saveId::backup::<k>` |

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
  userTid, coach: {...},      // see coach.js; coaching skills: coach.skills { dev, mot, tac, rec, med } (0-5), coach.sp, spTot, spLog, lastSP, mvps
  news: [{ season, day, phase, text, type, tid }],
  history: [{ season, champion, runnerUp, fmvp, awards, standings, finals, preseasonProj,
             bracket: [{ r, c, hi, lo, w, win, sh, sl }], playIn: [{ c, st, hi, lo, win }] }],
  records, settings, practice, teamSeason: { [tid]: totals }, flags, preseasonProj: { [tid]: winPct },
  // settings.autosave: 'always' | 'game' | 'week' | 'phase' | 'off'; settings.backupCount 0-10 (default 3)
  sliders: { v, preset, <slider key>: 0-100, tradeRequests: bool },   // created lazily by PBC.Sliders.get(S)
  regularAwards,              // computed at the end of the regular season
  desk: { v, tick, seq, items: [Item], cd, fu, chem: { [tid]: 0-100 }, bond: { [tid]: ± }, media: 0-100, m0, c0,
          staff, press, captain: { [season]: pid }, demand, splash, pitch, own: { season, v }, flags, log },
                              // the Desk (js/core/desk.js), created lazily; settings.deskStop: 'important'|'all'|'never'
  media: { v, seq, sseq, writers, stories, arts: [{ id, sid, k, w, season, day, phase, tid, tids, pid, pri, user, data, seen }],
           archive: [{ season, list: [{ id, k, h, d, ... }] }], form, tst, rank, ladder, nights, flags },
                              // the Media (js/core/media.js), created lazily; articles are data, written by media_text.js
  coaches: { seq, list: { [cid]: { id, first, last, age, tid, rating, style, from, hired, contract, seasons, tot, fired, retired } } },
  rivals: { v, pairs: { 'a-b': { heat, peak, peakSeason, g: [winsA, winsB], po: [{ season, round, w, winner, g7 }], last: { season, day, why }, born } } },
  allStarWknd: { season, day, invites: { three: [pid], dunk: [pid], skills: [pid] }, out: [pid], done },
  allStarHist: [{ season, three, dunk, skills, game }],   // every All-Star weekend (js/core/allstar.js)
  tips: { seen: { [screen]: 1 }, visited: { [screen]: 1 }, startDone },   // tips for a new career (js/ui/polish.js)
  legacy: { v, hof: [{ id, kind, season, name, pid, cid, tid, score, first, years, honors, line, coach }], numbers: { [tid]: [{ num, pid, season, name }] },
            prev, prevSeason, leaders, crowned, flags },
}
```

### Team
```js
{ id, abbr, city, name, conf, div, market (1-5), colors: { primary, secondary, trim }, wood,
  strat: { off, def, tempo, focus, crash, pressure, goTo1, goTo2 },
  rot: { starters: [5 ids], minutes: { id: minutes }, auto: bool },
  coachId, coachName, coachRating,   // the head coach (PBC.Staff; the user's team: S.coach)
  owner: { patience, spend, name, type },   // type: winner | money (the Dealmaker) | showman (the Promoter) | builder | meddler (PBC.Office)
  fac: { train, med, scout, arena (1-5), pts, build: { key, at, lvl } | null, hist },   // facilities (PBC.Office)
  hype (fans 0-100, moved weekly by the Desk), history: [{ season, w, l, result, round, champ, seed }],
  // Team Editor (all optional; UI.teamUniform / UI.teamCourt / UI.teamArena give the defaults when missing)
  badge: { shape }, arena: 'name',
  uniforms: { home: { jersey, number, trim, shorts }, away: { ... } },   // '#hex'
  court: { wood: 'light'|'medium'|'dark', paint, logoText, apron },       // t.wood mirrors court.wood
  defaultStrat,                // AI teams: keep these systems through the offseason
  orig }                       // the league's original values (Reset in the Team Editor restores them)
```

### Player
```js
{ id, first, last, gender, age, born, pos, arch, hgt (in), wgt, wing, hand, num,
  r: { close, layup, dunk, post, mid, three, ft, drawFoul, shotIQ, handle, pass, vision, intD, perD, steal, block,
       helpD, oreb, dreb, speed, agility, strength, vert, stamina, hustle, clutch, durability },   // 25–99
  ovr, pot,                    // pot = true potential (hidden from the user for prospects / other teams unless scouted)
  tid,                         // team id, -1 free agent, -2 draft prospect, -3 retired
  contract: { amt, exp, rookie },   // amt per season; exp = last season covered (expiring when exp === S.season)
  look: {...},                 // look.face: portrait expression override ('auto' or a PBC.Persona face key)
  pers: { money, win, loyal, pt, market, ego, work, type },   // traits 1–99 (free agency, morale); type = personality
                               // override (PBC.Persona type key), otherwise derived from the traits
  origin, draft: { year, round, pick, tid } | null,
  injury: { name, days, total } | null,
  stats: [{ season, tid, po, gp, gs, min, pts, fgm, fga, tpm, tpa, ftm, fta, orb, drb, ast, stl, blk, tov, pf, pm, dd, td, hiPts, hiReb, hiAst }],
  awards: [{ season, type, detail }], hist: [{ season, ovr, pot, tid, age }],
  morale (0–100), train, yearsPro, promise: null | { type:'starter'|'minutes', min, season, tid, desk, gp0, min0, gs0 },
                               // (a promise made mid-season through the Desk is judged from the day it was made)
  deskTalk, deskShop, deskOneMore, miles: ['pts10000', ...], summer: { season, focus },   // the Desk's marks
  numHist: { [tid]: num },     // the number he wore with each team (retired numbers); coachId: a former player now coaching
  tend: { three, mid, rim, dunk, pullup, stepback, drawFoul, iso, pnr, post, pass, push, crash, gamble, block, foul },  // 0–100
  tendCustom,                  // true once tendencies were edited (they then stop following rating changes)
  style, styleCustom,          // a play style picked in the editor (PBC.Style key, styleCustom true); without it the style
                               // follows his ratings (PBC.Style.of). Badges are never stored: PBC.Badges.of(p) from the ratings
  tradeReq: null | { season, day, reason: 'minutes'|'losing'|'promise'|'unhappy', text }, lowWeeks, nickname,
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
