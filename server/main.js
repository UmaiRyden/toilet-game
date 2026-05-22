import { start } from './src/app.js';

start().catch((err) => {
  console.error('[server] startup failed:', err);
  process.exit(1);
});
