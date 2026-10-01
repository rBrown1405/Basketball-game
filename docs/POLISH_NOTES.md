# Pace and polish: notes

Phase 5 of `docs/SEASON_LOOP_PLAN.md`: help finding your way through a long season, and the loose ends.

## What is new

- **The calendar** (`js/ui/calendar.js`, Season → Calendar): a month at a glance with your games (home, road,
  postseason), results (click one for the box score), rivalry nights, the second night of a back-to-back, the trade
  deadline, All-Star weekend and the break, the finale. Beside it: your next eight games with what makes them matter
  (a rivalry, a back-to-back, one of the league's best), and the year's key dates, done, today or in N days.
- **The weekly digest** (the Desk's `weekly_digest`, a message from your assistant every week of the regular season):
  the week's record (from the schedule) and the season's, the standings and the move since last week, the best player
  of the week, who is out, a headline about your team, what is waiting on your desk, and next week's games with rivalry
  nights and back-to-backs.
- **The season documentary** (`js/core/story.js`, `PBC.Story.season(S)`, on the Season Recap): your season in chapters
  written from the record: training camp (the owner, the goal, the projection), the first month (the record and the
  pace), the middle of the season (the record at the break, your All-Stars and the weekend's winners, the best and worst
  streaks), the deadline (your trades), the stretch run (after the break, the finish, the close games), the postseason
  (every series), and the verdict (the owner's review, your players' awards, the achievements and skill points), with
  the season's headlines about your team.
- **Tips for a new career** (`js/ui/polish.js`): a short tip the first time you open a screen (the Desk, the Media, The
  Hall, the Front Office, My Career, the calendar, practice, trades, free agency, scouting, All-Star weekend, the lineup,
  strategy), remembered per save; "Hide tips" or Settings → Tips turns them off. A getting-started checklist on Home
  through your first season (play a game, answer the Desk, set your lineup, run a practice, read a story, learn a skill,
  meet the owner, look at the calendar).

## Loose ends

- A draft prospect's player card no longer shows the exact OVR: an estimate (~87) with the scouted range under it, and
  strengths and weaknesses only once the scouting reveals them (the ratings tab already showed ranges). The ranges sit
  on one line now.
- Past playoff brackets are kept: every season's history entry has its series (round, conference, seeds, wins, the
  winner) and the play-in, about 1 KB a season; Records & History → Champions has a "bracket" link per season.
- `autoPractice` is a setting now (Settings → Assistants run practice): no weekly reminder, the assistants run a
  lighter session every week unless you run one.
- `S.allStars` is read by All-Star weekend (Phase 4).
- The comment in `Season.advanceToUserGame` said the UI stops the sim for practice; it never did, and it says so now.
- The game's text no longer uses long dashes: sentences got plain punctuation (a colon, a comma or a full stop), and
  the empty-value placeholders in tables are a hyphen.

## Measured

`node tools/audit/career.js --seasons 3 --seed 29 --answers random`: exit 0, no errors; the weekly digest 25 or 26 a
season; 34.4 s a season when nothing else runs (39.6 s with the gauntlet running at the same time). The gauntlet passes
152/152. The screens checked in the browser at 1400 and 390 px wide: the recap's documentary, a past bracket, the
calendar, the Desk with the digest and a tip, a prospect's card; no console errors.
