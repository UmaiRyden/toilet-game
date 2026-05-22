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

  // Try file first (local dev)
  try {
    const raw = fs.readFileSync(TOKEN_INFO_PATH, 'utf8');
    cached = JSON.parse(raw);
    console.log(
      `[config/tokens] loaded from file — mint=${cached.mint?.slice(0, 8)}… treasury=${cached.treasury?.slice(0, 8) ?? '(none)'}…`,
    );
    return cached;
  } catch (err) {
    // File absent — fall through to env vars
  }

  // Fall back to individual env variables (Railway / hosted deployments)
  const mint = (process.env.TOILET_TOKEN_MINT || '').trim();
  const decimals = parseInt(process.env.TOILET_TOKEN_DECIMALS || '6', 10);
  const treasury = (process.env.TREASURY_WALLET_ADDRESS || '').trim();

  if (mint) {
    cached = { mint, decimals, treasury: treasury || null };
    console.log(
      `[config/tokens] loaded from env — mint=${mint.slice(0, 8)}… decimals=${decimals} treasury=${treasury ? treasury.slice(0, 8) + '…' : '(none)'}`,
    );
  } else {
    console.warn(
      `[config/tokens] token info unavailable — set TOILET_TOKEN_MINT or TREASURY_TOKEN_INFO_PATH`,
    );
    cached = null;
  }

  return cached;
}

export function getTreasuryAddress() {
  return (
    getTokenInfo()?.treasury ||
    (process.env.TREASURY_WALLET_ADDRESS || '').trim() ||
    null
  );
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
