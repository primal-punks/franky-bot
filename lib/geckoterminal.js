// Franky Bot — pool terbaru dari GeckoTerminal API (gratis, tanpa key).
// Dipakai untuk discovery pair baru. Hasil dinormalisasi ke bentuk yang
// dipakai lib/strategy.js (bentuk mirip DexScreener).
// Docs: https://www.geckoterminal.com/api/docs

const API = 'https://api.geckoterminal.com/api/v2';

function tokenAddressFromId(id) {
  const i = String(id || '').indexOf('_');
  return i >= 0 ? String(id).slice(i + 1) : String(id || '');
}

function normalize(pool) {
  const a = pool?.attributes || {};
  const baseId = pool?.relationships?.base_token?.data?.id || '';
  const name = String(a.name || '');
  const symbol = name.split(' / ')[0].trim() || '???';
  return {
    pairAddress: a.address,
    baseToken: { address: tokenAddressFromId(baseId), symbol },
    priceUsd: a.base_token_price_usd,
    fdv: Number(a.fdv_usd || 0),
    liquidity: { usd: Number(a.reserve_in_usd || 0) },
    volume: { h1: Number(a.volume_usd?.h1 || 0) },
    txns: {
      h1: {
        buys: a.transactions?.h1?.buys || 0,
        sells: a.transactions?.h1?.sells || 0,
      },
    },
    pairCreatedAt: a.pool_created_at ? new Date(a.pool_created_at).getTime() : 0,
  };
}

// Pool terbaru di satu network (halaman 1 = 20 pool).
export async function latestPools(network) {
  const res = await fetch(`${API}/networks/${network}/new_pools?page=1`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GeckoTerminal ${network}: HTTP ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data.data) ? data.data : []).map(normalize);
}
