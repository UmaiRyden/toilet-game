/**
 * Send test $TOILET from the devnet treasury to any wallet.
 *
 * Usage:  npm run airdrop-toilet -- <recipient-wallet-address>
 *
 * Reads the treasury keypair and mint from the files written by setup-devnet-token.ts.
 * Creates the recipient's ATA if it doesn't exist (treasury pays the rent).
 */

import fs from 'node:fs';
import path from 'node:path';

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

const AIRDROP_AMOUNT_WHOLE_TOKENS = 10_000;

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const KEYPAIR_PATH = path.join(SCRIPTS_DIR, 'treasury-keypair.json');
const TOKEN_INFO_PATH = path.join(SCRIPTS_DIR, 'token-info.json');

interface TokenInfo {
  mint: string;
  decimals: number;
  treasury: string;
  ata: string;
}

function loadTreasury(): Keypair {
  if (!fs.existsSync(KEYPAIR_PATH)) {
    throw new Error(
      `Treasury keypair not found at ${KEYPAIR_PATH}. Run "npm run setup-devnet" first.`,
    );
  }
  const raw = fs.readFileSync(KEYPAIR_PATH, 'utf8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

function loadTokenInfo(): TokenInfo {
  if (!fs.existsSync(TOKEN_INFO_PATH)) {
    throw new Error(
      `Token info not found at ${TOKEN_INFO_PATH}. Run "npm run setup-devnet" first.`,
    );
  }
  return JSON.parse(fs.readFileSync(TOKEN_INFO_PATH, 'utf8')) as TokenInfo;
}

function parseRecipient(): PublicKey {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npm run airdrop-toilet -- <recipient-wallet-address>');
    process.exit(1);
  }
  try {
    return new PublicKey(arg);
  } catch {
    console.error(`Invalid Solana address: ${arg}`);
    process.exit(1);
  }
}

async function main() {
  const recipient = parseRecipient();
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const treasury = loadTreasury();
  const info = loadTokenInfo();
  const mint = new PublicKey(info.mint);

  console.log(`Network    : devnet`);
  console.log(`Treasury   : ${treasury.publicKey.toBase58()}`);
  console.log(`Mint       : ${mint.toBase58()}`);
  console.log(`Recipient  : ${recipient.toBase58()}`);

  /** Treasury ATA already exists from setup; this is a no-op fetch. */
  const fromAta = await getOrCreateAssociatedTokenAccount(
    connection,
    treasury,
    mint,
    treasury.publicKey,
  );
  console.log(`From ATA   : ${fromAta.address.toBase58()}`);

  /** Recipient ATA may not exist yet — treasury pays the ~0.002 SOL rent. */
  const toAta = await getOrCreateAssociatedTokenAccount(
    connection,
    treasury,
    mint,
    recipient,
  );
  console.log(`To ATA     : ${toAta.address.toBase58()}`);

  const rawAmount =
    BigInt(AIRDROP_AMOUNT_WHOLE_TOKENS) * BigInt(10) ** BigInt(info.decimals);
  console.log(
    `\nTransferring ${AIRDROP_AMOUNT_WHOLE_TOKENS.toLocaleString()} $TOILET…`,
  );
  const sig = await transfer(
    connection,
    treasury, // fee payer
    fromAta.address,
    toAta.address,
    treasury, // owner of source ATA
    rawAmount,
  );

  console.log(
    `\n✅ Sent ${AIRDROP_AMOUNT_WHOLE_TOKENS.toLocaleString()} $TOILET to ${recipient.toBase58()}`,
  );
  console.log(`   Tx: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((err) => {
  console.error('\nAirdrop failed:', err);
  process.exit(1);
});
