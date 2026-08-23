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
      <div className="header-container">
        <div className="header-brand">
          <div className="brand-logo-badge" aria-hidden="true">
            <span className="brand-rx">Rx</span>
            <span className="brand-dot"></span>
          </div>
          <div className="brand-titles">
            <h1 className="header-title">Drug Shortage Research Priority Board</h1>
            <span className="header-tagline">
              Decentralized consensus research prioritization · Powered by GenLayer Intelligent Contracts
            </span>
          </div>
        </div>

        <div className="header-meta">
          <div className="header-meta-status-row">
            <div
              className="network-indicator"
              title="Connected Network: GenLayer Studionet (Chain ID 61999)"
            >
              <span className="network-dot" aria-hidden="true"></span>
              <span className="network-label">Studionet</span>
            </div>

            <RpcLatencyMonitor />

            {isContractConfigured && contractAddress ? (
              <a
                href={`https://explorer-studio.genlayer.com/address/${contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="contract-status-pill status-configured"
                title={`View contract ${contractAddress} on GenLayer Studionet Explorer`}
                aria-label={`View contract ${contractAddress} on GenLayer Studionet Explorer`}
              >
                <span className="status-dot" aria-hidden="true"></span>
                <span className="contract-status-text">
                  Contract: {formatAddress(contractAddress)} ↗
                </span>
              </a>
            ) : (
              <div
                className="contract-status-pill status-not-configured"
                title="VITE_GENLAYER_CONTRACT_ADDRESS is not set"
              >
                <span className="status-dot" aria-hidden="true"></span>
                <span className="contract-status-text">Contract not configured</span>
              </div>
            )}
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
      </div>

      <WalletModal triggerRef={connectButtonRef} />
    </header>
  );
};
