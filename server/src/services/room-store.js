console.log(
  `[diag boot] room-store.js loaded at ${new Date().toISOString()} from ${import.meta.url}`,
);

/**
 * Lobby + rooms + match handles (Redis-backed).
 *
 * Room data lives in Redis so it survives server restart and tab refresh.
 * Timer handles, WebSocket references, and lobby subscriber refs live in
 * memory only — they are not (and cannot be) serialized.
 *
 * @typedef {{
 *   id: string,
 *   stakeSol: number,
 *   players: Array<{
 *     playerId: string,
 *     clientSessionId: string,
 *     ready: boolean,
 *     ws: import('ws').WebSocket | null,
 *     disconnectedAt: number | null,
 *     walletAddress: string | null,
 *   }>,
 *   createdAt: number,
 *   countdownEndsAt: number | null,
 *   activeMatchId: string | null,
 *   extendedMag: Record<string, boolean>,
 *   gameState: any,
 *   stakePending: {
 *     attemptId: string,
 *     startedAt: number,
 *     endsAt: number,
 *     status: Record<string, 'pending' | 'paid'>,
 *     signatures: Record<string, string>,
 *   } | null,
 *   rematchWindow: {
 *     matchId: string,
 *     winnerPlayerId: string,
 *     loserPlayerId: string,
 *     acceptedBy: string[],
 *   } | null,
 * }} Room
 */

import crypto from 'node:crypto';

import {
  EXTENDED_MAG_PRICE,
  getTreasuryAddress,
} from '../config/tokens.js';
import {
  clearPendingForRoom,
  clearPendingRoom,
  clearPlayerRoom,
  deleteMatch,
  deleteRoom,
  getAllRooms,
  getMatch,
  getPendingRoom,
  getRoom,
  listAllMatchIds,
  listAllRoomIds,
  setMatch,
  setPendingRoom,
  setPlayerRoom,
  setRoom,
} from '../config/redis.js';
import { logMatch } from './matchHistory.js';
import { payoutWinner } from './payout.js';
import { verifyStakeTransfer } from './stakeVerifier.js';

const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const MATCH_RECORD_TTL_MS = 2 * 60 * 60 * 1000;
const READY_COUNTDOWN_MS = 5000;
const RECONNECT_GRACE_MS = 60 * 1000;
const REMATCH_WINDOW_MS = 15 * 1000;
const ROUNDS_TO_WIN_MATCH = 2;
/** Window for both players to sign + confirm their on-chain stake transfer. */
const STAKE_PENDING_MS = 60 * 1000;

/* ---------- In-memory non-serializable state ---------- */

/** @type {Map<string, import('ws').WebSocket>} playerId -> live WebSocket */
const playerConnections = new Map();
/** @type {Set<import('ws').WebSocket>} */
const lobbySubscribers = new Set();
/**
 * Timer handles per room. Never serialized.
 * @type {Map<string, { countdown?: NodeJS.Timeout, stakePending?: NodeJS.Timeout, rematch?: NodeJS.Timeout }>}
 */
const roomTimers = new Map();

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

function genAttemptId() {
  return crypto.randomUUID();
}

function label(playerId) {
  return `Player ${playerId.slice(-4)}`;
}

/* ---------- Timer plumbing (in-memory only) ---------- */

function getTimerSlot(roomId) {
  let slot = roomTimers.get(roomId);
  if (!slot) {
    slot = {};
    roomTimers.set(roomId, slot);
  }
  return slot;
}

function clearRoomTimer(roomId, name) {
  const slot = roomTimers.get(roomId);
  if (!slot) return;
  if (slot[name]) {
    clearTimeout(slot[name]);
    delete slot[name];
  }
}

function clearAllRoomTimers(roomId) {
  const slot = roomTimers.get(roomId);
  if (!slot) return;
  for (const h of Object.values(slot)) {
    if (h) clearTimeout(h);
  }
  roomTimers.delete(roomId);
}

/* ---------- Room load/save (Redis-backed) ---------- */

/** Attach live ws (if any) to each player on a freshly-loaded room. */
function attachConnections(room) {
  if (!room) return room;
  for (const p of room.players) {
    p.ws = playerConnections.get(p.playerId) ?? null;
  }
  return room;
}

/** @returns {Promise<Room | null>} */
async function loadRoom(roomId) {
  const room = await getRoom(roomId);
  if (!room) return null;
  return attachConnections(room);
}

/** @param {Room} room */
async function saveRoom(room) {
  await setRoom(room.id, room);
}

/* ---------- Summaries / payloads ---------- */

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
  if (room.stakePending) return 'stake_pending';
  if (room.players.length < 2) return 'waiting_opponent';
  if (room.players.every((p) => p.ready)) return 'starting';
  return 'ready_up';
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
    stakeStatus: room.stakePending ? { ...room.stakePending.status } : null,
    stakePendingEndsAt: room.stakePending?.endsAt ?? null,
    extendedMag: room.extendedMag ? { ...room.extendedMag } : {},
    selfPlayerId,
    players: room.players.map((p, seat) => ({
      playerId: p.playerId,
      seat,
      ready: p.ready,
      connected: Boolean(p.ws && p.ws.readyState === 1),
      label: label(p.playerId),
      isHost: seat === 0,
      hasWallet: Boolean(p.walletAddress),
    })),
  };
}

/** @param {Room} room */
function broadcastRoom(room) {
  for (const p of room.players) {
    if (!p.ws || p.ws.readyState !== 1) continue;
    p.ws.send(JSON.stringify(roomStatePayload(room, p.playerId)));
  }
}

