import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type {
  EIP6963ProviderDetail,
  EIP1193Provider,
  WalletOption,
  SupportedWalletRDNS,
} from '../types/wallet';
import {
  STUDIONET_CHAIN_ID_HEX,
  STUDIONET_CHAIN_ID_DEC,
  STUDIONET_CHAIN_CONFIG,
} from '../services/chains';

export interface WalletContextValue {
  isModalOpen: boolean;
  isWalletModalOpen: boolean;
  openChooser: () => void;
  openWalletModal: () => void;
  closeChooser: () => void;
  closeWalletModal: () => void;
  options: WalletOption[];
  isConnecting: boolean;
  connectedAccount: string | null;
  connectedProvider: EIP1193Provider | null;
  connectedWalletName: string | null;
  chainId: string | null;
  isCorrectChain: boolean;
  connectionError: string | null;
  connectWallet: (option: WalletOption) => Promise<boolean>;
  disconnect: () => void;
  switchChain: () => Promise<boolean>;
}
const WalletContext = createContext<WalletContextValue | null>(null);

export const ALLOWLISTED_RDNS: Record<string, { name: string; rdns: SupportedWalletRDNS }> = {
  'io.metamask': { name: 'MetaMask', rdns: 'io.metamask' },
  'io.metamask.mobile': { name: 'MetaMask', rdns: 'io.metamask' },
  'com.okex.wallet': { name: 'OKX Wallet', rdns: 'com.okex.wallet' },
  'com.okx.wallet': { name: 'OKX Wallet', rdns: 'com.okex.wallet' },
  'io.rabby': { name: 'Rabby', rdns: 'io.rabby' },
};

export function classifyLegacyProvider(eth: unknown): { name: string; rdns: SupportedWalletRDNS } | null {
  if (!eth || typeof eth !== 'object') return null;
  const p = eth as Record<string, unknown>;

  if (p.isRabby === true) {
    return { name: 'Rabby', rdns: 'io.rabby' };
  }
  if (p.isOkxWallet === true || p.isOKExWallet === true) {
    return { name: 'OKX Wallet', rdns: 'com.okex.wallet' };
  }
  if (p.isMetaMask === true && !p.isRabby && !p.isOkxWallet && !p.isOKExWallet && !p.isBraveWallet && !p.isCoinbaseWallet) {
    return { name: 'MetaMask', rdns: 'io.metamask' };
  }
  return null;
}

