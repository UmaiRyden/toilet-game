/**
 * Shared loader for the devnet $TOILET token metadata written by `npm run setup-devnet`.
 * Both payout and stake-verification subsystems read from here so they stay in sync.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PATH = path.resolve(
  __dirname,
  '../../../scripts/token-info.json',
);
const TOKEN_INFO_PATH =
  (process.env.TREASURY_TOKEN_INFO_PATH || '').trim() || DEFAULT_PATH;

let cached = null;
let loadAttempted = false;

export function getTokenInfo() {
  if (loadAttempted) return cached;
  loadAttempted = true;
  try {
    const raw = fs.readFileSync(TOKEN_INFO_PATH, 'utf8');
    cached = JSON.parse(raw);
  } catch (err) {
    console.warn(
      `[config/tokens] could not load token-info from ${TOKEN_INFO_PATH}: ${err.message}`,
    );
    cached = null;
  }
  return cached;
}

export function getTreasuryAddress() {
  return getTokenInfo()?.treasury ?? null;
}

export function getMintAddress() {
  return getTokenInfo()?.mint ?? null;
}

export function getMintDecimals() {
  const d = getTokenInfo()?.decimals;
  return typeof d === 'number' ? d : null;
}

/** Cost of the in-room 20-round magazine upgrade — must match src/config/solana.ts. */
export const EXTENDED_MAG_PRICE = 10;
