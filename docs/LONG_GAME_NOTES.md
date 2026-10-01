# The Long Game: notes

Phase 4 of `docs/SEASON_LOOP_PLAN.md`. A career now has things that build over years: the coach you become (skills you
earn and spend), the owner you answer to (a personality with its own demands), the building (facilities that take a
summer to build), the teams you cannot stand (rivalries), the big weekend in the middle of the season (All-Star), and 60
achievements to chase.

## Where it lives

- `js/core/coach.js` (`PBC.Coach`): the coaching skills, the skill points, the achievements' new triggers.
- `js/core/staff.js` (`PBC.Staff`): coaching that matters, for every bench: `edges`, `gameEdge`, `devBonus`; AI coaches'
  ratings now follow their work.
- `js/core/office.js` (`PBC.Office`): owners with personalities and every team's facilities.
- `js/core/rivals.js` (`PBC.Rivals`): rivalries.
- `js/core/allstar.js` (`PBC.AllStar`): All-Star weekend.
- `js/ui/office.js` (+ `css/office.css`): the Coaching skills card on My Career, the **Front Office** screen (the owner,
  the facilities, your rivals, the league's best buildings) and the **All-Star Weekend** screen (the game, the contests,
  the history). The Hall has a **Rivalries** tab; the pregame shows a rivalry and the head-to-head.
