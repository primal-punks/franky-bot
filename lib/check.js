// Franky Check — logika vonis pemeriksa koin, dipakai api/check.js.
// Vonis murni dari angka on-chain (DexScreener + GoPlus): harga, likuiditas,
// pajak, honeypot, konsentrasi holder, LP. Bukan analisis insider GMGN dan
// bukan penilaian "apakah ceritanya nyata" — itu butuh membaca X/website.

export const CHAINS = {
  solana: { label: 'Solana', goplus: '101', gecko: 'solana', dex: 'solana' },
  bsc: { label: 'BNB Chain', goplus: '56', gecko: 'bsc', dex: 'bsc' },
  base: { label: 'Base', goplus: '8453', gecko: 'base', dex: 'base' },
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
