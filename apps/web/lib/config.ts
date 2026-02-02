"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, arbitrum, base, sepolia } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "PrismOS",
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "demo",
  chains: [mainnet, arbitrum, base, sepolia],
  ssr: true,
});
