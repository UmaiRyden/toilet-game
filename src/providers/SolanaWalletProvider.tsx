import { useMemo, type ReactNode } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

import { SOLANA_RPC_URL } from '../config/solana';

interface Props {
  children: ReactNode;
}

/**
 * Wraps the app with Solana wallet adapter providers. Phantom is the only
 * wallet enabled in Phase 2; more can be added by extending the adapters array.
 */
export function SolanaWalletProvider({ children }: Props) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
