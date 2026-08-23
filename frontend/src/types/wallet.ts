export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}
export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

export type SupportedWalletRDNS = 'io.metamask' | 'com.okex.wallet' | 'io.rabby';

export interface WalletOption {
  id: string;
  name: string;
  icon: string;
  rdns: SupportedWalletRDNS;
  provider: EIP1193Provider;
  isFallback?: boolean;
}
