import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

/** Align with root `.env.example` and `vite.config.ts`. */
export const DEFAULT_LISTEN_PORT = 8080;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnv = path.join(__dirname, '..', '..', '..', '.env');

dotenv.config({ path: repoRootEnv });

export function getListenPort() {
  const raw = process.env.PORT;
  if (raw === undefined || raw === '') return DEFAULT_LISTEN_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) return DEFAULT_LISTEN_PORT;
  return n;
}
