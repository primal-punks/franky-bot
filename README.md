# Franky Bot 🤖

Bot trading meme coin multi-chain — **Solana, BNB Chain, Base, HyperEVM (Hyperliquid)** —
dibuat untuk di-deploy di Vercel (serverless + cron + dashboard).

## Strategi (default)

Swing token trending: tiap siklus, bot mengecek pair terbaru di DexScreener,
menyaring yang ramai + likuid, mengecek honeypot via GoPlus, beli kecil,
lalu jual otomatis saat take-profit / stop-loss / batas waktu pegang.

- Beli maks **$5 per posisi** (`MAX_BUY_USD`), maks **5 posisi** terbuka
- Take-profit **+50%**, stop-loss **-25%**, max hold **24 jam**
- Batas rugi harian **$20** — kalau tembus, bot berhenti beli hari itu
- Pair harus berumur 5 menit – 24 jam, likuiditas ≥ $10.000,
  volume 1 jam ≥ $1.000, FDV ≤ $5 jt, beli 1 jam ≥ 5 transaksi
- Token honeypot / pajak beli-jual > 10% / mintable / owner pegang > 20% → **SKIP**

## Penting, baca dulu sebelum deploy

1. **Vercel itu serverless.** Bot jalan lewat cron, bukan proses 24/7.
   Paket **Hobby** Vercel hanya boleh cron 1x sehari; cron tiap 5 menit
   (seperti di `vercel.json`) butuh paket **Pro**. Di Hobby, bot ini lebih
   cocok sebagai scanner harian + eksekusi manual dari tombol di dashboard.
   Kalau mau reaksi detik-per-detik (sniper), butuh VPS, bukan Vercel.
2. **Mode kertas dulu.** Default `DRY_RUN=true`: bot hanya mencatat
   "seandainya beli", tidak ada uang yang bergerak. Ubah ke `false`
   hanya kalau kamu sudah paham risikonya.
3. **Robinhood tidak ada.** Tidak ada jaringan meme coin Robinhood.
   Robinhood Chain (L2 Arbitrum) itu untuk saham tokenisasi, bukan meme coin.
   Chain yang didukung bot ini: Solana, BNB, Base, HyperEVM.
4. **Wallet khusus.** Buat wallet baru khusus bot, isi dana kecil saja.
   Jangan pernah pakai wallet utama. Private key hanya di Environment
   Variables Vercel, **jangan pernah tulis di kode atau kirim ke siapa pun.**

## Connect wallet & login Google

Dashboard punya dua hal baru:

- **Tombol Connect MetaMask dan Connect Phantom** — untuk melihat alamat
  dan saldo (BNB, ETH di Base, HYPE, SOL). Tombol ini **hanya baca saldo**,
  tidak meminta tanda tangan apa pun. Trading tetap jalan dari server
  pakai key di Environment Variables. Butuh ekstensi MetaMask / Phantom
  terpasang di browser.
- **Login dengan Google** — mengunci dashboard supaya hanya kamu yang bisa
  membuka dan memencet scan. Login ini **opsional**: kalau env vars di
  bawah tidak diisi, dashboard tetap terbuka seperti sebelumnya.

### Mengaktifkan login Google

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → buat
   project baru (gratis).
2. Menu **APIs & Services → OAuth consent screen** → pilih **External** →
   isi nama aplikasi dan email kamu → simpan.
3. Menu **APIs & Services → Credentials → Create Credentials →
   OAuth client ID** → tipe **Web application**.
4. Di **Authorized JavaScript origins**, tambah:
   `https://<nama-project-kamu>.vercel.app`
   (untuk tes lokal tambah juga `http://localhost:3000`).
   Tidak perlu mengisi Authorized redirect URIs.
5. Salin **Client ID** yang muncul.
6. Di Vercel → Settings → Environment Variables, isi:
   - `GOOGLE_CLIENT_ID` = Client ID tadi
   - `ALLOWED_EMAIL` = email Google kamu
   - `SESSION_SECRET` = string acak panjang (mis. hasil `openssl rand -hex 32`)
7. **Redeploy.** Buka dashboard → login dengan Google → hanya email itu
   yang bisa masuk. Session berlaku 7 hari.

## Deploy ke Vercel

### Cara A — Vercel CLI (paling cepat)

```bash
npm install -g vercel
cd franky-bot
npm install
vercel        # login, pilih project, deploy preview
vercel env add DRY_RUN            # isi true
vercel env add MAX_BUY_USD        # isi 5
vercel env add CRON_SECRET        # isi string acak, mis. franky-123-rahasia
# ...ulangi untuk env var lain dari .env.example (yang kosong boleh dilewati)
vercel --prod
```

### Cara B — GitHub + import

1. Buat repo GitHub baru, push folder ini (jangan ikut `.env` / `node_modules`).
2. Di vercel.com → Add New → Project → import repo itu.
3. Isi Environment Variables di Settings → Environment Variables.
4. Deploy. Cron aktif otomatis dari `vercel.json`.

## Environment variables

