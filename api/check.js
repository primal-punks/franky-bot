// Franky Check — endpoint pemeriksa koin (read-only, tanpa login).
// GET /api/check?chain=bsc&address=0x...  atau POST {chain, address}.
// Menggabungkan DexScreener (harga, likuiditas, volume) + GoPlus
// (honeypot, pajak, holder, LP) lalu menghitung vonis di lib/check.js.
// Terbuka seperti "first check needs no account": tidak ada wallet, kunci,
// atau uang yang terlibat — hanya membaca data publik.
import { fetchSecurity } from '../lib/security.js';
import { CHAINS, verdictFor, isEvmAddress, isSolanaAddress } from '../lib/check.js';

export default async function handler(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const chain = String(req.query.chain || body.chain || 'bsc').toLowerCase();
  const address = String(req.query.address || body.address || '').trim();
  const meta = CHAINS[chain];
  if (!meta) return res.status(400).json({ ok: false, error: 'chain tidak dikenal (solana / bsc / base)' });
  if (chain === 'solana' ? !isSolanaAddress(address) : !isEvmAddress(address)) {
    return res.status(400).json({ ok: false, error: 'alamat token tidak valid untuk chain ini' });
  }

  try {
    const dexRes = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!dexRes.ok) throw new Error(`DexScreener HTTP ${dexRes.status}`);
    const dex = await dexRes.json();
    const pairs = (Array.isArray(dex.pairs) ? dex.pairs : []).filter(
      (p) => String(p.chainId || '').toLowerCase() === meta.dex,
    );
    if (!pairs.length) {
      return res.status(404).json({ ok: false, error: 'token tidak ditemukan / belum ada pair di chain ini' });
    }
    pairs.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
    const p = pairs[0];

    let sec = null;
    try {
      sec = await fetchSecurity(meta.goplus, address, [p.pairAddress]);
    } catch (e) {
      sec = null; // GoPlus gagal: vonis tetap jalan dengan peringatan NO_SEC
    }

    const { verdict, flags } = verdictFor(p, sec);
    const createdAt = Number(p.pairCreatedAt || 0);
    return res.status(200).json({
      ok: true,
      chain,
      address,
      checkedAt: new Date().toISOString(),
      token: {
        name: p.baseToken?.name || '',
        symbol: p.baseToken?.symbol || '',
        image: p.info?.imageUrl || '',
      },
      pair: {
        dex: p.dexId || '',
        pairAddress: p.pairAddress || '',
        priceUsd: p.priceUsd || '',
        liquidityUsd: Number(p?.liquidity?.usd || 0),
        fdv: Number(p.fdv || 0),
        marketCap: Number(p.marketCap || 0),
        volumeH1: Number(p?.volume?.h1 || 0),
        buysH1: Number(p?.txns?.h1?.buys || 0),
        sellsH1: Number(p?.txns?.h1?.sells || 0),
        changeH1: Number(p?.priceChange?.h1 ?? 0),
        changeH24: Number(p?.priceChange?.h24 ?? 0),
        createdAt,
        ageMin: createdAt ? Math.max(0, Math.round((Date.now() - createdAt) / 60000)) : null,
      },
      security: sec
        ? { honeypot: sec.honeypot, buyTax: sec.buyTax, sellTax: sec.sellTax, holders: sec.holders || null, risks: sec.risks || null, score: sec.score ?? null }
        : null,
      verdict,
      flags,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
