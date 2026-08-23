import React, { useEffect, useRef } from 'react';
import { useWallet } from '../hooks/useWallet';

interface WalletModalProps {
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export const WalletModal: React.FC<WalletModalProps> = ({ triggerRef }) => {
  const {
    isModalOpen,
    closeChooser,
    options,
    connectWallet,
    isConnecting,
    connectionError,
  } = useWallet();

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus trap and Escape key listener
  useEffect(() => {
    if (!isModalOpen) return;

    // Set background inert
    const appRoot = document.getElementById('app-workbench-root');
    if (appRoot) {
      appRoot.setAttribute('aria-hidden', 'true');
    }

    // Initial focus
    const timer = setTimeout(() => {
      if (firstButtonRef.current) {
        firstButtonRef.current.focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeChooser();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements);
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (appRoot) {
        appRoot.removeAttribute('aria-hidden');
      }
      // Restore focus to trigger
      if (triggerRef && triggerRef.current) {
        triggerRef.current.focus();
      }
    };
  }, [isModalOpen, closeChooser, triggerRef]);

  if (!isModalOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeChooser();
        }
      }}
      data-testid="wallet-modal-backdrop"
    >
      <div
        className="modal-dialog wallet-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id="wallet-modal-title" className="modal-title">
            Select EIP-6963 Wallet
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={closeChooser}
            aria-label="Close wallet selection dialog"
            disabled={isConnecting}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="wallet-modal-instructions">
            Connect an authorized wallet on <strong>GenLayer Studionet</strong>. Only verified MetaMask, OKX Wallet, and Rabby providers are supported.
          </p>

          {connectionError && (
            <div className="alert-box alert-error" role="alert" aria-live="assertive">
              <span className="alert-title">Connection Error:</span> {connectionError}
            </div>
          )}

          {options.length === 0 ? (
            <div className="wallet-empty-state" role="status">
              <p>No supported EIP-6963 wallet detected in this browser.</p>
              <p className="wallet-hint">
                Please install or enable MetaMask, OKX Wallet, or Rabby extension.
              </p>
            </div>
          ) : (
            <div className="wallet-options-list" role="list">
              {options.map((opt, index) => (
                <button
                  key={opt.id}
                  ref={index === 0 ? firstButtonRef : undefined}
                  type="button"
                  className="wallet-option-button"
                  onClick={() => connectWallet(opt)}
                  disabled={isConnecting}
                  data-testid={`wallet-option-${opt.rdns}`}
                >
                  <div className="wallet-option-info">
                    {opt.icon ? (
                      <img
                        src={opt.icon}
                        alt=""
                        className="wallet-option-icon"
                        aria-hidden="true"
                        onError={(e) => {
                          // Hide broken icon
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="wallet-option-badge-icon" aria-hidden="true">
                        W
                      </span>
                    )}
                    <span className="wallet-option-name">{opt.name}</span>
                  </div>
                  <span className="wallet-option-tag">
                    {opt.isFallback ? 'Injected' : opt.rdns}
                  </span>
                </button>
              ))}
            </div>
          )}

          {isConnecting && (
            <div className="wallet-connecting-indicator" aria-live="polite">
              <span className="spinner-inline" aria-hidden="true"></span>
              <span>Requesting account and verifying Studionet chain...</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={closeChooser}
            disabled={isConnecting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