export async function listRooms() {
  const rooms = await getAllRooms();
  return rooms.map(roomSummary);
}

async function broadcastLobby() {
  const payload = JSON.stringify({ type: 'rooms_snapshot', rooms: await listRooms() });
  for (const ws of lobbySubscribers) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

/* ---------- Match-start helpers ---------- */

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
 * Reference physics (gravity 800, jumpV -580):
 *   single jump apex ≈ 210 px, double jump apex ≈ 420 px.
 * yFraction bands match the client tuning:
 *   - lowest 0.65-0.70 (~131-161 px above ground on a 600 px canvas) — single-jump reach.
 *   - middle 0.45-0.50 (~251-281 px above ground) — double-jump reach.
 *   - highest 0.25-0.30 (~371-401 px above ground) — double-jump reach.
 * Min gap between bands is 0.15, satisfying the no-overlap rule.
 * X positions are shuffled across left/center/right thirds.
 */
function generatePlatformLayout() {
  const lowestY = randRange(0.65, 0.7);
  const middleY = randRange(0.45, 0.5);
  const highestY = randRange(0.25, 0.3);

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
async function finalizeMatch(room) {
  if (room.players.length !== 2 || !room.players.every((p) => p.ready)) return;

  const matchId = genMatchId();
  const roomId = room.id;
  const platforms = generatePlatformLayout();

  const extendedMagPlayers = room.players
    .filter((p) => room.extendedMag?.[p.playerId] === true)
    .map((p) => p.playerId);

  const payload = JSON.stringify({
    type: 'match_started',
    roomId,
    matchId,
    platforms,
    extendedMagPlayers,
  });

  cancelRoomCountdown(room);

  await setMatch(matchId, {
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
    walletAddresses: {
      [room.players[0].playerId]: room.players[0].walletAddress || null,
      [room.players[1].playerId]: room.players[1].walletAddress || null,
    },
    stakeSol: room.stakeSol,
    roundNumber: 1,
    platforms,
    extendedMagPlayers,
  };

  room.extendedMag = {};
  clearRoomTimer(room.id, 'rematch');
  room.rematchWindow = null;
  room.players.forEach((p) => {
    p.ready = false;
  });

  await saveRoom(room);

  for (const p of room.players) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(payload);
  }
  broadcastRoom(room);
  await broadcastLobby();
}

/** @param {Room} room */
function cancelRoomCountdown(room) {
  clearRoomTimer(room.id, 'countdown');
  room.countdownEndsAt = null;
}

/**
 * Send winner the treasury payout, then notify them via WS, then persist a match
 * history row keyed by the resulting signature. Payout + history are fire-and-forget
 * so the match-resolved broadcast isn't blocked on Solana confirmation latency.
 *
 * @param {Room} room
 * @param {string} matchId
 * @param {string} winnerPlayerId
 * @param {string} loserPlayerId
 * @param {'eliminated' | 'forfeit'} reason
 * @param {number} potSol
 * @param {{ playerId: string, ws: import('ws').WebSocket | null } | undefined} snapshotWinner
 * @param {{ stakeSol: number, roomId: string, roundsWonWinner: number, roundsWonLoser: number } | null} matchLogData
 */
function triggerWinnerPayout(
  room,
  matchId,
  winnerPlayerId,
  loserPlayerId,
  reason,
  potSol,
  snapshotWinner,
  matchLogData,
) {
  const walletAddresses = room.gameState?.walletAddresses ?? {};
  const winnerWallet =
    walletAddresses[winnerPlayerId] ||
    room.players.find((p) => p.playerId === winnerPlayerId)?.walletAddress ||
    null;
  const loserWallet =
    walletAddresses[loserPlayerId] ||
    room.players.find((p) => p.playerId === loserPlayerId)?.walletAddress ||
    null;

  const winnerWs = snapshotWinner?.ws
    ?? room.players.find((p) => p.playerId === winnerPlayerId)?.ws
    ?? null;

  const persistHistory = (signature) => {
    if (!matchLogData) return;
    void logMatch({
      matchId,
      roomId: matchLogData.roomId,
      stakeAmount: matchLogData.stakeSol,
      winnerWallet,
      loserWallet,
      winnerPlayerId,
      loserPlayerId,
      roundsWonWinner: matchLogData.roundsWonWinner,
      roundsWonLoser: matchLogData.roundsWonLoser,
      resolutionReason: reason,
      payoutSignature: signature,
      totalPot: potSol,
    }).catch((err) => console.error('[match-history] log failed:', err?.message ?? err));
  };

  if (!winnerWallet) {
    console.warn(
      `[payout] match ${matchId} winner ${winnerPlayerId} has no wallet — skipping payout`,
    );
    if (winnerWs && winnerWs.readyState === 1) {
      winnerWs.send(
        JSON.stringify({
          type: 'payout_failed',
          matchId,
          reason: 'no_wallet',
          amount: potSol,
          message: 'No wallet address on file for the winner — payout skipped',
        }),
      );
    }
    /** Still record the match for audit even though no payout went out. */
    persistHistory(null);
    return;
  }

  void payoutWinner(winnerWallet, potSol).then((signature) => {
    if (signature) {
      console.log(
        `[payout] match ${matchId} (${reason}): ${potSol} $TOILET → ${winnerWallet} (tx ${signature})`,
      );
      if (winnerWs && winnerWs.readyState === 1) {
        winnerWs.send(
          JSON.stringify({
            type: 'payout_complete',
            matchId,
            reason,
            amount: potSol,
            signature,
            recipientWallet: winnerWallet,
          }),
        );
      }
    } else if (winnerWs && winnerWs.readyState === 1) {
      winnerWs.send(
        JSON.stringify({
          type: 'payout_failed',
          matchId,
          reason: 'transfer_failed',
          amount: potSol,
          recipientWallet: winnerWallet,
          message: 'Treasury transfer failed — contact support',
        }),
      );
    }
    /** Persist with whatever signature we got (null on failed transfer). */
    persistHistory(signature ?? null);
  });
}

/**
 * Health-driven match end (target health hit 0).
 * @param {Room} room
 * @param {string} matchId
 * @param {{ playerId: string, ws: import('ws').WebSocket | null }} winner
 * @param {{ playerId: string, ws: import('ws').WebSocket | null }} loser
 */
async function resolveMatchByElimination(room, matchId, winner, loser) {
  if (!room.activeMatchId || room.activeMatchId !== matchId) return;

  const stakeSol = room.stakeSol;
  const potSol = stakeSol * 2;
  const winnerPlayerId = winner.playerId;
  const loserPlayerId = loser.playerId;

  room.activeMatchId = null;
  await deleteMatch(matchId);

  const overPayload = JSON.stringify({
    type: 'game_over',
    matchId,
    winnerPlayerId,
    loserPlayerId,
  });
  for (const p of [winner, loser]) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(overPayload);
  }

  const winnerWallet =
    room.gameState?.walletAddresses?.[winnerPlayerId] ?? null;

  const resolution = JSON.stringify({
    type: 'match_resolved',
    reason: 'eliminated',
    matchId,
    roomId: room.id,
    winnerPlayerId,
    loserPlayerId,
    winnerWallet,
    stakeSol,
    potSol,
    payoutNote: 'winner takes pot — devnet treasury settles automatically',
  });
  for (const p of [winner, loser]) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(resolution);
  }

  const roundsWon = room.gameState?.roundsWon ?? {};
  triggerWinnerPayout(
    room,
    matchId,
    winnerPlayerId,
    loserPlayerId,
    'eliminated',
    potSol,
    winner,
    {
      stakeSol,
      roomId: room.id,
      roundsWonWinner: Number(roundsWon[winnerPlayerId] ?? ROUNDS_TO_WIN_MATCH),
      roundsWonLoser: Number(roundsWon[loserPlayerId] ?? 0),
    },
  );

  clearRoomTimer(room.id, 'rematch');
  room.rematchWindow = {
    matchId,
    winnerPlayerId,
    loserPlayerId,
    acceptedBy: [],
  };
  const roomId = room.id;
  getTimerSlot(roomId).rematch = setTimeout(() => {
    void finalizeRematchWindow(roomId, matchId);
  }, REMATCH_WINDOW_MS);

  await saveRoom(room);
  await broadcastLobby();
}

