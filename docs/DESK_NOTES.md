# The Desk: notes

Phase 1 of `docs/SEASON_LOOP_PLAN.md`. Before it, nothing in a season ever asked you anything between games. The Desk
is the front office inbox: every day or two something lands on it, from your players, the owner, the press, your
staff or another front office, and every answer has consequences you live with.

## Where it lives

- `js/core/desk.js`: the engine (`PBC.Desk`). Items, triggers, cooldowns, deadlines and default answers, follow-ups,
  the effects, team chemistry, fans, the media standing, the engine's confidence hook. No DOM; runs in Node.
- `js/core/desk_events.js`: the situations (48 templates, 35 that come up on their own and 13 follow-ups).
- `js/ui/desk.js` + `css/desk.css`: the Desk screen, the Home card ("On your desk"), the chips that show what an answer
  did.
- Hooks: `season.js` (every day, every week, after your games, the deadline, All-Star, the end of the regular season,
  the end of the season, the owner's review), `offseason.js` (the offseason, the draft, free agency and its weeks,
  training camp; the retirement and free-agency hooks below), `sim.js` (confidence), `ai.js` (promises in the automatic
  rotation), `ui/app.js` (the sim stops, Home), `ui/core.js` (the nav count, the top bar's continue button),
  `ui/career.js` (Settings), `ui/live.js` (the postgame "Face the press" button).

## Items

`S.desk.items`: `{ id, t, kind, season, day, phase, title, text, from, opts, due, block, pri, done, pick, out, fx }`.

- **Decisions** wait for an answer. `block` decisions stop the sim (Settings → The Desk: *Important* stops for
  priority 2 and 3, the default; *Every decision*; *Never*).
- **Offers** (a trade call, a sleeper prospect, a feature story, a charity invitation) never stop the sim; they go
  away when they run out.
- **Messages** are things to read: a promise kept or broken, the owner's verdict on the deadline, a player hurt after
  you ignored the trainer.

Every decision and offer has a deadline in days (`due`). When it runs out, the template's default answer is applied
and the history says your staff answered. The offseason has no days, so whatever is still open from an earlier phase
gets its default when the next phase begins (and everything open from the season when the season ends).

`Desk.answer(S, id, k)` returns `{ text, nav, fx }`: the outcome, a screen to open (the trade room with the offer, a
player, the roster) and what changed (`fx`, from a snapshot of your room before and after: morale by player,
chemistry, fans, the media, the owner's trust, confidence, development). The card shows `fx` as chips.

## When things come

| Trigger | When | How many |
|---|---|---|
| `daily` | the end of every regular-season day (and playoff day while you are still in) | one situation with probability 0.28 × the frequency setting, +0.2 after 5 quiet days; none while 4 decisions are open |
| `game` | after each of your games | one with probability 0.28 × min(1.5, frequency) |
| `gameAll` | after each of your games | every one that applies (career milestones) |
| `week` | the end of every week (and each week of free agency) | the best candidate of each weekly template (the owner, the trainer, the scout, the phones) |
| `series` | the day before each of your playoff series | the series speech |
| `phase:<key>` | preseason, tipoff, allstar, deadline, postseason, season_end, offseason, draft, fa | the season's meetings, once per season each |

A template's `cd` is the days before it comes back for the same key (the same player, the same pair), `gcd` the days
before it comes back at all. The Desk draws from its own seeded stream (`Desk.rng`: save id, tick, salt), so the
season's games keep theirs and a save always plays out the same way for the same answers.

## The situations

| Family | Situations |
|---|---|
| Locker room | wants more minutes (promise them, explain the role, earn it, sixth man), wants to start, wants the ball, two players at each other's throats (back one, team meeting, fine both; the loser can ask out later), a veteran offers to mentor a kid (development over weeks), late to film (and late again), a contract-year player asks about the future, a trade request's meeting (explore, talk him out of it, a bigger role, refuse), a shooting slump, a big night, career milestones, the rookie wall, naming a captain, exit interviews (each player's summer focus), a veteran's one more year, the series speech |
| Owner | the preseason goals and one extra demand (the payroll, a win total, the fans, a young player's minutes), judged at the end of the season; check-ins when the owner is thrilled or furious (an extension, a budget, a turnaround promise checked a month later); the push for a deadline splash and the verdict on deadline day; the owner's favorite player |
| Press | the postgame presser after a blowout, a skid, a rout, a statement win, a streak, a playoff game or overtime (own it, call them out, blame the refs, credit them; boast and be checked ten days later); the pregame against a top-four team (guarantee a win, checked the next day); a player's controversial quote; a rival star's trash talk; a feature story request; an MVP campaign |
| Staff | the trainer's warning about a player's minutes (ignore it and he may get hurt), the scout's sleeper, the development report, predraft workouts |
| League | trade calls from the other 29 front offices (built on the trade AI: at most two of their players plus picks; accept, counter in the trade room, pass), teams shopping a star, a good free agent still unsigned, the All-Star snub and picks, the free-agency pitch (winning, a big role, the city, development) |
| Community | charity invitations |

## The numbers an answer moves

- **Morale** (the existing 0-100, scaled by League Settings → Morale Sensitivity): minutes, re-signing, free agency,
  trade requests.
- **Team chemistry** (new, every team, 0-100): drifts weekly toward its room: the top nine's morale against 68, winning
  (weighted by games played), continuity (who played here last season; 0.6 in a brand-new league), trade requests (-6
  each) and the personalities (a leader +2.5 ... a diva -2.5), plus a bond your decisions add to (±30, fading 10% a
  week).
- **Owner trust** = the coach's job security (the firing line is 22-30 at the end of a season). A season's talks move
  it less once they have moved it 30 points in one direction.
- **Fans** = `team.hype` (it was generated and never read before): drifts weekly toward winning, the best player, the
  market; your answers add to it.
- **The media**: your standing with the press, drifting 5% a week back toward 50.
- **Confidence** (`p.conf`, carried into the next games), **development** (training points), **promises**.

## Promises

`fx.promise` uses the existing promise system: `p.promise = { type: 'minutes' | 'starter', min, season, tid, desk,
gp0, min0, gs0 }`. A promise made mid-season is judged from the day it was made (`Season.promiseBroken`), weekly
morale feels it, and the Desk checks it ten games later: kept is +6 morale and your word (`S.fo.kept`, which free
agents read); broken is -10, chemistry and a message. With the automatic rotation your assistants keep your word: a
promised starter starts and promised minutes are played (taken from the end of the bench first). A promise that has
not had four games when the regular season ends lapses.

## On the court

League Settings → Chemistry on the Court (on by default, 0 to 2): `Desk.confMod(S, tid)` adds to each player's
starting confidence (`conf0` in the engine's confidence system) `k × (0.06 × clamp((chemistry - league mean) / 30) +
0.06 × clamp((morale - league mean) / 25))`. Both terms are measured from the league's means, so the league's numbers
do not move. Measured mid-season: the league mean of the nudge 0.0003; teams from -0.09 to +0.06. Confidence enters
the make logit at 0.14 per point, so the best and the worst rooms in the league are worth about +0.4 and -0.6 points a
game.

## Other hooks

- Free agency: your pitch adds up to +5 (or -2) to a player's interest in you (`Off.appeal`, "Your pitch").
- Retirement: a veteran you asked for one more year is less likely to retire (`Off.retireChance` × 0.45).
- `Off.evaluatePromises` leaves the Desk's promises to the Desk.

## Settings

- League Settings → Front Office Desk (0 turns it off, 2 is twice as busy) and Chemistry on the Court.
- Settings → The Desk stops the sim for: Important (default), Every decision, Never.

## Adding a situation

```js
Desk.def({
  id: 'my_case', fam: 'locker', kind: 'decision', when: 'daily', phases: ['regular'], w: 1, cd: 60, gcd: 30, pri: 1, due: 3, def: 'b',
  find(S, X) { return [{ key: pid, pid, w: 1 }]; },              // candidates now (X.u = your team, X.R = the Desk's stream)
  build(S, c, X) { return { title, text, from, opts: [{ k: 'a', label, hint }, { k: 'b', label, hint }], data: { pid } }; },
  resolve(S, it, k, X) { fx.mor(S, p, 5); return 'What happened.'; },   // or { text, nav }
});
```

Words about players use the pronoun helpers (`he(p)`, `his(p)`...); fixed words in a women's league are rewritten by
`Desk.fem`. The owner, staff and writers are generated people: their lines use names, not pronouns.

## Measured

`node tools/audit/career.js --seasons 10 --seed 7 --answers random` (a stand-in coach answering at random, every day),
`--answers first` (always the first answer) and `--answers default` (never answers; everything runs out), on this
build:

| | random, 10 seasons | first, 10 seasons | default, 20 seasons | women, random, 4 seasons |
|---|---|---|---|---|
| Items a season | 93 (58 decisions, 26 offers, 9 messages) | 97 (62, 25, 11) | 95 (64, 21, 8) | 64 (43, 15, 7) |
| Days the sim would stop (Important) | 15 | 17 | 46 (nothing answered) | 11 |
| Answers that ran out | 19 | 18 | all | 14 |
| A season headless | 35 s | 34 s | 35 s | 7 s |
| The Desk in the save | 73 to 130 KB | 67 to 135 KB | 69 to 153 KB | 55 to 88 KB |
| Errors | 0 | 0 | 0 | 0 |

The save after 10 seasons is 4.62 MB (4.49 MB before the Desk). Every situation came up over the careers except the
rare follow-ups (a feud that flares into a trade request, a boast checked ten days later, the trainer's warning that
turns into an injury). In the browser: a new career opens with the owner's goals and the captain on the Desk, Tip Off
stops for them, the answers show their chips, the resume button picks the sim up where it stopped, and Sim Week stops
for the important ones (two stops in five weeks with every item answered). No console errors. The gauntlet
(`node tools/audit/check.js`) still passes 152 of 152.
