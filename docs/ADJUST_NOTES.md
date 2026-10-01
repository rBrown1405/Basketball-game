# In-game adjustments: the bench fights back, the locker room, matchups

The play caller (`js/core/playcall.js`) already went back to what worked on offense. Nothing answered on defense: a
CPU coach kept the scheme it tipped off with all night and only called a timeout after a 9-point run. Now every bench
reads the game and answers it (`js/core/adjust.js`, `PBC.Adjust`), and in a live game your assistant suggests the
answers to you.

## What a bench does

At the start of a possession (after the timeouts and the substitutions, `Sim.nextPossession`) the defense's bench:

- **Reads the game** (`Adjust.read`) every few trips, out of a timeout and at every quarter break (a little more
  readily at halftime): what is hurting it, in points above what those possessions usually score in this league.
  Their pick and roll, isolations, post-ups, spot-ups, off-screen action, hand-offs and cuts (the play caller's tally),
  threes, points at the rim and in the paint, one player carrying them, transition. Each is shrunk toward nothing on a
  small sample; threes and the paint are shrunk much more (a hot night from three is mostly luck).
- **Answers it** with a scheme that takes it away (`FIX`), that its five can play (switching needs versatile
  defenders, hedging mobile bigs, drop a rim protector: `Sim.defenseFitOf`) and that does not open up something they
  are already hurting it with (no zone or pack-the-paint against a team on fire from three, no switching against a
  team scoring in the post). Among those it weighs what each scheme is worth in this engine (`VAL`, measured below)
  and never trades its defense for one that is clearly worse in general.
- **Judges it**: zone, box-and-one, blitz and pressure are played in stints of 7 to 12 trips, then the team goes back
  to its own defense unless the stint is working; a change that gets burned (points allowed per trip in it, tallied by
  `js/core/playstats.js`) goes back sooner. Garbage time is left alone.
- **Out of the other team's timeout** sometimes shows a zone for one to three trips (the NBA's zone possessions cluster
  there: the play was drawn up against man).
- **Late**: presses after a make when behind (down 6 to 16 in the last four minutes, more for a bold coach), plays
  faster when down 10 in the last five minutes and slower when up 12 in the last four, backs off the ball when one of
  its three best players has five fouls in the fourth, and fouls up three on the last possession more often when it
  is analytics-minded (`Adjust.foulUp3P`).
- **The hack**: when the defense is in the penalty, it may foul a poor free throw shooter (under 55% expected; under
  46% in the first half) on purpose as the offense sets up, never in the last two minutes of a quarter (the NBA rule).
  The second time in a quarter, that player's own bench sits the player for the rest of it.
- **Transition**: when the run-outs pile up, a team that crashes the glass stops; one that already plays it balanced
  sends everyone back only when it is bad.

How quickly and how well a bench reads the game comes from its coach: the coach's rating (45 to 85 maps to 0..1) and
style (a Tactician or a Defensive specialist reads more), and how readily the coach changes (some are stubborn). The
noise in the read, the bar a problem has to clear, how often the bench looks and how often it picks the best answer all
follow it. In
the playoffs every bench reacts a little sooner.

Every change is a line in the play-by-play and an `adjust` event: the live view shows a toast, the broadcast a tag
(`2-3 ZONE`, `BOX-AND-ONE`, `HACK-A-JONES`, `FULL-COURT PRESS`) and the booth talks about it.

## Your bench

