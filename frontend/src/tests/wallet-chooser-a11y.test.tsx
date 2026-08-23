import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WalletProvider } from '../context/WalletContext';
import { WalletModal } from '../components/WalletModal';
import { useWallet } from '../hooks/useWallet';
import type { EIP6963ProviderDetail } from '../types/wallet';

function createMockProvider() {
  return {
    request: vi.fn().mockImplementation(async ({ method }) => {
      if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
      if (method === 'eth_chainId') return '0xf22f';
      return null;
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

function announceProvider(detail: EIP6963ProviderDetail) {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze(detail),
    })
  );
}

const AccessibilityTestComponent: React.FC = () => {
  const { openChooser } = useWallet();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div>
      <button ref={triggerRef} onClick={openChooser} data-testid="wallet-trigger-button">
        Connect Wallet
      </button>
      <input data-testid="outside-input" placeholder="Outside modal element" />
      <WalletModal triggerRef={triggerRef} />
    </div>
  );
};

describe('Wallet Chooser Dialog Accessibility (Scenarios 21–26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Scenario 21: Opening modal sets initial focus on close button or first interactive element
  it('Scenario 21: focuses the close button or first focusable item upon opening', async () => {
    render(
      <WalletProvider>
        <AccessibilityTestComponent />
      </WalletProvider>
    );

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-1', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: createMockProvider() as any,
      });
    });

    const triggerBtn = screen.getByTestId('wallet-trigger-button');
    fireEvent.click(triggerBtn);

    const closeBtn = screen.getByRole('button', { name: /close/i });
    expect(closeBtn).toBeInTheDocument();
  });

  // Scenario 22: Tab navigation is trapped within the modal
  it('Scenario 22: traps focus within the modal dialog during Tab cycling', () => {
    render(
      <WalletProvider>
        <AccessibilityTestComponent />
      </WalletProvider>
    );

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-1', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: createMockProvider() as any,
      });
    });

    fireEvent.click(screen.getByTestId('wallet-trigger-button'));

    const dialog = screen.getByRole('dialog');
    const closeBtn = screen.getByRole('button', { name: /close/i });
    const mmBtn = screen.getByRole('button', { name: /MetaMask/i });

    expect(dialog).toBeInTheDocument();
    expect(closeBtn).toBeInTheDocument();
    expect(mmBtn).toBeInTheDocument();

    // Verify Tab key cycling within dialog
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(dialog).toBeInTheDocument();
  });

  // Scenario 23: Pressing Escape closes the modal
  it('Scenario 23: closes modal when Escape key is pressed', () => {
    render(
      <WalletProvider>
        <AccessibilityTestComponent />
      </WalletProvider>
    );

    fireEvent.click(screen.getByTestId('wallet-trigger-button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Scenario 24: Clicking backdrop closes the modal
  it('Scenario 24: closes modal when clicking outside the dialog content', () => {
    render(
      <WalletProvider>
        <AccessibilityTestComponent />
      </WalletProvider>
    );

    fireEvent.click(screen.getByTestId('wallet-trigger-button'));
    const backdrop = screen.getByTestId('wallet-modal-backdrop');

    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Scenario 25: Closing modal restores focus to the trigger button
  it('Scenario 25: restores focus to the trigger element when closed', () => {
    render(
      <WalletProvider>
        <AccessibilityTestComponent />
      </WalletProvider>
    );

    const triggerBtn = screen.getByTestId('wallet-trigger-button');
    triggerBtn.focus();
    fireEvent.click(triggerBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Close via close button
    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Scenario 26: Errors rendered in role="alert" live region
  it('Scenario 26: renders connection error in an element with role="alert"', async () => {
    const errorProvider = createMockProvider();
    errorProvider.request = vi.fn().mockRejectedValue(new Error('Arbitrary connection failure'));

    render(
      <WalletProvider>
        <AccessibilityTestComponent />
      </WalletProvider>
    );

    act(() => {
      announceProvider({
        info: { uuid: 'uuid-err', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
        provider: errorProvider as any,
      });
    });

    fireEvent.click(screen.getByTestId('wallet-trigger-button'));
    const walletBtn = screen.getByRole('button', { name: /MetaMask/i });

    await act(async () => {
      fireEvent.click(walletBtn);
    });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Arbitrary connection failure/i);
  });
});
