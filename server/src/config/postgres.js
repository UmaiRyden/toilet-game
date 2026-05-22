/**
 * Postgres pool for durable match history + player stats.
 *
 * Local dev: DATABASE_URL defaults to postgresql://localhost:5432/toilet_game.
 *   Docker:  docker run --name toilet-postgres -e POSTGRES_PASSWORD=postgres \
 *              -e POSTGRES_DB=toilet_game -p 5432:5432 -d postgres:16-alpine
 *   Hosted:  Railway Postgres, Supabase, Neon — set DATABASE_URL=postgres://...
 *
 * Connection failures are non-fatal — the game keeps running; logMatch /
 * getLeaderboard surface errors and the caller degrades gracefully.
 */

import pg from 'pg';

import './env.js';

const DEFAULT_URL = 'postgresql://localhost:5432/toilet_game';

const url = process.env.DATABASE_URL?.trim() || DEFAULT_URL;

/** SSL is required by most hosted providers; opt in via DATABASE_SSL=true. */
const useSsl = (process.env.DATABASE_SSL ?? '').toLowerCase() === 'true';

const maskedUrl = url.replace(/:\/\/[^@]+@/, '://<credentials>@');
console.log(`[pg] pool created — ${maskedUrl} ssl=${useSsl}`);

export const pool = new pg.Pool({
  connectionString: url,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

let connectedOnce = false;
pool.on('connect', () => {
  if (!connectedOnce) {
    connectedOnce = true;
    console.log('[pg] connected to database');
  }
});

pool.on('error', (err) => {
  console.error('[pg] pool error:', err?.message ?? err);
});

/**
 * Run a parameterised query. Returns null on connection failure so callers
 * can decide whether to swallow the error or surface it.
 *
 * @template T
 * @param {string} text
 * @param {ReadonlyArray<unknown>} [params]
 * @returns {Promise<import('pg').QueryResult<T> | null>}
 */
export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('[pg] query failed:', err?.message ?? err);
    return null;
  }
}

/** Strict variant — propagates the error. Use when failure should bubble (e.g., startup migration). */
export async function queryOrThrow(text, params) {
  return pool.query(text, params);
}

export async function endPool() {
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
}