- Hooks: `sim.js` (each team's coaching edge and medical staff, rivalry nights), `season.js` (rivalries after every
  game and every week, the All-Star invitations and the weekend, practice gains, weekly morale), `league.js` (a series'
  path and its end), `offseason.js` (development, free agent appeal and the Closer discount, the facilities' summer, the
  rivalries' summer, a free agent who leaves one rival for another), `trade.js` (a star traded between two teams),
  `draft.js` (scouting points and the bank, the AI's draft board, a player's OVR on draft night), `desk.js` /
  `desk_events.js` (chemistry, morale, the press and the owner's trust by skill; owner demands by personality; the
  facilities budget; trash talk heats rivalries; the All-Star invitations), `media.js` / `media_text.js` (rivalries,
  rivalry nights, the All-Star Game and the three contests), `live.js` (the pregame and a louder building on rivalry
  nights).

## Coaching skills

Five skills, five levels each: **Player Development** (practice gains +10% a level, summer growth +0.12 a rating a level
for players 26 and under, and it stays: it moves their career curve), **Motivator** (chemistry +1.5 a level, morale hits
6% smaller a level), **Tactician** (a shooting edge of 0.25% at both ends of the floor a level), **Recruiter** (free
agent interest +2.5 a level) and **Media Savvy** (the press settles 4 points higher a level, the owner's trust drops 5%
less a level). Levels 3 and 5 unlock a perk each: late bloomers and star maker, players' coach and culture, adjustments
and mastermind (the playoff edge ×1.5 and ×2), closer (free agents ask you for 4% less) and destination (your own players
re-sign more easily), spin (bad press costs half) and face of the league (the owner gives you more time).

Skill points: a winning record, the owner's goal met, each playoff series won, the Finals, a title (+2), Coach of the
Year (+2), at least one for any season (the lessons of a hard one), and the bigger achievements (+1, or +2 for the
biggest). A new career starts with 3; an older save gets two
for every season already coached. A level costs 2, 4, 6, 8 and 10 (30 to master a skill, 150 for all five): over a long
career you master two or three.

## Coaching that matters (every bench)

Each team's coach gives it small edges, centred on the league's AI benches so the league's numbers stay where they
were: a shooting edge at each end (a coach 30 rating points above the middle: 0.8% before the style), chemistry (4
points) and growth (0.3 a rating a summer for young players). The style weights them: offensive minds and defensive
specialists lean to their end, player developers grow players, motivators keep rooms together, tacticians find more in
the playoffs (×1.3). Your coach's edges are the skills you learned. AI coaches' ratings now follow their work every
season: beating the projection, a title or Coach of the Year lifts them, missing it and age wear them down.

## The owner

Every owner has a personality on top of patience and spending. **The Winner** wants wins and a deep run, and the review
swings 20% harder both ways. **The Dealmaker** wants a payroll under the tax and a full building (-5 over the tax, +3
under the cap). **The Promoter** wants stars and noise (fans at 75+: +4, under 40: -4, an All-Star: +2). **The Builder**
wants young players getting better and picks kept (their growth counts in every review; 15% more patience). **The
Meddler** wants to be heard (a favorite player's minutes; ignoring the owner at the Desk costs up to 6 points). The type
weights the owner's demand at training camp (new ones: make the playoffs, win a series, an All-Star, keep every first-round
pick, play my guy 24 minutes) and its tone, and AI owners' types move their coaches' hot seats.

## Facilities

Training center, medical staff, scouting department and arena, levels 1 to 5 (3 is the league's middle). Level effects,
from the middle: practice gains ±6% and summer growth ±0.06 a level; injuries ±7% and time out ±8% a level; scouting
points ±1 a week and the bank ±4 a level, and the AI's draft board 25% sharper or blurrier a level; fan excitement ±3 and
free agent interest ±1.2 (plus ±0.8 from the training center) a level. Points every summer: 1 + spending / 30, +1 for the
playoffs, +2 for a title, +1 for a full building (the Dealmaker -0.5, the Promoter +0.5); a level costs 3, 5, 7 and 9
points (2 to 5), and a new league starts every team with enough for one project. One project at a time; it opens at the next training camp. The preseason Desk asks where the points go.
AI teams build by their owner's taste.

## Rivalries

Heat between every pair of teams: every game (0.35; same division +0.35, a one-possession game +0.9, overtime +1.1,
two good teams +0.6), every playoff game (0.8), a playoff series (9, +2 a game past the minimum, +6 for a Game 7, +4 in
the last two rounds, +3 for an upset), a star traded between them (or leaving one for the other in free agency),
trash talk at the Desk. It cools 1.2% a week and 20% a summer. 18+ is a rivalry, 35+ bitter, 60+ a blood feud. Rivalry
nights: a little playoff edge in the engine (tighter rotations), a louder building, a tag and the head-to-head on the
pregame, previews in the press (yours every meeting once it is bitter), stories when one is born or boils over.

## All-Star weekend

With the rosters: invitations to the three-point contest (8 shooters: five racks, the last ball worth two; the top
three to a final), the dunk contest (4 dunkers, men's league: two dunks, the top two dunk twice more; five judges; a
dunk-off on a tie; a small risk of getting hurt), the skills challenge (a bracket of 8). The Desk asks whether your
invited players go. On the first day of the break: the contests and the All-Star Game (the conferences, or two captains'
teams; a fast exhibition of about 170 points a side, the MVP from the winners unless someone had a monster night). The
winners get it on their record, the press writes four stories, and the history stays.

## Achievements

60 (35 new): the long career (750 and 1,000 wins, 70 wins, five titles, a perfect run, from the ashes, Coach of the Year
three times, 20 seasons, 10 with one team), the playoffs (a Game 7, back from 3-1, beating a rival, a blood feud), your
players (three MVPs, Rookie of the Year, Defensive Player of the Year, a draft pick who grows 15, three All-Stars, the
weekend's winners, the GOAT, a Hall of Famer and a retired number you coached for five seasons), the legacy (the top 10
and the top of the greatest coaches), the front office (100 and 500 Desk answers, ten promises kept, chemistry 90, the
media at 85, the owner's demand three times, a level 5 facility, a mastered skill, every skill at 3).

## Measured

`node tools/audit/career.js --seasons 8 --seed 17 --answers random` (men's league; the stand-in coach learns the
cheapest skill it can), exit 0, no errors; the gauntlet (`tools/audit/check.js`) passes 152/152:

| | |
|---|---|
| Time | 35.1 s a season headless (34 to 35 before this phase), the summer about half a second |
| The save | 4.14 MB after eight seasons (4.03 MB in the Legacy's run): rivalries, facilities and the All-Star history add about 0.1 MB |
| Skill points | a .500-ish coach who was fired twice: 12 earned in eight seasons (before every season gave at least one); a winning season with a playoff run earns 3 to 6 |
| Rivalries | after one season the top three at heat 27 to 31 (all "Rivalry"), after eight the first bitter ones (36 to 45); no blood feud yet; about 420 pairs on record (about 40 KB) |
| All-Star weekend | game 157-184 points a side; three-point finals won with 22 to 25; dunk finals won with 88 to 98 (two 50s happen, as they do in the real contest); skills finals in 25 to 30 s |
| Coaching changes | 2 to 7 a summer, 4.25 on average, with the owners' personalities in the hot seats |
| Achievements | 12 of 60 for that coach in eight seasons |
| The women's league | two seasons, no dunk contest, captains pick the All-Star teams, 6.8 s a season |

The tuning along the way: dunk scores (the first formula gave elite dunkers 50s every time), skill points (the first
economy maxed every skill in a long career; now a long one masters two or three), the owner types' labels (gender
neutral: the Dealmaker and the Promoter), and the All-Star Game's minutes and points for each league.