/**
 * Tear down a stale rematch window — fires on timeout, decline, or disconnect.
 */
async function finalizeRematchWindow(roomId, matchId) {
  const room = await loadRoom(roomId);
  if (!room) return;
  const win = room.rematchWindow;
  if (!win || win.matchId !== matchId) return;
  clearRoomTimer(roomId, 'rematch');
  room.rematchWindow = null;
  room.gameState = null;

  const loser = room.players.find((p) => p.playerId === win.loserPlayerId);
  if (loser?.ws) loser.ws.roomId = null;
  if (loser) await clearPlayerRoom(loser.playerId);
  room.players = room.players.filter((p) => p.playerId !== win.loserPlayerId);
  room.players.forEach((p) => {
    p.ready = false;
  });

  await saveRoom(room);
  broadcastRoom(room);
  await broadcastLobby();
}

/**
 * Forfeit: loser removed, winner keeps seat; table returns to matchmaking.
 * @param {Room} room
 * @param {string} matchId
 * @param {import('ws').WebSocket} forfeitingWs
 */
async function forfeitMatch(room, matchId, forfeitingWs) {
  if (!room.activeMatchId || room.activeMatchId !== matchId) return;
  const idx = room.players.findIndex((p) => p.ws === forfeitingWs);
  if (idx === -1) return;

  const forfeiter = room.players[idx];
  const winner = room.players[idx === 0 ? 1 : 0];
  const stakeSol = room.stakeSol;
  const potSol = stakeSol * 2;

  const walletAddresses = room.gameState?.walletAddresses ?? {};
  const preForfeitRounds = { ...(room.gameState?.roundsWon ?? {}) };

  room.activeMatchId = null;
  room.gameState = null;
  await deleteMatch(matchId);

  const winnerWallet =
    walletAddresses[winner.playerId] ?? winner.walletAddress ?? null;

  const resolution = {
    type: 'match_resolved',
    reason: 'forfeit',
    matchId,
    roomId: room.id,
    winnerPlayerId: winner.playerId,
    loserPlayerId: forfeiter.playerId,
    winnerWallet,
    stakeSol,
    potSol,
    payoutNote: 'forfeit — opponent receives combined stakes',
  };

  const payload = JSON.stringify(resolution);
  if (forfeitingWs.readyState === 1) forfeitingWs.send(payload);
  if (winner.ws && winner.ws.readyState === 1) winner.ws.send(payload);

  triggerWinnerPayout(
    room,
    matchId,
    winner.playerId,
    forfeiter.playerId,
    'forfeit',
    potSol,
    winner,
    {
      stakeSol,
      roomId: room.id,
      roundsWonWinner: Number(preForfeitRounds[winner.playerId] ?? 0),
      roundsWonLoser: Number(preForfeitRounds[forfeiter.playerId] ?? 0),
    },
  );

  forfeitingWs.roomId = null;
  await clearPlayerRoom(forfeiter.playerId);
  room.players = room.players.filter((p) => p.ws !== forfeitingWs);
  room.players.forEach((p) => {
    p.ready = false;
  });

  await saveRoom(room);
  broadcastRoom(room);
  await broadcastLobby();
}

