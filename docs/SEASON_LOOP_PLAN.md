# The long season: a deep loop, a living media, a league with a history

Asked for by the user: the season loop is boring. The game has to be deep, with always something to do; a media
that follows the league's storylines; the greatest players and coaches of all time; a save you can play for 40 hours.

40 hours is 15 to 25 seasons at 1.5 to 3 hours a season. So a season has to give you something to decide every day
or two, something worth reading every day, and something to chase over years.

Ground rules (the same as the gameplay plan): nothing that works is rewritten. New systems are new modules
(`js/core/desk.js`, `media.js`, `legacy.js`, `staff.js`) with small hooks in the existing ones; every new piece of
state initializes itself lazily, so old saves load; the season's simulated games keep their numbers (the engine is
only touched where it says so, behind a setting); a headless season stays around 30 s; the save grows by a bounded
amount a season.

## How it works now (October 2026)

- **The loop**: Play Game / Quick Sim / Sim Week / Sim to End on Home; the pregame screen; live or quick games;
  weekly practice (assistants run it if you skip it); trades until the deadline; free agents in season. Between games
  you are never asked anything: no inbox, no decisions. The cues are passive (the 14 newest news lines on Home, result
  toasts, the practice and scouting dots, the owner card).
- **People**: player morale (minutes, winning, promises) drives trade requests, re-signing and free agency, but never
  the games; personalities (7 traits, 12 types); no team chemistry, no relationships, no staff. AI coaches are a name
  the magazine makes up and a fixed rating: no records, never fired or hired. The owner is two numbers (patience,
  spend); `team.hype` is generated and never read.
- **The front office**: contracts and the cap, the draft with scouting fog, re-signing, free agency with promises,
  trades with AI valuation and AI-to-AI deals (the AI never offers you a trade), development, aging and retirements.
- **The coach's career**: owner goals, owner mood, job security, the end of season review, getting fired, job offers,
  25 achievements, Hall of Fame points.
- **The media**: a plain news feed (400 lines, about a season and a third; 40% of it injuries) and the 15-page
  preseason magazine. No in-season stories, no press conferences.
- **History**: champions, awards, All-League teams, standings per season; every player ever with his season lines and
  awards; top-10 single-game records; an All-Time list on the records screen. Lost every season: past schedules, box
  scores and playoff brackets. No player Hall of Fame, no retired numbers.
- **Measured**: a headless season 31-33 s, an offseason 0.4-0.5 s; the save 0.8 MB new, then +0.34 MB a season
  (4.5 MB after 10 seasons: players 3.4 MB, teams 0.5 MB).

## The four pillars

1. **The Desk**: always something to do. An inbox of real decisions every day or two, from your players, the owner,
   the media, your staff and the other 29 front offices, each with consequences you live with.
2. **The Media**: stories that build. Streaks, slumps, breakouts, award races, milestones, rivalries, hot seats, trade
   rumors and contract years, opened, followed and closed by recurring writers with their own voices.
3. **The Legacy**: all-time greats (players and coaches), a Hall of Fame class every summer, record books, banners and
   retired numbers, and your own coach climbing the all-time list.
4. **The Long Game**: owners with personalities, rivals that grow over years, the big nights of the calendar, and a
   coach who gets better with experience.

## Phase 1: The Desk (the daily loop)

Built: `docs/DESK_NOTES.md`.

- **The Desk** (`js/core/desk.js`): items of three kinds: decisions (the sim stops for them), messages and reports
  (read when you like), opportunities (answer before a deadline or they go away). Each comes from a template with a
  trigger, a cooldown and options; each option has effects and can schedule a follow-up (a promise checked ten games
  later, a feud that flares again).
- **About 40 situations to start**: a player wants more minutes, a bigger role, the ball more, a rest night; two
  players clash; a veteran offers to mentor a rookie; a player is late to film; a star in his contract year asks about
  an extension; a trade request escalates; the owner's preseason goals and mid-season check-ins, his favorite player,
  his push for a splash trade; a press conference after a big win or loss and before a rivalry game; a controversial
  quote; trash talk from a rival; the trainer's injury warning; an assistant's game-plan tip; a scout's sleeper
  prospect; a charity event; an award campaign; an All-Star snub; a milestone; exit interviews (each player's summer
  focus); and **trade offers from the other front offices** (built on the existing trade valuation).
- **Consequences**: morale (exists), team chemistry (new, per team), owner trust (job security and owner mood),
  fan support (`team.hype`, finally used), your standing with the media (new), development, promises (the existing
  promise and credibility system), fines and suspensions.
