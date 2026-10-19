import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8547;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;
const KEY1 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY2 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

spawn("anvil", ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"], {
  detached: true,
  stdio: "ignore",
}).unref();

const account1 = privateKeyToAccount(KEY1);
const account2 = privateKeyToAccount(KEY2);
const pub = createPublicClient({ chain: local, transport: http() });
const wallet = createWalletClient({ account: account1, chain: local, transport: http() });

for (let i = 0; ; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const artifact = JSON.parse(
  readFileSync(new URL("../contracts/out/Drip.sol/Drip.json", import.meta.url), "utf8"),
);

await wallet.sendTransaction({ to: account1.address, value: 0n });
await wallet.sendTransaction({ to: account1.address, value: 0n });

const deployHash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
});
const deployed = await pub.waitForTransactionReceipt({ hash: deployHash });
const address = deployed.contractAddress;

const stopTime = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
const openHash = await wallet.writeContract({
  address,
  abi: artifact.abi,
  functionName: "open",
  args: [account2.address, stopTime],
  value: parseEther("1.0"),
});
await pub.waitForTransactionReceipt({ hash: openHash });

writeFileSync(
  new URL("../.env.local", import.meta.url),
  [
    "# Written by scripts/local-stack.mjs. Not the testnet or mainnet config.",
    "NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet",
    `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
    `NEXT_PUBLIC_CONTRACT_968=${address}`,
    `NEXT_PUBLIC_DEPLOY_BLOCK_968=${deployed.blockNumber - 1n}`,
    "",
  ].join("\n"),
);

console.log(`chain       anvil ${CHAIN_ID} on ${RPC}`);
console.log(`contract    ${address}  (block ${deployed.blockNumber})`);
console.log(`stream #1   1.0 BOT streaming to ${account2.address}`);
console.log("\n.env.local written. Start the app with: npm run dev");
