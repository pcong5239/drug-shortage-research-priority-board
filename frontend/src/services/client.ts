import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import type { EIP1193Provider } from '../types/wallet';

let publicClientInstance: ReturnType<typeof createClient> | null = null;

const appChain = typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app')
  ? {
      ...studionet,
      rpcUrls: {
        ...studionet.rpcUrls,
        default: { http: [`${window.location.origin}/api/genlayer`] },
      },
    }
  : studionet;

export function getPublicClient(): ReturnType<typeof createClient> {
  if (!publicClientInstance) {
    publicClientInstance = createClient({
      chain: appChain,
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
    chain: appChain,
    account: accountAddress as `0x${string}`,
    provider,
  });
}
