# LoL Matchups (private)

Pick a champion + lane → top 10 counters and recommended build (EUW, Gold+, Platinum+ or Emerald+).

## Run
    cp .env.example .env
    npm install
    npm run dev          # API on :3001 + site on http://localhost:5173

## Data
- Counters/builds: lolalytics (unofficial endpoints, may break) — `PROVIDER=lolalytics`.
- Names/icons: Riot Data Dragon.
- `PROVIDER=riot` reserved for the future Riot API match crawler (not implemented).
- `MIN_GAMES` (default 1000) hides low-sample matchups.

## Test
    npm test
