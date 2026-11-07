// Franky Bot — beli/jual di Solana via Jupiter Aggregator v6.
// Key diambil dari env SOLANA_PRIVATE_KEY (format base58, export dari Phantom/Solflare).

import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const WSOL = 'So11111111111111111111111111111111111111112';

function keypair() {
  const raw = process.env.SOLANA_PRIVATE_KEY;
  if (!raw) throw new Error('SOLANA_PRIVATE_KEY belum diisi');
  return Keypair.fromSecretKey(bs58.decode(raw.trim()));
}

function connection() {
  return new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
}

export async function solPriceUsd() {
  try {
    const r = await fetch(`https://api.jup.ag/price/v2?ids=${WSOL}`);
    const j = await r.json();
    return Number(j?.data?.[WSOL]?.price || 0);
  } catch {
    return 0;
  }
}

async function jupiterSwap(inputMint, outputMint, amountRaw, slippageBps) {
  const kp = keypair();
  const conn = connection();
  const q = await fetch(
    `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${slippageBps}`,
  ).then((r) => r.json());
  if (!q || q.error || !q.outAmount) {
    throw new Error(`Jupiter quote gagal: ${q?.error || 'tanpa outAmount'}`);
  }
  const s = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: q,
      userPublicKey: kp.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  }).then((r) => r.json());
  if (!s.swapTransaction) throw new Error('Jupiter swap gagal dibuat');
  const tx = VersionedTransaction.deserialize(Buffer.from(s.swapTransaction, 'base64'));
  tx.sign([kp]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(sig, 'confirmed');
  return { signature: sig, outAmount: q.outAmount };
}

// Beli token dengan SOL senilai usdAmount.
export async function solanaBuy(mint, usdAmount, slippageBps) {
  const price = await solPriceUsd();
  if (!price) throw new Error('harga SOL tidak didapat');
  const lamports = Math.floor((usdAmount / price) * 1e9);
  return jupiterSwap(WSOL, mint, lamports, slippageBps);
}

// Jual seluruh saldo token kembali ke SOL.
export async function solanaSell(mint, slippageBps) {
  const kp = keypair();
  const conn = connection();
  const accs = await conn.getParsedTokenAccountsByOwner(kp.publicKey, {
    mint: new PublicKey(mint),
  });
  const info = accs.value?.[0]?.account?.data?.parsed?.info;
  const raw = info?.tokenAmount?.amount;
  if (!raw || raw === '0') throw new Error('saldo token 0');
  return jupiterSwap(mint, WSOL, raw, slippageBps);
}
