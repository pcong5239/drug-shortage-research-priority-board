import React, { useRef } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useContract } from '../hooks/useContract';
import { WalletModal } from './WalletModal';
import { RpcLatencyMonitor } from './RpcLatencyMonitor';

export const Header: React.FC = () => {
  const {
    connectedAccount,
    connectedWalletName,
    isCorrectChain,
    openChooser,
    disconnect,
    switchChain,
  } = useWallet();

  const { contractAddress, isContractConfigured } = useContract();

  const connectButtonRef = useRef<HTMLButtonElement | null>(null);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  };

  return (
    <header className="utility-header" role="banner">
      <div className="header-brand">
        <h1 className="header-title">Drug Shortage Research Priority Board</h1>
        <div className="network-indicator" title="Connected Network: GenLayer Studionet (Chain ID 61999)">
          <span className="network-dot" aria-hidden="true"></span>
          <span className="network-label">Studionet</span>
        </div>
        <RpcLatencyMonitor />
      </div>

      <div className="header-meta">
        <div
          className={`contract-status-pill ${
            isContractConfigured ? 'status-configured' : 'status-not-configured'
          }`}
          title={
            isContractConfigured
              ? `Contract Address: ${contractAddress}`
              : 'VITE_GENLAYER_CONTRACT_ADDRESS is not set'
          }
        >
          <span className="status-dot" aria-hidden="true"></span>
          <span className="contract-status-text">
            {isContractConfigured
              ? `Contract: ${formatAddress(contractAddress!)}`
              : 'Contract not configured'}
          </span>
        </div>

        <div className="wallet-actions">
          {connectedAccount ? (
            <div className="connected-wallet-cluster">
              {!isCorrectChain && (
                <button
                  type="button"
                  className="btn btn-warning btn-sm"
                  onClick={switchChain}
                  title="Switch to Studionet (Chain ID 61999)"
                >
                  Switch to Studionet
                </button>
              )}
              <div className="wallet-pill" title={`Connected via ${connectedWalletName || 'Wallet'}`}>
                <span className="wallet-name-subtle">{connectedWalletName}:</span>
                <span className="wallet-address-mono">{formatAddress(connectedAccount)}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={openChooser}
                title="Switch connected wallet"
              >
                Switch
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={disconnect}
                title="Disconnect wallet"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              ref={connectButtonRef}
              type="button"
              className="btn btn-primary"
              onClick={openChooser}
              data-testid="connect-wallet-button"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      <WalletModal triggerRef={connectButtonRef} />
    </header>
  );
};
