import { Context } from 'hono';
import { Address, Hex, encodeFunctionData } from 'viem';
import { generateReceipt } from '../middleware/x402';

interface SettleRequest {
  agentAddress: Address;
  channels?: string[];
}

interface Channel {
  channelId: `0x${string}`;
  userEns: string;
  userAddress: Address;
  amountUsdc: string;
}

const YELLOW_ABI = [{ 
  name: 'batchSettle', 
  type: 'function', 
  inputs: [{ type: 'bytes32[]' }, { type: 'uint256[]' }, { type: 'bytes[]' }], 
  outputs: [], 
  stateMutability: 'nonpayable' 
}] as const;

async function getOpenChannels(_agent: Address, _filter?: string[]): Promise<Channel[]> {
  // TODO: Implement Yellow Network channel query
  return [];
}

export async function buildSettleHandler(c: Context): Promise<Response> {
  try {
    const body = await c.req.json() as SettleRequest;

    if (!body.agentAddress?.startsWith('0x')) {
      return c.json({ success: false, error: 'Invalid agent', code: 'INVALID_AGENT' }, 400);
    }

    const channels = await getOpenChannels(body.agentAddress, body.channels);

    if (!channels.length) {
      return c.json({
        success: true,
        calldata: null,
        channels: [],
        total: '0.00 USDC',
        receipt: generateReceipt(c.get('paymentId'), '/api/build/settle', 0.01, ['no-channels']),
      });
    }

    const total = channels.reduce((s, ch) => s + parseFloat(ch.amountUsdc), 0);
    const YELLOW_CUSTODY = '0x0000000000000000000000000000000000000000' as Address;

    const data = encodeFunctionData({
      abi: YELLOW_ABI,
      functionName: 'batchSettle',
      args: [
        channels.map(ch => ch.channelId),
        channels.map(ch => BigInt(Math.floor(parseFloat(ch.amountUsdc) * 1e6))),
        channels.map(() => '0x' as Hex),
      ],
    });

    return c.json({
      success: true,
      calldata: { to: YELLOW_CUSTODY, data, value: '0' },
      channels: channels.map(ch => ({ user: ch.userEns, id: ch.channelId, amount: `${ch.amountUsdc} USDC` })),
      total: `${total.toFixed(2)} USDC`,
      receipt: generateReceipt(c.get('paymentId'), '/api/build/settle', 0.01, [`settle-${channels.length}`]),
    });

  } catch (error: unknown) {
    console.error('[buildSettle]', error);
    return c.json({ success: false, error: 'Internal error', code: 'INTERNAL_ERROR' }, 500);
  }
}