/**
 * Refund a single player by sending `amount` $TOILET from treasury back to their wallet.
 * Fire-and-forget so room cleanup isn't blocked on Solana confirmation latency.
 */
function refundPlayerStake(player, amount, reason) {
  const wallet = player?.walletAddress;
  if (!wallet) {
    console.warn(`[stake] cannot refund ${player?.playerId}: no wallet on file`);
    return;
  }
  const playerWs = player.ws;
  void payoutWinner(wallet, amount).then((signature) => {
    if (playerWs && playerWs.readyState === 1) {
      playerWs.send(
        JSON.stringify({
          type: 'stake_refunded',
          amount,
          signature,
          reason,
          recipientWallet: wallet,
        }),
      );
    }
    if (signature) {
      console.log(
        `[stake] refunded ${amount} $TOILET to ${wallet} (tx ${signature}, reason ${reason})`,
      );
    } else {
      console.error(
        `[stake] refund FAILED for ${wallet} (${amount} $TOILET, reason ${reason})`,
      );
    }
  });
}

/**
 * Tear down an in-flight stake-pending window. Refunds any player already marked 'paid',
 * resets ready states so the room recycles back into ready_up, and broadcasts match_cancelled.
 *
 * @param {Room} room
 * @param {string} reason
 */
async function cancelStakePending(room, reason) {
  if (!room.stakePending) return;
  const stakePending = room.stakePending;
  clearRoomTimer(room.id, 'stakePending');
  room.stakePending = null;

  const stake = room.stakeSol;
  for (const [pid, status] of Object.entries(stakePending.status)) {
    if (status === 'paid') {
      const player = room.players.find((p) => p.playerId === pid);
      if (player) refundPlayerStake(player, stake, reason);
    }
  }

  room.players.forEach((p) => {
    p.ready = false;
  });

  await saveRoom(room);

  const cancelPayload = JSON.stringify({
    type: 'match_cancelled',
    reason,
    stakeSol: stake,
  });
  for (const p of room.players) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(cancelPayload);
  }

  broadcastRoom(room);
  await broadcastLobby();
}

/**
 * Both players are ready — gate the countdown on each player signing an on-chain stake
 * transfer to treasury.
 *
 * @param {Room} room
 */
async function beginStakePending(room) {
  console.log(
    `[diag beginStakePending] ENTRY room=${room.id} players=${room.players
      .map(
        (p) =>
          `${p.playerId.slice(-4)}(ready=${p.ready}, wallet=${p.walletAddress || 'NULL'})`,
      )
      .join(', ')} stakePending=${Boolean(room.stakePending)} activeMatchId=${room.activeMatchId} countdownTimer=${Boolean(roomTimers.get(room.id)?.countdown)}`,
  );

  if (room.players.length !== 2 || !room.players.every((p) => p.ready)) {
    console.log(
      `[diag beginStakePending] EARLY RETURN room=${room.id} — not 2 ready players (count=${room.players.length})`,
    );
    return;
  }
  if (room.stakePending || room.activeMatchId) {
    console.log(
      `[diag beginStakePending] EARLY RETURN room=${room.id} — already has stakePending=${Boolean(room.stakePending)} or activeMatchId=${room.activeMatchId}`,
    );
    return;
  }
  if (roomTimers.get(room.id)?.countdown) {
    console.log(
      `[diag beginStakePending] EARLY RETURN room=${room.id} — countdown timer already running`,
    );
    return;
  }

  const missingWallet = room.players.filter((p) => !p.walletAddress);
  if (missingWallet.length > 0) {
    console.log(
      `[diag beginStakePending] EARLY RETURN room=${room.id} — WALLET_REQUIRED for ${missingWallet
        .map((p) => p.playerId.slice(-4))
        .join(', ')} — sending error and aborting`,
    );
    for (const p of missingWallet) {
      sendError(
        p.ws,
        'WALLET_REQUIRED',
        'Connect a Solana wallet before starting a paid match',
      );
    }
    return;
  }

  if (!getTreasuryAddress()) {
    console.log(
      `[diag beginStakePending] EARLY RETURN room=${room.id} — TREASURY_UNAVAILABLE (getTreasuryAddress() returned null/empty)`,
    );
    for (const p of room.players) {
      sendError(
        p.ws,
        'TREASURY_UNAVAILABLE',
        'Treasury wallet not configured — contact support',
      );
    }
    return;
  }

  const now = Date.now();
  const attemptId = genAttemptId();
  room.stakePending = {
    attemptId,
    startedAt: now,
    endsAt: now + STAKE_PENDING_MS,
    status: {
      [room.players[0].playerId]: 'pending',
      [room.players[1].playerId]: 'pending',
    },
    signatures: {},
  };

  const roomId = room.id;
  getTimerSlot(roomId).stakePending = setTimeout(async () => {
    const r = await loadRoom(roomId);
    if (!r || !r.stakePending || r.stakePending.attemptId !== attemptId) return;
    await cancelStakePending(r, 'timeout');
  }, STAKE_PENDING_MS);

  await saveRoom(room);
  console.log(
    `[diag beginStakePending] SET room.stakePending — computed phase=${roomPhase(room)} for room=${room.id}; calling broadcastRoom + broadcastLobby`,
  );
  broadcastRoom(room);
  await broadcastLobby();
}

