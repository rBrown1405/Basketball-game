# The Media: notes

Phase 2 of `docs/SEASON_LOOP_PLAN.md`. The league now has a press corps that follows it: stories open, build and
close over weeks, written by recurring writers with their own voices, with weekly power rankings, award ladders and a
rumor mill, a front page, your own beat writer, and an archive of every season's biggest stories.

## Where it lives

- `js/core/media.js` (`PBC.Media`): the writers, the stories, the detectors (every game, every day, every week, the
  season's moments, the offseason), the archive, pruning, and the readers for the screens and the booth. No DOM.
- `js/core/media_text.js`: the words. Every article is stored as data and written on demand (`Media.render(S, a)`)
  from banks of headlines, decks and paragraphs, in the writer's voice, seeded by the article id.
- `js/ui/media.js` + `css/media.css`: the Media hub ("The League Report": front page, storylines, power rankings, the
  award races, the rumor mill, your team, the archive), the article reader, and the headline card on Home.
- Hooks: `season.js` (every game, every day and week, the deadline, All-Star, the end of the regular season, the
  champions, trade requests), `trade.js` (every trade), `offseason.js` (the lottery, the draft, each week of free
  agency, notable retirements, the new season), `desk_events.js` (the press room's questions come from the league's
  writers, and what you say makes the papers), `ui/commentary.js` (the booth mentions tonight's storylines).

## The writers

Five national voices made once per save and a beat writer for your team (the Desk's beat writer, and a new one when
you change teams):

| Role | Voice | Writes |
|---|---|---|
| Insider | sources, the calls around the league | injuries, trades, trade requests, the rumor mill, the deadline, hot seats, the lottery, free agency |
| Numbers | the stats under the record | power rankings, the award ladders, hot hands, slumps, the draft, series previews |
| Columnist | takes | streaks, surprises and flops, the MVP race, the play-in and lottery races, All-Star snubs, your boasts |
| Senior writer | history | the big nights, milestones, records, champions, retirements, series that end |
| Beat writer | your locker room | your games, your injuries, your streaks, a notebook every few weeks, your podium quotes |

## What gets written

- **Every game** (all 1,230): a rolling five-game window for the notable players, every team's streak, the night's
  best performance (50 points, a 40-10-10, 25-25, twelve threes; your own players from a lower bar), stars hurt for two
  weeks or more (any rotation player of yours), career milestones crossed tonight (10,000 points and up, with the
  all-time rank) and league single-game records once the record book has some history.
- **Every day**: the best big night, winning and losing streaks (8 and 9 games in the league, 5 for your team; an
  update every four more, and the end of the long ones), one hot hand every few days and one slump a week at most,
  stars back from injury (with how their team did without them); in the playoffs, previews of the conference finals,
  the Finals and your series, the series that end (upsets, sweeps, seven games) and Game 7s.
- **Every week**: power rankings with a line for every team, the award ladders (MVP top 10, Rookie, Defense, Sixth
  Man, Coach of the Year, scored the way the awards are), the rumor mill until the deadline (trade requests,
  rebuilding teams' veterans, stars in a contract year, with the contenders most likely to call), surprises and
  disappointments against the preseason projections (from 20 games), coaches on the hot seat (from 25; you too when
  the owner is furious), the play-in race and the race to the bottom (the last 18 games), your beat writer's notebook.
- **The season's moments**: All-Star rosters and snubs, deadline day, the writers' awards ballot, the champions; in
  the summer, the lottery, the draft, each week's biggest signings, notable retirements.
- **From the Desk**: what you say at the podium (a boast, a guarantee, blaming the officials, calling out your team,
  and sometimes the rest) becomes a story.

At most three story pieces a day on top of the weekly ones; about 280 to 350 articles a season.

## Storage

`S.media = { v, seq, sseq, writers, stories, arts, archive, form, tst, rank, ladder, nights, flags }`. Articles keep
only their data (ids, numbers); 320 at most in the current season (the latest three power rankings and ladders, the
last four rumor mills and notebooks; then the least important and oldest go first). At the start of a new season the
last one's 24 biggest stories go to the archive as headlines (40 seasons kept), and the summer's stories stay on the
front page through the preseason. Measured: 39 to 68 KB in the save at the start of a season, about 150 KB late in
one; the archive grows about 6 KB a season.

## On screen

- **The League Report** (Media in the nav, a dot when something new is about your team): the lead story with its
  first paragraph, the rest of the front page, the power rankings, the MVP ladder, the open storylines and "this
  week in league history" from the archive.
- **The reader**: the headline, deck, byline (name, role and outlet), the article, the players and teams in it (they
  open), and the other pieces of the same story.
- **Home**: the day's top story and two more headlines.
- **The booth**: the intro mentions a team's streak or a player's hot hand, slump or trade request.

## Measured

`node tools/audit/career.js --seasons 6 --seed 11 --answers random` on this build: 277 to 345 articles a season, no
article with an unfilled word, no errors; a season 33 s headless (the media's share under a second); the save 3.35 MB
after six seasons. Rendering every stored article takes about 20 ms.
