/**
 * Lobby + rooms + match handles (MVP).
 * @typedef {{
 *   id: string,
 *   stakeSol: number,
 *   players: Array<{
 *     playerId: string,
 *     clientSessionId: string,
 *     ready: boolean,
 *     ws: import('ws').WebSocket | null,
 *     disconnectedAt: number | null,
 *   }>,
 *   createdAt: number,
 *   countdownTimer: ReturnType<typeof setTimeout> | null,
 *   countdownEndsAt: number | null,
 *   activeMatchId: string | null,
 * }} Room
 */

import crypto from 'node:crypto';

const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const MATCH_RECORD_TTL_MS = 2 * 60 * 60 * 1000;
const READY_COUNTDOWN_MS = 5000;
const RECONNECT_GRACE_MS = 60 * 1000;
const REMATCH_WINDOW_MS = 15 * 1000;
const ROUNDS_TO_WIN_MATCH = 2;

/** @type {Map<string, Room>} */
const rooms = new Map();
/** @type {Set<import('ws').WebSocket>} */
const lobbySubscribers = new Set();
/** @type {Map<string, string>} */
const pendingRoomByClientSession = new Map();
/** @type {Map<string, { roomId: string, stakeSol: number, createdAt: number }>} */
const activeMatches = new Map();

const STAKES = new Set([100, 500, 1000]);

function genPlayerId() {
  return crypto.randomUUID();
}

function genRoomId() {
  return `room-${crypto.randomUUID().slice(0, 8)}`;
}

function genMatchId() {
  return `match-${crypto.randomUUID().slice(0, 12)}`;
}

function label(playerId) {
  return `Player ${playerId.slice(-4)}`;
}

/** @param {Room} room */
function hostDisplay(room) {
  return room.players[0] ? label(room.players[0].playerId) : '—';
}

/** @param {Room} room */
function roomSummary(room) {
  return {
    id: room.id,
    stakeSol: room.stakeSol,
    stakeLabel: `${room.stakeSol.toLocaleString()} $TOILET`,
    hostDisplay: hostDisplay(room),
    seatsFilled: room.players.length,
    seatsTotal: 2,
    awaitingHost: room.players.length === 0,
  };
}

/** @param {Room} room */
function roomPhase(room) {
  if (room.activeMatchId) return 'in_match';
  if (room.countdownEndsAt != null && Date.now() < room.countdownEndsAt) {
    return 'countdown';
  }
  if (room.players.length < 2) return 'waiting_opponent';
  if (room.players.every((p) => p.ready)) return 'starting';
  return 'ready_up';
}

export function listRooms() {
  return [...rooms.values()].map(roomSummary);
}

