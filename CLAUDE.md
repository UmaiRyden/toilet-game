# CLAUDE.md - ToiletWifHat 2D PvP Shooter

## Project Overview

2D PvP browser shooter game where players wager $TOILET tokens (Solana SPL token).
Players connect Phantom wallet, wager tokens, and play 1v1 matches. Winner takes all.

## Current State

Client built the matchmaking layer. Game logic (Phaser) and wallet integration are not built yet.

### What exists (DO NOT rebuild):
- Room create/join/leave with WebSocket (server/src/services/room-store.js)
- Lobby with room listing, filtering by stake tier (100/500/1000 $TOILET)
- Ready-up system with countdown timer
- Match start/forfeit/resolve flow
- Reconnection with grace period (60s)
- Session tracking via sessionStorage (tab-scoped, no DB)
- React frontend with routing: /, /lobby, /room/:roomId, /match/:matchId
- Vite dev proxy forwards /health, /rooms, /ws to backend

### What needs to be built:

**Milestone 1 ($100) - Game Logic:**
- Phaser.js game inside MatchPage (replace the placeholder div)
- Player movement (arrow keys / A,D), jumping (spacebar / W)
- Left-click shooting toward mouse cursor
- Magazine system: 10 rounds default, reload delay when empty
- Health bars, hit detection, match end when health = 0
- Real-time sync of game state between two players via existing WebSocket
- Server-side hit detection (don't trust client)
- Demo mode at /match/demo (single player, no betting)

**Milestone 2 ($100) - Betting & Wallet:**
- Phantom wallet adapter integration
- $TOILET token balance check before joining paid rooms
- Wager lock on match start, auto payout to winner
- Paid vs demo lobby toggle
- Extended magazine (20 rounds) as purchasable upgrade
- Redis for live match state, Postgres for balances and match history

## Architecture

```
toilet/
  package.json          # React frontend (Vite + Tailwind v4)
  vite.config.ts        # Dev proxy: /health, /rooms, /ws -> backend
  .env.example          # PORT, VITE_BACKEND_ORIGIN, VITE_WS_URL
  index.html
  src/
    main.tsx            # Entry, BrowserRouter wraps App
    App.tsx             # Routes: HubMenuLayout (/, meta) + GameShellLayout (lobby, room, match)
    contexts/
      GameRealtimeContext.tsx  # WebSocket manager for room/match lifecycle
    hooks/
      useLobbyRooms.ts       # Lobby room list via WS subscription
      useRoomSocket.ts       # (unused currently)
      useMatchSession.ts     # Verifies matchId with server via separate WS
    lib/
      realtime.ts      # getRealtimeWsUrl() - WS URL from env or same-origin
      api.ts           # REST helpers, fetchRooms()
      env.ts           # getAppOrigin()
      clientSession.ts # Tab-scoped client session ID
      matchSession.ts  # sessionStorage for active match ID
      roomSession.ts   # sessionStorage for active room ID
    pages/
      HomePage.tsx     # Main menu with links to lobby and demo
      LobbyPage.tsx    # Room list, create room dialog, stake filter
      RoomPage.tsx     # Matchmaking: ready-up, countdown, invite link
      MatchPage.tsx    # WHERE PHASER GAME GOES (has placeholder div)
      LeaderboardPage.tsx  # Placeholder
      SettingsPage.tsx     # Placeholder
      TermsPage.tsx        # Placeholder
      NotFoundPage.tsx
    layouts/
      HubMenuLayout.tsx    # Wrapper for menu pages
      GameShellLayout.tsx  # Wrapper for game pages (lobby/room/match)
    components/
      ActiveRoomRedirect.tsx  # Redirects to active room if one exists
    types/
      realtime.ts      # RoomSummary, RoomPlayer, RoomPhase, RoomStatePayload
  server/
    main.js            # Entry: calls start()
    package.json       # Dependencies: ws, dotenv
    src/
      app.js           # start(): creates HTTP server, attaches WS, runs sweep timer
      config/env.js    # Loads .env from repo root, DEFAULT_LISTEN_PORT = 8080
      http/create-server.js  # GET /health, GET /rooms, CORS headers
      ws/attach.js     # WebSocketServer on /ws path
      services/room-store.js # ALL game room logic lives here
```

## Tech Stack

- **Frontend:** React 19, Vite 5, Tailwind CSS v4, TypeScript
- **Backend:** Node.js, native `ws` library (no Express, no Socket.io)
- **Game Engine:** Phaser.js (to be added)
- **Realtime:** Raw WebSocket, NOT Socket.io
- **State:** Redis for live room/match state (ioredis); Postgres for match history + player stats (pg); in-memory for timer handles + WS refs; sessionStorage on client.

## Key Technical Details

### WebSocket Protocol
The server uses raw `ws` library, NOT Socket.io. All messages are JSON with a `type` field.

Existing message types (DO NOT change these):
- welcome, lobby_subscribe, lobby_unsubscribe, list_rooms, rooms_snapshot
- create_room, join_room, leave_room, room_state
- set_ready, match_started, join_match, forfeit_match, match_resolved
- error

New game message types to add for Phaser sync:
- game_state (player positions, health, ammo)
- game_shoot (player fired)
- game_hit (server-confirmed hit)
- game_over (match result with winner/loser)

### MatchPage Integration Point
In src/pages/MatchPage.tsx there is a placeholder div:
```tsx
<div className="flex min-h-[min(420px,55vh)] flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 text-slate-500">
  Game viewport (Phaser)
</div>
```
Replace this div with the Phaser game canvas. Keep the rest of MatchPage intact (header, forfeit dialog, session check).

### Match Flow (already works)
1. Player creates room in lobby (pick stake: 100/500/1000)
2. Second player joins room
3. Both players click "ready" (one-way, can't undo)
4. 5-second countdown starts
5. Server sends match_started with matchId
6. Client navigates to /match/:matchId <- PHASER LOADS HERE
7. Match plays out
8. When match ends, send match result through existing WS
9. Server sends match_resolved, winner stays in room, loser goes to lobby

### Demo Mode
matchId === 'demo' skips session verification. Use this for single-player testing.
Route: /match/demo (linked from HomePage)

## Environment Setup

```bash
# Copy env
cp .env.example .env

# Install frontend deps
npm install

# Install server deps
cd server && npm install && cd ..

# Start Redis (one of):
docker run -p 6379:6379 redis:7-alpine    # Docker (recommended)
# or: sudo apt install redis-server && redis-server   # WSL / Linux
# or: hosted instance (Upstash free tier) — set REDIS_URL in .env

# Start Postgres (one of):
docker run --name toilet-postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=toilet_game -p 5432:5432 -d postgres:16-alpine
# or: hosted (Railway Postgres, Supabase, Neon) — set DATABASE_URL + DATABASE_SSL=true

# Run both (two terminals)
npm run dev          # Frontend on :3000
npm run dev:server   # Backend on :8080
```

### Redis configuration

- `REDIS_URL` — connection string, defaults to `redis://localhost:6379`.
  Supports `rediss://` for TLS (Upstash, etc.).
- `REDIS_KEY_PREFIX` — key namespace, defaults to `toilet`. Override when sharing a Redis instance across deployments.

All live state (rooms, players, active matches, pending creation flow) is stored in Redis. Timer handles, WebSocket references, and lobby subscribers stay in memory inside `server/src/services/room-store.js` — they're rebuilt on reconnect. On startup the server calls `reconcileOnStartup()` which clears any room data left dangling by a crashed previous process (in-flight stake/countdown/match state is unrecoverable across restart).

### Postgres configuration

- `DATABASE_URL` — connection string, defaults to `postgresql://localhost:5432/toilet_game`.
- `DATABASE_SSL` — set to `true` for hosted providers requiring TLS (Railway, Supabase, Neon).
- Schema in `server/src/db/schema.sql` (`matches` + `player_stats`) is applied idempotently on every server start via `server/src/db/migrate.js`.
- Postgres is **non-blocking**: if it's offline the game still runs — matches just won't be persisted and `/leaderboard` returns an empty array. Errors are logged once per pool.
- Demo mode (`/match/demo`) is client-only and never reaches the server, so it is never logged.

Production hosting suggestion: Railway Postgres or Supabase. Set `DATABASE_URL` + `DATABASE_SSL=true`.

## Important Rules

- DO NOT modify existing room-store.js matchmaking logic unless adding game-specific message handlers
- DO NOT replace raw WebSocket with Socket.io
- Live room state is now Redis-backed; all reads/writes in room-store.js are async. Timer handles MUST stay in memory (`roomTimers` map) — they are not serializable.
- Server-side hit detection is mandatory, never trust the client
- Keep the existing UI style (dark theme, Tailwind, rounded cards)
- All new game code should go in src/game/ directory
- Test with two browser tabs on localhost
- Magazine default is 10 rounds, extended is 20 (Milestone 2)

## Stake Tiers
Predefined in room-store.js: 100, 500, 1000 $TOILET tokens.
DO NOT change these values.

## Testing
No test framework set up. Test manually:
1. Open two browser tabs to localhost:3000
2. Create room in tab 1, join in tab 2
3. Both ready up, countdown starts, match loads
4. Verify game renders and players can move/shoot
5. Test demo mode at /match/demo with single tab
