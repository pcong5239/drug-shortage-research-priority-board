import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WalletProvider } from '../context/WalletContext';
import { ContractProvider } from '../context/ContractContext';
import { Header } from '../components/Header';
import { useWallet } from '../hooks/useWallet';
import type { EIP6963ProviderDetail } from '../types/wallet';

function createMockProvider(overrides?: Record<string, unknown>) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    request: vi.fn().mockImplementation(async ({ method }) => {
      if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
      if (method === 'eth_chainId') return '0xf22f'; // 61999 Studionet
      return null;
    }),
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    }),
    removeListener: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    }),
    _emit(event: string, ...args: unknown[]) {
      if (listeners[event]) {
        listeners[event].forEach((h) => h(...args));
      }
    },
    ...overrides,
  };
}

function announceProvider(detail: EIP6963ProviderDetail) {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze(detail),
    })
  );
}

const TestWalletConsumer: React.FC = () => {
  const { openChooser, connectedAccount, disconnect, switchChain, isCorrectChain } = useWallet();
  return (
    <div>
      <Header />
      <button onClick={openChooser} data-testid="open-wallet-btn">
        Connect
      </button>
      <button onClick={disconnect} data-testid="disconnect-btn">
        Disconnect
      </button>
      <button onClick={switchChain} data-testid="switch-chain-btn">
        Switch Chain
      </button>
      <div data-testid="connected-account">{connectedAccount || 'none'}</div>
      <div data-testid="chain-status">{isCorrectChain ? 'correct' : 'wrong'}</div>
    </div>
  );
};

function renderTestComponent() {
  return render(
    <WalletProvider>
      <ContractProvider>
        <TestWalletConsumer />
      </ContractProvider>
    </WalletProvider>
  );
}