function broadcastLobby() {
  const payload = JSON.stringify({ type: 'rooms_snapshot', rooms: listRooms() });
  for (const ws of lobbySubscribers) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

/** @param {string} roomId */
function clearPendingKeysForRoom(roomId) {
  for (const [sessionId, rid] of pendingRoomByClientSession.entries()) {
    if (rid === roomId) pendingRoomByClientSession.delete(sessionId);
  }
}

/** @param {Room} room */
function cancelRoomCountdown(room) {
  if (room.countdownTimer) {
    clearTimeout(room.countdownTimer);
    room.countdownTimer = null;
  }
  room.countdownEndsAt = null;
}

/** @param {Room} room @param {string} selfPlayerId */
function roomStatePayload(room, selfPlayerId) {
  const phase = roomPhase(room);
  return {
    type: 'room_state',
    roomId: room.id,
    stakeSol: room.stakeSol,
    phase,
    countdownEndsAt: room.countdownEndsAt ?? null,
    /** So the client can map "you" even if `welcome` is delivered after the first `room_state`. */
    selfPlayerId,
    players: room.players.map((p, seat) => ({
      playerId: p.playerId,
      seat,
      ready: p.ready,
      connected: Boolean(p.ws && p.ws.readyState === 1),
      label: label(p.playerId),
      isHost: seat === 0,
    })),
  };
}

/** @param {Room} room */
function broadcastRoom(room) {
  for (const p of room.players) {
    if (!p.ws || p.ws.readyState !== 1) continue;
    const payload = JSON.stringify(roomStatePayload(room, p.playerId));
    p.ws.send(payload);
  }
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generate a random three-platform layout (fractions of canvas).
 *
 * Reference physics (canvas height ≈ 600): single jump apex = 144 px ≈ 0.24 of height,
 * double jump apex = 288 px ≈ 0.48. The yFraction ranges below keep the constraints true
 * for any reasonably-tall canvas:
 *   - lowest top is below the single-jump-from-ground apex (reachable in one jump).
 *   - middle top is above the single-jump apex but inside the double-jump apex from ground.
 *   - highest is outside single-jump-from-middle reach but inside double-jump-from-middle.
 *   - lowest↔middle gap ≥ 0.16, middle↔highest gap ≥ 0.28 — both above the 15 % rule.
 * X positions are shuffled across left/center/right thirds.
 *
 * @returns {Array<{ xFraction: number, yFraction: number, wFraction: number }>}
 */
function generatePlatformLayout() {
  const lowestY = randRange(0.74, 0.86);
  const middleY = randRange(0.46, 0.58);
  const highestMinY = Math.max(0.08, middleY - 0.42);
  const highestMaxY = middleY - 0.28;
  const highestY = randRange(highestMinY, highestMaxY);

  const thirds = shuffleArray([
    [0.15, 0.32],
    [0.4, 0.6],
    [0.68, 0.85],
  ]);

  return [
    { xFraction: randRange(thirds[0][0], thirds[0][1]), yFraction: lowestY, wFraction: 0.22 },
    { xFraction: randRange(thirds[1][0], thirds[1][1]), yFraction: middleY, wFraction: 0.2 },
    { xFraction: randRange(thirds[2][0], thirds[2][1]), yFraction: highestY, wFraction: 0.18 },
  ];
}

/**
 * Table stays open; both players keep seats until forfeit or normal end (later).
 * @param {Room} room
 */
function finalizeMatch(room) {
  if (room.players.length !== 2 || !room.players.every((p) => p.ready)) return;

  const matchId = genMatchId();
  const roomId = room.id;
  const platforms = generatePlatformLayout();
  const payload = JSON.stringify({ type: 'match_started', roomId, matchId, platforms });

  cancelRoomCountdown(room);

  activeMatches.set(matchId, {
    roomId,
    stakeSol: room.stakeSol,
    createdAt: Date.now(),
  });

  room.activeMatchId = matchId;
  room.gameState = {
    players: {
      [room.players[0].playerId]: { health: 100 },
      [room.players[1].playerId]: { health: 100 },
    },
    roundsWon: {
      [room.players[0].playerId]: 0,
      [room.players[1].playerId]: 0,
    },
    roundNumber: 1,
    platforms,
  };
  /** A stale rematch window from the prior match shouldn't influence this one. */
  if (room.rematchWindow?.timer) clearTimeout(room.rematchWindow.timer);
  room.rematchWindow = null;
  room.players.forEach((p) => {
    p.ready = false;
  });

  for (const p of room.players) {
    if (p.ws.readyState === 1) p.ws.send(payload);
  }
  broadcastRoom(room);
  broadcastLobby();
}

/**
 * Health-driven match end (target health hit 0).
 * Mirrors forfeitMatch: loser leaves the room, winner keeps seat, broadcasts resolve.
 * @param {Room} room
 * @param {string} matchId
 * @param {{ playerId: string, ws: import('ws').WebSocket | null }} winner
 * @param {{ playerId: string, ws: import('ws').WebSocket | null }} loser
 */
function resolveMatchByElimination(room, matchId, winner, loser) {
  if (!room.activeMatchId || room.activeMatchId !== matchId) return;

  const stakeSol = room.stakeSol;
  const potSol = stakeSol * 2;
  const winnerPlayerId = winner.playerId;
  const loserPlayerId = loser.playerId;

  /** Halt further game-message processing immediately. */
  room.activeMatchId = null;
  activeMatches.delete(matchId);

  const overPayload = JSON.stringify({
    type: 'game_over',
    matchId,
    winnerPlayerId,
    loserPlayerId,
  });
  for (const p of [winner, loser]) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(overPayload);
  }

  const resolution = JSON.stringify({
    type: 'match_resolved',
    reason: 'eliminated',
    matchId,
    roomId: room.id,
    winnerPlayerId,
    loserPlayerId,
    stakeSol,
    potSol,
    payoutNote: 'winner takes pot — placeholder settlement until on-chain escrow',
  });
  for (const p of [winner, loser]) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(resolution);
  }

  /**
   * Defer the "remove loser from room" cleanup. Both players stay seated during the
   * REMATCH_WINDOW_MS window so they can opt in to a fresh match. If neither / only one
   * accepts within the window, finalizeRematchWindow runs the normal post-match cleanup.
   */
  if (room.rematchWindow?.timer) clearTimeout(room.rematchWindow.timer);
  room.rematchWindow = {
    matchId,
    winnerPlayerId,
    loserPlayerId,
    acceptedBy: new Set(),
    timer: setTimeout(() => finalizeRematchWindow(room, matchId), REMATCH_WINDOW_MS),
  };

  broadcastLobby();
}