- **On the court** (behind a League Setting, on by default, small): chemistry and morale nudge each player's starting
  confidence in the engine's existing confidence system; the league average is unchanged.
- **The screens**: the Desk (inbox with decision cards, portraits, what each answer is likely to do), a Today card and
  a badge on Home, and the sim buttons stopping when something needs you (a setting: everything, important only,
  never). A weekly digest after Sim Week.

## Phase 2: The Media (storylines)

Built: `docs/MEDIA_NOTES.md`.

- **The story engine** (`js/core/media.js`): detectors run each day and week over the league and open, update and close
  stories: win and losing streaks, hot and cold players, breakouts and slumps, the award races (MVP voting is already
  computed and never shown), the rookie watch, milestones and record chases, injuries to stars and how the team holds up,
  revenge games, rivalry games, coaches on the hot seat, trade rumors (built from trade requests, contract years and team
  needs, building to the deadline), the tank race, the playoff race, overachievers and collapses against the preseason
  projections, farewell tours, contract-year pushes, All-Star picks and snubs, playoff series (upset alerts, sweeps,
  Game 7s), dynasty watch; in the summer the draft board, free agency and the coaching carousel.
- **The writers**: a handful of outlets and reporters made for each league (the national insider, the numbers analyst,
  the hot-take columnist, your beat writer, a beat writer for each rival), each with a voice. Articles are written from
  template banks with variety, the way the magazine already writes (seeded, so a save always reads the same).
- **Weekly**: power rankings with a line each, the award ladders, the rumor mill, "this day in league history" from the
  archives.
- **Press conferences** through the Desk: your tone (confident, humble, deflect, call out, praise) moves morale, the
  owner, the fans, the media and the next opponent.
- **The screen**: the Media hub (front page, the outlets, rankings, ladders, rumors, your clippings, the archive), the
  headline of the day on Home, the booth mentioning live storylines during games, a cleaner news feed with filters.

## Phase 3: The Legacy (history)

Built: `docs/LEGACY_NOTES.md`.

- **Coaches as people** (`js/core/staff.js`): a head coach for every team with a name, age, style and rating, a
  contract and a career record; firings and hires every summer (the coaching carousel, with the media covering it);
  Coach of the Year goes to the coach, not the team; your coach is one of them on every list.
- **All-time lists** (`js/core/legacy.js`, from the existing All-Time score): the greatest players (titles, MVPs,
  Finals MVPs, All-League, All-Star, defense, career totals, peak seasons) and the greatest coaches (wins, win rate,
  playoff wins, titles, Finals, Coach of the Year), by position, franchise and era; active players climbing the list
  as stories.
- **The Hall of Fame**: a class every summer (players a few seasons after they retire, coaches too), induction night,
  the Hall's screen with plaques; numbers retired by the franchises and banners in the arena.
- **Record books**: single game (exists), season and career records kept as they fall, league and franchise; record
  chases as stories.
- **League archives**: every season's bracket, All-League teams, draft, the champions' rosters; all-decade teams.
- **The save**: retired players keep what history needs (season lines, awards, look) and drop the rest, so 25
  seasons stay well under 10 MB.

## Phase 4: The Long Game

- Owners with personalities (money, winning, image, patience, meddling) and goals that move with the season; budget
  choices (training, medical, scouting facilities) that pay off over years.
- Rivalries between teams that heat up with playoff meetings, close games, trades and trash talk; rivalry games on
  the schedule, in the media and louder in the arena.
- The big nights: All-Star weekend (the game and the contests), trade deadline day, the lottery, draft night, awards
  night, Hall of Fame night.
- Your coach grows: skill points from achievements and seasons, spent on development, motivation, tactics, recruiting
  and media; 50+ achievements.

Built: `docs/LONG_GAME_NOTES.md` (the trade deadline, the lottery, draft night, awards night and Hall of Fame night were
already written up by the Media and the Legacy; the All-Star weekend is new).

## Phase 5: Pace and polish

- A calendar with the key dates, the weekly digest, a season documentary recap, tips for new careers.
- The loose ends the code map found: the exact OVR of prospects showing on the player card header, the practice
  comment that says the sim stops for practice, unused fields (`autoPractice`, `S.allStars`), past playoff brackets.

## Verification (every phase)

- A headless career (`tools/audit/career.js`): 20 seasons with a stand-in user answering the Desk by simple rules; no
  errors; decisions per season, stories and articles per week, Hall of Fame classes per summer, the all-time lists, the
  record books; the save after 20 seasons; the time per day; the season's numbers against the build before.
- The browser: the screens rendered and clicked through with Playwright, screenshots checked.
- The gauntlet (`tools/audit/check.js`) still passes.