describe('Wallet Discovery & Routing (Scenarios 1–20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Scenario 1: Zero providers announced -> empty provider list with informational banner
  it('Scenario 1: displays informational message when zero providers are announced', () => {
    renderTestComponent();

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(screen.getByText(/No supported EIP-6963 wallet detected/i)).toBeInTheDocument();
  });

  // Scenario 2: Single MetaMask announced via EIP-6963
  it('Scenario 2: discovers single MetaMask provider via EIP-6963', () => {
    const metaMaskProvider = createMockProvider();
    renderTestComponent();

    act(() => {
      announceProvider({
        info: {
          uuid: 'uuid-metamask-1',
          name: 'MetaMask',
          icon: 'data:image/svg+xml;utf8,<svg></svg>',
          rdns: 'io.metamask',
        },
        provider: metaMaskProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(screen.getByText('MetaMask')).toBeInTheDocument();
    expect(screen.queryByText(/No supported EIP-6963 wallet detected/i)).not.toBeInTheDocument();
  });

  // Scenario 3: Single OKX Wallet announced
  it('Scenario 3: discovers single OKX Wallet provider via EIP-6963', () => {
    const okxProvider = createMockProvider();
    renderTestComponent();

    act(() => {
      announceProvider({
        info: {
          uuid: 'uuid-okx-1',
          name: 'OKX Wallet',
          icon: 'data:image/svg+xml;utf8,<svg></svg>',
          rdns: 'com.okex.wallet',
        },
        provider: okxProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(screen.getByText('OKX Wallet')).toBeInTheDocument();
  });

  // Scenario 4: Single Rabby announced
  it('Scenario 4: discovers single Rabby provider via EIP-6963', () => {
    const rabbyProvider = createMockProvider();
    renderTestComponent();

    act(() => {
      announceProvider({
        info: {
          uuid: 'uuid-rabby-1',
          name: 'Rabby Wallet',
          icon: 'data:image/svg+xml;utf8,<svg></svg>',
          rdns: 'io.rabby',
        },
        provider: rabbyProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(screen.getByText('Rabby')).toBeInTheDocument();
  });

  // Scenario 5: Multiple distinct providers (MetaMask + OKX + Rabby)
  it('Scenario 5: renders all 3 providers when MetaMask, OKX, and Rabby are announced', () => {
    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-mm', name: 'MetaMask', icon: 'mm-icon', rdns: 'io.metamask' },
        provider: createMockProvider() as any,
      });
      announceProvider({
        info: { uuid: 'uuid-okx', name: 'OKX Wallet', icon: 'okx-icon', rdns: 'com.okex.wallet' },
        provider: createMockProvider() as any,
      });
      announceProvider({
        info: { uuid: 'uuid-rabby', name: 'Rabby', icon: 'rabby-icon', rdns: 'io.rabby' },
        provider: createMockProvider() as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(screen.getByText('MetaMask')).toBeInTheDocument();
    expect(screen.getByText('OKX Wallet')).toBeInTheDocument();
    expect(screen.getByText('Rabby')).toBeInTheDocument();
  });

  // Scenario 6: Duplicate EIP-6963 announcements with identical UUID deduplicated
  it('Scenario 6: deduplicates announcements sharing identical UUID', () => {
    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'same-uuid', name: 'MetaMask', icon: 'mm-icon', rdns: 'io.metamask' },
        provider: createMockProvider() as any,
      });
      announceProvider({
        info: { uuid: 'same-uuid', name: 'MetaMask Duplicate', icon: 'mm-icon', rdns: 'io.metamask' },
        provider: createMockProvider() as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    const buttons = screen.getAllByRole('button', { name: /MetaMask/i });
    expect(buttons.length).toBe(1);
  });

  // Scenario 7: Duplicate EIP-6963 announcements with identical provider object deduplicated
  it('Scenario 7: deduplicates announcements sharing identical provider object', () => {
    const sharedProvider = createMockProvider();
    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-1', name: 'Provider A', icon: 'a-icon', rdns: 'io.metamask' },
        provider: sharedProvider as any,
      });
      announceProvider({
        info: { uuid: 'uuid-2', name: 'Provider B', icon: 'b-icon', rdns: 'io.metamask' },
        provider: sharedProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    const buttons = screen.getAllByRole('button', { name: /MetaMask/i });
    expect(buttons.length).toBe(1);
  });

  // Scenario 8: Fallback to window.ethereum only when zero EIP-6963 providers announced and wallet is classified
  it('Scenario 8: displays window.ethereum fallback when zero EIP-6963 providers are announced', () => {
    (window as any).ethereum = createMockProvider({ isMetaMask: true });

    renderTestComponent();

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(screen.getByText('MetaMask')).toBeInTheDocument();
  });

  // Scenario 9: EIP-6963 announcement dynamically replaces window.ethereum fallback
  it('Scenario 9: replaces fallback when an EIP-6963 provider is announced', () => {
    (window as any).ethereum = createMockProvider({ isMetaMask: true });

    renderTestComponent();

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(screen.getByText('MetaMask')).toBeInTheDocument();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-eip-rabby', name: 'Rabby', icon: 'rabby-icon', rdns: 'io.rabby' },
        provider: createMockProvider() as any,
      });
    });

    expect(screen.getByText('Rabby')).toBeInTheDocument();
  });

  // Scenario 10: Fallback ignores invalid window.ethereum lacking request method
  it('Scenario 10: ignores invalid window.ethereum missing request function', () => {
    (window as any).ethereum = { isMetaMask: true }; // No request function

    renderTestComponent();

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(screen.getByText(/No supported EIP-6963 wallet detected/i)).toBeInTheDocument();
  });

  // Scenario 11: Non-EIP-6963 events on eip6963:announceProvider are ignored
  it('Scenario 11: ignores invalid announceProvider events with missing detail or fields', () => {
    renderTestComponent();

    act(() => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: null }));
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: {} }));
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: { info: null, provider: null },
        })
      );
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(screen.getByText(/No supported EIP-6963 wallet detected/i)).toBeInTheDocument();
  });

  // Scenario 12: Unsupported RDNS format is strictly filtered out by allowlist
  it('Scenario 12: filters out and ignores unsupported wallet RDNS formats', () => {
    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'custom-uuid', name: 'Custom Wallet', icon: 'icon', rdns: 'custom.unsupported.wallet' },
        provider: createMockProvider() as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(screen.getByText(/No supported EIP-6963 wallet detected/i)).toBeInTheDocument();
    expect(screen.queryByText('Custom Wallet')).not.toBeInTheDocument();
  });

  // Scenario 13: Opening chooser dialog does NOT trigger RPC requests
  it('Scenario 13: opening chooser dialog does not execute any RPC calls', () => {
    const mockProvider = createMockProvider();
    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-mm', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: mockProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    expect(mockProvider.request).not.toHaveBeenCalled();
  });

  // Scenario 14: Closing chooser dialog without selection triggers zero RPC calls
  it('Scenario 14: closing modal without selection performs zero RPC calls', () => {
    const mockProvider = createMockProvider();
    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-mm', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: mockProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(mockProvider.request).not.toHaveBeenCalled();
  });

  // Scenario 15: User selects MetaMask -> calls eth_requestAccounts on MetaMask provider only
  it('Scenario 15: selecting a specific provider routes eth_requestAccounts to that provider object only', async () => {
    const mmProvider = createMockProvider();
    const okxProvider = createMockProvider();

    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-mm', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: mmProvider as any,
      });
      announceProvider({
        info: { uuid: 'uuid-okx', name: 'OKX Wallet', icon: 'icon', rdns: 'com.okex.wallet' },
        provider: okxProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    const mmButton = screen.getByRole('button', { name: /MetaMask/i });

    await act(async () => {
      fireEvent.click(mmButton);
    });

    expect(mmProvider.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(okxProvider.request).not.toHaveBeenCalled();
    expect(screen.getByTestId('connected-account')).toHaveTextContent('0x1111111111111111111111111111111111111111');
  });

  // Scenario 16: User rejection (4001) displays inline error, modal remains usable
  it('Scenario 16: displays inline error when user rejects connection request (4001)', async () => {
    const mmProvider = createMockProvider({
      request: vi.fn().mockRejectedValue({ code: 4001, message: 'User rejected the request' }),
    });

    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-mm', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: mmProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    const mmButton = screen.getByRole('button', { name: /MetaMask/i });

    await act(async () => {
      fireEvent.click(mmButton);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Connection request was rejected/i);
    expect(screen.getByTestId('connected-account')).toHaveTextContent('none');
  });

  // Scenario 17: Connected to wrong chain -> prompts chain switch via wallet_switchEthereumChain
  it('Scenario 17: prompts chain switch when connected to a non-Studionet chain', async () => {
    let switchCalls = 0;
    const mmProvider = createMockProvider({
      request: vi.fn().mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
        if (method === 'eth_chainId') return '0x1'; // Mainnet
        if (method === 'wallet_switchEthereumChain') {
          switchCalls++;
          if (switchCalls === 1) {
            throw new Error('User declined auto-switch');
          }
          return null;
        }
        return null;
      }),
    });

    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-mm', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: mmProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /MetaMask/i }));
    });

    expect(screen.getByTestId('chain-status')).toHaveTextContent('wrong');

    // Trigger manual chain switch
    await act(async () => {
      fireEvent.click(screen.getByTestId('switch-chain-btn'));
    });

    expect(mmProvider.request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xf22f' }],
    });
  });

  // Scenario 18: Chain switch error 4902 triggers wallet_addEthereumChain
  it('Scenario 18: adds Studionet chain if switch returns error code 4902 (chain not added)', async () => {
    const mmProvider = createMockProvider({
      request: vi.fn().mockImplementation(async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
        if (method === 'eth_chainId') return '0x1';
        if (method === 'wallet_switchEthereumChain') {
          const err = new Error('Chain not added') as any;
          err.code = 4902;
          throw err;
        }
        if (method === 'wallet_addEthereumChain') return null;
        return null;
      }),
    });

    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-mm', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: mmProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /MetaMask/i }));
    });

    const addCalls = (mmProvider.request as any).mock.calls.filter(
      (c: any) => c[0]?.method === 'wallet_addEthereumChain'
    );
    expect(addCalls.length).toBeGreaterThan(0);
    expect(addCalls[0][0].params[0].chainId).toBe('0xf22f');
    expect(addCalls[0][0].params[0].chainName).toBe('Genlayer Studio Network');
  });

  // Scenario 19: accountsChanged event updates connected address or disconnects on empty array
  it('Scenario 19: responds to accountsChanged event by updating address or disconnecting', async () => {
    const mmProvider = createMockProvider();

    renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-mm', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: mmProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /MetaMask/i }));
    });

    expect(screen.getByTestId('connected-account')).toHaveTextContent('0x1111111111111111111111111111111111111111');

    // Change account
    act(() => {
      mmProvider._emit('accountsChanged', ['0x2222222222222222222222222222222222222222']);
    });
    expect(screen.getByTestId('connected-account')).toHaveTextContent('0x2222222222222222222222222222222222222222');

    // Empty accounts list -> disconnects
    act(() => {
      mmProvider._emit('accountsChanged', []);
    });
    expect(screen.getByTestId('connected-account')).toHaveTextContent('none');
  });

  // Scenario 20: Disconnect resets state; fresh mount starts disconnected
  it('Scenario 20: disconnect clears session, fresh mount starts in disconnected state', async () => {
    const mmProvider = createMockProvider();

    const { unmount } = renderTestComponent();

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-mm', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: mmProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('open-wallet-btn'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /MetaMask/i }));
    });

    expect(screen.getByTestId('connected-account')).toHaveTextContent('0x1111111111111111111111111111111111111111');

    // Click disconnect
    act(() => {
      fireEvent.click(screen.getByTestId('disconnect-btn'));
    });
    expect(screen.getByTestId('connected-account')).toHaveTextContent('none');

    unmount();

    // Re-render (simulating reload)
    renderTestComponent();

    expect(screen.getByTestId('connected-account')).toHaveTextContent('none');
  });
});