/**
 * Tear down a stale rematch window — fires on timeout, decline, or disconnect.
 * Completes the post-match cleanup that resolveMatchByElimination deferred.
 * @param {Room} room
 * @param {string} matchId
 */
function finalizeRematchWindow(room, matchId) {
  const win = room.rematchWindow;
  if (!win || win.matchId !== matchId) return;
  if (win.timer) clearTimeout(win.timer);
  room.rematchWindow = null;
  room.gameState = null;

  const loser = room.players.find((p) => p.playerId === win.loserPlayerId);
  if (loser?.ws) loser.ws.roomId = null;
  room.players = room.players.filter((p) => p.playerId !== win.loserPlayerId);
  room.players.forEach((p) => {
    p.ready = false;
  });

  broadcastRoom(room);
  broadcastLobby();
}

/**
 * Forfeit: loser removed, winner keeps seat; table returns to matchmaking (one seat open).
 * Escrow split is placeholder fields for future settlement.
 * @param {Room} room
 * @param {string} matchId
 * @param {import('ws').WebSocket} forfeitingWs
 */
function forfeitMatch(room, matchId, forfeitingWs) {
  if (!room.activeMatchId || room.activeMatchId !== matchId) return;
  const idx = room.players.findIndex((p) => p.ws === forfeitingWs);
  if (idx === -1) return;

  const forfeiter = room.players[idx];
  const winner = room.players[idx === 0 ? 1 : 0];
  const stakeSol = room.stakeSol;
  const potSol = stakeSol * 2;

  room.activeMatchId = null;
  room.gameState = null;
  activeMatches.delete(matchId);

  const resolution = {
    type: 'match_resolved',
    reason: 'forfeit',
    matchId,
    roomId: room.id,
    winnerPlayerId: winner.playerId,
    loserPlayerId: forfeiter.playerId,
    stakeSol,
    potSol,
    /** Placeholder: full pot to winner on forfeit (real settlement later). */
    payoutNote: 'forfeit — opponent receives combined stakes (placeholder)',
  };

  const payload = JSON.stringify(resolution);
  if (forfeitingWs.readyState === 1) forfeitingWs.send(payload);
  if (winner.ws && winner.ws.readyState === 1) winner.ws.send(payload);

  forfeitingWs.roomId = null;
  room.players = room.players.filter((p) => p.ws !== forfeitingWs);
  room.players.forEach((p) => {
    p.ready = false;
  });

  broadcastRoom(room);
  broadcastLobby();
}