/** @param {Room} room */
async function beginCountdown(room) {
  console.log(
    `[diag beginCountdown] ENTRY room=${room.id} stakePending=${Boolean(room.stakePending)} activeMatchId=${room.activeMatchId}`,
  );
  if (room.players.length !== 2 || !room.players.every((p) => p.ready)) return;
  if (roomTimers.get(room.id)?.countdown) return;

  cancelRoomCountdown(room);
  room.countdownEndsAt = Date.now() + READY_COUNTDOWN_MS;
  await saveRoom(room);
  broadcastRoom(room);

  const roomId = room.id;
  getTimerSlot(roomId).countdown = setTimeout(async () => {
    clearRoomTimer(roomId, 'countdown');
    const r = await loadRoom(roomId);
    if (!r) return;
    r.countdownEndsAt = null;
    if (r.players.length !== 2 || !r.players.every((p) => p.ready)) {
      await saveRoom(r);
      return;
    }
    await finalizeMatch(r);
  }, READY_COUNTDOWN_MS);
}

/** @param {import('ws').WebSocket} ws */
async function leaveRoomExplicit(ws) {
  const rid = ws.roomId;
  if (!rid || typeof rid !== 'string') return;
  const room = await loadRoom(rid);
  if (!room) {
    ws.roomId = null;
    if (ws.playerId) await clearPlayerRoom(ws.playerId);
    return;
  }

  const idx = room.players.findIndex((p) => p.ws === ws);
  if (idx === -1) {
    ws.roomId = null;
    if (ws.playerId) await clearPlayerRoom(ws.playerId);
    return;
  }

  if (room.activeMatchId) {
    await forfeitMatch(room, room.activeMatchId, ws);
    return;
  }
  if (room.stakePending) {
    await cancelStakePending(room, 'player_left');
  }

  const leavingPlayer = room.players[idx];
  await clearPlayerRoom(leavingPlayer.playerId);
  room.players = room.players.filter((p) => p.ws !== ws);
  ws.roomId = null;

  if (room.players.length === 0) {
    clearAllRoomTimers(rid);
    await deleteRoom(rid);
    await clearPendingForRoom(rid);
    await broadcastLobby();
    return;
  }

  cancelRoomCountdown(room);
  room.players.forEach((p) => {
    p.ready = false;
  });
  await saveRoom(room);
  broadcastRoom(room);
  await broadcastLobby();
}

/** Refresh / transient network drop: keep seat for grace period. */
async function disconnectFromRoom(ws) {
  const rid = ws.roomId;
  if (!rid || typeof rid !== 'string') return;
  const room = await loadRoom(rid);
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
    await forfeitMatch(room, room.activeMatchId, ws);
    return;
  }
  if (room.stakePending) {
    await cancelStakePending(room, 'player_disconnected');
  }

  room.players[idx].disconnectedAt = Date.now();
  /** Drop the in-memory ws link; the serialized form already has ws stripped. */
  room.players[idx].ws = null;
  ws.roomId = null;

  cancelRoomCountdown(room);
  room.players.forEach((p) => {
    p.ready = false;
  });
  await saveRoom(room);
  broadcastRoom(room);
  await broadcastLobby();
}

/** @param {import('ws').WebSocket} ws */
function sendError(ws, code, message) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'error', code, message }));
}

/** Tell the client its sessionStorage room/match lock is stale so it can clear it. */
function sendSessionInvalid(ws, reason) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'session_invalid', reason }));
}

export async function sweepStaleEmptyRooms() {
  const now = Date.now();
  const rooms = await getAllRooms();
  let changed = false;

  for (const stored of rooms) {
    const room = attachConnections(stored);
    const before = room.players.length;
    room.players = room.players.filter((p) => {
      if (p.ws) return true;
      if (!p.disconnectedAt) return false;
      return now - p.disconnectedAt < RECONNECT_GRACE_MS;
    });
    const removed = before - room.players.length;
    if (removed > 0) changed = true;

    if (room.players.length === 0 && now - room.createdAt > EMPTY_ROOM_TTL_MS) {
      clearAllRoomTimers(room.id);
      await deleteRoom(room.id);
      await clearPendingForRoom(room.id);
      changed = true;
      continue;
    }

    if (removed > 0) {
      await saveRoom(room);
    }
  }

  /** Match TTL: collect ids, drop expired records. */
  const matchIds = await listAllMatchIds();
  for (const mid of matchIds) {
    const rec = await getMatch(mid);
    if (!rec) continue;
    if (now - (rec.createdAt ?? 0) > MATCH_RECORD_TTL_MS) {
      await deleteMatch(mid);
    }
  }

  if (changed) await broadcastLobby();
}

/**
 * On startup, evict any room whose serialized state cannot recover — no players,
 * or all players' disconnect grace expired. Keeps players with valid grace windows
 * intact so a tab refresh during a server restart still lands them in-room.
 */
