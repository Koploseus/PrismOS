/**
 * GET /api/position/:address
 *
 * Wallet balances + LP positions from Base chain.
 */

import { Context } from "hono";
import { formatUnits, isAddress } from "viem";
import { generateReceipt } from "../middleware/x402";
import {
  createBaseClient,
  fetchBalance,
  fetchNFTBalance,
  fetchBTCPrice,
  TOKENS,
  POSITION_MANAGER,
} from "../lib/positionChecker";
import * as fs from "fs";
import * as path from "path";

// Read subscription data to get known position token IDs
function getSubscriptionData(
  address: string
): { positionTokenId?: string; positionTxHash?: string } | null {
  try {
    const subPath = path.resolve(__dirname, "../../../../data/subscriptions.json");
    if (fs.existsSync(subPath)) {
      const data = JSON.parse(fs.readFileSync(subPath, "utf-8"));
      const key = address.toLowerCase();
      return data.subscriptions?.[key] || null;
    }
  } catch {
    // Ignore
  }
  return null;
}

function getRecommendations(positionCount: number, walletValue: number): string[] {
  const recs: string[] = [];
  if (positionCount === 0 && walletValue > 1) {
    recs.push("Create LP position to start earning fees");
  }
  if (positionCount > 0 && walletValue > 1) {
    recs.push("Add remaining funds to LP position");
  }
  if (positionCount > 0) {
    recs.push("Position actively earning fees");
  }
  if (walletValue < 1 && positionCount === 0) {
    recs.push("Deposit funds to get started");
  }
  return recs.length ? recs : ["Account ready"];
}

export async function positionHandler(c: Context): Promise<Response> {
  try {
    const address = c.req.param("address");

    if (!address || !isAddress(address)) {
      return c.json({ success: false, error: "Invalid address", code: "INVALID_ADDRESS" }, 400);
    }

    const client = createBaseClient();

    // Fetch all balances in parallel
    const [wbtc, cbbtc, usdc, lpNftCount, btcPrice] = await Promise.all([
      fetchBalance(client, TOKENS.WBTC.address, address),
      fetchBalance(client, TOKENS.CBBTC.address, address),
      fetchBalance(client, TOKENS.USDC.address, address),
      fetchNFTBalance(client, address),
      fetchBTCPrice(),
    ]);

    // Calculate wallet balances
    const wbtcAmt = Number(formatUnits(wbtc, 8));
    const cbbtcAmt = Number(formatUnits(cbbtc, 8));
    const usdcAmt = Number(formatUnits(usdc, 6));

    const wbtcUsd = wbtcAmt * btcPrice;
    const cbbtcUsd = cbbtcAmt * btcPrice;
    const walletValueUsd = wbtcUsd + cbbtcUsd + usdcAmt;

    // Get subscription data for known positions
    const subData = getSubscriptionData(address);
    const positionCount = Number(lpNftCount);

    // Calculate ratios for wallet
    const totalBtcWallet = wbtcAmt + cbbtcAmt;
    const walletRatio = totalBtcWallet > 0 ? wbtcAmt / totalBtcWallet : 0.5;

    return c.json({
      success: true,
      address,
      chainId: 8453,

      // Wallet balances (tokens not in LP)
      wallet: {
        wbtc: { raw: wbtc.toString(), formatted: wbtcAmt.toFixed(8), usd: wbtcUsd.toFixed(2) },
        cbbtc: { raw: cbbtc.toString(), formatted: cbbtcAmt.toFixed(8), usd: cbbtcUsd.toFixed(2) },
        usdc: { raw: usdc.toString(), formatted: usdcAmt.toFixed(6), usd: usdcAmt.toFixed(2) },
        totalValueUsd: walletValueUsd.toFixed(2),
      },

      // LP Positions (count only, value requires on-chain liquidity read)
      lpPositions: {
        count: positionCount,
        positionManager: POSITION_MANAGER,
        tokenIds: subData?.positionTokenId ? [subData.positionTokenId] : [],
        pool: "WBTC/cbBTC",
        protocol: "Uniswap V4",
      },

      // Summary
      summary: {
        walletValueUsd: walletValueUsd.toFixed(2),
        positionCount,
        wbtcRatio: `${(walletRatio * 100).toFixed(1)}%`,
        hasActivePosition: positionCount > 0,
      },

      // Market data
      market: {
        btcPrice: btcPrice.toFixed(0),
        timestamp: Date.now(),
      },

      // Recommendations
      recommendations: getRecommendations(positionCount, walletValueUsd),

      // Payment receipt
      receipt: generateReceipt(c.get("paymentId"), "/api/position", 0.005, [
        "balances",
        "lpPositions",
        "analytics",
      ]),
    });
  } catch (error: unknown) {
    console.error("[position]", error);
    return c.json({ success: false, error: "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
}