/** @param {Room} room */
function beginCountdown(room) {
  if (room.players.length !== 2 || !room.players.every((p) => p.ready)) return;
  if (room.countdownTimer) return;

  cancelRoomCountdown(room);
  room.countdownEndsAt = Date.now() + READY_COUNTDOWN_MS;
  broadcastRoom(room);

  room.countdownTimer = setTimeout(() => {
    room.countdownTimer = null;
    room.countdownEndsAt = null;
    const r = rooms.get(room.id);
    if (!r || r.players.length !== 2 || !r.players.every((p) => p.ready)) return;
    finalizeMatch(r);
  }, READY_COUNTDOWN_MS);
}

/** @param {import('ws').WebSocket} ws */
function leaveRoomExplicit(ws) {
  const rid = ws.roomId;
  if (!rid || typeof rid !== 'string') return;
  const room = rooms.get(rid);
  if (!room) {
    ws.roomId = null;
    return;
  }

  const idx = room.players.findIndex((p) => p.ws === ws);
  if (idx === -1) {
    ws.roomId = null;
    return;
  }

  if (room.activeMatchId) {
    forfeitMatch(room, room.activeMatchId, ws);
    return;
  }

  room.players = room.players.filter((p) => p.ws !== ws);
  ws.roomId = null;

  if (room.players.length === 0) {
    cancelRoomCountdown(room);
    rooms.delete(rid);
    clearPendingKeysForRoom(rid);
    broadcastLobby();
    return;
  }

  /** One player left — keep the table open; remaining player becomes seat 0 (host). */
  cancelRoomCountdown(room);
  room.players.forEach((p) => {
    p.ready = false;
  });
  broadcastRoom(room);
  broadcastLobby();
}

/** Refresh / transient network drop: keep seat for grace period (no DB). */
function disconnectFromRoom(ws) {
  const rid = ws.roomId;
  if (!rid || typeof rid !== 'string') return;
  const room = rooms.get(rid);
  if (!room) {
    ws.roomId = null;
    return;
  }

  const idx = room.players.findIndex((p) => p.ws === ws);
  if (idx === -1) {
    ws.roomId = null;
    return;
  }

  if (room.activeMatchId) {
    forfeitMatch(room, room.activeMatchId, ws);
    return;
  }

  room.players[idx].ws = null;
  room.players[idx].disconnectedAt = Date.now();
  ws.roomId = null;

  cancelRoomCountdown(room);
  room.players.forEach((p) => {
    p.ready = false;
  });
  broadcastRoom(room);
  broadcastLobby();
}

/** @param {import('ws').WebSocket} ws */
function sendError(ws, code, message) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'error', code, message }));
}

export function sweepStaleEmptyRooms() {
  const now = Date.now();
  let changed = false;
  for (const [id, room] of rooms.entries()) {
    const before = room.players.length;
    room.players = room.players.filter((p) => {
      if (p.ws) return true;
      if (!p.disconnectedAt) return false;
      return now - p.disconnectedAt < RECONNECT_GRACE_MS;
    });
    if (room.players.length !== before) changed = true;

    if (room.players.length === 0 && now - room.createdAt > EMPTY_ROOM_TTL_MS) {
      cancelRoomCountdown(room);
      rooms.delete(id);
      clearPendingKeysForRoom(id);
      changed = true;
    }
  }
  for (const [mid, rec] of activeMatches.entries()) {
    if (now - rec.createdAt > MATCH_RECORD_TTL_MS) activeMatches.delete(mid);
  }
  if (changed) broadcastLobby();
}

/**
 * @param {import('ws').WebSocket} ws
 * @returns {string} playerId for welcome message
 */
export function bindConnection(ws) {
  const playerId = genPlayerId();
  ws.playerId = playerId;
  ws.roomId = null;
  return playerId;
}

