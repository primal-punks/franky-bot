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
  // Kunci hasil GoPlus: alamat EVM dalam huruf kecil, alamat Solana apa adanya
  // (base58, case-sensitive) — jadi coba keduanya.
  const info = data?.result?.[address] || data?.result?.[address.toLowerCase()];
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

// Data keamanan mentah untuk pemeriksa koin (Franky Check): tanpa gate
// trading — semua temuan dikembalikan apa adanya supaya vonis bisa menilai
// sendiri (mintable, pajak tinggi, blacklist, owner besar justru jadi label
// di hasil cek, bukan alasan menghentikan pengecekan).
// GoPlus hanya mendukung chain EVM: untuk Solana (101) dipakai RugCheck,
// karena GoPlus mengembalikan code 2022 "main chain is not supported".
export async function fetchSecurity(goplusChainId, address, excludeAddresses) {
  if (String(goplusChainId) === '101') return fetchSecuritySolana(address);
  if (!goplusChainId) return null;
  const url = `${API}/token_security/${goplusChainId}?contract_addresses=${address}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const info = data?.result?.[address] || data?.result?.[address.toLowerCase()];
  if (!info) return null;
  return {
    honeypot: info.is_honeypot === '1',
    buyTax: Number(info.buy_tax || 0),
    sellTax: Number(info.sell_tax || 0),
    holders: holderStats(info, excludeAddresses),
  };
}

async function fetchSecuritySolana(mint) {
  const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`);
  if (!res.ok) return null;
  const d = await res.json();
  if (!d || d.mint !== mint) return null;
  const top = (d.topHolders || []).slice(0, 10);
  const top10Pct = top.reduce((s, h) => s + Number(h.pct || 0), 0);
  const creatorTop = (d.topHolders || []).find((h) => h.address === d.creator);
  let lpLockedPct = 0;
  for (const m of d.markets || []) {
    lpLockedPct = Math.max(lpLockedPct, Number(m?.lp?.lpLockedPct || 0));
  }
  return {
    honeypot: d.rugged === true,
    rugged: d.rugged === true,
    buyTax: 0,
    sellTax: 0,
    holders: {
      top10Pct: +top10Pct.toFixed(1),
      holderCount: Number(d.totalHolders || 0),
      ownerPct: creatorTop ? +Number(creatorTop.pct || 0).toFixed(1) : 0,
      lpBurnPct: 0,
      lpLockedPct: +lpLockedPct.toFixed(1),
      mintable: d.mintAuthority != null,
      blacklist: d.freezeAuthority != null,
    },
    risks: (d.risks || []).map((r) => r.name || String(r)),
    score: d.score_normalised ?? null,
  };
}
