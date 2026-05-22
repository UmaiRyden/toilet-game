/**
 * On-chain verification of a player's stake transfer.
 *
 * Given a tx signature, confirms the transaction:
 *   - exists and was confirmed on devnet
 *   - contains an SPL transferChecked / transfer instruction
 *   - moves `expectedAmount` whole $TOILET tokens from the player's ATA → treasury ATA
 *
 * `SKIP_STAKE_VERIFY=true` in the environment short-circuits verification — useful
 * for local dev where re-running the full Solana round-trip on every match would
 * waste time. Never enable this in production.
 */

import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

import {
  getMintAddress,
  getMintDecimals,
} from '../config/tokens.js';

const SKIP_VERIFY =
  String(process.env.SKIP_STAKE_VERIFY || '').toLowerCase() === 'true';

let connection = null;
function getConnection() {
  if (connection) return connection;
  connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  return connection;
}

/** Try a handful of times — confirmed transactions can lag the RPC's parsed view by a beat. */
const MAX_FETCH_ATTEMPTS = 6;
const FETCH_RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} txSignature
 * @param {string} expectedFrom base58 wallet pubkey of the player who paid
 * @param {string} expectedTo base58 wallet pubkey of the treasury
 * @param {number} expectedAmount whole-token amount
 * @returns {Promise<boolean>}
 */
export async function verifyStakeTransfer(
  txSignature,
  expectedFrom,
  expectedTo,
  expectedAmount,
) {
  if (SKIP_VERIFY) {
    console.log(
      `[stakeVerifier] SKIP_STAKE_VERIFY=true — accepting ${txSignature} unconditionally`,
    );
    return true;
  }
  if (typeof txSignature !== 'string' || !txSignature) return false;
  if (typeof expectedFrom !== 'string' || !expectedFrom) return false;
  if (typeof expectedTo !== 'string' || !expectedTo) return false;
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) return false;

  const mintAddress = getMintAddress();
  const decimals = getMintDecimals();
  if (!mintAddress || decimals == null) {
    console.error(
      '[stakeVerifier] token-info.json is missing or incomplete — cannot verify',
    );
    return false;
  }

  let conn;
  try {
    conn = getConnection();
  } catch (err) {
    console.error('[stakeVerifier] could not open RPC connection:', err);
    return false;
  }

  try {
    const mint = new PublicKey(mintAddress);
    const fromPubkey = new PublicKey(expectedFrom);
    const toPubkey = new PublicKey(expectedTo);
    const expectedFromAta = (
      await getAssociatedTokenAddress(mint, fromPubkey)
    ).toBase58();
    const expectedToAta = (
      await getAssociatedTokenAddress(mint, toPubkey)
    ).toBase58();
    const expectedRaw = BigInt(expectedAmount) * BigInt(10) ** BigInt(decimals);

    let tx = null;
    for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
      tx = await conn.getParsedTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (tx) break;
      await sleep(FETCH_RETRY_DELAY_MS);
    }

    if (!tx) {
      console.warn(`[stakeVerifier] tx ${txSignature} not found on devnet`);
      return false;
    }
    if (tx.meta?.err) {
      console.warn(
        `[stakeVerifier] tx ${txSignature} failed on-chain:`,
        tx.meta.err,
      );
      return false;
    }

    const instructions = tx.transaction.message.instructions ?? [];
    for (const ix of instructions) {
      if (ix.program !== 'spl-token') continue;
      const parsed = ix.parsed;
      if (!parsed || typeof parsed !== 'object') continue;
      const type = parsed.type;
      if (type !== 'transfer' && type !== 'transferChecked') continue;

      const info = parsed.info ?? {};
      if (info.source !== expectedFromAta) continue;
      if (info.destination !== expectedToAta) continue;

      let rawAmount;
      if (type === 'transferChecked') {
        if (info.mint !== mintAddress) continue;
        rawAmount = BigInt(info.tokenAmount?.amount ?? '0');
      } else {
        rawAmount = BigInt(info.amount ?? '0');
      }

      if (rawAmount === expectedRaw) {
        return true;
      }
    }

    console.warn(
      `[stakeVerifier] tx ${txSignature} did not contain a matching ${expectedAmount} $TOILET transfer from ${expectedFrom} to ${expectedTo}`,
    );
    return false;
  } catch (err) {
    console.error('[stakeVerifier] verification threw:', err);
    return false;
  }
}
