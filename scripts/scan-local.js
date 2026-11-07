// Franky Bot — jalankan satu siklus scan dari terminal (tes lokal).
//   cp .env.example .env.local   (lalu isi bila perlu)
//   npm install
//   npm run scan
// Tetap mode kertas bila DRY_RUN=true — tidak ada uang yang bergerak.

import { runCycle } from '../lib/engine.js';

const summary = await runCycle('local');
console.log(JSON.stringify(summary, null, 2));
