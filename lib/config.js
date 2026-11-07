// Franky Bot — konfigurasi dari environment variables.
// JANGAN taruh private key di file ini. Semua rahasia lewat env vars Vercel.

export const CONFIG = {
  // Default TRUE = mode kertas, tidak ada uang asli yang bergerak.
  dryRun: process.env.DRY_RUN !== 'false',
  maxBuyUsd: Number(process.env.MAX_BUY_USD || 5),
  maxPositions: Number(process.env.MAX_POSITIONS || 5),
  takeProfitPct: Number(process.env.TAKE_PROFIT_PCT || 50),
  stopLossPct: Number(process.env.STOP_LOSS_PCT || 25),
  maxHoldHours: Number(process.env.MAX_HOLD_HOURS || 24),
  minLiquidityUsd: Number(process.env.MIN_LIQUIDITY_USD || 10000),
  minVolumeH1Usd: Number(process.env.MIN_VOLUME_H1_USD || 1000),
  maxFdvUsd: Number(process.env.MAX_FDV_USD || 5000000),
  maxTaxPct: Number(process.env.MAX_TAX_PCT || 10),
  slippageBps: Number(process.env.SLIPPAGE_BPS || 300), // 300 = 3%
  dailyLossLimitUsd: Number(process.env.DAILY_LOSS_LIMIT_USD || 20),
  enabledChains: (process.env.ENABLED_CHAINS || 'solana,bsc,base,hyperliquid')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  cronSecret: process.env.CRON_SECRET || '',
};

export const CHAINS = {
  solana: {
    id: 'solana',
    label: 'Solana',
    dexscreener: 'solana',
    gecko: 'solana',
    goplus: '101',
    rpc: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
    native: 'SOL',
    nativeMint: 'So11111111111111111111111111111111111111112',
  },
  bsc: {
    id: 'bsc',
    label: 'BNB Chain',
    dexscreener: 'bsc',
    gecko: 'bsc',
    goplus: '56',
    rpc: process.env.BSC_RPC || 'https://bsc-dataseed.bnbchain.org',
    router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap V2
    wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    chainId: 56,
    native: 'BNB',
  },
  base: {
    id: 'base',
    label: 'Base',
    dexscreener: 'base',
    gecko: 'base',
    goplus: '8453',
    rpc: process.env.BASE_RPC || 'https://mainnet.base.org',
    router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', // Uniswap V2
    wrappedNative: '0x4200000000000000000000000000000000000006', // WETH
    chainId: 8453,
    native: 'ETH',
  },
  hyperliquid: {
    id: 'hyperliquid',
    label: 'HyperEVM',
    dexscreener: 'hyperevm',
    gecko: 'hyperevm',
    goplus: null, // GoPlus belum mendukung HyperEVM — pair HyperEVM di-skip di cek keamanan
    rpc: process.env.HYPEREVM_RPC || 'https://rpc.hyperliquid.xyz/evm',
    router: process.env.HYPEREVM_ROUTER || '', // isi router DEX HyperEVM bila mau live
    wrappedNative: '0x5555555555555555555555555555555555555555', // WHYPE
    chainId: 999,
    native: 'HYPE',
  },
};
