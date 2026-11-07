// Franky Bot — status bot untuk dashboard (tanpa data rahasia).
// Bila ALLOWED_EMAIL diisi, endpoint ini butuh session Google yang valid.

import { loadState } from '../lib/store.js';
import { CONFIG, CHAINS } from '../lib/config.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!requireAuth(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized', authRequired: true });
  }
  const state = await loadState();
  return res.status(200).json({
    ok: true,
    mode: CONFIG.dryRun ? 'PAPER' : 'LIVE',
    chains: CONFIG.enabledChains.map((id) => CHAINS[id]?.label || id),
    limits: {
      maxBuyUsd: CONFIG.maxBuyUsd,
      maxPositions: CONFIG.maxPositions,
      takeProfitPct: CONFIG.takeProfitPct,
      stopLossPct: CONFIG.stopLossPct,
      maxHoldHours: CONFIG.maxHoldHours,
      dailyLossLimitUsd: CONFIG.dailyLossLimitUsd,
    },
    positions: state.positions,
    trades: state.trades.slice(0, 50),
    daily: state.daily,
    logs: state.logs.slice(0, 100),
  });
}
