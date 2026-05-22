import { clusterApiUrl } from '@solana/web3.js';

export const SOLANA_NETWORK = 'devnet';
export const SOLANA_RPC_URL = clusterApiUrl(SOLANA_NETWORK);

// Devnet test token created via `npm run setup-devnet`. Swap for mainnet values at launch.
export const TOILET_TOKEN_MINT = '7u9z4bx47wLz2s9Ui5697sfNKfBG19sXdUibyVUM8YD8';
export const TREASURY_WALLET = 'Hpug1YxkfUodjxWRsYuJcpQXAaVpH7L5hiqbPm3m2xFA';
export const EXTENDED_MAG_PRICE = 10; // $TOILET cost for 20-round mag upgrade
