// Franky Bot — cek keamanan token via GoPlus API (gratis, tanpa key).
// Prinsip: kalau tidak ada data atau ada tanda bahaya, SKIP (fail closed).
// Docs: https://gopluslabs.io/token-security-api

import { CONFIG } from './config.js';

const API = 'https://api.gopluslabs.io/api/v1';

// GoPlus mengembalikan `percent` sebagai fraksi 0-1 (mis. 0.1166 = 11,66%),
// bukan satuan persen. Normalisasi: bila nilai mentah > 1, anggap sudah persen.
function toPct(v) {
  const n = Number(v || 0);
  if (!isFinite(n)) return 0;
  return n > 1 ? n : n * 100;
}

const BURN_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
]);

// Statistik holder dari data GoPlus. Alamat pair (pool likuiditas) dan alamat
// burn dikeluarkan dari hitungan 10 teratas, karena pool/burn bukan risiko dump.
function holderStats(info, excludeAddresses) {
  const excluded = new Set((excludeAddresses || []).map((a) => String(a).toLowerCase()));
  const holders = (info.holders || []).filter((h) => {
    const addr = String(h.address || '').toLowerCase();
    return !excluded.has(addr) && !BURN_ADDRESSES.has(addr);
  });
  const top10Pct = holders.slice(0, 10).reduce((s, h) => s + toPct(h.percent), 0);
  let lpBurnPct = 0;
  let lpLockedPct = 0;
  for (const x of info.lp_holders || []) {
    const addr = String(x.address || '').toLowerCase();
    const pct = toPct(x.percent);
    if (BURN_ADDRESSES.has(addr)) lpBurnPct += pct;
    else if (String(x.is_locked) === '1') lpLockedPct += pct;
  }
  return {
    top10Pct: +top10Pct.toFixed(1),
    holderCount: Number(info.holder_count || 0),
    ownerPct: +toPct(info.owner_percent).toFixed(1),
    lpBurnPct: +lpBurnPct.toFixed(1),
    lpLockedPct: +lpLockedPct.toFixed(1),
    mintable: info.is_mintable === '1',
    blacklist: info.is_blacklisted === '1',
  };
}

export async function checkToken(goplusChainId, address, excludeAddresses) {
  if (!goplusChainId) return { ok: false, reason: 'goplus-tidak-dukung-chain' };
  const url = `${API}/token_security/${goplusChainId}?contract_addresses=${address}`;
  const res = await fetch(url);
  if (!res.ok) return { ok: false, reason: `goplus-http-${res.status}` };
  const data = await res.json();
  const info = data?.result?.[address.toLowerCase()];
  if (!info) return { ok: false, reason: 'goplus-tidak-ada-data' };

  if (info.is_honeypot === '1') return { ok: false, reason: 'honeypot' };
  if (info.is_proxy === '1' && info.is_mintable === '1') {
    return { ok: false, reason: 'proxy-dan-mintable' };
  }
  const buyTax = Number(info.buy_tax || 0);
  const sellTax = Number(info.sell_tax || 0);
  if (buyTax > CONFIG.maxTaxPct || sellTax > CONFIG.maxTaxPct) {
    return { ok: false, reason: `pajak-tinggi buy ${buyTax}% sell ${sellTax}%` };
  }
  if (info.is_mintable === '1') return { ok: false, reason: 'mintable' };
  if (info.is_blacklisted === '1') return { ok: false, reason: 'blacklist' };
  const ownerPct = Number(info.owner_percent || 0);
  if (ownerPct > 20) return { ok: false, reason: `owner-pegang-${ownerPct}%` };

  return { ok: true, buyTax, sellTax, honeypot: false, holders: holderStats(info, excludeAddresses) };
}
