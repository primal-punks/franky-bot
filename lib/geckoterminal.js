// Franky Bot — pool terbaru dari GeckoTerminal API (gratis, tanpa key).
// Dipakai untuk discovery pair baru. Hasil dinormalisasi ke bentuk yang
// dipakai lib/strategy.js (bentuk mirip DexScreener).
// Docs: https://www.geckoterminal.com/api/docs

const API = 'https://api.geckoterminal.com/api/v2';

function tokenAddressFromId(id) {
  const i = String(id || '').indexOf('_');
  return i >= 0 ? String(id).slice(i + 1) : String(id || '');
}

function normalize(pool, tokensById) {
  const a = pool?.attributes || {};
  const baseId = pool?.relationships?.base_token?.data?.id || '';
  const name = String(a.name || '');
  const symbol = name.split(' / ')[0].trim() || '???';
  const token = tokensById.get(baseId) || {};
  return {
    pairAddress: a.address,
    baseToken: { address: tokenAddressFromId(baseId), symbol },
    imageUrl: token.imageUrl || '',
    priceUsd: a.base_token_price_usd,
    fdv: Number(a.fdv_usd || 0),
    marketCap: Number(a.market_cap_usd || 0),
    liquidity: { usd: Number(a.reserve_in_usd || 0) },
    volume: { h1: Number(a.volume_usd?.h1 || 0) },
    txns: {
      h1: {
        buys: a.transactions?.h1?.buys || 0,
        sells: a.transactions?.h1?.sells || 0,
      },
    },
    pairCreatedAt: a.pool_created_at ? new Date(a.pool_created_at).getTime() : 0,
    name,
    changeM5: Number(a.price_change_percentage?.m5 || 0),
    changeH1: Number(a.price_change_percentage?.h1 || 0),
    changeH6: Number(a.price_change_percentage?.h6 || 0),
    changeH24: Number(a.price_change_percentage?.h24 || 0),
  };
}

// Foto koin datang dari array `included` di respons GeckoTerminal
// (token resource: id "solana_<mint>" / "bsc_0x…", attributes.image_url).
function tokensById(data) {
  const map = new Map();
  for (const t of Array.isArray(data?.included) ? data.included : []) {
    if (t?.type === 'token' && t.id) {
      map.set(t.id, { imageUrl: t?.attributes?.image_url || '' });
    }
  }
  return map;
}

// Pool yang lagi tren di satu network (20 pool per halaman).
// Retry sama seperti latestPools.
export async function trendingPools(network, page = 1) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${API}/networks/${network}/trending_pools?page=${page}&include=base_token`, {
      headers: { Accept: 'application/json', 'User-Agent': 'FrankyBot/1.0' },
    });
    if (res.ok) {
      const data = await res.json();
      const tokens = tokensById(data);
      return (Array.isArray(data.data) ? data.data : []).map((p) => normalize(p, tokens));
    }
    lastErr = new Error(`GeckoTerminal ${network}: HTTP ${res.status}`);
    if (res.status !== 429 && res.status < 500) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  throw lastErr;
}
// Retry saat 429/5xx: GeckoTerminal gratis membatasi ~30 req/menit per IP,
// dan IP keluar Vercel dipakai bersama banyak pengguna, jadi 429 sering
// muncul saat scan 4 chain berurutan. Jeda antar percobaan: 4s, 8s.
export async function latestPools(network, page = 1) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${API}/networks/${network}/new_pools?page=${page}&include=base_token`, {
      headers: { Accept: 'application/json', 'User-Agent': 'FrankyBot/1.0' },
    });
    if (res.ok) {
      const data = await res.json();
      const tokens = tokensById(data);
      return (Array.isArray(data.data) ? data.data : []).map((p) => normalize(p, tokens));
    }
    lastErr = new Error(`GeckoTerminal ${network}: HTTP ${res.status}`);
    if (res.status !== 429 && res.status < 500) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  throw lastErr;
}
