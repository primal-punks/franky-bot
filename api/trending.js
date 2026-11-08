// Franky Check — daftar koin Trending / Baru dari GeckoTerminal (read-only).
// GET /api/trending?chain=bsc&kind=trending|new
// Terbuka, tanpa login. GeckoTerminal gratis ~30 req/menit per IP — bila 429,
// kembalikan error yang jujur supaya halaman menampilkannya, bukan data palsu.
import { latestPools, trendingPools } from '../lib/geckoterminal.js';
import { CHAINS } from '../lib/check.js';

export default async function handler(req, res) {
  const chain = String(req.query.chain || 'solana').toLowerCase();
  const kind = String(req.query.kind || 'trending').toLowerCase();
  const meta = CHAINS[chain];
  if (!meta) return res.status(400).json({ ok: false, error: 'chain tidak dikenal (solana / bsc / base)' });
  if (kind !== 'trending' && kind !== 'new') {
    return res.status(400).json({ ok: false, error: 'kind harus trending atau new' });
  }
  try {
    const pools = kind === 'new' ? await latestPools(meta.gecko) : await trendingPools(meta.gecko);
    return res.status(200).json({
      ok: true,
      chain,
      kind,
      pools: pools.map((p) => ({
        name: p.name || '',
        symbol: p.baseToken?.symbol || '',
        address: p.baseToken?.address || '',
        pairAddress: p.pairAddress || '',
        imageUrl: p.imageUrl || '',
        priceUsd: p.priceUsd || '',
        fdv: Number(p.fdv || 0),
        marketCap: Number(p.marketCap || 0),
        liquidityUsd: Number(p?.liquidity?.usd || 0),
        volumeH1: Number(p?.volume?.h1 || 0),
        buysH1: Number(p?.txns?.h1?.buys || 0),
        sellsH1: Number(p?.txns?.h1?.sells || 0),
        changeM5: Number(p.changeM5 || 0),
        changeH1: Number(p.changeH1 || 0),
        changeH6: Number(p.changeH6 || 0),
        changeH24: Number(p.changeH24 || 0),
        createdAt: Number(p.pairCreatedAt || 0),
      })),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