interface AttachedListeners {
  provider: EIP1193Provider;
  accountsHandler: (...args: unknown[]) => void;
  chainHandler: (...args: unknown[]) => void;
}

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [announcedProviders, setAnnouncedProviders] = useState<Map<string, EIP6963ProviderDetail>>(new Map());
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const [connectedProvider, setConnectedProvider] = useState<EIP1193Provider | null>(null);
  const [connectedWalletName, setConnectedWalletName] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);

  const activeProviderRef = useRef<EIP1193Provider | null>(null);
  const attachedListenersRef = useRef<AttachedListeners | null>(null);

  const removeAttachedListeners = useCallback(() => {
    if (attachedListenersRef.current) {
      const { provider, accountsHandler, chainHandler } = attachedListenersRef.current;
      if (typeof provider.removeListener === 'function') {
        try {
          provider.removeListener('accountsChanged', accountsHandler);
          provider.removeListener('chainChanged', chainHandler);
        } catch {
          // Safe catch
        }
      }
      attachedListenersRef.current = null;
    }
  }, []);

  // EIP-6963 Discovery (strictly allowlist only MetaMask, OKX Wallet, and Rabby)
  useEffect(() => {
    const handleAnnouncement = (event: Event) => {
      const customEvent = event as CustomEvent<EIP6963ProviderDetail>;
      const detail = customEvent.detail;

      if (
        !detail ||
        typeof detail !== 'object' ||
        !detail.info ||
        typeof detail.info.uuid !== 'string' ||
        typeof detail.info.rdns !== 'string' ||
        !detail.provider ||
        typeof detail.provider.request !== 'function'
      ) {
        return; // Ignore invalid announcement
      }

      // Check allowlist: ignore unsupported RDNS providers
      const rdnsKey = detail.info.rdns.toLowerCase();
      if (!ALLOWLISTED_RDNS[rdnsKey]) {
        return;
      }

      setAnnouncedProviders((prev) => {
        const next = new Map(prev);
        // Deduplicate by UUID and provider identity
        for (const [key, existing] of next.entries()) {
          if (existing.provider === detail.provider || existing.info.uuid === detail.info.uuid) {
            next.delete(key);
          }
        }
        next.set(detail.info.uuid, detail);
        return next;
      });
    };

    window.addEventListener('eip6963:announceProvider', handleAnnouncement);
    window.dispatchEvent(new CustomEvent('eip6963:requestProvider'));

    return () => {
      window.removeEventListener('eip6963:announceProvider', handleAnnouncement);
      removeAttachedListeners();
    };
  }, [removeAttachedListeners]);

  // Compute available wallet options
  const options: WalletOption[] = [];
  if (announcedProviders.size > 0) {
    for (const detail of announcedProviders.values()) {
      const matched = ALLOWLISTED_RDNS[detail.info.rdns.toLowerCase()];
      if (matched) {
        options.push({
          id: detail.info.uuid,
          name: matched.name,
          icon: detail.info.icon || '',
          rdns: matched.rdns,
          provider: detail.provider,
          isFallback: false,
        });
      }
    }
  }

  // Legacy fallback ONLY when zero supported EIP-6963 providers exist AND legacy provider is identifiable
  if (options.length === 0 && typeof window !== 'undefined' && (window as any).ethereum) {
    const eth = (window as any).ethereum;
    if (typeof eth.request === 'function') {
      const classified = classifyLegacyProvider(eth);
      if (classified) {
        options.push({
          id: 'legacy-injected',
          name: classified.name,
          icon: '',
          rdns: classified.rdns,
          provider: eth as EIP1193Provider,
          isFallback: true,
        });
      }
    }
  }

  const openChooser = useCallback(() => {
    setConnectionError(null);
    setIsModalOpen(true);
  }, []);

  const closeChooser = useCallback(() => {
    if (!isConnecting) {
      setIsModalOpen(false);
      setConnectionError(null);
    }
  }, [isConnecting]);

  const disconnect = useCallback(() => {
    removeAttachedListeners();
    activeProviderRef.current = null;
    setConnectedAccount(null);
    setConnectedProvider(null);
    setConnectedWalletName(null);
    setChainId(null);
    setConnectionError(null);
  }, [removeAttachedListeners]);

  const switchChain = useCallback(async (): Promise<boolean> => {
    const provider = activeProviderRef.current;
    if (!provider) return false;

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
      });
      setChainId(STUDIONET_CHAIN_ID_HEX);
      return true;
    } catch (switchError: any) {
      const code = switchError?.code || switchError?.data?.originalError?.code;
      // 4902 means chain has not been added
      if (code === 4902 || switchError?.message?.includes('Unrecognized chain')) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [STUDIONET_CHAIN_CONFIG],
          });
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
          });
          setChainId(STUDIONET_CHAIN_ID_HEX);
          return true;
        } catch (addError: any) {
          setConnectionError(`Failed to add Studionet chain: ${addError?.message || String(addError)}`);
          return false;
        }
      }
      setConnectionError(`Failed to switch chain to Studionet: ${switchError?.message || String(switchError)}`);
      return false;
    }
  }, []);

  const connectWallet = useCallback(
    async (option: WalletOption): Promise<boolean> => {
      setIsConnecting(true);
      setConnectionError(null);

      // Clean up previous listeners if switching provider
      removeAttachedListeners();

      try {
        const provider = option.provider;
        const accountsRaw = await provider.request({ method: 'eth_requestAccounts' });

        if (!Array.isArray(accountsRaw) || accountsRaw.length === 0 || !accountsRaw[0]) {
          throw new Error('No accounts returned by wallet');
        }

        const account = String(accountsRaw[0]).toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(account)) {
          throw new Error('Invalid account address format returned');
        }

        activeProviderRef.current = provider;
        setConnectedAccount(account);
        setConnectedProvider(provider);
        setConnectedWalletName(option.name);

        // Fetch current chain ID
        let currentChain = '';
        try {
          const rawChain = await provider.request({ method: 'eth_chainId' });
          currentChain = typeof rawChain === 'string' ? rawChain.toLowerCase() : '';
          setChainId(currentChain);
        } catch {
          // Ignore chain fetch error
        }

        // Verify or switch to Studionet
        if (currentChain !== STUDIONET_CHAIN_ID_HEX.toLowerCase()) {
          await switchChain();
        }

        // Bind event listeners with retained handler references
        if (typeof provider.on === 'function') {
          const handleAccountsChanged = (newAccounts: unknown) => {
            if (Array.isArray(newAccounts) && newAccounts.length > 0 && newAccounts[0]) {
              setConnectedAccount(String(newAccounts[0]).toLowerCase());
            } else {
              disconnect();
            }
          };

          const handleChainChanged = (newChainId: unknown) => {
            if (typeof newChainId === 'string') {
              setChainId(newChainId.toLowerCase());
            }
          };

          provider.on('accountsChanged', handleAccountsChanged);
          provider.on('chainChanged', handleChainChanged);

          attachedListenersRef.current = {
            provider,
            accountsHandler: handleAccountsChanged,
            chainHandler: handleChainChanged,
          };
        }

        setIsModalOpen(false);
        setIsConnecting(false);
        return true;
      } catch (err: any) {
        setIsConnecting(false);
        const msg = err?.message || String(err);
        if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
          setConnectionError('Connection request was rejected by user in wallet.');
        } else {
          setConnectionError(`Connection failed: ${msg}`);
        }
        return false;
      }
    },
    [switchChain, disconnect, removeAttachedListeners]
  );

  const isCorrectChain = Boolean(
    chainId &&
      (chainId.toLowerCase() === STUDIONET_CHAIN_ID_HEX.toLowerCase() ||
        chainId === String(STUDIONET_CHAIN_ID_DEC))
  );

  return (
    <WalletContext.Provider
      value={{
        isModalOpen,
        isWalletModalOpen: isModalOpen,
        openChooser,
        openWalletModal: openChooser,
        closeChooser,
        closeWalletModal: closeChooser,
        options,
        isConnecting,
        connectedAccount,
        connectedProvider,
        connectedWalletName,
        chainId,
        isCorrectChain,
        connectionError,
        connectWallet,
        disconnect,
        switchChain,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
