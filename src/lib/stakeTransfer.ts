import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

import {
  EXTENDED_MAG_PRICE,
  TOILET_TOKEN_MINT,
  TREASURY_WALLET,
} from '../config/solana';

/**
 * Must match the on-chain mint's decimals — currently 6 (set by `npm run setup-devnet`).
 * If we ever rotate the mint to a different decimal count, this number has to move with it.
 */
const TOILET_DECIMALS = 6;

export interface SignableWallet {
  publicKey: PublicKey | null;
  signTransaction: (<T extends Transaction>(tx: T) => Promise<T>) | undefined;
}

/**
 * Builds, signs (via Phantom), sends, and confirms a $TOILET transfer of `amount`
 * whole tokens from the player's wallet to the treasury wallet. Throws on any
 * step failing — callers catch and report to the server.
 *
 * @returns the confirmed transaction signature
 */
export async function transferStakeToTreasury(
  connection: Connection,
  wallet: SignableWallet,
  amount: number,
): Promise<string> {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected');
  }
  if (typeof wallet.signTransaction !== 'function') {
    throw new Error('Connected wallet cannot sign transactions');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid stake amount: ${amount}`);
  }

  const mint = new PublicKey(TOILET_TOKEN_MINT);
  const treasury = new PublicKey(TREASURY_WALLET);
  const from = wallet.publicKey;

  const fromAta = await getAssociatedTokenAddress(mint, from);
  const toAta = await getAssociatedTokenAddress(mint, treasury);

  const tx = new Transaction();

  /**
   * Treasury ATA should already exist (created during `npm run setup-devnet`), but if
   * something rotated the keypair we still want the transfer to succeed. The player
   * funds the ~0.002 SOL rent in that case — standard SPL transfer behavior.
   */
  try {
    await getAccount(connection, toAta);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(from, toAta, treasury, mint),
    );
  }

  const rawAmount = BigInt(amount) * BigInt(10) ** BigInt(TOILET_DECIMALS);

  tx.add(
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      from,
      rawAmount,
      TOILET_DECIMALS,
    ),
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = from;

  let signed: Transaction;
  try {
    signed = await wallet.signTransaction(tx);
  } catch (err) {
    /** User rejected in Phantom, or wallet errored — surface as a recognizable error type. */
    throw new Error(
      err instanceof Error && err.message
        ? `Wallet rejected the transaction: ${err.message}`
        : 'Wallet rejected the transaction',
    );
  }

  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
  });

  const confirmation = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );
  if (confirmation.value.err) {
    throw new Error(
      `Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  return sig;
}

/**
 * Same transfer pattern as `transferStakeToTreasury` but fixed at `EXTENDED_MAG_PRICE`
 * (the cost of the 20-round magazine upgrade). The fee is one-shot — refunds are not
 * issued if the match cancels.
 */
export async function transferExtendedMagFee(
  connection: Connection,
  wallet: SignableWallet,
): Promise<string> {
  return transferStakeToTreasury(connection, wallet, EXTENDED_MAG_PRICE);
}
