// Franky Bot — beli/jual di chain EVM (BNB, Base, HyperEVM) via router DEX V2.
// Key diambil dari env EVM_PRIVATE_KEY. Satu key dipakai untuk semua chain EVM.

import { ethers } from 'ethers';

const ROUTER_ABI = [
  'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) payable returns (uint256[] memory amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)',
  'function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];

function connect(chain) {
  const key = process.env.EVM_PRIVATE_KEY;
  if (!key) throw new Error('EVM_PRIVATE_KEY belum diisi');
  const provider = new ethers.JsonRpcProvider(chain.rpc);
  const signer = new ethers.Wallet(key, provider);
  return { provider, signer };
}

function deadline() {
  return Math.floor(Date.now() / 1000) + 300; // 5 menit
}

function minOut(amountOut, slippageBps) {
  return (amountOut * BigInt(10000 - slippageBps)) / 10000n;
}

// Beli token dengan native coin (BNB / ETH / HYPE).
export async function evmBuy(chain, tokenAddress, nativeAmount, slippageBps) {
  if (!chain.router) throw new Error(`Router ${chain.label} belum diisi (env HYPEREVM_ROUTER)`);
  const { signer } = connect(chain);
  const router = new ethers.Contract(chain.router, ROUTER_ABI, signer);
  const path = [chain.wrappedNative, tokenAddress];
  const amountsOut = await router.getAmountsOut(nativeAmount, path);
  const tx = await router.swapExactETHForTokens(
    minOut(amountsOut[1], slippageBps),
    path,
    await signer.getAddress(),
    deadline(),
    { value: nativeAmount },
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash, amountOut: amountsOut[1].toString() };
}

// Jual seluruh saldo token kembali ke native coin.
export async function evmSell(chain, tokenAddress, slippageBps) {
  if (!chain.router) throw new Error(`Router ${chain.label} belum diisi (env HYPEREVM_ROUTER)`);
  const { signer } = connect(chain);
  const me = await signer.getAddress();
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const balance = await token.balanceOf(me);
  if (balance === 0n) throw new Error('saldo token 0');
  const allowance = await token.allowance(me, chain.router);
  if (allowance < balance) {
    const txA = await token.approve(chain.router, balance);
    await txA.wait();
  }
  const router = new ethers.Contract(chain.router, ROUTER_ABI, signer);
  const path = [tokenAddress, chain.wrappedNative];
  const amountsOut = await router.getAmountsOut(balance, path);
  const tx = await router.swapExactTokensForETH(
    balance,
    minOut(amountsOut[1], slippageBps),
    path,
    me,
    deadline(),
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash, amountOut: amountsOut[1].toString() };
}