/** @param {import('ws').WebSocket} ws */
export function onConnectionClosed(ws) {
  lobbySubscribers.delete(ws);
  disconnectFromRoom(ws);
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {string} text
 */
export function dispatchMessage(ws, text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    sendError(ws, 'BAD_JSON', 'Expected JSON message');
    return;
  }
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
    sendError(ws, 'BAD_MESSAGE', 'Missing type');
    return;
  }

  switch (msg.type) {
    case 'lobby_subscribe': {
      lobbySubscribers.add(ws);
      ws.send(JSON.stringify({ type: 'rooms_snapshot', rooms: listRooms() }));
      break;
    }
    case 'lobby_unsubscribe': {
      lobbySubscribers.delete(ws);
      break;
    }
    case 'list_rooms': {
      ws.send(JSON.stringify({ type: 'rooms_snapshot', rooms: listRooms() }));
      break;
    }
    case 'create_room': {
      const stake = Number(msg.stakeSol);
      if (!STAKES.has(stake)) {
        sendError(ws, 'BAD_STAKE', 'stakeSol must be 100, 500, or 1000');
        return;
      }
      const clientSessionId =
        typeof msg.clientSessionId === 'string' ? msg.clientSessionId.trim() : '';

      leaveRoomExplicit(ws);

      if (clientSessionId) {
        const existingId = pendingRoomByClientSession.get(clientSessionId);
        if (existingId) {
          const existing = rooms.get(existingId);
          if (existing && existing.players.length === 0) {
            if (existing.stakeSol === stake) {
              ws.send(JSON.stringify({ type: 'room_created', room: roomSummary(existing) }));
              broadcastLobby();
              return;
            }
            rooms.delete(existingId);
            clearPendingKeysForRoom(existingId);
            pendingRoomByClientSession.delete(clientSessionId);
          }
        }
      }

      const id = genRoomId();
      /** @type {Room} */
      const room = {
        id,
        stakeSol: stake,
        players: [],
        createdAt: Date.now(),
        countdownTimer: null,
        countdownEndsAt: null,
        activeMatchId: null,
      };
      rooms.set(id, room);
      if (clientSessionId) pendingRoomByClientSession.set(clientSessionId, id);

      ws.send(JSON.stringify({ type: 'room_created', room: roomSummary(room) }));
      broadcastLobby();
      break;
    }
    case 'join_room': {
      const roomId = typeof msg.roomId === 'string' ? msg.roomId : '';
      const room = rooms.get(roomId);
      if (!room) {
        sendError(ws, 'ROOM_NOT_FOUND', 'No room with that id');
        return;
      }
      if (room.activeMatchId) {
        sendError(ws, 'MATCH_IN_PROGRESS', 'Table is in a match');
        return;
      }

      const clientSessionId =
        typeof msg.clientSessionId === 'string' ? msg.clientSessionId.trim() : '';

      if (clientSessionId) {
        const existing = room.players.find(
          (p) =>
            p.clientSessionId === clientSessionId &&
            !p.ws &&
            p.disconnectedAt != null &&
            Date.now() - p.disconnectedAt < RECONNECT_GRACE_MS,
        );
        if (existing) {
          existing.ws = ws;
          existing.disconnectedAt = null;
          ws.playerId = existing.playerId;
          ws.roomId = roomId;
          broadcastRoom(room);
          broadcastLobby();
          break;
        }
      }

      if (room.players.some((p) => p.playerId === ws.playerId)) {
        ws.roomId = roomId;
        broadcastRoom(room);
        break;
      }
      if (room.players.length >= 2) {
        sendError(ws, 'ROOM_FULL', 'Room already has two players');
        return;
      }
      leaveRoomExplicit(ws);
      room.players.push({
        playerId: ws.playerId,
        clientSessionId,
        ready: false,
        ws,
        disconnectedAt: null,
      });
      ws.roomId = roomId;
      if (room.players.length >= 1) clearPendingKeysForRoom(roomId);
      broadcastRoom(room);
      broadcastLobby();
      break;
    }
    case 'leave_room': {
      leaveRoomExplicit(ws);
      break;
    }
    case 'forfeit_match': {
      const mid = typeof msg.matchId === 'string' ? msg.matchId : '';
      const rec = activeMatches.get(mid);
      if (!rec) {
        sendError(ws, 'MATCH_NOT_FOUND', 'Unknown or expired match');
        return;
      }
      const room = rooms.get(rec.roomId);
      if (!room || room.activeMatchId !== mid) {
        sendError(ws, 'MATCH_NOT_FOUND', 'Match no longer active');
        return;
      }
      if (!room.players.some((p) => p.ws === ws)) {
        sendError(ws, 'NOT_IN_MATCH', 'Not in this match');
        return;
      }
      forfeitMatch(room, mid, ws);
      break;
    }
    case 'join_match': {
      const matchId = typeof msg.matchId === 'string' ? msg.matchId : '';
      const rec = activeMatches.get(matchId);
      if (!rec) {
        sendError(ws, 'MATCH_NOT_FOUND', 'Unknown or expired match');
        return;
      }
      ws.send(
        JSON.stringify({
          type: 'match_joined',
          matchId,
          roomId: rec.roomId,
          stakeSol: rec.stakeSol,
        }),
      );
      break;
    }
    case 'set_ready': {
      const rid = ws.roomId;
      if (!rid || typeof rid !== 'string') {
        sendError(ws, 'NOT_IN_ROOM', 'Join a room first');
        return;
      }
      const room = rooms.get(rid);
      if (!room) {
        sendError(ws, 'ROOM_NOT_FOUND', 'Room gone');
        ws.roomId = null;
        return;
      }
      if (room.activeMatchId) {
        sendError(ws, 'IN_MATCH', 'Cannot change ready during a match');
        return;
      }
      const entry = room.players.find((p) => p.playerId === ws.playerId);
      if (!entry) {
        sendError(ws, 'NOT_IN_ROOM', 'Not seated in this room');
        return;
      }

      const nextReady = Boolean(msg.ready);

      /** One-way ready: cannot unset once true (no “not ready” / no countdown cancel via toggle). */
      if (entry.ready && !nextReady) {
        sendError(ws, 'READY_LOCKED', 'Ready is final — you cannot go back');
        return;
      }

      entry.ready = nextReady;

      if (room.players.length === 2 && room.players.every((p) => p.ready)) {
        beginCountdown(room);
      } else {
        broadcastRoom(room);
        broadcastLobby();
      }
      break;
    }
    case 'game_update': {
      const rid = ws.roomId;
      if (!rid || typeof rid !== 'string') return;
      const room = rooms.get(rid);
      if (!room || !room.activeMatchId) return;
      const opponent = room.players.find((p) => p.ws !== ws);
      if (!opponent || !opponent.ws || opponent.ws.readyState !== 1) return;
      opponent.ws.send(
        JSON.stringify({
          type: 'game_update',
          fromPlayerId: ws.playerId,
          x: Number(msg.x) || 0,
          y: Number(msg.y) || 0,
          vx: Number(msg.vx) || 0,
          vy: Number(msg.vy) || 0,
        }),
      );
      break;
    }
    case 'game_shoot': {
      const rid = ws.roomId;
      if (!rid || typeof rid !== 'string') return;
      const room = rooms.get(rid);
      if (!room || !room.activeMatchId) return;
      const opponent = room.players.find((p) => p.ws !== ws);
      if (!opponent || !opponent.ws || opponent.ws.readyState !== 1) return;
      opponent.ws.send(
        JSON.stringify({
          type: 'game_shoot',
          fromPlayerId: ws.playerId,
          x: Number(msg.x) || 0,
          y: Number(msg.y) || 0,
          dx: Number(msg.dx) || 0,
          dy: Number(msg.dy) || 0,
        }),
      );
      break;
    }
    case 'game_hit': {
      const rid = ws.roomId;
      if (!rid || typeof rid !== 'string') return;
      const room = rooms.get(rid);
      if (!room || !room.activeMatchId || !room.gameState) return;

      const shooter = room.players.find((p) => p.ws === ws);
      if (!shooter) return;
      const targetPlayerId =
        typeof msg.targetPlayerId === 'string' ? msg.targetPlayerId.trim() : '';
      if (!targetPlayerId || targetPlayerId === shooter.playerId) return;
      const target = room.players.find((p) => p.playerId === targetPlayerId);
      if (!target) return;

      const targetState = room.gameState.players[targetPlayerId];
      if (!targetState || targetState.health <= 0) return;

      targetState.health = Math.max(0, targetState.health - 10);

      const confirmation = JSON.stringify({
        type: 'game_hit',
        matchId: room.activeMatchId,
        shooterPlayerId: shooter.playerId,
        targetPlayerId,
        targetHealth: targetState.health,
      });
      for (const p of room.players) {
        if (p.ws && p.ws.readyState === 1) p.ws.send(confirmation);
      }

      if (targetState.health <= 0) {
        /** Round end — credit the shooter, then either close the match or roll into the next round. */
        const roundsWon = room.gameState.roundsWon;
        roundsWon[shooter.playerId] = (roundsWon[shooter.playerId] || 0) + 1;

        if (roundsWon[shooter.playerId] >= ROUNDS_TO_WIN_MATCH) {
          resolveMatchByElimination(room, room.activeMatchId, shooter, target);
        } else {
          /** Reset healths for the next round and broadcast the score. */
          room.gameState.players[shooter.playerId].health = 100;
          room.gameState.players[target.playerId].health = 100;
          room.gameState.roundNumber = (room.gameState.roundNumber || 1) + 1;

          const roundEndedPayload = JSON.stringify({
            type: 'round_ended',
            matchId: room.activeMatchId,
            roundWinnerPlayerId: shooter.playerId,
            roundLoserPlayerId: target.playerId,
            nextRound: room.gameState.roundNumber,
            scores: {
              [room.players[0].playerId]: roundsWon[room.players[0].playerId] || 0,
              [room.players[1].playerId]: roundsWon[room.players[1].playerId] || 0,
            },
            playerHealth: 100,
          });
          for (const p of room.players) {
            if (p.ws && p.ws.readyState === 1) p.ws.send(roundEndedPayload);
          }
        }
      }
      break;
    }
    case 'game_over': {
      /** Server is the authority on match end (driven by game_hit reaching 0). */
      /** Ignore client-sent game_over; left here to make the protocol whitelist explicit. */
      break;
    }
    case 'request_rematch': {
      const rid = ws.roomId;
      if (!rid || typeof rid !== 'string') return;
      const room = rooms.get(rid);
      if (!room || !room.rematchWindow) return;
      const requesterId = ws.playerId;
      if (
        requesterId !== room.rematchWindow.winnerPlayerId &&
        requesterId !== room.rematchWindow.loserPlayerId
      ) {
        return;
      }
      room.rematchWindow.acceptedBy.add(requesterId);

      const status = JSON.stringify({
        type: 'rematch_status',
        matchId: room.rematchWindow.matchId,
        acceptedBy: [...room.rematchWindow.acceptedBy],
      });
      for (const p of room.players) {
        if (p.ws && p.ws.readyState === 1) p.ws.send(status);
      }

      if (room.rematchWindow.acceptedBy.size >= 2) {
        const bothConnected =
          room.players.length === 2 &&
          room.players.every((p) => p.ws && p.ws.readyState === 1);
        if (!bothConnected) {
          finalizeRematchWindow(room, room.rematchWindow.matchId);
          break;
        }
        clearTimeout(room.rematchWindow.timer);
        room.rematchWindow = null;
        room.players.forEach((p) => {
          p.ready = true;
        });
        finalizeMatch(room);
      }
      break;
    }
    default:
      sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${msg.type}`);
  }
}