export async function reconcileOnStartup() {
  const now = Date.now();
  const ids = await listAllRoomIds();
  let cleared = 0;
  for (const id of ids) {
    const room = await getRoom(id);
    if (!room) {
      await deleteRoom(id);
      continue;
    }
    /** Any in-flight timer-driven state is unrecoverable across restart — wipe it. */
    let mutated = false;
    if (room.countdownEndsAt && room.countdownEndsAt < now) {
      room.countdownEndsAt = null;
      mutated = true;
    }
    if (room.stakePending) {
      room.stakePending = null;
      room.players?.forEach((p) => {
        p.ready = false;
      });
      mutated = true;
    }
    if (room.rematchWindow) {
      room.rematchWindow = null;
      room.gameState = null;
      mutated = true;
    }
    if (room.activeMatchId) {
      /** Server died mid-match — the match cannot resume; clear it. */
      await deleteMatch(room.activeMatchId);
      room.activeMatchId = null;
      room.gameState = null;
      room.players?.forEach((p) => {
        p.ready = false;
        p.disconnectedAt = p.disconnectedAt ?? now;
      });
      mutated = true;
    }

    const allStale =
      !room.players ||
      room.players.length === 0 ||
      room.players.every(
        (p) => p.disconnectedAt && now - p.disconnectedAt > RECONNECT_GRACE_MS,
      );

    if (allStale) {
      await deleteRoom(room.id);
      await clearPendingForRoom(room.id);
      for (const p of room.players ?? []) {
        await clearPlayerRoom(p.playerId);
      }
      cleared++;
      continue;
    }

    /** All sockets died with the previous process — mark every seated player as in grace window. */
    for (const p of room.players) {
      if (!p.disconnectedAt) {
        p.disconnectedAt = now;
        mutated = true;
      }
    }

    if (mutated) await setRoom(room.id, room);
  }
  console.log(`[server] reconcile complete — cleared ${cleared} stale rooms`);
}

/**
 * @param {import('ws').WebSocket} ws
 * @returns {string} playerId for welcome message
 */
export function bindConnection(ws) {
  const playerId = genPlayerId();
  ws.playerId = playerId;
  ws.roomId = null;
  playerConnections.set(playerId, ws);
  return playerId;
}

