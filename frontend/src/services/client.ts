import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import type { EIP1193Provider } from '../types/wallet';

let publicClientInstance: ReturnType<typeof createClient> | null = null;

export function configurePublicReadProvider(
  provider: EIP1193Provider | null,
  accountAddress: string | null
): void {
  publicClientInstance = provider && accountAddress
    ? createWalletBoundClient(provider, accountAddress)
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
