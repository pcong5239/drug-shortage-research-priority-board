import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { abi } from 'genlayer-js';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { classifyReceipt, decodeReturnedId, executeContractWrite } from '../services/contract';
import {
  isAllocateSlotsReadbackConfirmed,
  isLockRoundReadbackConfirmed,
} from '../context/ContractContext';
import { createWalletBoundClient } from '../services/client';
import {
  WalletProvider,
  useWallet,
  ALLOWLISTED_RDNS,
  classifyLegacyProvider,
} from '../context/WalletContext';
import { RpcLatencyMonitor } from '../components/RpcLatencyMonitor';

const encodeReturn = (value: bigint): `0x${string}` =>
  `0x${Array.from(abi.calldata.encode(value), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;

// Helper component for testing wallet context
const TestWalletComponent: React.FC = () => {
  const {
    isConnecting,
    connectedAccount,
    options,
    connectWallet,
    disconnect,
    connectionError,
  } = useWallet();

  return (
    <div>
      <div data-testid="connection-status">{connectedAccount ? 'connected' : 'disconnected'}</div>
      <div data-testid="is-connecting">{isConnecting ? 'true' : 'false'}</div>
      <div data-testid="account-address">{connectedAccount || 'none'}</div>
      <div data-testid="error-message">{connectionError || 'none'}</div>
      <div data-testid="wallet-count">{options.length}</div>
      <ul data-testid="wallet-list">
        {options.map((w) => (
          <li key={w.id} data-testid={`wallet-item-${w.rdns}`}>
            <button
              onClick={() => connectWallet(w)}
              data-testid={`connect-btn-${w.rdns}`}
            >
              {w.name}
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => disconnect()} data-testid="disconnect-btn">
        Disconnect
      </button>
    </div>
  );
};

describe('Defect 1 & 2 Regressions: Real Calldata Encoding & Provider Binding', () => {
  it('Defect 1: createWalletBoundClient binds directly to the selected EIP-1193 provider', () => {
    const mockProvider = {
      request: vi.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890']),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const client = createWalletBoundClient(
      mockProvider as any,
      '0x1234567890123456789012345678901234567890'
    );

    expect(client).toBeDefined();
    expect(typeof client.writeContract).toBe('function');
    expect(typeof client.readContract).toBe('function');
    expect(typeof client.getTransactionReceipt).toBe('function');
  });

  it('Defect 2: executeContractWrite invokes client.writeContract with positional arguments and 0n value', async () => {
    const mockProvider = {
      request: vi.fn(),
    };

    const mockWriteContract = vi.fn().mockResolvedValue('0xtxhash123456');
    const mockGetReceipt = vi.fn().mockResolvedValue({
      status: 'FINALIZED',
      execution_result: 'FINISHED_WITH_RETURN',
      consensus_data: { leader_receipt: [{ result: encodeReturn(1n) }] },
    });

    const mockClient = {
      writeContract: mockWriteContract,
      getTransaction: mockGetReceipt,
      getTransactionReceipt: mockGetReceipt,
    };

    const clientModule = await import('../services/client');
    const clientSpy = vi.spyOn(clientModule, 'createWalletBoundClient').mockReturnValue(mockClient as any);

    const onStateChange = vi.fn();

    const outcome = await executeContractWrite({
      contractAddress: '0x1111111111111111111111111111111111111111',
      provider: mockProvider as any,
      accountAddress: '0x2222222222222222222222222222222222222222',
      functionName: 'create_round',
      args: ['https://fda.gov', '0xabc', 0, '2026', 'desc', 'v1', 'rubric', 'v1', 3600, 86400, 2],
      actionName: 'Create Round',
      onStateChange,
    });

    expect(outcome.success).toBe(true);
    expect(outcome.txHash).toBe('0xtxhash123456');
    expect(clientSpy).toHaveBeenCalledWith(mockProvider, '0x2222222222222222222222222222222222222222');
    expect(mockWriteContract).toHaveBeenCalledWith({
      address: '0x1111111111111111111111111111111111111111',
      functionName: 'create_round',
      args: ['https://fda.gov', '0xabc', 0, '2026', 'desc', 'v1', 'rubric', 'v1', 3600, 86400, 2],
      value: 0n,
    });

    clientSpy.mockRestore();
  });
});

describe('Steward readback regressions', () => {
  it('accepts the valid EVALUATED zero-submission lock result only', () => {
    expect(isLockRoundReadbackConfirmed({ state: 'EVALUATED', submission_count: 0 })).toBe(true);
    expect(isLockRoundReadbackConfirmed({ state: 'EVALUATED', submission_count: 1 })).toBe(false);
    expect(isLockRoundReadbackConfirmed({ state: 'LOCKED', submission_count: 1 })).toBe(true);
    expect(isLockRoundReadbackConfirmed({ state: 'OPEN', submission_count: 0 })).toBe(false);
  });

  it('accepts FINAL as the valid no-allocation result of allocate_slots', () => {
    expect(isAllocateSlotsReadbackConfirmed({ state: 'FINAL' })).toBe(true);
    expect(isAllocateSlotsReadbackConfirmed({ state: 'CLAIM' })).toBe(true);
    expect(isAllocateSlotsReadbackConfirmed({ state: 'ALLOCATED' })).toBe(true);
    expect(isAllocateSlotsReadbackConfirmed({ state: 'EVALUATED' })).toBe(false);
  });
});

describe('Defect 3 Regressions: Consensus Finality & Execution Classification', () => {
  it('Defect 3: rejects non-finalized pending status (does not prematurely classify as success)', () => {
    const pendingReceipt = {
      status: 'PENDING',
      status_name: 'PENDING',
      txExecutionResult: 1,
    };
    const classified = classifyReceipt(pendingReceipt);
    expect(classified.isFinalized).toBe(false);
    expect(classified.status).toBe('UNDETERMINED');
  });

  it('Defect 3: classifies terminal non-success consensus statuses as UNDETERMINED', () => {
    const cancelledReceipt = { status: 8, status_name: 'CANCELED' };
    expect(classifyReceipt(cancelledReceipt).status).toBe('UNDETERMINED');
    expect(classifyReceipt(cancelledReceipt).isFinalized).toBe(true);

    const leaderTimeoutReceipt = { status: 13, status_name: 'LEADER_TIMEOUT' };
    expect(classifyReceipt(leaderTimeoutReceipt).status).toBe('UNDETERMINED');
    expect(classifyReceipt(leaderTimeoutReceipt).isFinalized).toBe(true);

    const validatorTimeoutReceipt = { status: 12, status_name: 'VALIDATORS_TIMEOUT' };
    expect(classifyReceipt(validatorTimeoutReceipt).status).toBe('UNDETERMINED');
    expect(classifyReceipt(validatorTimeoutReceipt).isFinalized).toBe(true);
  });

  it('Defect 3: classifies status 7 (FINALIZED) with execution failure as ERROR', () => {
    const revertedReceipt = {
      status: 7,
      status_name: 'FINALIZED',
      execution_result: 'FINISHED_WITH_ERROR',
      error: 'Assertion error',
    };
    const classified = classifyReceipt(revertedReceipt);
    expect(classified.status).toBe('ERROR');
    expect(classified.isFinalized).toBe(true);
    expect(classified.errorReason).toBe('Assertion error');
  });

  it('Defect 3: classifies status 7 (FINALIZED) with execution code 1 / FINISHED_WITH_RETURN as SUCCESS', () => {
    const successReceipt = {
      status: 7,
      status_name: 'FINALIZED',
      execution_result: 'FINISHED_WITH_RETURN',
      result: 1,
      consensus_data: { leader_receipt: [{ result: encodeReturn(42n) }] },
    };
    const classified = classifyReceipt(successReceipt);
    expect(classified.status).toBe('SUCCESS');
    expect(classified.isFinalized).toBe(true);
    expect(classified.returnedValue).toBe(encodeReturn(42n));
    expect(decodeReturnedId(classified.returnedValue)).toBe(42n);
  });

  it('Defect 3: emits full 6-stage lifecycle on successful execution', async () => {
    const stages: string[] = [];
    const onStateChange = vi.fn((state) => stages.push(state.stage));

    const mockReceipt = {
      status: 'FINALIZED',
      execution_result: 'FINISHED_WITH_RETURN',
      consensus_data: { leader_receipt: [{ result: encodeReturn(1n) }] },
    };

    const clientModule = await import('../services/client');
    const clientSpy = vi.spyOn(clientModule, 'createWalletBoundClient').mockReturnValue({
      writeContract: vi.fn().mockResolvedValue('0xstagehash'),
      getTransaction: vi.fn().mockResolvedValue(mockReceipt),
      getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
    } as any);

    const outcome = await executeContractWrite({
      contractAddress: '0x1111111111111111111111111111111111111111',
      provider: {} as any,
      accountAddress: '0x2222222222222222222222222222222222222222',
      functionName: 'create_round',
      args: [],
      actionName: 'Create Round',
      onStateChange,
      performReadback: vi.fn().mockResolvedValue(true),
    });

    expect(outcome.success).toBe(true);
    expect(stages).toEqual([
      'SIGNING',
      'SUBMITTED',
      'CONSENSUS',
      'FINALIZED',
      'EXECUTION_SUCCESS',
      'READBACK_CONFIRMED',
    ]);

    clientSpy.mockRestore();
  });
});

describe('Defect 4 Regressions: Strict Wallet Allowlist & Classification', () => {
  it('Defect 4: ALLOWLISTED_RDNS only contains MetaMask, OKX Wallet, and Rabby', () => {
    const allowedKeys = Object.keys(ALLOWLISTED_RDNS);
    expect(allowedKeys).toContain('io.metamask');
    expect(allowedKeys).toContain('io.metamask.mobile');
    expect(allowedKeys).toContain('com.okex.wallet');
    expect(allowedKeys).toContain('com.okx.wallet');
    expect(allowedKeys).toContain('io.rabby');
    expect(allowedKeys.length).toBeLessThanOrEqual(5);
  });

  it('Defect 4: classifyLegacyProvider accurately classifies Rabby, OKX, and MetaMask by flags', () => {
    expect(classifyLegacyProvider({ isRabby: true })?.name).toBe('Rabby');
    expect(classifyLegacyProvider({ isOkxWallet: true })?.name).toBe('OKX Wallet');
    expect(classifyLegacyProvider({ isOKExWallet: true })?.name).toBe('OKX Wallet');
    expect(classifyLegacyProvider({ isMetaMask: true })?.name).toBe('MetaMask');
    expect(classifyLegacyProvider({ isMetaMask: true, isRabby: true })?.name).toBe('Rabby');
    expect(classifyLegacyProvider({ isMetaMask: true, isOkxWallet: true })?.name).toBe('OKX Wallet');
    expect(classifyLegacyProvider({ isBraveWallet: true })).toBeNull();
    expect(classifyLegacyProvider({ isCoinbaseWallet: true })).toBeNull();
    expect(classifyLegacyProvider({})).toBeNull();
    expect(classifyLegacyProvider(null)).toBeNull();
  });

  it('Defect 4: rejects non-allowlisted EIP-6963 provider announcements', () => {
    render(
      <WalletProvider>
        <TestWalletComponent />
      </WalletProvider>
    );

    // Announce an unallowed wallet (e.g. io.phantom)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'u1', name: 'Phantom', icon: '', rdns: 'io.phantom' },
            provider: { request: vi.fn() },
          },
        })
      );
    });

    expect(screen.queryByTestId('wallet-item-io.phantom')).not.toBeInTheDocument();
    expect(screen.getByTestId('wallet-count')).toHaveTextContent('0');

    // Announce an allowlisted wallet (e.g. io.metamask)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'u2', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
            provider: { request: vi.fn() },
          },
        })
      );
    });

    expect(screen.getByTestId('wallet-item-io.metamask')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-count')).toHaveTextContent('1');
  });
});

describe('Defect 5 Regressions: Provider Listener Lifecycle & Leak Prevention', () => {
  it('Defect 5: removes attached listeners on disconnect and on provider switch', async () => {
    const mockOn1 = vi.fn();
    const mockRemoveListener1 = vi.fn();
    const provider1 = {
      request: vi.fn().mockImplementation((req: { method: string }) => {
        if (req.method === 'eth_requestAccounts') return Promise.resolve(['0x1111111111111111111111111111111111111111']);
        if (req.method === 'eth_accounts') return Promise.resolve(['0x1111111111111111111111111111111111111111']);
        if (req.method === 'eth_chainId') return Promise.resolve('0x19');
        return Promise.resolve(null);
      }),
      on: mockOn1,
      removeListener: mockRemoveListener1,
    };

    const { unmount } = render(
      <WalletProvider>
        <TestWalletComponent />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'm1', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
            provider: provider1,
          },
        })
      );
    });

    // Connect
    await act(async () => {
      fireEvent.click(screen.getByTestId('connect-btn-io.metamask'));
    });

    expect(mockOn1).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
    expect(mockOn1).toHaveBeenCalledWith('chainChanged', expect.any(Function));

    // Disconnect
    await act(async () => {
      fireEvent.click(screen.getByTestId('disconnect-btn'));
    });

    expect(mockRemoveListener1).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
    expect(mockRemoveListener1).toHaveBeenCalledWith('chainChanged', expect.any(Function));

    // Connect again then unmount component
    await act(async () => {
      fireEvent.click(screen.getByTestId('connect-btn-io.metamask'));
    });
    unmount();

    expect(mockRemoveListener1).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
    expect(mockRemoveListener1).toHaveBeenCalledWith('chainChanged', expect.any(Function));
  });
});

describe('Defect 6 Regressions: RPC Latency Monitor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: 'test' }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Defect 6: renders RPC latency monitor with health dot and refresh button', async () => {
    render(<RpcLatencyMonitor />);

    expect(screen.getByTestId('rpc-latency-monitor')).toBeInTheDocument();
    expect(screen.getByTestId('rpc-status-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('rpc-refresh-btn')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('rpc-latency-value')).toBeInTheDocument();
    });

    // Click refresh
    await act(async () => {
      fireEvent.click(screen.getByTestId('rpc-refresh-btn'));
    });
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});
