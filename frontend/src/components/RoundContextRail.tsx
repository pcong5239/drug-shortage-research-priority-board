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
  const [isCopied, setIsCopied] = useState(false);

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

  const copyDigest = (digest: string) => {
    navigator.clipboard.writeText(digest);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const STAGES = ['OPEN', 'LOCKED', 'EVALUATED', 'ALLOCATED', 'CLAIM', 'FINAL'];

  const STAGE_DESCRIPTIONS: Record<string, string> = {
    OPEN: 'Accepting research question submissions with public evidence citations',
    LOCKED: 'Cohort locked; GenLayer validators running consensus evidence evaluation',
    EVALUATED: 'All submissions evaluated; ready for deterministic slot allocation',
    ALLOCATED: 'Slots allocated; awaiting reviewer claim acknowledgments',
    CLAIM: 'Claim window active; unacknowledged slots subject to timeout reclaim',
    FINAL: 'Round finalized; allocation results permanently recorded on-chain',
  };

  return (
    <aside className="round-context-rail" aria-label="Round Context and Snapshot Provenance">
      <div className="rail-header">
        <div className="rail-title-row">
          <div className="rail-heading-group">
            <h2 className="rail-title">Cohort Rounds</h2>
            <span className="rail-count-badge">
              {roundCount} {roundCount === 1 ? 'Round' : 'Rounds'} Total
            </span>
          </div>
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
              Active Round Selection:
            </label>
            <div className="select-container">
              <select
                id="round-selector"
                className="select-dropdown"
                value={selectedRoundId || ''}
                onChange={(e) => setSelectedRoundId(Number(e.target.value))}
                disabled={isLoading}
              >
                {Array.from({ length: roundCount }, (_, i) => i + 1).map((rId) => (
                  <option key={rId} value={rId}>
                    Cohort Round #{rId}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="empty-rail-message">
            {isContractConfigured
              ? 'No research priority rounds created yet. Click "+ New Round" to initialize.'
              : 'Contract address not configured.'}
          </div>
        )}
      </div>

      {currentRound && (
        <div className="rail-content">
          <div className="round-summary-card">
            <div className="card-top-row">
              <div className="round-identifier-block">
                <span className="round-id-tag">Round #{currentRound.round_id}</span>
                <span className="round-slots-pill">
                  {currentRound.slot_count} Review Slots
                </span>
              </div>
              <StatusBadge status={currentRound.state} type="round" />
            </div>

            <div className="timeline-block">
              <div className="timeline-header">
                <span className="meta-label">Consensus Stage Progression:</span>
                <span className="stage-desc-hint">
                  {STAGE_DESCRIPTIONS[currentRound.state] || currentRound.state}
                </span>
              </div>
              <div className="stage-steps" aria-label="Stage Timeline">
                {STAGES.map((stg, idx) => {
                  const isCurrent = currentRound.state === stg;
                  const isPast = STAGES.indexOf(currentRound.state) > idx;
                  return (
                    <div
                      key={stg}
                      className={`stage-pill ${isCurrent ? 'stage-current' : ''} ${
                        isPast ? 'stage-past' : ''
                      }`}
                      title={`Stage ${idx + 1}/6: ${stg}`}
                    >
                      <span className="stage-num">{idx + 1}</span>
                      <span className="stage-name">{stg}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="meta-divider"></div>

            <div className="meta-grid">
              <div className="meta-item full-width-item">
                <span className="meta-label">Frozen openFDA Snapshot Source:</span>
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

              <div className="meta-item full-width-item">
                <div className="label-with-action">
                  <span className="meta-label">SHA-256 Digest:</span>
                  <button
                    type="button"
                    className="btn-copy-digest"
                    onClick={() => copyDigest(currentRound.snapshot_sha256)}
                    title="Copy full SHA-256 digest"
                  >
                    {isCopied ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
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

              <div className="meta-item full-width-item">
                <span className="meta-label">Canonical Subset Scope:</span>
                <p className="meta-val-block">{currentRound.subset_description}</p>
              </div>

              <div className="meta-divider full-width-item"></div>

              <div className="meta-item">
                <span className="meta-label">Review Slots:</span>
                <span className="meta-val font-bold highlight-val">
                  {currentRound.slot_count} Slots
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Submission Deadline:</span>
                <span className="meta-val">{formatDate(currentRound.submission_deadline)}</span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Claim Window Duration:</span>
                <span className="meta-val">
                  {Math.round(currentRound.claim_duration / 60)} min ({currentRound.claim_duration}s)
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Rubric / Disclaimer:</span>
                <span className="meta-val">
                  {currentRound.rubric_version} / {currentRound.disclaimer_version}
                </span>
              </div>

              <div className="meta-item full-width-item">
                <span className="meta-label">Round Creator:</span>
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
