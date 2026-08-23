import { abi, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import type { EIP1193Provider } from '../types/wallet';

let publicClientInstance: ReturnType<typeof createClient> | null = null;

function createProviderReadClient(provider: EIP1193Provider, accountAddress: string) {
  const client = createWalletBoundClient(provider, accountAddress);
  return {
    ...client,
    readContract: async (args: any) => {
      const encodedCall = abi.calldata.encode(
        abi.calldata.makeCalldataObject(args.functionName, args.args || [], args.kwargs)
      );
      const data = abi.transactions.serialize([encodedCall, Boolean(args.leaderOnly)] as any);
      const raw = await provider.request({
        method: 'gen_call',
        params: [{
          type: 'read',
          to: args.address,
          from: accountAddress,
          data,
          transaction_hash_variant: args.transactionHashVariant || 'latest-nonfinal',
        }],
      });
      const hex = String(raw || '').replace(/^0x/, '');
      if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
        throw new Error('Wallet RPC returned malformed gen_call data');
      }
      return abi.calldata.decode(
        Uint8Array.from(hex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16))
      );
    },
  } as ReturnType<typeof createClient>;
}

export function configurePublicReadProvider(
  provider: EIP1193Provider | null,
  accountAddress: string | null
): void {
  publicClientInstance = provider && accountAddress
    ? createProviderReadClient(provider, accountAddress)
    : null;
}

export function getPublicClient(): ReturnType<typeof createClient> {
  if (!publicClientInstance) {
    publicClientInstance = createClient({
      chain: studionet,
    });
  }
  return publicClientInstance;
}
export function createWalletBoundClient(
  provider: EIP1193Provider,
  accountAddress: string
): ReturnType<typeof createClient> {
  // Bind client strictly to user-selected provider and account
  return createClient({
    chain: studionet,
    account: accountAddress as `0x${string}`,
    provider,
  });
}
