# The Legacy: notes

Phase 3 of `docs/SEASON_LOOP_PLAN.md`. The league now remembers: every team has a real head coach with a career, the
greatest players and coaches of all time are ranked, a Hall of Fame class goes in every summer, franchises retire the
numbers of their icons, the all-decade teams are picked, the career records are watched as they fall, and the save
stays lean over decades.

## Where it lives

- `js/core/staff.js` (`PBC.Staff`): the head coaches. `S.coaches = { seq, list: { [cid]: Coach } }`; `team.coachId`,
  `team.coachName` and `team.coachRating` follow the current coach (the rating is the "Head coach" factor free agents
  weigh).
- `js/core/legacy.js` (`PBC.Legacy`): the scores, the Hall of Fame, retired numbers, the all-decade teams, the career
  leaders, the save's summer cleanup. `S.legacy = { v, hof, numbers, prev, prevSeason, leaders, crowned, flags }`.
- `js/ui/legacy.js` (+ styles in `css/media.css`): **The Hall** (greatest players, greatest coaches, the Hall of Fame,
  franchises, decades, your legacy).
- Hooks: `coach.js` (a new career fills the other benches; taking a job lets that team's coach go and fills the one
  you left), `season.js` (every coach's season on the record and every player's number with his team, at the season's
  end), `offseason.js` (the carousel, the Hall class, retired numbers and the cleanup when the offseason begins),
  `player.js` (retired numbers are never handed out again), `media.js` / `media_text.js` (the carousel, the Hall
  class, a number to the rafters, a new all-time leader), `ui/league.js` (the awards table names the coach who was
  there that season).

## The coaches

Each AI coach has a name, an age, a style (offensive mind, defensive specialist, player developer, motivator,
tactician), a rating, where they came from (longtime assistant, college coach, former player, veteran head coach), a
contract, and a career: every season's record, result, playoff record, title, Coach of the Year. A new league's coaches
start with the team's old rating and no record: the league's history begins with your first season.

**The carousel**, every summer: each coach's heat comes from missing the preseason projection, losing, the owner's
patience, tenure, two losing seasons in a row, an expiring contract, and a recent title (which protects); the hotter
the seat, the likelier the firing. Coaches retire from 64 (and always at 70). Open jobs go to the best available by
rating, titles and record, with some taste: coaches fired elsewhere, assistants and college coaches getting their
first shot, and former players (leaders and smart players two to twelve seasons into retirement) who come back as
coaches.

**The all-time coaches** (`Staff.all`, your coach included): titles × 10, Finals × 3, Coach of the Year × 4, wins ×
0.025, playoff wins × 0.12, and over three full seasons (winning percentage − .500) × 40.

## The greatest players

`Legacy.profile(S, p, tid)`: titles × 6, MVPs × 7, Finals MVPs × 3.5, Defensive Player of the Year × 3, All-League
first, second and third teams × 3.5, 2.2 and 1.3, All-Star × 1.2, All-Defense × 0.7, Rookie of the Year × 1, Sixth Man
× 0.6, Most Improved × 0.4; then points / 1,800, rebounds / 1,600, assists / 1,100, steals and blocks / 600, playoff
points / 900, playoff games / 60, and the peak (the best three seasons' game score a game, over 12) × 0.45. With a
franchise (`tid`), only what was done there counts. The Hall shows the top 50 with filters (position, active or
retired, a franchise), the movement since last summer, and the active players climbing the fastest.

## The Hall of Fame

Every summer when the offseason begins: players retired at least three seasons and coaches retired at least one (with
eight seasons on a bench, or three titles), whose score clears 40, best first, four at most a class. First-ballot inductees are marked. The screen shows the
classes as plaques and who is on the ballot soon. In a 14-season test league the first class came in season 10, then
classes of one to four.

## Retired numbers

When a player retires, every franchise he played at least seven seasons for, with a franchise score of 26 or more,
retires the number he wore there (`p.numHist`, kept at each season's end). The franchise page shows its banners
(titles) and numbers; nobody on that team gets the number again.

## Career records as they fall

The all-time leader in points, rebounds, assists, threes, steals and blocks (regular season) is refreshed weekly; a
player who passes it, above a bar (20,000 points, 9,000 rebounds, 6,000 assists, 2,000 threes, 1,500 steals or
blocks), gets a story, once per player and record.

## The all-decade teams

From each season's All-League teams (first team 5, second 3, third 2), MVPs 6, Finals MVPs 3, Defensive Player of the
Year 1.5 and the All-Defense first team 0.8: two guards, two forwards and a center, a first and a second team per
calendar decade.

## The save over decades

`Legacy.compact` every summer: retired players drop their rating history (but the last), training, scouting and the
Desk's marks after a season; eight seasons after retiring, players with under 250 games, no honors of any kind, not in
the Hall, never a coach and never named in the season awards leave the save.

## Measured

`node tools/audit/career.js --seasons 12 --seed 13 --answers first` (men's league), exit 0, no errors:

| | |
|---|---|
| Coaching changes a summer | 0 to 6, about 3.4 on average (fired 0 to 5, retired 0 to 3), before the firing line was lowered a little (now 18, was 22); an 8-season run after it (seed 21) had summers of 2, 3, 8, 2, 6, 5, 8 and 3, about 4.6 |
| The first Hall of Fame classes | two coaches in seasons 7 and 8 (now they would wait for eight seasons on a bench), then a player in seasons 10 and 11 |
| Retired numbers | none for the first eight summers (nobody had seven seasons with a team yet), then 1, 3, 3 and 4 |
| Players in the save | 624 after the first summer, +72 a season until the cleanup starts (eight seasons after the first retirements), then about 1,210 and flat |
| The save | 1.59 MB after one season, 3.01 MB after five, 5.05 MB after twelve (about 0.23 MB a season late in the run) |
| Time | about 35 s a season headless, the summer about half a second |

The 14-season run while building it set the bars: with a Hall bar of 34 and numbers at a franchise score of 20 over six
seasons, 18 numbers went up, too many of them for role players with long tenures, so the bars went to 40, 26 and seven
seasons.
