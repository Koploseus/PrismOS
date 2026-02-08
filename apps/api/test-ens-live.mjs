import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const ENS_NAME = "yieldbot.prismos.eth";
const client = createPublicClient({ chain: mainnet, transport: http("https://eth.llamarpc.com") });

const keys = [
  "prismos.agent.name", "prismos.agent.description", "prismos.agent.wallet",
  "prismos.strategy.id", "prismos.strategy.pool", "prismos.strategy.chain",
  "prismos.strategy.risk", "prismos.strategy.protocol", "prismos.strategy.pair",
  "prismos.strategy.token0", "prismos.strategy.token1",
  "prismos.strategy.token0Decimals", "prismos.strategy.token1Decimals",
  "prismos.fee.collect", "prismos.fee.rebalance", "prismos.fee.compound", "prismos.fee.rangeAdjust",
  "prismos.permissions", "prismos.contracts",
];

const results = await Promise.all(keys.map(k => client.getEnsText({ name: normalize(ENS_NAME), key: k }).catch(() => null)));

console.log("\n=== yieldbot.prismos.eth ENS Records ===\n");
keys.forEach((k, i) => {
  const v = results[i];
  console.log(`${v ? '✅' : '⬜'} ${k} = ${v ? `"${v}"` : '(empty)'}`);
});

const filled = results.filter(Boolean).length;
console.log(`\n📊 ${filled}/${keys.length} keys populated\n`);

// Identify gaps
const gapKeys = keys.filter((_, i) => !results[i]);
if (gapKeys.length > 0) {
  console.log("⚠️ Missing keys that our code needs:");
  gapKeys.forEach(k => console.log(`  - ${k}`));
}
