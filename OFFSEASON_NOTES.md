# Offseason, draft, free agency & trades — notes

Owner of: `js/core/draft.js`, `js/core/offseason.js`, `js/core/trade.js`, `js/ui/offseason.js`, `js/ui/draft.js`,
`js/ui/freeagency.js`, `js/ui/trade.js`, `css/offseason.css`, `test/offseason.js`, this file.

## Requests for lead

1. **Hook — in-season AI-to-AI trades:** please call `PBC.Trade && PBC.Trade.daily(S)` once per regular-season
   day (e.g. at the end of `Season.endDay`, before `S.day++`, or from `AI.daily`). It self-limits to ~5 trades per
   season before the deadline, never touches the user's team, and posts news. (Offseason AI trades already happen
   on draft day and during free agency without any hook.)
2. **Minor — contracts can exceed the max salary by up to $5K** (women's league mostly). `League.create` (league.js
   ~line 104) and `Player.marketValue` round to $10K *after* clamping to `maxSalary`, e.g. a $256.7K max becomes
   $260K. Suggest `Math.min(maxSalary, round(...))`. My code clamps with `Offseason.fitAmt(S, p, x)`;
   `test/offseason.js` tolerates +$5K for now.
3. **Optional — player card buttons** (`js/ui/cards.js`): "Release" calls `AI.release` (no dead money) and "Sign
   player" computes its own deal. For one set of cap rules, call `PBC.Offseason.release(S, pid)` (dead money for
   guaranteed years, handles the FA market) and `PBC.Offseason.quickSign(S, pid)` (rest-of-season deal, soft-cap
   rules, rotation update) — both return `{ ok, msg }`.
4. **Optional — `UI.potLabel`** shows `~90` for a 91-OVR free agent under 28 (rounds the potential below the OVR).
   `'~' + Math.max(p.ovr, Math.round(p.pot / 3) * 3)` avoids it.

Resolved: play-in stall when team id 0 won a play-in game (fixed in league.js/season.js by the lead).

## Load order

```html
<!-- CORE_EXTRA (after coach.js) -->
<script src="js/core/draft.js"></script>
<script src="js/core/offseason.js"></script>
<script src="js/core/trade.js"></script>
<!-- EXTRA_CSS -->
<link rel="stylesheet" href="css/offseason.css">
<!-- UI_EXTRA (after the lead's UI files) -->
<script src="js/ui/offseason.js"></script>   <!-- first: defines PBC.OffUI, registers phases & nav -->
<script src="js/ui/draft.js"></script>
<script src="js/ui/freeagency.js"></script>
<script src="js/ui/trade.js"></script>
```
Core files only reference each other inside functions, so their relative order doesn't matter as long as all three
load before `League.create` runs. `test/harness.js` already loads them.

## Phases & the CONTINUE button (registered in `js/ui/offseason.js`)

| Phase | Screen | CONTINUE label → action |
|---|---|---|
| `awards` | lead's recap | "Begin Offseason" → `App.beginOffseason` → `Offseason.begin(S)` → `'draft_lottery'` |
| `draft_lottery` | `lottery` | "Draft Lottery" (a click on the lottery screen reveals instantly) → "Start the Draft" → `Offseason.startDraft(S)` |
| `draft` | `draft` | "Sim to My Pick" / "You're on the Clock" (just a nudge) / "Finish Draft" → "Re-sign Players" → `Offseason.startResign(S)` |
| `resign` | `resign` | "Open Free Agency" → confirm if players are undecided → `Offseason.startFreeAgency(S)` |
| `freeagency` | `freeagency` | "End Week n/8" → `Offseason.faAdvance(S)` + week-results modal; then "Start New Season" → `Offseason.finish(S)` → `'preseason'`, shows the Offseason Report and opens `PBC.Magazine.open(S)` |

If the coach is unemployed, the lead's top bar shows "Job Offers" first; my code treats the user team as `-1` while
unemployed, so every team is AI-run until a job is accepted.

