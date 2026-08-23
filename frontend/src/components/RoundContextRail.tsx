import React, { useState } from 'react';
import { useContract } from '../hooks/useContract';
import { StatusBadge } from './StatusBadge';
import { CreateRoundModal } from './CreateRoundModal';

export const RoundContextRail: React.FC = () => {
  const {
    roundCount,
    selectedRoundId,
    setSelectedRoundId,
    currentRound,
    isLoading,
    isContractConfigured,
  } = useContract();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '—';
    return new Date(timestamp * 1000).toLocaleString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  const STAGES = ['OPEN', 'LOCKED', 'EVALUATED', 'ALLOCATED', 'CLAIM', 'FINAL'];

  return (
    <aside className="round-context-rail" aria-label="Round Context and Snapshot Provenance">
      <div className="rail-header">
        <div className="rail-title-row">
          <h2 className="rail-title">Cohort Rounds</h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIsCreateModalOpen(true)}
            disabled={!isContractConfigured}
            data-testid="create-round-trigger"
          >
            + New Round
          </button>
        </div>

        {roundCount > 0 ? (
          <div className="round-selector-wrapper">
            <label htmlFor="round-selector" className="meta-label">
              Select Active Round:
            </label>
            <select
              id="round-selector"
              className="select-dropdown"
              value={selectedRoundId || ''}
              onChange={(e) => setSelectedRoundId(Number(e.target.value))}
              disabled={isLoading}
            >
              {Array.from({ length: roundCount }, (_, i) => i + 1).map((rId) => (
                <option key={rId} value={rId}>
                  Round #{rId}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="empty-rail-message">
            {isContractConfigured
              ? 'No research priority rounds created yet.'
              : 'Contract address not configured.'}
          </div>
        )}
      </div>

      {currentRound && (
        <div className="rail-content">
          <div className="round-summary-card">
            <div className="card-top-row">
              <span className="round-id-tag">Round #{currentRound.round_id}</span>
              <StatusBadge status={currentRound.state} type="round" />
            </div>

            <div className="timeline-block">
              <span className="meta-label">Stage Progression:</span>
              <div className="stage-steps" aria-label="Stage Timeline">
                {STAGES.map((stg) => {
                  const isCurrent = currentRound.state === stg;
                  const isPast = STAGES.indexOf(currentRound.state) > STAGES.indexOf(stg);
                  return (
                    <div
                      key={stg}
                      className={`stage-pill ${isCurrent ? 'stage-current' : ''} ${
                        isPast ? 'stage-past' : ''
                      }`}
                      title={`Stage: ${stg}`}
                    >
                      {stg}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="meta-divider"></div>

            <div className="meta-list">
              <div className="meta-item">
                <span className="meta-label">Snapshot Source:</span>
                <a
                  href={currentRound.snapshot_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="meta-link wrap-break"
                  title="Open openFDA frozen snapshot URL"
                >
                  {currentRound.snapshot_uri}
                </a>
              </div>

              <div className="meta-item">
                <span className="meta-label">SHA-256 Digest:</span>
                <code className="mono-hash wrap-break" title={currentRound.snapshot_sha256}>
                  {currentRound.snapshot_sha256}
                </code>
              </div>

              <div className="meta-item">
                <span className="meta-label">Captured Timestamp:</span>
                <span className="meta-val">{formatDate(currentRound.captured_at)}</span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Dataset Last Updated:</span>
                <span className="meta-val">{currentRound.dataset_last_updated || '—'}</span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Subset Focus:</span>
                <p className="meta-val-block">{currentRound.subset_description}</p>
              </div>

              <div className="meta-divider"></div>

              <div className="meta-item">
                <span className="meta-label">Available Slots:</span>
                <span className="meta-val font-bold">
                  {currentRound.slot_count} Research-Review Slots
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Submission Deadline:</span>
                <span className="meta-val">{formatDate(currentRound.submission_deadline)}</span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Claim Duration:</span>
                <span className="meta-val">
                  {Math.round(currentRound.claim_duration / 60)} minutes (
                  {currentRound.claim_duration}s)
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Rubric / Disclaimer:</span>
                <span className="meta-val">
                  {currentRound.rubric_version} / {currentRound.disclaimer_version}
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Creator Address:</span>
                <code className="mono-hash wrap-break">{currentRound.creator}</code>
              </div>
            </div>
          </div>
        </div>
      )}

      <CreateRoundModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </aside>
  );
};
