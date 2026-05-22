import { useCallback } from 'react';
import {
  useConnection,
  useWallet as useWalletAdapter,
} from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

import { TOILET_TOKEN_MINT } from '../config/solana';

function formatAddress(pubkey: PublicKey | null): string {
  if (!pubkey) return '';
  const s = pubkey.toBase58();
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

/**
 * App-facing wallet hook. Wraps the wallet adapter so callers don't have to
 * juggle modal visibility, address formatting, and SPL token reads.
 */
export function useWallet() {
  const { connection } = useConnection();
  const {
    connected,
    publicKey,
    disconnect,
    signTransaction,
  } = useWalletAdapter();
  const { setVisible } = useWalletModal();

  const walletAddress = formatAddress(publicKey);

  /** Opens the wallet picker modal. autoConnect handles returning users on its own. */
  const connect = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  /**
   * Reads the connected wallet's $TOILET balance.
   * Returns 0 for any failure path: no wallet, no ATA, invalid mint placeholder, RPC error.
   */
  const getToiletBalance = useCallback(async (): Promise<number> => {
    if (!publicKey) return 0;
    try {
      const mint = new PublicKey(TOILET_TOKEN_MINT);
      const ata = await getAssociatedTokenAddress(mint, publicKey);
      const [account, mintInfo] = await Promise.all([
        getAccount(connection, ata),
        getMint(connection, mint),
      ]);
      return Number(account.amount) / Math.pow(10, mintInfo.decimals);
    } catch {
      return 0;
    }
  }, [connection, publicKey]);

  return {
    connected,
    publicKey,
    connect,
    disconnect,
    walletAddress,
    getToiletBalance,
    /** Forwarded straight from the adapter — undefined if the active wallet can't sign. */
    signTransaction,
    /** Same Solana Connection the adapter is using; pass to lib helpers that build txs. */
    connection,
  };
}
