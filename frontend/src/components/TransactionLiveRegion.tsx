import React from 'react';
import { useContract } from '../hooks/useContract';

export const TransactionLiveRegion: React.FC = () => {
  const { txState, resetTxState, refreshData } = useContract();

  if (txState.stage === 'IDLE') {
    return (
      <div
        className="sr-only"
        role="region"
        aria-label="Transaction Status Announcements"
        aria-live="polite"
        aria-atomic="true"
      />
    );
  }

  const stageOrder = [
    'SIGNING',
    'SUBMITTED',
    'CONSENSUS',
    'FINALIZED',
    'EXECUTION_SUCCESS',
    'READBACK_CONFIRMED',
  ];

  const currentStageIndex = stageOrder.indexOf(txState.stage);

  return (
    <section
      className={`transaction-panel ${txState.stage === 'ERROR' ? 'tx-error' : 'tx-active'}`}
      role="region"
      aria-label="Transaction Execution Status"
      aria-live="polite"
    >
      <div className="tx-header">
        <div className="tx-title-group">
          <span className="tx-action-name">{txState.actionName || 'On-chain Operation'}</span>
          <span className="tx-stage-badge" data-stage={txState.stage}>
            {txState.stage}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={resetTxState}
          aria-label="Dismiss transaction panel"
        >
          Dismiss
        </button>
      </div>

      <div className="tx-pipeline-track" aria-hidden="true">
        {stageOrder.map((stageName, idx) => {
          const isDone = currentStageIndex >= idx && txState.stage !== 'ERROR';
          const isCurrent = txState.stage === stageName;
          return (
            <div
              key={stageName}
              className={`pipeline-step ${isDone ? 'step-done' : ''} ${
                isCurrent ? 'step-current' : ''
              }`}
            >
              <span className="step-dot"></span>
              <span className="step-label">{stageName.replace('_', ' ')}</span>
            </div>
          );
        })}
      </div>

      <div className="tx-body">
        {txState.details && <p className="tx-details-text">{txState.details}</p>}

        {txState.txHash && (
          <div className="tx-hash-row">
            <span className="meta-label">Transaction Hash:</span>
            <code className="mono-hash" title={txState.txHash}>
              {txState.txHash}
            </code>
          </div>
        )}

        {txState.returnedId !== null && txState.returnedId !== undefined && (
          <div className="tx-returned-row">
            <span className="meta-label">Returned Identifier:</span>
            <span className="mono-value">#{String(txState.returnedId)}</span>
          </div>
        )}

        {txState.error && (
          <div className="tx-error-box" role="alert">
            <strong>Error:</strong> {txState.error}
            <div className="tx-reconcile-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  await refreshData();
                }}
              >
                Reconcile On-chain State
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