| Nama | Wajib? | Keterangan |
| --- | --- | --- |
| `DRY_RUN` | - | `true` = mode kertas (default). `false` = uang asli. |
| `MAX_BUY_USD` | - | Besar beli per posisi (default 5). |
| `MAX_POSITIONS` | - | Maks posisi terbuka (default 5). |
| `TAKE_PROFIT_PCT` | - | Jual saat untung sekian % (default 50). |
| `STOP_LOSS_PCT` | - | Jual saat rugi sekian % (default 25). |
| `MAX_HOLD_HOURS` | - | Jual paksa setelah sekian jam (default 24). |
| `DAILY_LOSS_LIMIT_USD` | - | Berhenti beli bila rugi harian tembus ini (default 20). |
| `MIN_LIQUIDITY_USD` | - | Likuiditas minimum pair (default 10000). |
| `MIN_VOLUME_H1_USD` | - | Volume 1 jam minimum (default 1000). |
| `MAX_FDV_USD` | - | FDV maksimum (default 5000000). |
| `MAX_TAX_PCT` | - | Pajak beli/jual maksimum (default 10). |
| `SLIPPAGE_BPS` | - | Slippage, 300 = 3% (default 300). |
| `ENABLED_CHAINS` | - | `solana,bsc,base,hyperliquid` (default semua). |
| `CRON_SECRET` | disarankan | Rahasia pemanggil `/api/scan`. |
| `SOLANA_RPC` / `BSC_RPC` / `BASE_RPC` / `HYPEREVM_RPC` | - | RPC tiap chain (ada default publik). |
| `HYPEREVM_ROUTER` | bila live HyperEVM | Alamat router DEX HyperEVM. |
| `EVM_PRIVATE_KEY` | bila live EVM | Key wallet BNB/Base/HyperEVM. |
| `SOLANA_PRIVATE_KEY` | bila live Solana | Key wallet Solana (base58). |
| `GOOGLE_CLIENT_ID` | bila login Google | Client ID OAuth Web dari Google Cloud Console. |
| `ALLOWED_EMAIL` | bila login Google | Email Google yang boleh login dashboard. |
| `SESSION_SECRET` | bila login Google | String acak panjang untuk session. |

## Cara pakai

- Buka URL hasil deploy: dashboard menampilkan mode (PAPER/LIVE), posisi
  terbuka, riwayat trade, dan log. Ada tombol **Scan sekarang** (isi
  CRON_SECRET bila kamu mengisinya), tombol **Connect MetaMask / Phantom**
  (lihat saldo saja), dan login Google (bila dikonfigurasi).
- Endpoint cron: `GET /api/scan?source=cron` (tambah `&secret=...` bila
  `CRON_SECRET` diisi). Endpoint status: `GET /api/positions`.
- Tes lokal sebelum deploy: salin `.env.example` ke `.env.local`,
  lalu `npm install && npm run scan` (satu siklus, tetap mode kertas
  bila `DRY_RUN=true`).

## Catatan teknis

- State (posisi, trade, log) disimpan di `/tmp/franky-state.json`.
  Di Vercel, `/tmp` bisa hilang saat fungsi di-recycle — untuk pemakaian
  serius, ganti `lib/store.js` ke Vercel KV / Upstash Redis.
- Harga dan pair dari DexScreener API (gratis, tanpa key).
  Pool terbaru untuk discovery dari GeckoTerminal API (gratis, tanpa key).
  Keamanan token dari GoPlus API (gratis, tanpa key). HyperEVM belum
  didukung GoPlus, jadi pair HyperEVM otomatis di-skip di pemeriksaan
  keamanan sampai ada sumber lain.
- Swap EVM lewat router V2 (PancakeSwap di BNB, Uniswap V2 di Base).
  Swap Solana lewat Jupiter Aggregator v6.
- GoPlus kadang tidak punya data untuk token yang sangat baru —
  token seperti itu di-skip (fail closed).

## Risiko

Meme coin sangat volatil, mayoritas berakhir nol. Bot ini alat bantu,
bukan jaminan cuan. Jangan taruh uang yang tidak siap hilang, dan jangan
pernah menaruh seluruh dana di satu wallet bot.

## Struktur file

```
franky-bot/
├── api/
│   ├── scan.js          # cron + tombol scan manual (satu siklus penuh)
│   ├── positions.js     # status bot untuk dashboard
│   ├── auth.js          # tukar Google ID token jadi session bot
│   └── config.js        # konfigurasi publik dashboard (client ID Google)
├── lib/
│   ├── config.js        # semua setting dari env vars
│   ├── auth.js          # session HMAC + cek akses API
│   ├── store.js         # simpan posisi/trade/log (file /tmp)
│   ├── dexscreener.js   # harga token saat ini
│   ├── geckoterminal.js # pool terbaru tiap chain (discovery)
│   ├── security.js      # cek honeypot/pajak via GoPlus
│   ├── strategy.js      # filter + skor pair
│   ├── evm.js           # beli/jual BNB, Base, HyperEVM
│   ├── solana.js        # beli/jual Solana via Jupiter
│   └── engine.js        # otak bot: cek TP/SL lalu scan beli
├── public/
│   └── index.html       # dashboard
├── scripts/
│   └── scan-local.js    # tes satu siklus dari terminal
├── package.json
├── vercel.json          # cron tiap 5 menit (butuh Pro)
└── .env.example
```
