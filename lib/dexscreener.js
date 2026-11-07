// Franky Bot — data pair & harga dari DexScreener API (gratis, tanpa key).
// Docs: https://dexscreener.com/api

const API = 'https://api.dexscreener.com';

// Pair terbaru di satu chain (diurutkan DexScreener berdasarkan waktu dibuat).
export async function latestPairs(chainId) {
  const res = await fetch(`${API}/latest/dex/pairs/${chainId}`);
  if (!res.ok) throw new Error(`DexScreener ${chainId}: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.pairs) ? data.pairs : [];
}

// Harga USD token saat ini (ambil pair pertama yang punya harga).
export async function tokenPriceUsd(chainId, tokenAddress) {
  const res = await fetch(`${API}/latest/dex/tokens/${tokenAddress}`);
  if (!res.ok) return null;
  const data = await res.json();
  const pairs = Array.isArray(data.pairs) ? data.pairs : [];
  const pair =
    pairs.find((p) => p.chainId === chainId && Number(p.priceUsd) > 0) ||
    pairs.find((p) => Number(p.priceUsd) > 0);
  return pair ? Number(pair.priceUsd) : null;
}
