// Franky Check — daftar koin Trending / Baru dari GeckoTerminal (read-only).
// GET /api/trending?chain=bsc&kind=trending|new&page=1
// Terbuka, tanpa login. GeckoTerminal gratis ~30 req/menit per IP — bila 429,
// kembalikan error yang jujur supaya halaman menampilkannya, bukan data palsu.
// Daftar dibersihkan di server: koin mati disembunyikan, duplikat (satu CA
// muncul di beberapa pool) digabung ke entri berlikuiditas terbesar.
import { latestPools, trendingPools } from '../lib/geckoterminal.js';
import { CHAINS } from '../lib/check.js';

function isDead(p) {
  const price = Number(p.priceUsd || 0);
  const fdv = Number(p.fdv || 0);
  const mc = Number(p.marketCap || 0);
  if (!price || price <= 0) return true;
  if (fdv <= 0 && mc <= 0) return true;
  if (Number(p.changeH24 || 0) <= -99.9) return true; // -100% = mati
  return false;
}

export default async function handler(req, res) {
  const chain = String(req.query.chain || 'solana').toLowerCase();
  const kind = String(req.query.kind || 'trending').toLowerCase();
  const page = Math.min(5, Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1));
  const meta = CHAINS[chain];
  if (!meta) return res.status(400).json({ ok: false, error: 'chain tidak dikenal (solana / bsc / base / elysium / robinhood / hyperevm / ethereum)' });
  if (kind !== 'trending' && kind !== 'new') {
    return res.status(400).json({ ok: false, error: 'kind harus trending atau new' });
  }
  try {
    const pools = kind === 'new' ? await latestPools(meta.gecko, page) : await trendingPools(meta.gecko, page);
    // Dedupe per alamat token (satu koin bisa punya banyak pool) — simpan
    // yang likuiditasnya terbesar — lalu buang koin mati.
    const byAddr = new Map();
    for (const p of pools) {
      const addr = String(p.baseToken?.address || '').toLowerCase();
      if (!addr) continue;
      const prev = byAddr.get(addr);
      if (!prev || Number(p?.liquidity?.usd || 0) > Number(prev?.liquidity?.usd || 0)) byAddr.set(addr, p);
    }
    const clean = [...byAddr.values()].filter((p) => !isDead(p));
    return res.status(200).json({
      ok: true,
      chain,
      kind,
      page,
      pools: clean.map((p) => ({
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
