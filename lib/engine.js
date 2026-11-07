// Franky Bot — otak bot. Satu siklus:
//  1. Cek posisi terbuka: jual bila kena take-profit / stop-loss / max hold.
//  2. Bila rugi harian tembus batas, berhenti beli hari itu.
//  3. Scan pair terbaru tiap chain aktif, filter, cek keamanan, lalu beli.
//
// CATATAN: library chain berat (ethers, @solana/web3.js) sengaja di-import
// LAZY (dynamic import) hanya saat transaksi live. Import statis di atas
// membuat /api/scan crash di Vercel (FUNCTION_INVOCATION_FAILED) karena
// bundler serverless gagal memuat dependency besar itu saat cold start.
// Mode kertas tidak pernah menyentuh library itu, jadi scan jalan tanpa mereka.

import { CONFIG, CHAINS } from './config.js';
import { loadState, saveState, log } from './store.js';
import { tokenPriceUsd } from './dexscreener.js';
import { latestPools } from './geckoterminal.js';
import { checkToken } from './security.js';
import { pairPasses, scorePair } from './strategy.js';

const today = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Harga USD dari wrapped native (WBNB/WETH/WHYPE) via DexScreener.
async function wrappedPriceUsd(chain) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chain.wrappedNative}`);
    const j = await r.json();
    const p = (j.pairs || []).find((x) => Number(x.priceUsd) > 0);
    return p ? Number(p.priceUsd) : 0;
  } catch {
    return 0;
  }
}

async function executeBuy(chain, pair) {
  if (CONFIG.dryRun) return { paper: true };
  if (chain.id === 'solana') {
    const { solanaBuy } = await import('./solana.js');
    return solanaBuy(pair.baseToken.address, CONFIG.maxBuyUsd, CONFIG.slippageBps);
  }
  const { ethers } = await import('ethers');
  const { evmBuy } = await import('./evm.js');
  const price = await wrappedPriceUsd(chain);
  if (!price) throw new Error(`harga ${chain.native} tidak didapat`);
  const nativeAmount = ethers.parseEther(String(CONFIG.maxBuyUsd / price));
  return evmBuy(chain, pair.baseToken.address, nativeAmount, CONFIG.slippageBps);
}

async function executeSell(pos) {
  if (CONFIG.dryRun) return { paper: true };
  const chain = CHAINS[pos.chain];
  if (pos.chain === 'solana') {
    const { solanaSell } = await import('./solana.js');
    return solanaSell(pos.tokenAddress, CONFIG.slippageBps);
  }
  const { evmSell } = await import('./evm.js');
  return evmSell(chain, pos.tokenAddress, CONFIG.slippageBps);
}

export async function runCycle(trigger = 'cron') {
  const state = await loadState();
  if (state.daily.date !== today()) state.daily = { date: today(), pnlUsd: 0, buys: 0 };

  const summary = {
    trigger,
    at: new Date().toISOString(),
    dryRun: CONFIG.dryRun,
    scanned: 0,
    candidates: 0,
    buys: [],
    sells: [],
    skipped: [],
    errors: [],
  };

  // 1. Kelola posisi terbuka.
  for (const pos of [...state.positions]) {
    try {
      const price = await tokenPriceUsd(CHAINS[pos.chain].dexscreener, pos.tokenAddress);
      if (!price) continue;
      const pnlPct = ((price - pos.entryPriceUsd) / pos.entryPriceUsd) * 100;
      const ageH = (Date.now() - new Date(pos.boughtAt).getTime()) / 3600000;
      let reason = null;
      if (pnlPct >= CONFIG.takeProfitPct) reason = `TP +${pnlPct.toFixed(1)}%`;
      else if (pnlPct <= -CONFIG.stopLossPct) reason = `SL ${pnlPct.toFixed(1)}%`;
      else if (ageH >= CONFIG.maxHoldHours) reason = `max-hold ${ageH.toFixed(1)}j`;
      if (!reason) continue;

      const result = await executeSell(pos);
      const pnlUsd = (pos.entryUsd * pnlPct) / 100;
      state.daily.pnlUsd += pnlUsd;
      state.positions = state.positions.filter((p) => p.id !== pos.id);
      state.trades.unshift({
        ...pos,
        exitPriceUsd: price,
        pnlPct: +pnlPct.toFixed(2),
        pnlUsd: +pnlUsd.toFixed(2),
        reason,
        closedAt: new Date().toISOString(),
        exitTx: result?.txHash || result?.signature || null,
      });
      summary.sells.push({ symbol: pos.symbol, reason, pnlPct: +pnlPct.toFixed(2) });
      log(state, `JUAL ${pos.symbol} (${reason}) pnl ${pnlPct.toFixed(1)}%`);
    } catch (e) {
      summary.errors.push(`sell ${pos.symbol}: ${e.message}`);
    }
  }

  // 2. Batas rugi harian.
  if (state.daily.pnlUsd <= -CONFIG.dailyLossLimitUsd) {
    summary.skipped.push('daily-loss-limit');
    await saveState(state);
    return summary;
  }

  // 3. Scan & beli. Jeda antar chain supaya GeckoTerminal (gratis, limit
  // ~30 req/menit per IP bersama) tidak langsung 429.
  let firstChain = true;
  for (const chainId of CONFIG.enabledChains) {
    const chain = CHAINS[chainId];
    if (!chain) continue;
    if (!firstChain) await sleep(1500);
    firstChain = false;
    try {
      const pairs = await latestPools(chain.gecko);
      summary.scanned += pairs.length;
      const fresh = pairs
        .filter(
          (p) =>
            !state.positions.some((x) => x.id === `${chainId}:${p.baseToken.address}`) &&
            !state.trades.some(
              (t) =>
                t.id === `${chainId}:${p.baseToken.address}` &&
                t.closedAt?.slice(0, 10) === today(),
            ),
        )
        .sort((a, b) => scorePair(b) - scorePair(a));

      for (const pair of fresh.slice(0, 10)) {
        if (state.positions.length >= CONFIG.maxPositions) break;
        const pass = pairPasses(pair);
        if (!pass.ok) continue;
        summary.candidates += 1;

        const sec = await checkToken(chain.goplus, pair.baseToken.address, [pair.pairAddress]);
        if (!sec.ok) {
          log(state, `SKIP ${pair.baseToken.symbol} (${chain.label}): ${sec.reason}`);
          continue;
        }

        const entryPrice = Number(pair.priceUsd || 0);
        if (!entryPrice) continue;

        try {
          const result = await executeBuy(chain, pair);
          const pos = {
            id: `${chainId}:${pair.baseToken.address}`,
            chain: chainId,
            symbol: pair.baseToken.symbol,
            tokenAddress: pair.baseToken.address,
            pairAddress: pair.pairAddress,
            entryPriceUsd: entryPrice,
            entryUsd: CONFIG.maxBuyUsd,
            boughtAt: new Date().toISOString(),
            txHash: result?.txHash || result?.signature || null,
            paper: !!CONFIG.dryRun,
            holders: sec.holders || null,
          };
          state.positions.push(pos);
          state.daily.buys += 1;
          summary.buys.push({ symbol: pos.symbol, chain: chainId, price: entryPrice, tx: pos.txHash, holders: sec.holders || null });
          log(state, `BELI ${pos.symbol} (${chain.label}) $${CONFIG.maxBuyUsd} @ $${entryPrice}`);
        } catch (e) {
          summary.errors.push(`buy ${pair.baseToken.symbol}: ${e.message}`);
          log(state, `GAGAL BELI ${pair.baseToken.symbol}: ${e.message}`);
        }
      }
    } catch (e) {
      summary.errors.push(`scan ${chainId}: ${e.message}`);
    }
  }

  await saveState(state);
  return summary;
}
