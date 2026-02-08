"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { mainnet, arbitrum, base, sepolia, type Chain } from "wagmi/chains";

export const SUPPORTED_CHAINS = [mainnet, arbitrum, base, sepolia] as const;

export const DEFAULT_CHAIN = mainnet;

export function getChainById(chainId: number): Chain | undefined {
  return SUPPORTED_CHAINS.find((chain) => chain.id === chainId);
}

export const config = getDefaultConfig({
  appName: "PrismOS",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "demo",
  chains: [mainnet, arbitrum, base, sepolia],
  ssr: true,
  transports: {
    [mainnet.id]: http("https://ethereum-rpc.publicnode.com"),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
    [base.id]: http("https://mainnet.base.org"),
  },
});