- In a game you **sim**, your staff makes the calls like any bench, as well as your **Tactician** skill reads the game.
- In a game you **coach live**, your assistant **suggests**: a card at the top of the Coach tab ("Their pick and roll:
  18 points on 11 trips. Try Drop Coverage?") with **Apply** and **Not now**, and a toast when a new one comes in. It
  also tells you when a change you made is getting burned, and to press when you are behind late.
- **Let my staff adjust the defense** (the Coach tab, and Settings: Assistant adjustments, off by default) lets it act
  instead. It never touches a defense you called: change it yourself and it goes back to suggesting.
- The Coach tab lists **Their bench**: the other coach's last three moves.

## Engine changes

- `g.zt`: each team's field goals by zone tonight (the reads, the halftime report).
- A **blitz** or a **hedge** forces its extra turnovers on the ball screens it is played on (`toOn`), not on every
  trip. Before this a blitz was worth 2.6 points a game more than a team's own defense (the next section) and every
  smart coach would have blitzed everything.
- `Sim.defenseFitOf`, `Sim.event`, `Sim.ftExpect` for the benches; the hack (`hackFoul`, a "Foul on purpose");
  `g.lastTO` (who called the last timeout); `T.adj` on each team; `opts.live` on `Sim.createGame` from the live view.

## Measurements

League averages the reads use (the calibrated engine, 300 games of each league):

| | men | women |
|---|---:|---:|
| Half-court points per trip | 1.146 | 1.033 |
| Transition | 1.22 | 1.14 |
| Pick and roll / isolation / post / spot-up | 1.07 / 1.03 / 1.06 / 1.09 | 0.98 / 0.90 / 0.95 / 0.96 |
| Off-screen / hand-off / cut | 1.00 / 1.05 / 1.31 | 0.89 / 0.92 / 1.20 |
| FG% rim / paint / mid / corner 3 / above the break | .656 / .431 / .409 / .376 / .348 | .575 / .373 / .359 / .340 / .326 |

What each scheme is worth (`node tools/audit/schemes.js men <scheme>`: the home team plays it all season, nobody
adjusts; home margin, 1230 games each, about ±0.4):

| Scheme | before the blitz fix | after |
|---|---:|---:|
| each team's own | +1.22 | +1.16 |
| Blitz / Trap | **+3.79** | +0.78 |
| Hedge | +0.74 | +0.35 |
| Ball Pressure | +2.04 | +1.28 |
| Box-and-One | +2.18 | +2.35 |
| Drop | +2.04 | +2.48 |
| Pack the Paint | +1.67 | +2.50 |
| 1-3-1 Zone | +1.90 | +2.90 |
| Man / Switch / 2-3 / 3-2 / Run Off the Line | +0.63 / +0.76 / +1.06 / +1.00 / +0.90 | |

Walling off the rim pays in this engine (a shot at the rim is worth 1.31 points, a three about 1.05); chasing the
three-point line costs. `VAL` in `js/core/adjust.js` is this table, rounded and shrunk.

Does adjusting help the team that does it? (`node tools/audit/adjust_ab.js men <none|home|away> 3`: only one team
adjusts; home margin over 3690 games, ±0.3)

| | nobody | home only | away only | what adjusting is worth |
|---|---:|---:|---:|---:|
| First version (chased hot shooting, backed off for foul trouble early, sent everyone back) | +1.84 | +0.53 | +2.51 | **about -1.0 a game** |
| Now | +1.62 | +1.20 | +0.90 | about +0.15 (no worse, a little better) |

That is the target: the other bench answers you the way a real one does, without being handed an edge, and your own
answers can beat its.

How often (300 men's games): about 3 moves per team per game, a third of them going back to its own defense; the
press 0.2, a surprise zone out of a timeout 0.04, the hack 0.02 per team per game (it needs a really poor free throw
shooter on the floor and the defense in the penalty). Zone and box-and-one together went from 6.4% of half-court
trips (the teams whose own defense it is) to 7.6%; the NBA's 2025-26 rate is 3.6%, one team at 18.4%.

The season (`node test/calibrate.js`, one season, seed 7): men 116.3 points and 100.4 possessions a game before, 115.9
and 100.4 after; women 85.6 / 82.6 before, 85.9 / 82.5 after. Simulating is about 12% slower (400 games: 5.6 s to 6.3 s).

Checks: the animation gauntlet 152/152; a two-season headless career exits clean (29.7 s a season); two live games
headless through the court (`tools/audit/run.js`) reach the final buzzer with no script errors and the court's score
matching the engine, and two more with the coach's calls and the matchup orders on (`--calls 1`: deny their best,
sag off their worst shooter, double their best post scorer, your best defender on their best) the same. In the browser (desktop 1400 px and phone 390 px), full live games with no console errors: the
other bench's moves and your assistant's suggestion with Apply, the locker room (report, suggestions, a talk and
every player's reaction, then the third quarter), and the huddle's Matchups (two orders and a new assignment, shown in
the Coach tab, honored by the engine).


## The halftime locker room

`js/core/locker.js` (`PBC.Locker`) and `js/ui/locker.js`. At halftime of a game you coach live (Settings: Halftime
locker room, on by default) the game waits while you are in the room.

- **The report**: field goals, threes, free throws, turnovers and points a trip for both teams; what is working (your
  actions scoring well above this league's usual, players on fire); what is hurting you (the bench's read, players gone
  cold, their best scorer); foul trouble on both sides; what their bench has done.
- **The suggestions**, taken with one tap when you go back out: the defense (or the glass) as your bench reads it;
  denying their star the ball or doubling a star who scores inside (a third of their points, 14 or more); the play that
  has scored (3 calls or more at 1.4 points a trip or better) for the first two trips of the half; feeding the hot hand
  (your go-to player); sitting a starter with three fouls for the first half of the third (`c.rest`); the pace when you
  are down 10 or up 14.
- **The talk**: stay calm, fire them up, praise them, demand more. Each of your nine players takes it by personality
  (`js/core/persona.js`; a competitor wants to be pushed, a diva wants praise, a hothead does not need more fire, praise
  when you are getting beaten rings hollow with the competitors) and by the score: each one's confidence moves 0.15
  (`c.conf`, which settles back over the player's minutes, and a little of it stays for the game), and the team gets an edge for
  the third quarter at both ends (logit; taken back at the start of the fourth):

| Talk | up 10+ | up 3-9 | close | down 3-9 | down 10+ |
|---|---:|---:|---:|---:|---:|
| Stay calm | +0.01 | +0.02 | +0.03 | +0.02 | 0 |
| Fire them up | -0.01 | +0.01 | +0.03 | +0.04 | +0.05 |
| Praise them | +0.03 | +0.03 | +0.01 | -0.01 | -0.03 |
| Demand more | +0.02 | +0.02 | +0.02 | +0.03 | +0.03 |

  plus 0.02 times how the room took it (-1 to +1), times 1 + 0.15 per Motivator level when it is good (1 - 0.12 per
  level when it is bad). The other bench gives its own talk (`Locker.autoTalk`: the right one for the score as often as
  its coach knows it, more for a Motivator), and so does your staff when you sim or skip the room. 300 simulated games:
  600 talks, every third-quarter edge taken back, points per trip unchanged (1.146).

## Matchups and orders

The huddle (a timeout, or Call a play in the Coach tab) has a **Matchups** block: their five on the floor, who guards
each (pick a defender; the man he had takes the other's old defender) and an order on each man. The engine pairs the
two lineups as before (`pairLineups`) and lays your assignments over it (`T.mmUser`); the court is handed the same
pairing. The orders (`Sim.setOrders`, `T.orders`, logit on his shots unless noted; `Sim.ORDER`):

| Order | On him | Everyone else |
|---|---|---|
| Deny the ball | a quarter fewer touches, threes -0.10; his man stays in the passing lane | |
| Sag off | open jumpers +0.09; his man a big cushion and no deny | -0.05 at the rim and in the paint for each man sagged off (two at most) |
| Double team | touches x0.85, inside -0.20, outside -0.06, turnovers x1.2 when he has the ball; the defender whose own man is nearest comes up on him inside 18 ft | the man left open: a cleaner look (+0.07 open) |
| Force the weak hand | at the rim and in the paint -0.06 | |
| Hack | fouled on purpose about every other trip he is on the floor, when you are in the penalty and not in the last two minutes of a quarter | |

The court plays them (`js/match/defense.js`): `onBallGap` (sag off: a bigger cushion, deny: tighter), `denyK` (deny:
all the way into the lane, sag: none), `doubler` (the double team, exempt from the lane rule while he is on the ball).
The Coach tab lists your orders with a button to clear each one.

What an order is worth (`node tools/audit/orders.js <order>`: the home team puts it on the away team's best player,
sag off on the starter with the worst three-point rating, 1230 games each, home margin about ±0.5):

| | home margin | their target's points |
|---|---:|---:|
| no order | +1.48 | 21.6 |
| Deny | +1.49 | 19.8 |
| Double | +1.31 | 20.1 (their team 115.9 instead of 116.5) |
| Force the weak hand | +1.75 | 21.8 |
| Sag off (their worst shooter) | +2.25 (after toning sag off down from +0.12 to +0.09 and its help from -0.035 to -0.05; it was +0.94) | |

None of them is a free win: denying or doubling a star takes points off his night and his teammates pick them up;
sagging off a real non-shooter pays a little. The locker room suggests the deny and the double on a star who is
carrying them.

## Sources

- [NBA.com, Numbers notebook: zone defenses](https://www.nba.com/news/numbers-notebook-zone-defenses) and
  [The Stein Line on zone defense](https://marcstein.substack.com/p/talking-zone-defense-nba-big-men) (3.6% of
  possessions in 2025-26, up from 0.3% in 2017-18; more zone out of timeouts)
- [Sports Illustrated: NBA coaches' creative counters](https://www.si.com/the-cauldron/2015/11/17/nba-coaches-creative-counters-established-actions)
  and [The Analyst on Tyronn Lue's adjustments](https://theanalyst.com/articles/tyronn-lue-los-angeles-clippers-defense-nba-playoffs/)
  (a plan B and a plan C against the pick and roll)
- [Hack-a-Shaq (Wikipedia mirror)](https://kiwix.gnuisnotunix.com/wikipedia_en_all_maxi_2021-12/A/Hack-a-Shaq) and
  [theScore on the hack rules](https://www.thescore.com/nba/news/775623) (off-ball fouls in the last two minutes: one
  free throw and the ball)
