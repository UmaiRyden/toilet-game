# ToiletWifHat — 2D PvP Shooter on Solana

A browser-based 1v1 shooter where players wager **$TOILET** SPL tokens. Connect your Phantom wallet, pick a stake tier, and play. Winner takes both stakes — no house cut.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Local Development Setup](#local-development-setup)
4. [Environment Variables Reference](#environment-variables-reference)
5. [Deployment Guide](#deployment-guide)
6. [Scripts](#scripts)
7. [Game Features](#game-features)
8. [Switching to Mainnet](#switching-to-mainnet)

---

## Project Overview

**ToiletWifHat** is a 2D PvP arena shooter with on-chain wagering built on Solana devnet. Two players match up, lock their stake in escrow, and the winner receives both stakes automatically via the treasury wallet.

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 5, TypeScript, Tailwind CSS v4 |
| Game Engine | Phaser.js 4 |
| Backend | Node.js, native `ws` (no Express, no Socket.io) |
| Realtime | Raw WebSocket — JSON message protocol |
| Live State | Redis (ioredis) |
| Match History | Postgres (pg) |
| Blockchain | Solana (devnet → mainnet) |
| Wallet | Phantom via `@solana/wallet-adapter-react` |
| Frontend hosting | Vercel |
| Backend hosting | Railway |

---

## Architecture

```
Browser (Vercel)
  └── React + Phaser frontend
        ├── REST  →  Railway backend  :8080  /rooms, /health
        └── WebSocket  →  Railway backend  :8080  /ws
                              ├── Redis (Upstash)     — live room & match state
                              └── Postgres (Supabase) — match history, leaderboard
```

- **Frontend (Vercel):** Static React/Vite build. All real-time communication goes through WebSocket. No server-side rendering.
- **Backend (Railway):** Single Node.js process. Serves the REST API and WebSocket server on the same port. Stateless between restarts — live state lives in Redis.
- **Redis (Upstash):** Stores room snapshots, player state, active match data, and reconnect grace-period flags. Keys are prefixed with `toilet:` by default.
- **Postgres (Supabase / Railway):** Append-only match history and per-player stats. Non-blocking — if Postgres is offline, gameplay continues and matches simply aren't persisted.

---

## Local Development Setup

### Prerequisites

- **Node.js** 20+ and npm 10+
- **Redis** (Docker recommended, or Upstash free tier)
- **Postgres** (Docker recommended, or any hosted provider)
- **Phantom** browser extension (for wallet features)

### 1. Clone the repo

```bash
git clone https://github.com/UmaiRyden/toilet-game.git
cd toilet-game
```

### 2. Install dependencies

```bash
# Frontend
npm install

# Backend (separate package.json)
cd server && npm install && cd ..
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your local values. See the [Environment Variables Reference](#environment-variables-reference) table below for what each variable does.

### 4. Start Redis and Postgres

**Docker (recommended):**

```bash
# Redis
docker run -d -p 6379:6379 redis:7-alpine

# Postgres
docker run -d --name toilet-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=toilet_game \
  -p 5432:5432 \
  postgres:16-alpine
```

Or use a hosted provider (Upstash for Redis, Supabase / Railway for Postgres) and set `REDIS_URL` / `DATABASE_URL` in `.env`.

### 5. Run the devnet token setup (first time only)

This creates the treasury keypair and mints 1,000,000 $TOILET on Solana devnet:

```bash
npm run setup-devnet
```

The script saves `scripts/treasury-keypair.json` and `scripts/token-info.json`. **Do not commit these files** — they are gitignored.

### 6. Start the servers

Open **two terminals:**

```bash
# Terminal 1 — Frontend (http://localhost:3000)
npm run dev

# Terminal 2 — Backend (http://localhost:8080)
npm run dev:server
```

The Vite dev proxy forwards `/health`, `/rooms`, and `/ws` to the backend automatically. The frontend always talks to `localhost:3000`.

### 7. Test multiplayer locally

Open two browser tabs to `http://localhost:3000`. Create a room in one tab, join in the other, ready up, and the match will start.

For a single-player smoke test, navigate directly to `http://localhost:3000/match/demo`.

---

## Environment Variables Reference

All variables are loaded from `.env` in the repo root (read by both Vite and the Node server via `dotenv`).

### Frontend (`VITE_*`)

| Variable | Description | Example |
|---|---|---|
| `VITE_DEV_SERVER_PORT` | Port Vite listens on locally | `3000` |
| `VITE_BACKEND_ORIGIN` | Base URL of the backend for REST calls | `http://127.0.0.1:8080` |
| `VITE_APP_ORIGIN` | Public origin of the frontend (used for invite links) | `http://localhost:3000` |
| `VITE_WS_URL` | WebSocket URL the frontend connects to | `ws://127.0.0.1:8080/ws` |

> In production, set `VITE_BACKEND_ORIGIN` and `VITE_WS_URL` to your Railway backend URL. Leave `VITE_APP_ORIGIN` as your Vercel domain.

### Backend

| Variable | Description | Default | Example |
|---|---|---|---|
| `PORT` | Port the Node.js server listens on | `8080` | `8080` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` | `rediss://user:pass@host:6380` |
| `REDIS_KEY_PREFIX` | Namespace prefix for all Redis keys | `toilet` | `toilet-prod` |
| `DATABASE_URL` | Postgres connection string | `postgresql://localhost:5432/toilet_game` | `postgresql://user:pass@host/db` |
| `DATABASE_SSL` | Enable TLS for Postgres (required by most hosted providers) | `false` | `true` |

### Solana / treasury

| Variable | Description | Example |
|---|---|---|
| `TOILET_TOKEN_MINT` | SPL token mint address for $TOILET | `7u9z4bx47wLz2s9Ui5697sfNKfBG19sXdUibyVUM8YD8` |
| `TOILET_TOKEN_DECIMALS` | Decimals of the $TOILET mint | `6` |
| `TREASURY_WALLET_ADDRESS` | Public key of the treasury wallet that holds and distributes stakes | `Hpug1YxkfUodjxWRsYuJcpQXAaVpH7L5hiqbPm3m2xFA` |
| `TREASURY_KEYPAIR_JSON` | Full JSON array of treasury secret key bytes (for hosted deployments) | `[12,34,56,...]` |
| `TREASURY_KEYPAIR_PATH` | Filesystem path to the treasury keypair JSON (local dev only) | `scripts/treasury-keypair.json` |
| `TREASURY_TOKEN_INFO_PATH` | Filesystem path to `token-info.json` (local dev only) | `scripts/token-info.json` |

> The server tries the keypair file first, then falls back to `TREASURY_KEYPAIR_JSON`. On Railway, set only `TREASURY_KEYPAIR_JSON` — no file system access is needed.

---

## Deployment Guide

### Backend — Railway

1. Create a new Railway project and connect the GitHub repo.
2. Set the **root directory** to `server/` in Railway's settings (or configure a `railway.toml`). Railway runs `npm start` → `node main.js`.
3. Provision a **Redis** add-on (or link an Upstash instance) and a **Postgres** add-on (or link Supabase).
4. Add environment variables in Railway's dashboard:

```
PORT=8080
REDIS_URL=<Upstash rediss:// URL>
DATABASE_URL=<Postgres connection string>
DATABASE_SSL=true
TOILET_TOKEN_MINT=<mint address>
TOILET_TOKEN_DECIMALS=6
TREASURY_WALLET_ADDRESS=<treasury public key>
TREASURY_KEYPAIR_JSON=<JSON array of secret key bytes>
```

5. Railway auto-deploys on every push to `main`.

**Health check:** `GET https://<your-railway-url>/health` → `{ "status": "ok" }`

---

### Frontend — Vercel

1. Import the GitHub repo into Vercel.
2. Leave the **root directory** as `/` (the frontend `package.json` is at the repo root).
3. Vercel runs `npm run build` → `tsc --noEmit && vite build`.
4. Add environment variables in Vercel's dashboard:

```
VITE_BACKEND_ORIGIN=https://<your-railway-url>
VITE_WS_URL=wss://<your-railway-url>/ws
VITE_APP_ORIGIN=https://<your-vercel-url>
```

5. Vercel auto-deploys on every push to `main`.

> `VITE_DEV_SERVER_PORT` is only used locally and does not need to be set on Vercel.

---

## Scripts

All scripts run from the **repo root** with no compilation step needed.

### `npm run setup-devnet`

One-time devnet setup. Idempotent — safe to run multiple times.

- Generates `scripts/treasury-keypair.json` if it doesn't exist
- Airdrops up to 2 devnet SOL to the treasury (in 1 SOL chunks due to faucet limits)
- Creates the SPL token mint with 6 decimals
- Mints 1,000,000 $TOILET to the treasury's associated token account
- Saves `scripts/token-info.json` with the mint address, decimals, and treasury address

```bash
npm run setup-devnet
```

### `npm run airdrop-toilet -- <address>`

Sends 10,000 $TOILET from the devnet treasury to any wallet. Creates the recipient's ATA if needed (treasury pays the rent).

```bash
npm run airdrop-toilet -- <recipient-wallet-address>
```

### `npm run airdrop-sol -- <address>`

Requests 1 devnet SOL from the public faucet for any wallet. Useful for covering transaction fees.

```bash
npm run airdrop-sol -- <recipient-wallet-address>
```

> The devnet faucet is rate-limited per IP. If it fails, use [faucet.solana.com](https://faucet.solana.com) manually.

---

## Game Features

### Phase 1 — Game Logic

- **Phaser.js game engine** embedded directly in the match page
- **Player movement:** Arrow keys or A/D to move, Spacebar or W to jump
- **Aiming and shooting:** Left-click fires toward the mouse cursor
- **Magazine system:** 10 rounds default; auto-reload when empty
- **Health bars** with per-hit damage display
- **Server-side hit detection:** client sends shoot events, server confirms hits — client results are never trusted
- **Match end:** game over when a player's health reaches 0; winner stays, loser returns to lobby
- **Real-time sync:** player positions, health, and ammo state broadcast to both clients via WebSocket
- **Demo mode:** `/match/demo` — single player, no stake, no session check

### Phase 2 — Betting & Wallet

- **Phantom wallet integration** via `@solana/wallet-adapter-react`
- **Custom wallet connect modal:** dark-themed, detects Phantom installation, shows install link if extension is missing
- **$TOILET balance display** in the header after connection
- **Stake lock on match start:** tokens held by treasury during the match
- **Auto payout to winner** via SPL token transfer from treasury on match resolve
- **On-chain transaction link** displayed to winner after payout (Solana Explorer)
- **Extended magazine upgrade:** 20-round mag purchasable in the room lobby for 10 $TOILET
- **Stake tiers:** 100 / 500 / 1,000 $TOILET
- **Redis-backed live state:** rooms, players, match phase, reconnect grace periods
- **Postgres match history:** winner, loser, stake amount, payout, timestamp, on-chain signature
- **Leaderboard:** top players by total winnings, served from Postgres

### Matchmaking & Reliability

- Room create / join / leave with live WebSocket broadcast to all lobby subscribers
- Ready-up system with 5-second countdown before match starts
- **Client reconnection:** 60-second grace period; on reconnect the match resumes transparently
- **Mid-match disconnect resolution:** if a player stays offline for 30 seconds, the opponent is awarded the win automatically
- Forfeit / resign with confirmation dialog
- Session tracking via `sessionStorage` — tab-scoped, survives page refresh, requires no database

---

## Switching to Mainnet

### 1. Update `src/config/solana.ts` (frontend)

```ts
export const SOLANA_NETWORK = 'mainnet-beta';
export const SOLANA_RPC_URL = 'https://your-rpc-provider.com'; // use a paid RPC endpoint
export const TOILET_TOKEN_MINT = '<mainnet $TOILET mint address>';
export const TREASURY_WALLET   = '<mainnet treasury public key>';
```

### 2. Update Railway environment variables (backend)

```
TOILET_TOKEN_MINT=<mainnet mint address>
TREASURY_WALLET_ADDRESS=<mainnet treasury public key>
TREASURY_KEYPAIR_JSON=<mainnet treasury secret key JSON array>
```

### 3. Fund the treasury

The treasury wallet must hold enough $TOILET to cover active payouts. Each completed match pays out `stake × 2`. Transfer a sufficient float to the treasury before opening the game to players.

### 4. Use a production RPC provider

The public Solana RPC endpoints are heavily rate-limited and unsuitable for production traffic. Recommended providers:

| Provider | Notes |
|---|---|
| [Helius](https://helius.dev) | Generous free tier, low latency, Solana-native |
| [QuickNode](https://www.quicknode.com) | Reliable, good WebSocket support |
| [Alchemy](https://www.alchemy.com/solana) | Familiar API style, multi-chain |

Set `SOLANA_RPC_URL` in `src/config/solana.ts` and pass the same endpoint to `payout.js` on the server for on-chain transactions.

---

> **Security reminder:** `TREASURY_KEYPAIR_JSON` is a hot wallet private key. Store it only in Railway's encrypted environment variable store. Never commit it to the repository or log it to the console.
