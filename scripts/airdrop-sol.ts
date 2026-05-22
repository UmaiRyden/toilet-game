/**
 * Airdrop 1 devnet SOL to any wallet so it can pay transaction fees.
 *
 * Usage:  npm run airdrop-sol -- <recipient-wallet-address>
 *
 * Uses the public devnet faucet via Connection.requestAirdrop. The faucet is
 * rate-limited (per-IP, per-recipient); failures usually mean "try again in a
 * few minutes" rather than a code problem.
 */

import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';

const AIRDROP_AMOUNT_SOL = 1;

function parseRecipient(): PublicKey {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npm run airdrop-sol -- <recipient-wallet-address>');
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

  console.log(`Network    : devnet`);
  console.log(`Recipient  : ${recipient.toBase58()}`);

  const beforeLamports = await connection.getBalance(recipient);
  console.log(
    `Balance    : ${(beforeLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL (before)`,
  );

  console.log(`\nRequesting ${AIRDROP_AMOUNT_SOL} SOL airdrop…`);
  const lamports = AIRDROP_AMOUNT_SOL * LAMPORTS_PER_SOL;
  const sig = await connection.requestAirdrop(recipient, lamports);

  /** Confirm so the caller knows the balance is actually credited. */
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');
  const confirmation = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );
  if (confirmation.value.err) {
    throw new Error(
      `Airdrop tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  const afterLamports = await connection.getBalance(recipient);
  console.log(
    `\n✅ Sent ${AIRDROP_AMOUNT_SOL} SOL to ${recipient.toBase58()}`,
  );
  console.log(
    `   Balance    : ${(afterLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL (after)`,
  );
  console.log(`   Tx: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((err) => {
  console.error('\nAirdrop failed:', err);
  if (err instanceof Error && /429|rate.?limit|airdrop.*limit/i.test(err.message)) {
    console.error(
      '\nThe devnet faucet is rate-limited. Wait a few minutes and try again, or use https://faucet.solana.com/.',
    );
  }
  process.exit(1);
});
