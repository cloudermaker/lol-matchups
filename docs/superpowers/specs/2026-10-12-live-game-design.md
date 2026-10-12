# Live game — design

Date: 2026-10-12 · Status: draft for review

## Goal
During the loading screen, size up all 10 players and read the lane opponent in detail.

## Scope
- One EUW Riot ID saved as "me" in `localStorage`; set with a "This is me" button on the player page.
- Homepage shows a **Live game** button once "me" is set.
- Page URL `?live=Name%23TAG` works for any Riot ID (reload, testing with players currently in game).
- Stats use Ranked Solo/Duo only; the live game can be any queue. Lane guess only on 5v5 Summoner's Rift.
- Not in a game → "Not in a game" + Retry (no polling).
- Out of scope: polling, champ select, in-game data (gold, kills), a live game button on other profiles.

## Flow
1. `GET /api/live/:gameName/:tagLine`
   - account-v1: Riot ID → PUUID.
   - spectator-v5 `active-games/by-summoner/{puuid}`; 404 → `not_in_game`.
   - Per non-anonymous player, in parallel: league-v4 (rank, season W/L) and champion-mastery-v4 `by-puuid/{puuid}/by-champion/{id}`.
   - Guess lanes; return `LiveGameResponse`.
2. Page shows the 10 cards, then fetches `GET /api/live/form/:puuid?champ=<key>` with a 2-at-a-time queue: lane opponent, other enemies, allies.

## Server
### `RiotClient` (euw1, existing limiter / 429 retry / `RiotError`)
- `activeGame(puuid)`: 404 → `RiotError('not_in_game')`, not `not_found`.
- `mastery(puuid, championId)`: 404 → 0 points.
- `leagueEntries` reused.

### `server/src/live/`
- `lanes.ts` (pure) — `guessLanes(team, mainLanes)`:
  - Smite holder → jungle (first one if several).
  - Remaining players: try all lane permutations; score = number of champions on their main lane (`/api/main-lanes` data); ties keep Riot's participant order.
  - Not 5 players or not Summoner's Rift → lanes `null`.
- `form.ts` (pure) — from up to 10 ranked games: `games`, `wins`, `streak` (e.g. `W3`, `L2`), `kda`, `champGames`, `champWins`. Remakes excluded (same rule as profile).
- `service.ts` — `LiveService`:
  - `getGame(gameName, tagLine)` → `LiveGameResponse`. One failing league/mastery lookup leaves that card's fields `null`.
  - `getForm(puuid, championId)` → match-v5 `ids?queue=420&count=10`, `matchStore` with 5 parallel fetches, then `form.ts`.
- Cache (`TtlCache`): live game 30 s per Riot ID; form 10 min per PUUID.
- Concurrent identical requests share one load (same pattern as `ProfileService.pending`).

### Routes
- `GET /api/live/:gameName/:tagLine` → `LiveGameResponse`.
- `GET /api/live/form/:puuid?champ=<key>` → `LiveFormResponse`.

## Shared types (`shared/src/types.ts`)
- `LiveGameResponse`: `queueId`, `gameStartTime`, `me` (PUUID), `tier` (from your rank, for lolalytics), `allies: LivePlayer[]`, `enemies: LivePlayer[]`.
- `LivePlayer`: `puuid | null`, `riotId | null`, `anonymous`, `champion`, `spells`, `lane | null`, `rank | null`, `seasonWins | null`, `seasonLosses | null`, `mastery | null`, `lookupFailed`.
- `LiveFormResponse`: `games`, `wins`, `streak`, `kda`, `champGames`, `champWins`.
- `VersusResponse`: `winRate`, `games` (your champion against the opponent).

### Versus route
- `GET /api/versus?champ=&vs=&lane=&tier=` → `VersusResponse | null` via `MatchupService.getVersus` (lolalytics counters of your champion).

## Web
### `LivePage.tsx`
- Two columns (allies left, enemies right), rows aligned by lane; Riot order when lanes are unknown.
- Card: champion icon, Riot ID, rank + LP, season win rate, mastery, form line (e.g. "W3 · 6-4 last 10 · 2/3 on Ahri"); skeleton while loading.
- Badges: "One-trick" (7+ of last 10 on that champion), "Hot streak" / "Cold streak" (3+), "First time" (mastery < 10,000).
- Lane opponent panel (below the grid): their form on the champion, plus lolalytics matchup (your champion vs theirs: win rate, games) with a ↗ link to the champion page.
- Clicking an enemy card makes it the lane opponent and moves its form to the front of the queue.
- Anonymous players and bots: "Hidden player" card, no lookups.

### Elsewhere
- Player page: "This is me" button saves the Riot ID (`me.ts`, same try/catch storage pattern as `recentPlayers`).
- Homepage: **Live game** button when "me" is set.

## Errors
| Case | Behaviour |
|---|---|
| No "me" saved | No Live game button |
| Riot ID not found | "No EUW account for Name#TAG" |
| Spectator 404 | "Not in a game" + Retry |
| Not 5v5 Summoner's Rift | Cards shown; no lanes, no opponent panel |
| One league/mastery lookup fails | That card shows "–" |
| Form request fails | That card shows "Form unavailable"; queue continues |
| 429 after retry / key missing | Existing busy / key messages |
| lolalytics down | Opponent panel without matchup numbers, small note |

## Testing
- `lanes.test.ts`: Smite → jungle, best permutation, stable ties, no Smite, non-SR.
- `form.test.ts`: streaks, KDA, champion filter, remakes, fewer than 10 games.
- `service.test.ts` (fake `RiotClient`): spectator 404, anonymous player, one failing lookup, caching.
- Route tests for both endpoints.
- `LivePage.test.tsx`: cards render, queue priority order, opponent switch, Not in a game + Retry.
- `me.test.ts`: blocked or corrupt storage.
- Manual: open `?live=Name%23TAG` with a Riot ID currently in a game (yours, a friend's, or a high-elo EUW player).
