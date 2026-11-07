// Franky Bot — penyimpanan state sederhana (file JSON di /tmp).
// Di Vercel, /tmp bisa hilang saat fungsi di-recycle. Untuk pemakaian serius,
// ganti file ini dengan Vercel KV / Upstash Redis.

import { promises as fs } from 'node:fs';

const FILE = '/tmp/franky-state.json';

const blank = () => ({
  positions: [], // posisi terbuka
  trades: [], // riwayat trade yang sudah ditutup
  daily: { date: '', pnlUsd: 0, buys: 0 },
  logs: [], // log terbaru di depan, maks 200
});

export async function loadState() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return blank();
  }
}

export async function saveState(state) {
  state.trades = state.trades.slice(0, 200);
  state.logs = state.logs.slice(0, 200);
  await fs.writeFile(FILE, JSON.stringify(state));
}

export function log(state, msg) {
  state.logs.unshift({ t: new Date().toISOString(), msg });
  state.logs = state.logs.slice(0, 200);
}
