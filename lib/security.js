// Franky Bot — cek keamanan token via GoPlus API (gratis, tanpa key).
// Prinsip: kalau tidak ada data atau ada tanda bahaya, SKIP (fail closed).
// Docs: https://gopluslabs.io/token-security-api

import { CONFIG } from './config.js';

const API = 'https://api.gopluslabs.io/api/v1';

export async function checkToken(goplusChainId, address) {
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

  return { ok: true, buyTax, sellTax, honeypot: false };
}
