import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@solana/wallet-adapter-react-ui/styles.css';

import { App } from './App';
import { SettingsProvider } from './contexts/SettingsContext';
import { SolanaWalletProvider } from './providers/SolanaWalletProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <SettingsProvider>
    <SolanaWalletProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SolanaWalletProvider>
  </SettingsProvider>,
);