/** @param {import('ws').WebSocket} ws */
export async function onConnectionClosed(ws) {
  lobbySubscribers.delete(ws);
  if (ws.playerId && playerConnections.get(ws.playerId) === ws) {
    playerConnections.delete(ws.playerId);
  }
  await disconnectFromRoom(ws);
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {string} text
 */
export async function dispatchMessage(ws, text) {
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
      ws.send(JSON.stringify({ type: 'rooms_snapshot', rooms: await listRooms() }));
      break;
    }
    case 'lobby_unsubscribe': {
      lobbySubscribers.delete(ws);
      break;
    }
    case 'list_rooms': {
      ws.send(JSON.stringify({ type: 'rooms_snapshot', rooms: await listRooms() }));
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

      await leaveRoomExplicit(ws);

      if (clientSessionId) {
        const existingId = await getPendingRoom(clientSessionId);
        if (existingId) {
          const existing = await loadRoom(existingId);
          if (existing && existing.players.length === 0) {
            if (existing.stakeSol === stake) {
              ws.send(JSON.stringify({ type: 'room_created', room: roomSummary(existing) }));
              await broadcastLobby();
              return;
            }
            clearAllRoomTimers(existingId);
            await deleteRoom(existingId);
            await clearPendingForRoom(existingId);
            await clearPendingRoom(clientSessionId);
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
        countdownEndsAt: null,
        activeMatchId: null,
        extendedMag: {},
        gameState: null,
        stakePending: null,
        rematchWindow: null,
      };
      await saveRoom(room);
      if (clientSessionId) await setPendingRoom(clientSessionId, id);

      ws.send(JSON.stringify({ type: 'room_created', room: roomSummary(room) }));
      await broadcastLobby();
      break;
    }
    case 'join_room': {
      const roomId = typeof msg.roomId === 'string' ? msg.roomId : '';
      const clientSessionId =
        typeof msg.clientSessionId === 'string' ? msg.clientSessionId.trim() : '';

      const room = await loadRoom(roomId);
      if (!room) {
        /** The client may be auto-redirecting from sessionStorage to a now-dead room. */
        if (clientSessionId) sendSessionInvalid(ws, 'room_not_found');
        sendError(ws, 'ROOM_NOT_FOUND', 'No room with that id');
        return;
      }
      if (room.activeMatchId) {
        /** They're not in this match — tell them to clear their session lock. */
        const alreadySeated = room.players.some(
          (p) => p.clientSessionId === clientSessionId || p.playerId === ws.playerId,
        );
        if (!alreadySeated && clientSessionId) {
          sendSessionInvalid(ws, 'match_in_progress');
        }
        if (!alreadySeated) {
          sendError(ws, 'MATCH_IN_PROGRESS', 'Table is in a match');
          return;
        }
      }

      if (clientSessionId) {
        const existing = room.players.find(
          (p) =>
            p.clientSessionId === clientSessionId &&
            !p.ws &&
            p.disconnectedAt != null &&
            Date.now() - p.disconnectedAt < RECONNECT_GRACE_MS,
        );
        if (existing) {
          /** Rebind WS + connections map to the existing player identity. */
          if (ws.playerId && playerConnections.get(ws.playerId) === ws) {
            playerConnections.delete(ws.playerId);
          }
          ws.playerId = existing.playerId;
          playerConnections.set(existing.playerId, ws);
          existing.ws = ws;
          existing.disconnectedAt = null;
          ws.roomId = roomId;
          await setPlayerRoom(existing.playerId, roomId);
          await saveRoom(room);
          broadcastRoom(room);
          await broadcastLobby();
          break;
        }
      }

      const seated = room.players.find((p) => p.playerId === ws.playerId);
      if (seated) {
        seated.ws = ws;
        seated.disconnectedAt = null;
        ws.roomId = roomId;
        await setPlayerRoom(ws.playerId, roomId);
        await saveRoom(room);
        broadcastRoom(room);
        break;
      }
      if (room.players.length >= 2) {
        if (clientSessionId) sendSessionInvalid(ws, 'room_full');
        sendError(ws, 'ROOM_FULL', 'Room already has two players');
        return;
      }
      await leaveRoomExplicit(ws);
      room.players.push({
        playerId: ws.playerId,
        clientSessionId,
        ready: false,
        ws,
        disconnectedAt: null,
        walletAddress: ws.walletAddress || null,
      });
      ws.roomId = roomId;
      await setPlayerRoom(ws.playerId, roomId);
      if (room.players.length >= 1) await clearPendingForRoom(roomId);
      await saveRoom(room);
      broadcastRoom(room);
      await broadcastLobby();
      break;
    }
    case 'leave_room': {
      await leaveRoomExplicit(ws);
      break;
    }
    case 'set_wallet_address': {
      const raw =
        typeof msg.walletAddress === 'string' ? msg.walletAddress.trim() : '';
      const wallet = raw || null;
      ws.walletAddress = wallet;

      const rid = ws.roomId;
      if (rid && typeof rid === 'string') {
        const room = await loadRoom(rid);
        if (room) {
          const entry = room.players.find((p) => p.ws === ws);
          if (entry && entry.walletAddress !== wallet) {
            entry.walletAddress = wallet;
            await saveRoom(room);
            broadcastRoom(room);
          }
        }
      }
      break;
    }
    case 'forfeit_match': {
      const mid = typeof msg.matchId === 'string' ? msg.matchId : '';
      const rec = await getMatch(mid);
      if (!rec) {
        sendError(ws, 'MATCH_NOT_FOUND', 'Unknown or expired match');
        return;
      }
      const room = await loadRoom(rec.roomId);
      if (!room || room.activeMatchId !== mid) {
        sendError(ws, 'MATCH_NOT_FOUND', 'Match no longer active');
        return;
      }
      if (!room.players.some((p) => p.ws === ws)) {
        sendError(ws, 'NOT_IN_MATCH', 'Not in this match');
        return;
      }
      await forfeitMatch(room, mid, ws);
      break;
    }
    case 'join_match': {
      const matchId = typeof msg.matchId === 'string' ? msg.matchId : '';
      const rec = await getMatch(matchId);
      if (!rec) {
        sendSessionInvalid(ws, 'match_not_found');
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
      const room = await loadRoom(rid);
      if (!room) {
        sendSessionInvalid(ws, 'room_not_found');
        sendError(ws, 'ROOM_NOT_FOUND', 'Room gone');
        ws.roomId = null;
        return;
      }
      const timers = roomTimers.get(rid);
      if (room.activeMatchId || room.stakePending || timers?.countdown) {
        sendError(ws, 'IN_PROGRESS', 'Cannot change ready right now');
        return;
      }
      const entry = room.players.find((p) => p.playerId === ws.playerId);
      if (!entry) {
        sendError(ws, 'NOT_IN_ROOM', 'Not seated in this room');
        return;
      }

      const nextReady = Boolean(msg.ready);

      if (entry.ready && !nextReady) {
        sendError(ws, 'READY_LOCKED', 'Ready is final — you cannot go back');
        return;
      }

      entry.ready = nextReady;
      await saveRoom(room);

      if (room.players.length === 2 && room.players.every((p) => p.ready)) {
        console.log(
          `[diag set_ready] room=${rid} BOTH READY — calling beginStakePending (NOT beginCountdown). players=${room.players
            .map((p) => `${p.playerId.slice(-4)}:wallet=${p.walletAddress || 'NULL'}`)
            .join(', ')}`,
        );
        await beginStakePending(room);
      } else {
        console.log(
          `[diag set_ready] room=${rid} not both ready yet — broadcast only. ready=${room.players
            .map((p) => `${p.playerId.slice(-4)}=${p.ready}`)
            .join(', ')}`,
        );
        broadcastRoom(room);
        await broadcastLobby();
      }
      break;
    }
    case 'stake_paid': {
      const rid = ws.roomId;
      if (!rid || typeof rid !== 'string') return;
      const room = await loadRoom(rid);
      if (!room || !room.stakePending) return;
      const player = room.players.find((p) => p.ws === ws);
      if (!player) return;
      const stakePendingAttemptId = room.stakePending.attemptId;
      const currentStatus = room.stakePending.status[player.playerId];
      if (currentStatus !== 'pending') return;

      const txSig =
        typeof msg.txSignature === 'string' ? msg.txSignature.trim() : '';
      if (!txSig) {
        sendError(ws, 'BAD_STAKE_TX', 'Missing txSignature');
        return;
      }

      const treasuryAddress = getTreasuryAddress();
      const walletAddress = player.walletAddress;
      const stakeAmount = room.stakeSol;
      const playerId = player.playerId;
      const roomId = room.id;

      void (async () => {
        const ok =
          treasuryAddress && walletAddress
            ? await verifyStakeTransfer(
                txSig,
                walletAddress,
                treasuryAddress,
                stakeAmount,
              )
            : false;

        const r = await loadRoom(roomId);
        if (!r || !r.stakePending || r.stakePending.attemptId !== stakePendingAttemptId) {
          return;
        }
        if (r.stakePending.status[playerId] !== 'pending') return;

        if (!ok) {
          console.warn(
            `[stake] verification failed for ${playerId} tx=${txSig} — cancelling room ${roomId}`,
          );
          await cancelStakePending(r, 'stake_verification_failed');
          return;
        }

        r.stakePending.status[playerId] = 'paid';
        r.stakePending.signatures[playerId] = txSig;
        await saveRoom(r);
        broadcastRoom(r);

        if (Object.values(r.stakePending.status).every((s) => s === 'paid')) {
          clearRoomTimer(roomId, 'stakePending');
          r.stakePending = null;
          await saveRoom(r);
          await beginCountdown(r);
        }
      })();
      break;
    }
    case 'stake_failed': {
      const rid = ws.roomId;
      if (!rid || typeof rid !== 'string') return;
      const room = await loadRoom(rid);
      if (!room || !room.stakePending) return;
      const player = room.players.find((p) => p.ws === ws);
      if (!player) return;

      const reasonTag =
        typeof msg.reason === 'string' && msg.reason.trim()
          ? msg.reason.trim().slice(0, 64)
          : 'client_cancel';
      console.log(
        `[stake] player ${player.playerId} reported stake_failed: ${reasonTag}`,
      );
      await cancelStakePending(room, reasonTag);
      break;
    }
    case 'purchase_extended_mag': {
      const rid = ws.roomId;
      if (!rid || typeof rid !== 'string') return;
      const room = await loadRoom(rid);
      if (!room) return;
      const player = room.players.find((p) => p.ws === ws);
      if (!player) return;

      const phase = roomPhase(room);
      if (phase !== 'waiting_opponent' && phase !== 'ready_up') {
        sendError(
          ws,
          'PHASE_LOCKED',
          'Upgrades can only be purchased before the match starts',
        );
        return;
      }
      if (room.extendedMag?.[player.playerId] === true) {
        sendError(
          ws,
          'ALREADY_PURCHASED',
          'Extended magazine already purchased for this match',
        );
        return;
      }

      const txSig =
        typeof msg.txSignature === 'string' ? msg.txSignature.trim() : '';
      if (!txSig) {
        sendError(ws, 'BAD_UPGRADE_TX', 'Missing txSignature');
        return;
      }

      const treasuryAddress = getTreasuryAddress();
      const walletAddress = player.walletAddress;
      const playerId = player.playerId;
      const roomId = room.id;

      if (!treasuryAddress || !walletAddress) {
        sendError(
          ws,
          'UPGRADE_UNAVAILABLE',
          'Cannot verify upgrade purchase right now — connect wallet and retry',
        );
        return;
      }

      void (async () => {
        const ok = await verifyStakeTransfer(
          txSig,
          walletAddress,
          treasuryAddress,
          EXTENDED_MAG_PRICE,
        );

        const r = await loadRoom(roomId);
        if (!r) return;
        const currentPhase = roomPhase(r);
        if (currentPhase !== 'waiting_opponent' && currentPhase !== 'ready_up') {
          return;
        }
        if (!r.extendedMag) r.extendedMag = {};
        if (r.extendedMag[playerId] === true) return;

        const playerWs = playerConnections.get(playerId);
        if (!ok) {
          console.warn(
            `[upgrade] verification failed for ${playerId} tx=${txSig}`,
          );
          if (playerWs && playerWs.readyState === 1) {
            playerWs.send(
              JSON.stringify({
                type: 'upgrade_failed',
                kind: 'extended_mag',
                reason: 'verification_failed',
                message: 'Could not verify upgrade payment on-chain',
              }),
            );
          }
          return;
        }

        r.extendedMag[playerId] = true;
        await saveRoom(r);
        console.log(
          `[upgrade] player ${playerId} purchased extended mag (tx ${txSig})`,
        );
        if (playerWs && playerWs.readyState === 1) {
          playerWs.send(
            JSON.stringify({
              type: 'upgrade_purchased',
              kind: 'extended_mag',
              signature: txSig,
            }),
          );
        }
        broadcastRoom(r);
      })();
      break;
    }
    case 'game_update': {
      const rid = ws.roomId;
      if (!rid || typeof rid !== 'string') return;
      const room = await loadRoom(rid);
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
      const room = await loadRoom(rid);
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
      const room = await loadRoom(rid);
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
        const roundsWon = room.gameState.roundsWon;
        roundsWon[shooter.playerId] = (roundsWon[shooter.playerId] || 0) + 1;

        if (roundsWon[shooter.playerId] >= ROUNDS_TO_WIN_MATCH) {
          await resolveMatchByElimination(room, room.activeMatchId, shooter, target);
          /** resolveMatchByElimination handles its own save. */
          return;
        }

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
        await saveRoom(room);
      } else {
        await saveRoom(room);
      }
      break;
    }
    case 'game_over': {
      /** Server is the authority on match end (driven by game_hit reaching 0). Whitelist no-op. */
      break;
    }
    case 'request_rematch': {
      const rid = ws.roomId;
      if (!rid || typeof rid !== 'string') return;
      const room = await loadRoom(rid);
      if (!room || !room.rematchWindow) return;
      const requesterId = ws.playerId;
      if (
        requesterId !== room.rematchWindow.winnerPlayerId &&
        requesterId !== room.rematchWindow.loserPlayerId
      ) {
        return;
      }
      if (!room.rematchWindow.acceptedBy.includes(requesterId)) {
        room.rematchWindow.acceptedBy.push(requesterId);
      }

      const status = JSON.stringify({
        type: 'rematch_status',
        matchId: room.rematchWindow.matchId,
        acceptedBy: [...room.rematchWindow.acceptedBy],
      });
      for (const p of room.players) {
        if (p.ws && p.ws.readyState === 1) p.ws.send(status);
      }

      if (room.rematchWindow.acceptedBy.length >= 2) {
        const bothConnected =
          room.players.length === 2 &&
          room.players.every((p) => p.ws && p.ws.readyState === 1);
        if (!bothConnected) {
          await saveRoom(room);
          await finalizeRematchWindow(rid, room.rematchWindow.matchId);
          break;
        }
        clearRoomTimer(rid, 'rematch');
        room.rematchWindow = null;
        room.players.forEach((p) => {
          p.ready = true;
        });
        await saveRoom(room);
        await finalizeMatch(room);
      } else {
        await saveRoom(room);
      }
      break;
    }
    default:
      sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${msg.type}`);
  }
}
