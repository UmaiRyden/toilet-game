/**
 * Centralized treasury payout for match winners (MVP).
 *
 * Loads the treasury keypair (env override: TREASURY_KEYPAIR_PATH) and the token
 * info written by `npm run setup-devnet`. Exposes `payoutWinner(wallet, amount)`
 * which transfers $TOILET from treasury → winner on Solana devnet.
 *
 * Errors are logged, never thrown — a failed payout must not crash the game server.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  transfer,
} from '@solana/spl-token';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Defaults resolve to <repo-root>/scripts/*.json regardless of the server's CWD. */
const DEFAULT_KEYPAIR_PATH = path.resolve(
  __dirname,
  '../../../scripts/treasury-keypair.json',
);
const DEFAULT_TOKEN_INFO_PATH = path.resolve(
  __dirname,
  '../../../scripts/token-info.json',
);

const TOKEN_INFO_PATH =
  (process.env.TREASURY_TOKEN_INFO_PATH || '').trim() || DEFAULT_TOKEN_INFO_PATH;

/**
 * Load the treasury keypair. Tries the file path first (local dev), then falls
 * back to TREASURY_KEYPAIR_JSON env var (Railway / hosted deployments).
 */
function loadTreasuryKeypair() {
  // Try file path first
  try {
    const keypairPath =
      (process.env.TREASURY_KEYPAIR_PATH || '').trim() || DEFAULT_KEYPAIR_PATH;
    const data = fs.readFileSync(keypairPath, 'utf8');
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(data)));
  } catch (e) {
    // File not present — fall through to env var
  }

  // Try environment variable (set in Railway / production)
  try {
    if (process.env.TREASURY_KEYPAIR_JSON) {
      const secretKey = JSON.parse(process.env.TREASURY_KEYPAIR_JSON);
      return Keypair.fromSecretKey(Uint8Array.from(secretKey));
    }
  } catch (e) {
    console.error('[payout] Failed to parse TREASURY_KEYPAIR_JSON:', e.message);
  }

  return null;
}

/** Lazy singletons — initialized on first payout, retried per call if init failed. */
let treasury = null;
let tokenInfo = null;
let connection = null;

function initIfNeeded() {
  if (treasury && tokenInfo && connection) return true;
  try {
    treasury = loadTreasuryKeypair();
    if (!treasury) {
      console.error(
        '[payout] treasury keypair unavailable — set TREASURY_KEYPAIR_PATH or TREASURY_KEYPAIR_JSON',
      );
      return false;
    }
    if (!fs.existsSync(TOKEN_INFO_PATH)) {
      console.error(`[payout] token info not found at ${TOKEN_INFO_PATH}`);
      treasury = null;
      return false;
    }
    tokenInfo = JSON.parse(fs.readFileSync(TOKEN_INFO_PATH, 'utf8'));
    connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    console.log(
      `[payout] ready — treasury=${treasury.publicKey.toBase58()} mint=${tokenInfo.mint}`,
    );
    return true;
  } catch (err) {
    console.error('[payout] init failed:', err);
    treasury = null;
    tokenInfo = null;
    connection = null;
    return false;
  }
}

/**
 * Transfer `amount` whole $TOILET tokens from treasury to `winnerWalletAddress`.
 *
 * @param {string} winnerWalletAddress base58 pubkey
 * @param {number} amount whole tokens (will be scaled by mint decimals)
 * @returns {Promise<string | null>} transaction signature, or null on failure
 */
export async function payoutWinner(winnerWalletAddress, amount) {
  if (!initIfNeeded()) return null;
  if (!winnerWalletAddress || typeof winnerWalletAddress !== 'string') {
    console.error('[payout] missing winner wallet address — skipping payout');
    return null;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`[payout] invalid amount ${amount} — skipping payout`);
    return null;
  }

  try {
    const recipient = new PublicKey(winnerWalletAddress);
    const mint = new PublicKey(tokenInfo.mint);

    const fromAta = await getOrCreateAssociatedTokenAccount(
      connection,
      treasury,
      mint,
      treasury.publicKey,
    );
    /** Recipient ATA may not exist — treasury pays the ~0.002 SOL rent. */
    const toAta = await getOrCreateAssociatedTokenAccount(
      connection,
      treasury,
      mint,
      recipient,
    );

    const rawAmount =
      BigInt(amount) * BigInt(10) ** BigInt(tokenInfo.decimals);

    const sig = await transfer(
      connection,
      treasury,
      fromAta.address,
      toAta.address,
      treasury,
      rawAmount,
    );

    console.log(
      `[payout] sent ${amount} $TOILET → ${winnerWalletAddress} (tx ${sig})`,
    );
    return sig;
  } catch (err) {
    console.error(
      `[payout] transfer failed for ${winnerWalletAddress} (${amount} $TOILET):`,
      err,
    );
    return null;
  }
}
