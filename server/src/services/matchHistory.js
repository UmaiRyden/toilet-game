/**
 * Match history + leaderboard service. Backed by Postgres; degrades gracefully
 * when the DB is offline (every helper returns null / [] and logs once).
 */

import { pool, query } from '../config/postgres.js';

/**
 * @typedef {{
 *   matchId: string,
 *   roomId: string,
 *   stakeAmount: number,
 *   winnerWallet: string | null,
 *   loserWallet: string | null,
 *   winnerPlayerId: string,
 *   loserPlayerId: string,
 *   roundsWonWinner: number,
 *   roundsWonLoser: number,
 *   resolutionReason: 'eliminated' | 'forfeit' | string,
 *   payoutSignature: string | null,
 *   totalPot: number,
 * }} MatchLogPayload
 */

const INSERT_MATCH_SQL = `
  INSERT INTO matches (
    id, room_id, stake_amount, winner_wallet, loser_wallet,
    winner_player_id, loser_player_id, rounds_won_winner, rounds_won_loser,
    resolution_reason, payout_signature, total_pot
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT (id) DO UPDATE SET
    payout_signature = COALESCE(EXCLUDED.payout_signature, matches.payout_signature)
`;

const UPSERT_WINNER_SQL = `
  INSERT INTO player_stats (wallet_address, wins, losses, total_wagered, total_won, last_played_at)
  VALUES ($1, 1, 0, $2, $3, NOW())
  ON CONFLICT (wallet_address) DO UPDATE SET
    wins = player_stats.wins + 1,
    total_wagered = player_stats.total_wagered + EXCLUDED.total_wagered,
    total_won = player_stats.total_won + EXCLUDED.total_won,
    last_played_at = NOW()
`;

const UPSERT_LOSER_SQL = `
  INSERT INTO player_stats (wallet_address, wins, losses, total_wagered, total_won, last_played_at)
  VALUES ($1, 0, 1, $2, 0, NOW())
  ON CONFLICT (wallet_address) DO UPDATE SET
    losses = player_stats.losses + 1,
    total_wagered = player_stats.total_wagered + EXCLUDED.total_wagered,
    last_played_at = NOW()
`;

/**
 * Persist a completed match + bump aggregate stats for both players.
 * Wrapped in a transaction so a partial write doesn't desync matches vs. player_stats.
 *
 * @param {MatchLogPayload} match
 * @returns {Promise<boolean>} true if the row was written
 */
export async function logMatch(match) {
  if (!match || !match.matchId) return false;
  /** No wallets means no winner-takes-pot — still log the match for audit, but skip stats. */
  const hasWinnerWallet = typeof match.winnerWallet === 'string' && match.winnerWallet.length > 0;
  const hasLoserWallet = typeof match.loserWallet === 'string' && match.loserWallet.length > 0;

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('[match-history] connect failed — skipping log:', err?.message ?? err);
    return false;
  }

  try {
    await client.query('BEGIN');
    await client.query(INSERT_MATCH_SQL, [
      match.matchId,
      match.roomId,
      Math.round(match.stakeAmount ?? 0),
      match.winnerWallet ?? '',
      match.loserWallet ?? '',
      match.winnerPlayerId,
      match.loserPlayerId,
      Math.round(match.roundsWonWinner ?? 0),
      Math.round(match.roundsWonLoser ?? 0),
      match.resolutionReason ?? 'unknown',
      match.payoutSignature ?? null,
      Math.round(match.totalPot ?? 0),
    ]);

    if (hasWinnerWallet) {
      await client.query(UPSERT_WINNER_SQL, [
        match.winnerWallet,
        Math.round(match.stakeAmount ?? 0),
        Math.round(match.totalPot ?? 0),
      ]);
    }
    if (hasLoserWallet) {
      await client.query(UPSERT_LOSER_SQL, [
        match.loserWallet,
        Math.round(match.stakeAmount ?? 0),
      ]);
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[match-history] logMatch failed:', err?.message ?? err);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Top players by total $TOILET won. Returns [] on DB failure.
 * @param {number} [limit=20]
 */
export async function getLeaderboard(limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
  const result = await query(
    `SELECT
       wallet_address,
       display_name,
       wins,
       losses,
       total_wagered,
       total_won,
       last_played_at
     FROM player_stats
     ORDER BY total_won DESC, wins DESC, wallet_address ASC
     LIMIT $1`,
    [safeLimit],
  );
  if (!result) return [];
  return result.rows.map((row) => ({
    walletAddress: row.wallet_address,
    displayName: row.display_name ?? null,
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    totalWagered: Number(row.total_wagered) || 0,
    totalWon: Number(row.total_won) || 0,
    lastPlayedAt: row.last_played_at instanceof Date ? row.last_played_at.toISOString() : row.last_played_at,
  }));
}
