/**
 * One-time devnet setup for $TOILET.
 *
 * Creates a treasury keypair, airdrops SOL, creates an SPL token mint with 6 decimals,
 * and mints 1,000,000 $TOILET to the treasury's ATA. Idempotent: subsequent runs
 * reuse existing keypair / mint and skip the airdrop when the balance is sufficient.
 *
 * Run with:  npm run setup-devnet
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';

const DECIMALS = 6;
const SUPPLY_WHOLE_TOKENS = 1_000_000;
const AIRDROP_TARGET_SOL = 2;
const AIRDROP_CHUNK_SOL = 1; // public devnet often rejects > 1 SOL/request
const AIRDROP_MAX_ATTEMPTS_PER_CHUNK = 4;
const MIN_BALANCE_SOL = 1; // skip airdrop if treasury already has at least this much

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const KEYPAIR_PATH = path.join(SCRIPTS_DIR, 'treasury-keypair.json');
const TOKEN_INFO_PATH = path.join(SCRIPTS_DIR, 'token-info.json');

interface TokenInfo {
  mint: string;
  decimals: number;
  treasury: string;
  ata: string;
}

function loadOrCreateTreasury(): { treasury: Keypair; created: boolean } {
  if (fs.existsSync(KEYPAIR_PATH)) {
    const raw = fs.readFileSync(KEYPAIR_PATH, 'utf8');
    const secret = Uint8Array.from(JSON.parse(raw) as number[]);
    return { treasury: Keypair.fromSecretKey(secret), created: false };
  }
  const treasury = Keypair.generate();
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  fs.writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(treasury.secretKey)));
  return { treasury, created: true };
}

function loadTokenInfo(): TokenInfo | null {
  if (!fs.existsSync(TOKEN_INFO_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_INFO_PATH, 'utf8')) as TokenInfo;
}

function saveTokenInfo(info: TokenInfo): void {
  fs.writeFileSync(TOKEN_INFO_PATH, JSON.stringify(info, null, 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function airdropChunk(connection: Connection, treasury: Keypair, lamports: number): Promise<boolean> {
  for (let attempt = 1; attempt <= AIRDROP_MAX_ATTEMPTS_PER_CHUNK; attempt++) {
    try {
      const sig = await connection.requestAirdrop(treasury.publicKey, lamports);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, ...latest },
        'confirmed',
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  attempt ${attempt} failed: ${msg.split('\n')[0]}`);
      if (attempt < AIRDROP_MAX_ATTEMPTS_PER_CHUNK) {
        await sleep(2000 * attempt);
      }
    }
  }
  return false;
}

async function ensureBalance(connection: Connection, treasury: Keypair): Promise<void> {
  const balance = await connection.getBalance(treasury.publicKey);
  console.log(`Treasury balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (balance >= MIN_BALANCE_SOL * LAMPORTS_PER_SOL) {
    console.log('Sufficient balance — skipping airdrop.');
    return;
  }

  const targetLamports = AIRDROP_TARGET_SOL * LAMPORTS_PER_SOL;
  const chunkLamports = AIRDROP_CHUNK_SOL * LAMPORTS_PER_SOL;
  let current = balance;

  while (current < targetLamports) {
    const remaining = targetLamports - current;
    const ask = Math.min(chunkLamports, remaining);
    console.log(`Requesting airdrop of ${(ask / LAMPORTS_PER_SOL).toFixed(2)} SOL…`);
    const ok = await airdropChunk(connection, treasury, ask);
    if (!ok) {
      console.error(
        `\n❌ Devnet faucet refused after ${AIRDROP_MAX_ATTEMPTS_PER_CHUNK} attempts.`,
      );
      console.error('   The public devnet RPC heavily rate-limits airdrops.');
      console.error('   Fund the treasury manually, then rerun this script:');
      console.error(`     1) Open https://faucet.solana.com/`);
      console.error(`     2) Paste address: ${treasury.publicKey.toBase58()}`);
      console.error(`     3) Pick "Devnet" and request 1–2 SOL`);
      console.error(`   Or via CLI: solana airdrop 2 ${treasury.publicKey.toBase58()} --url devnet`);
      process.exit(1);
    }
    current = await connection.getBalance(treasury.publicKey);
    console.log(`  balance now: ${(current / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    if (current < targetLamports) await sleep(1000);
  }
  console.log(`Airdrop complete. Final balance: ${(current / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
}

async function createTokenIfMissing(
  connection: Connection,
  treasury: Keypair,
): Promise<TokenInfo> {
  const existing = loadTokenInfo();
  if (existing) {
    console.log('Existing token-info.json found — skipping mint creation.');
    return existing;
  }

  console.log('Creating new SPL token mint (6 decimals)…');
  const mint = await createMint(
    connection,
    treasury, // payer
    treasury.publicKey, // mint authority
    treasury.publicKey, // freeze authority
    DECIMALS,
  );
  console.log(`Mint address: ${mint.toBase58()}`);

  console.log('Creating treasury ATA…');
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    treasury,
    mint,
    treasury.publicKey,
  );
  console.log(`Treasury ATA: ${ata.address.toBase58()}`);

  const rawAmount = BigInt(SUPPLY_WHOLE_TOKENS) * BigInt(10) ** BigInt(DECIMALS);
  console.log(`Minting ${SUPPLY_WHOLE_TOKENS.toLocaleString()} $TOILET to treasury…`);
  await mintTo(
    connection,
    treasury,
    mint,
    ata.address,
    treasury,
    rawAmount,
  );

  const info: TokenInfo = {
    mint: mint.toBase58(),
    decimals: DECIMALS,
    treasury: treasury.publicKey.toBase58(),
    ata: ata.address.toBase58(),
  };
  saveTokenInfo(info);
  console.log('Saved token-info.json');
  return info;
}

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const { treasury, created } = loadOrCreateTreasury();
  console.log(
    created
      ? `Generated new treasury keypair → ${KEYPAIR_PATH}`
      : `Loaded existing treasury keypair from ${KEYPAIR_PATH}`,
  );
  console.log(`Treasury public key: ${treasury.publicKey.toBase58()}`);

  await ensureBalance(connection, treasury);
  const info = await createTokenIfMissing(connection, treasury);

  // Sanity-check that the on-chain mint actually matches our saved file (catches
  // the case where token-info.json points to a mint that doesn't exist on this network).
  const mintPubkey = new PublicKey(info.mint);
  const acct = await connection.getAccountInfo(mintPubkey);
  if (!acct) {
    console.warn(
      `\n⚠  Saved mint ${info.mint} not found on devnet. Delete scripts/token-info.json and rerun.`,
    );
  }

  console.log('\n=====================================================');
  console.log('  DEVNET $TOILET SETUP COMPLETE');
  console.log('=====================================================');
  console.log(`  Treasury wallet : ${info.treasury}`);
  console.log(`  $TOILET mint    : ${info.mint}`);
  console.log(`  Decimals        : ${info.decimals}`);
  console.log(`  Treasury ATA    : ${info.ata}`);
  console.log('=====================================================');
  console.log('\nCopy these values into src/config/solana.ts:');
  console.log(`  export const TOILET_TOKEN_MINT = '${info.mint}';`);
  console.log(`  export const TREASURY_WALLET   = '${info.treasury}';`);
  console.log('');
}

main().catch((err) => {
  console.error('\nSetup failed:', err);
  process.exit(1);
});