Nav items (group "Front Office"): Draft Lottery, Draft, Re-sign Players (phase-gated), Free Agents (market during free
agency, in-season list otherwise), Trades (always), Scouting (when prospects exist; dot when the bank is full),
Offseason Report. Screens: `lottery`, `draft`, `scouting`, `resign`, `freeagency` (params `{ tab: 'roster' }`),
`trade` (params `{ give: [pid], tid }` — the player card's "Shop in trade" already uses `give`), `offseason`.

## Public API (core)

**PBC.Offseason** — `begin(S)`, `startDraft(S)`, `startResign(S)`, `startFreeAgency(S)`, `faAdvance(S)`,
`canFinish(S)` → `{ ok, msg }`, `finish(S, { auto })`, `autoAll(S)` (assistant GM runs the rest of the offseason),
`nextLabel(S)`. Re-sign: `resignInfo`, `offerResign(S, pid, { amt, years, opt })`, `letWalk`, `autoResignUser`.
Free agency: `FA_ACTIONS`, `faAction(S, pid, key, arg)`, `faOffer(S, pid, offer)`, `faWithdraw`, `faList`,
`faInterest`, `userAsk`, `askRange`, `userOfferStatus`, `offerKind`, `autoFAUser`. Any time: `quickSign(S, pid)`,
`release(S, pid)`, `payroll(S, tid)` (cap-year payroll incl. dead money), `capSpace`, `capYear`, `committed`,
`deadMoney`, `appeal(S, p, tid)`, `baseAsk`, `develop(S, p)`, `initDevelopment(S)`.

**PBC.Draft** — `ensureClass(S)` (called by `League.newSeasonSetup`), `classOf(S, year)`, `view(S, p)` (scouted
OVR/POT ranges; POT matches `UI.potLabel` exactly), `SCOUT_ACTIONS`, `scout(S, pid, key)`, `scouting(S)`/`points(S)`,
`weeklyScoutingPoints(S)` (no hook needed: points accrue lazily from `S.day`, 8/week, bank 24, +20 pre-draft),
`setup(S)` (lottery + order), `state(S)`, `current(S)`, `isUserTurn(S)`, `select(S, pid)`, `autoPick`, `simToUser`,
`simAll`, `step`, `complete`, `projectedSlot(S, pick)`, `pickLabel`.

**PBC.Trade** — `status(S)` → `{ open, reason, daysLeft }`, `evaluate(S, offer)` → `{ ok, errors, reasons, sides, msg }`,
`execute(S, offer)`, `balance(S, offer, payIdx)` ("what would it take?"), `whatWouldYouWant(S, aiTid, pids, picks)`,
`shop(S, pids, picks)` (trade-block offers), `aiTradeTick(S)`, `daily(S)` (hook), `playerValue`, `pickValue`,
`teamMode`, `playerBlock`, `teamPicks`, `pickKey`, `describe`. Offer shape:
`{ tids: [user, ai], give: [{ pids, picks }, { pids, picks }] }` (give[i] = what team i sends; picks are
`"season:round:orig"` keys).

## State added to `S`

`S.draftState` (lottery + order + picks; kept after the draft as "last draft"), `S.scouting` (budget), `p.scout`
(`known`, action flags, `star` shortlist), `S.offseason` (live summary) → `S.lastOffseason` after `finish` (the
magazine reads `.signings`), `S.resign`, `S.fa` (market; cleared at `finish`), `S.trades` (last 150; the magazine reads
`.give[].pids`), `S.deadMoney[tid]`, `S.fo` (promises kept/broken), `S.devInit`, `p.dv` (hidden true peak),
`p.tradeLock` (free-agent signees can't be traded until the regular season), `p.retired`, `p.lastTid`,
`p.contract.po` (player-option season), `p.draft.{overall, rank, byUser}`, `p.rookieSeason`.

## Design notes

- **Rules:** soft cap — over the cap you can sign only the MLE (once) or minimum deals; re-signing your own players
  can exceed the cap. Trades: a team over the cap after the deal may take back ≤ 125% of outgoing salary + 25% of a
  minimum salary. Offseason rosters may run to max+3 (user) / max+2 (AI, clear upgrades only); `finish` trims.
  Released guaranteed money stays on the cap as dead money (2nd-round rookies before their first season are free).
- **15 front-office actions:** 5 scouting (film, attend a game, private workout, interview, medical) + 10 free agency
  (text, call agent, video pitch, facility tour, owner dinner, star player recruits, contender pitch, promise starting
  role, promise minutes, offer contract). Promises land in `p.promise` (the season's morale code enforces them) and
  are graded at the next offseason (broken promises cut the credibility of future ones).
- **Stable ratings over decades:** `Player.progress` alone inflates the league (+~17 OVR from 20→28 regardless of
  potential, and `pot` ratchets up with lucky years). `Offseason.develop` passes a `coachDev` so growth mean-reverts
  around each player's hidden career curve (`p.dv`); `initDevelopment` regresses the generator's noisy teenage
  potentials once at league creation; draft classes are built from a calibrated peak curve by slot. Averaged over
  seeds: men top-10 ≈93.5, 90+ ≈15, 85+ ≈43, 80+ ≈88, rotation OVR within ±0.5 over 12 seasons; women stable over 15.
  If `Player.progress` changes, re-tune `Offseason.DEV` / `Draft.CLASS` and re-run `node test/offseason.js`.

## Tests

`node test/offseason.js [men|women|both] [seasons=5] [seed=11] [fast]` — real season sims by default (≈3–4 min for
both leagues); `fast` fakes regular-season results. ~31k invariant checks: roster sizes, rotations, jersey numbers,
contracts (amount/expiry), pick bookkeeping (4 future drafts, each pick once), lottery rules, rookie-deal lengths,
new class & schedule, a stable OVR distribution, rookies arrive, retirements happen, sane payrolls.

## Known limitations

- No sign-and-trades, restricted free agency, rookie-scale extensions, two-way contracts or waiver claims; team options
  aren't modelled (player options are).
- AI teams don't pitch trades to the user unprompted; the user shops players via the trade block.
- Trade value and FA interest are fully visible (meters/previews) by design; the AI's small per-day mood (±3%) is the
  only hidden factor.
- The women's league is small, so its star counts swing more from season to season (seed noise ±25%).
