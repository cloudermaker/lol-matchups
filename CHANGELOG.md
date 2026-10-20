# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- feat: live game page with rank, mastery and recent form for all 10 players
- feat: lane opponent panel with lolalytics matchup win rate
- feat: Live game tab on the player page
- feat: Live shortcut next to recent players
- chore: `npm run start -w server` and a Vercel rewrite for deployment
- chore: server runs as a Vercel Express function (bundled entry, /tmp match cache)

## [0.1.0] - 2026-09-24

### Added

- feat: top 10 counters for a champion and lane (EUW, Platinum+)
- feat: recommended build per champion and lane (early items, core items, boots)
- feat: homepage with the 5 best and 5 lowest win rates per lane
- feat: open a champion page from a counter or the homepage with the ↗ button
- feat: Gold+ / Platinum+ / Emerald+ tier switch
- feat: lane preselected to the champion's main role
- feat: labelled, grouped search controls
- feat: page kept in the URL (bookmark, reload, browser back)
- feat: app version shown in the footer
- feat: link to lolalytics for runes and summoner spells
- feat: player profile from a Riot ID (champion pool, stats vs lane opponents, advice)
- feat: homepage player search with recent players; a name without a tag tries EUW, then EUR
- feat: current patch notes link and highlights image on the homepage
- chore: `npm run dev` starts API and site together
- chore: dev server restarts when `.env` changes
