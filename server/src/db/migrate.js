/**
 * Idempotent startup migration — runs schema.sql against the configured Postgres.
 * Failure is non-fatal: the game still runs, match history just won't be persisted.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { queryOrThrow } from '../config/postgres.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export async function runStartupMigration() {
  let sql;
  try {
    sql = await fs.readFile(SCHEMA_PATH, 'utf8');
  } catch (err) {
    console.error(`[pg] could not read schema.sql at ${SCHEMA_PATH}:`, err?.message ?? err);
    return false;
  }
  try {
    await queryOrThrow(sql);
    console.log('[pg] schema migration applied');
    return true;
  } catch (err) {
    console.error('[pg] migration failed — match history will be disabled:', err?.message ?? err);
    return false;
  }
}
