/**
 * Singleton ioredis client + helpers for live room/match state persistence.
 *
 * Local dev: REDIS_URL defaults to redis://localhost:6379. Easiest local options:
 *   - Docker:  docker run -p 6379:6379 redis:7-alpine
 *   - WSL:     sudo apt install redis-server && redis-server
 *   - Windows: install via WSL, Memurai, or use a hosted instance (Upstash free tier)
 *   - Hosted:  set REDIS_URL=rediss://<user>:<pass>@<host>:<port>
 *
 * Only data fields are serialized — timer handles, WebSocket references, and
 * Set instances live in memory inside room-store.js and are reattached on read.
 */

import Redis from 'ioredis';

import './env.js';

const DEFAULT_URL = 'redis://localhost:6379';

const url = process.env.REDIS_URL?.trim() || DEFAULT_URL;

/** Keys are namespaced so multiple deployments can share a single Redis instance. */
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX?.trim() || 'toilet';

const ROOM_KEY = (id) => `${KEY_PREFIX}:room:${id}`;
const ROOMS_INDEX = `${KEY_PREFIX}:rooms`;
const MATCH_KEY = (id) => `${KEY_PREFIX}:match:${id}`;
const MATCHES_INDEX = `${KEY_PREFIX}:matches`;
const PLAYER_ROOM_KEY = (id) => `${KEY_PREFIX}:playerRoom:${id}`;
const PENDING_ROOM_KEY = (sid) => `${KEY_PREFIX}:pendingRoom:${sid}`;
const PENDING_ROOM_INDEX = `${KEY_PREFIX}:pendingRoom`;

export const redis = new Redis(url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

let firstConnect = true;
redis.on('connect', () => {
  if (firstConnect) {
    firstConnect = false;
    console.log(`[redis] connected to ${url}`);
  }
});
redis.on('error', (err) => {
  console.error(`[redis] error: ${err?.message ?? err}`);
});
redis.on('reconnecting', (ms) => {
  console.warn(`[redis] reconnecting in ${ms}ms`);
});

/* ---------- Room ---------- */

/** @param {unknown} room */
function sanitizeRoomForStorage(room) {
  if (!room || typeof room !== 'object') return null;
  const r = /** @type {any} */ (room);
  return {
    id: r.id,
    stakeSol: r.stakeSol,
    players: Array.isArray(r.players)
      ? r.players.map((p) => ({
          playerId: p.playerId,
          clientSessionId: p.clientSessionId ?? '',
          ready: Boolean(p.ready),
          disconnectedAt: p.disconnectedAt ?? null,
          walletAddress: p.walletAddress ?? null,
        }))
      : [],
    createdAt: r.createdAt,
    countdownEndsAt: r.countdownEndsAt ?? null,
    activeMatchId: r.activeMatchId ?? null,
    extendedMag: r.extendedMag ?? {},
    gameState: r.gameState ?? null,
    stakePending: r.stakePending
      ? {
          startedAt: r.stakePending.startedAt,
          endsAt: r.stakePending.endsAt,
          status: r.stakePending.status ?? {},
          signatures: r.stakePending.signatures ?? {},
        }
      : null,
    rematchWindow: r.rematchWindow
      ? {
          matchId: r.rematchWindow.matchId,
          winnerPlayerId: r.rematchWindow.winnerPlayerId,
          loserPlayerId: r.rematchWindow.loserPlayerId,
          acceptedBy: Array.isArray(r.rematchWindow.acceptedBy)
            ? r.rematchWindow.acceptedBy
            : r.rematchWindow.acceptedBy instanceof Set
              ? [...r.rematchWindow.acceptedBy]
              : [],
        }
      : null,
  };
}

export async function getRoom(roomId) {
  if (!roomId) return null;
  const raw = await redis.get(ROOM_KEY(roomId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setRoom(roomId, room) {
  const sanitized = sanitizeRoomForStorage(room);
  if (!sanitized) return;
  await redis.multi().set(ROOM_KEY(roomId), JSON.stringify(sanitized)).sadd(ROOMS_INDEX, roomId).exec();
}

export async function deleteRoom(roomId) {
  await redis.multi().del(ROOM_KEY(roomId)).srem(ROOMS_INDEX, roomId).exec();
}

export async function listAllRoomIds() {
  return redis.smembers(ROOMS_INDEX);
}

export async function getAllRooms() {
  const ids = await listAllRoomIds();
  if (ids.length === 0) return [];
  const raws = await redis.mget(ids.map(ROOM_KEY));
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const raw = raws[i];
    if (!raw) {
      /** Drift between index and key — drop the orphan id. */
      await redis.srem(ROOMS_INDEX, ids[i]);
      continue;
    }
    try {
      out.push(JSON.parse(raw));
    } catch {
      /** Corrupt payload — purge it so it doesn't keep failing the index. */
      await redis.multi().del(ROOM_KEY(ids[i])).srem(ROOMS_INDEX, ids[i]).exec();
    }
  }
  return out;
}

/* ---------- Player → Room ---------- */

export async function setPlayerRoom(playerId, roomId) {
  if (!playerId || !roomId) return;
  await redis.set(PLAYER_ROOM_KEY(playerId), roomId);
}

export async function getPlayerRoom(playerId) {
  if (!playerId) return null;
  return redis.get(PLAYER_ROOM_KEY(playerId));
}

export async function clearPlayerRoom(playerId) {
  if (!playerId) return;
  await redis.del(PLAYER_ROOM_KEY(playerId));
}

/* ---------- Match registry ---------- */

export async function getMatch(matchId) {
  if (!matchId) return null;
  const raw = await redis.get(MATCH_KEY(matchId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setMatch(matchId, record) {
  await redis
    .multi()
    .set(MATCH_KEY(matchId), JSON.stringify(record))
    .sadd(MATCHES_INDEX, matchId)
    .exec();
}

export async function deleteMatch(matchId) {
  await redis.multi().del(MATCH_KEY(matchId)).srem(MATCHES_INDEX, matchId).exec();
}

export async function listAllMatchIds() {
  return redis.smembers(MATCHES_INDEX);
}

/* ---------- Pending-room (creation flow) ---------- */

export async function setPendingRoom(sessionId, roomId) {
  if (!sessionId || !roomId) return;
  await redis.multi().set(PENDING_ROOM_KEY(sessionId), roomId).sadd(PENDING_ROOM_INDEX, sessionId).exec();
}

export async function getPendingRoom(sessionId) {
  if (!sessionId) return null;
  return redis.get(PENDING_ROOM_KEY(sessionId));
}

export async function clearPendingRoom(sessionId) {
  if (!sessionId) return;
  await redis.multi().del(PENDING_ROOM_KEY(sessionId)).srem(PENDING_ROOM_INDEX, sessionId).exec();
}

export async function listAllPendingSessions() {
  return redis.smembers(PENDING_ROOM_INDEX);
}

export async function clearPendingForRoom(roomId) {
  const sessions = await listAllPendingSessions();
  if (sessions.length === 0) return;
  const pairs = await redis.mget(sessions.map(PENDING_ROOM_KEY));
  const pipeline = redis.multi();
  let queued = 0;
  for (let i = 0; i < sessions.length; i++) {
    if (pairs[i] === roomId) {
      pipeline.del(PENDING_ROOM_KEY(sessions[i])).srem(PENDING_ROOM_INDEX, sessions[i]);
      queued++;
    }
  }
  if (queued > 0) await pipeline.exec();
}
