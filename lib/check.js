// Franky Check — logika vonis pemeriksa koin, dipakai api/check.js.
// Vonis murni dari angka on-chain (DexScreener + GoPlus): harga, likuiditas,
// pajak, honeypot, konsentrasi holder, LP. Bukan analisis insider GMGN dan
// bukan penilaian "apakah ceritanya nyata" — itu butuh membaca X/website.

import { fetchSecurity } from './security.js';

export const CHAINS = {
  solana: { label: 'Solana', goplus: '101', gecko: 'solana', dex: 'solana' },
  bsc: { label: 'BNB Chain', goplus: '56', gecko: 'bsc', dex: 'bsc' },
  base: { label: 'Base', goplus: '8453', gecko: 'base', dex: 'base' },
  // Elysium: harga/likuiditas dari DexScreener + GeckoTerminal jalan, tapi
  // GoPlus TIDAK mendukung chain ini (code 2022) — cek Elysium selalu
  // membawa peringatan NO_SEC (data keamanan tidak tersedia), jadi vonis
  // minimal WASPADA. Jangan pernah menampilkan Elysium sebagai AMAN penuh.
  elysium: { label: 'Elysium', goplus: null, gecko: 'elysium', dex: 'elysium' },
  // Robinhood Chain (Arbitrum Orbit L2, chainId 4663): GoPlus mendukung
  // (code 1), jadi cek Robinhood dapat data keamanan penuh seperti BSC/Base.
  robinhood: { label: 'Robinhood', goplus: '4663', gecko: 'robinhood', dex: 'robinhood' },
  // HyperEVM (chainId 999): GoPlus TIDAK mendukung (code 2022) — sama
  // seperti Elysium, cek HyperEVM selalu membawa peringatan NO_SEC dan
  // vonis minimal WASPADA.
  hyperliquid: { label: 'HyperEVM', goplus: null, gecko: 'hyperevm', dex: 'hyperevm' },
  // Ethereum mainnet (chainId 1): GoPlus mendukung penuh (code 1).
  // Perhatikan: id GeckoTerminal-nya "eth", bukan "ethereum".
  ethereum: { label: 'Ethereum', goplus: '1', gecko: 'eth', dex: 'ethereum' },
};

export function isEvmAddress(a) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(a || '').trim());
}

export function isSolanaAddress(a) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(a || '').trim());
}

// pair: data pair DexScreener yang sudah dipilih (likuiditas terbesar).
// sec: hasil lib/security.js fetchSecurity (atau null bila GoPlus tanpa data).
// Mengembalikan { verdict: 'AMAN'|'WASPADA'|'BERBAHAYA', flags: [{code,label,level}] }.
export function verdictFor(pair, sec) {
  const flags = [];
  const push = (code, label, level) => flags.push({ code, label, level });

  if (!sec) {
    push('NO_SEC', 'Data keamanan tidak tersedia', 'warn');
  } else {
    if (sec.honeypot) push('HONEYPOT', 'HONEYPOT', 'danger');
    if (sec.rugged) push('RUGGED', 'RUG PULL TERDETEKSI', 'danger');
    const tax = Math.max(Number(sec.buyTax || 0), Number(sec.sellTax || 0));
    if (tax > 20) push('TAX_HIGH', `PAJAK ${tax}%`, 'danger');
    else if (tax > 5) push('TAX', `Pajak beli ${sec.buyTax}% / jual ${sec.sellTax}%`, 'warn');
    const h = sec.holders || {};
    const top10 = Number(h.top10Pct || 0);
    const dev = Number(h.ownerPct || 0);
    if (top10 >= 30) push('DUMP_RISK', 'DUMP RISK', 'danger');
    else if (top10 >= 20) push('TOP10', `10 teratas ${top10}%`, 'warn');
    if (dev >= 10) push('DEV', `DEV PEGANG ${dev}%`, 'danger');
    else if (dev >= 5) push('DEV', `Dev pegang ${dev}%`, 'warn');
    if (Number(h.lpBurnPct || 0) === 0 && Number(h.lpLockedPct || 0) === 0) {
      push('LP_OPEN', 'LP BELUM DIAMANKAN', 'warn');
    }
    if (h.mintable) push('MINTABLE', 'BISA DICETAK', 'warn');
    if (h.blacklist) push('BLACKLIST', 'ADA DAFTAR HITAM', 'danger');
  }

  if (pair) {
    const liq = Number(pair?.liquidity?.usd || 0);
    if (liq > 0 && liq < 10000) push('LIQ_LOW', 'Likuiditas tipis', 'warn');
    const h1 = Number(pair?.priceChange?.h1 ?? 0);
    if (h1 <= -50) push('DUMPED', 'Turun >50% dalam 1 jam', 'warn');
  }

  const danger = flags.some((f) => f.level === 'danger');
  const warn = flags.some((f) => f.level === 'warn');
  const verdict = danger ? 'BERBAHAYA' : warn ? 'WASPADA' : 'AMAN';
  return { verdict, flags };
}

// Cek satu koin sampai tuntas (dipakai api/check.js dan perintah /cek di
// Telegram). Melempar Error bila chain/alamat tidak valid, token tidak
// ditemukan, atau DexScreener gagal — pemanggil yang menentukan status HTTP.
export async function checkCoin(chain, address) {
  const meta = CHAINS[chain];
  if (!meta) throw new Error('chain tidak dikenal (solana / bsc / base / elysium / robinhood / hyperevm / ethereum)');
  address = String(address || '').trim();
  if (chain === 'solana' ? !isSolanaAddress(address) : !isEvmAddress(address)) {
    throw new Error('alamat token tidak valid untuk chain ini');
  }
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
    throw new Error('token tidak ditemukan / belum ada pair di chain ini');
  }
  pairs.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
  const p = pairs[0];

  let sec = null;
  try {
    sec = await fetchSecurity(meta.goplus, address, [p.pairAddress]);
  } catch {
    sec = null; // GoPlus/RugCheck gagal: vonis tetap jalan dengan peringatan NO_SEC
  }

  const { verdict, flags } = verdictFor(p, sec);
  const createdAt = Number(p.pairCreatedAt || 0);
  return {
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
  };
}
