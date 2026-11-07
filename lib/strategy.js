// Franky Bot — filter & skor pair dari DexScreener.
// Hanya pair yang lolos semua filter yang dipertimbangkan untuk dibeli.

import { CONFIG } from './config.js';

export function pairPasses(pair) {
  const liq = Number(pair?.liquidity?.usd || 0);
  if (liq < CONFIG.minLiquidityUsd) return { ok: false, reason: `likuiditas $${liq}` };

  const fdv = Number(pair?.fdv || 0);
  if (!fdv || fdv > CONFIG.maxFdvUsd) return { ok: false, reason: `fdv $${fdv}` };

  const volH1 = Number(pair?.volume?.h1 || 0);
  if (volH1 < CONFIG.minVolumeH1Usd) return { ok: false, reason: `volume-1j $${volH1}` };

  const h1 = pair?.txns?.h1 || {};
  const buys = h1.buys || 0;
  const sells = h1.sells || 0;
  if (buys < 5) return { ok: false, reason: `beli-1j-hanya-${buys}` };
  if (sells > buys * 2) return { ok: false, reason: 'jual-jauh-lebih-banyak-dari-beli' };

  const ageMin = (Date.now() - Number(pair?.pairCreatedAt || 0)) / 60000;
  if (!(ageMin >= 5 && ageMin <= 24 * 60)) {
    return { ok: false, reason: `umur-pair-${Math.round(ageMin)}-mnt` };
  }

  return { ok: true, ageMin };
}

// Skor 0-100: rasio beli, volume, dan likuiditas. Dipakai untuk mengurutkan kandidat.
export function scorePair(pair) {
  const h1 = pair?.txns?.h1 || {};
  const buys = h1.buys || 0;
  const sells = h1.sells || 0;
  const volH1 = Number(pair?.volume?.h1 || 0);
  const liq = Number(pair?.liquidity?.usd || 0);
  const buyRatio = buys / Math.max(1, buys + sells);
  return Math.round(
    buyRatio * 50 +
      Math.min(30, Math.log10(volH1 + 1) * 10) +
      Math.min(20, Math.log10(liq + 1) * 5),
  );
}
