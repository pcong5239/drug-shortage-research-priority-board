import React from 'react';
import { useContract } from '../hooks/useContract';
import { useWallet } from '../hooks/useWallet';
import { StatusBadge } from './StatusBadge';
import type { SubmissionData } from '../types/contract';

export const QuestionQueue: React.FC = () => {
  const {
    currentRound,
    submissions,
    evaluations,
    allocations,
    selectedSubmissionId,
    setSelectedSubmissionId,
    evaluateSubmission,
    acknowledgeSlot,
    txState,
  } = useContract();

  const { connectedAccount, isCorrectChain } = useWallet();

  if (!currentRound) {
    return (
      <div className="queue-container">
        <div className="queue-empty-message">No active round selected.</div>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="queue-container">
        <div className="queue-empty-message">
          No research questions submitted for Round #{currentRound.round_id} yet.
        </div>
      </div>
    );
  }

  // Sort submissions if allocations exist
  let displaySubmissions: SubmissionData[] = [...submissions];

  if (allocations && currentRound.state !== 'OPEN' && currentRound.state !== 'LOCKED') {
    const allocatedMap = new Map<number, number>();
    allocations.allocated_submission_ids.forEach((id, idx) => allocatedMap.set(id, idx + 1));

    const waitlistedMap = new Map<number, number>();
    allocations.waitlisted_submission_ids.forEach((id, idx) =>
      waitlistedMap.set(id, allocations.allocated_submission_ids.length + idx + 1)
    );

    displaySubmissions.sort((a, b) => {
      const rankA = allocatedMap.get(a.submission_id) ?? waitlistedMap.get(a.submission_id) ?? 999;
      const rankB = allocatedMap.get(b.submission_id) ?? waitlistedMap.get(b.submission_id) ?? 999;
      if (rankA !== rankB) return rankA - rankB;
      return a.submission_id - b.submission_id;
    });
  }

  const isWriting = txState.stage === 'SIGNING' || txState.stage === 'SUBMITTED';

  return (
    <div className="queue-container">
      <div className="queue-header-bar">
        <h3 className="queue-heading">
          Submitted Research Questions ({submissions.length})
        </h3>
        {allocations && (
          <span className="queue-ranking-note">
            Ranked by priority score & deterministic tie-break
          </span>
        )}
      </div>

      <div className="queue-records-wrapper" role="list">
        {displaySubmissions.map((sub, index) => {
          const ev = evaluations[sub.submission_id];
          const isSelected = sub.submission_id === selectedSubmissionId;
          const isReviewer =
            connectedAccount &&
            sub.reviewer_address.toLowerCase() === connectedAccount.toLowerCase();
          const canAcknowledge =
            currentRound.state === 'CLAIM' &&
            sub.status === 'ALLOCATED' &&
            isReviewer &&
            isCorrectChain;

          const canEvaluate =
            currentRound.state === 'LOCKED' &&
            sub.status === 'PENDING' &&
            isCorrectChain;

          return (
            <article
              key={sub.submission_id}
              className={`queue-record-card ${isSelected ? 'record-selected' : ''}`}
              onClick={() => setSelectedSubmissionId(sub.submission_id)}
              role="listitem"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedSubmissionId(sub.submission_id);
                }
              }}
              data-testid={`question-item-${sub.submission_id}`}
            >
              <div className="record-header">
                <div className="record-identity">
                  {allocations && (
                    <span className="rank-badge" title="Deterministic Queue Rank">
                      #{index + 1}
                    </span>
                  )}
                  <span className="record-sub-id">ID: #{sub.submission_id}</span>
                  <StatusBadge status={sub.status} />
                </div>

                {ev && ev.outcome === 'SCORED' && (
                  <div className="record-score-badge" title="Consensus Total Score / 16">
                    <span className="score-label">Score:</span>
                    <span className="score-val">{ev.total_score}</span>
                    <span className="score-max">/16</span>
                  </div>
                )}
              </div>

              <p className="record-question-text">{sub.question_text}</p>

              <div className="record-footer">
                <div className="record-meta-chips">
                  <span className="chip-key" title="Canonical Subject Key">
                    Key: {sub.canonical_subject_key}
                  </span>
                  <span className="chip-urls" title="Evidence Citations">
                    {sub.evidence_urls.length} Citations
                  </span>
                  {sub.reviewer_address && (
                    <span className="chip-reviewer" title="Reviewer Address">
                      Reviewer: {sub.reviewer_address.slice(0, 6)}…{sub.reviewer_address.slice(-4)}
                    </span>
                  )}
                </div>

                <div className="record-row-actions" onClick={(e) => e.stopPropagation()}>
                  {canEvaluate && (
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => evaluateSubmission(currentRound.round_id, sub.submission_id)}
                      disabled={isWriting}
                      title="Run consensus evidence fetch and LLM scoring for this submission"
                    >
                      Evaluate
                    </button>
                  )}

                  {canAcknowledge && (
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => acknowledgeSlot(currentRound.round_id, sub.submission_id)}
                      disabled={isWriting}
                      title="Acknowledge your allocated research-review slot"
                    >
                      Acknowledge Slot
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
