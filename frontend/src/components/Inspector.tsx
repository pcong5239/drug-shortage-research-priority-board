import React, { useEffect, useRef } from 'react';
import { useContract } from '../hooks/useContract';
import { StatusBadge } from './StatusBadge';

const REASON_CODE_LABELS: Record<string, string> = {
  RELEVANT_SHORTAGE_PRIORITY: 'Relevant Shortage Research Priority',
  SIGNIFICANT_URGENCY_SIGNAL: 'Significant Public Urgency Signal',
  CRITICAL_EVIDENCE_GAP: 'Critical Evidence Gap in Published Literature',
  HIGH_RESEARCH_FEASIBILITY: 'High Public Research Feasibility',
  LOW_RELEVANCE: 'Low Direct Shortage Relevance',
  MINIMAL_EVIDENCE_GAP: 'Minimal or Redundant Evidence Gap',
  LOW_URGENCY_SIGNAL: 'Low Urgency Signal',
  LOW_FEASIBILITY: 'Low Execution Feasibility',
  SNAPSHOT_DIGEST_MISMATCH: 'Snapshot Digest Verification Mismatch',
  SNAPSHOT_STALE: 'Frozen Snapshot Dataset Stale at Evaluation Time',
  EVIDENCE_FETCH_FAILED: 'External Evidence Fetch Failed',
  MATERIAL_EVIDENCE_CONFLICT: 'Material Evidence Conflict Across Citations',
  MALFORMED_EVALUATION: 'Malformed Validator Evaluation Schema',
  OUT_OF_SCOPE_QUESTION: 'Question is Out of Public Shortage Scope',
};

export const Inspector: React.FC = () => {
  const {
    submissions,
    evaluations,
    selectedSubmissionId,
    setSelectedSubmissionId,
  } = useContract();

  const drawerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const selectedSub = submissions.find((s) => s.submission_id === selectedSubmissionId);
  const selectedEval = selectedSubmissionId ? evaluations[selectedSubmissionId] : null;

  // Keyboard accessibility: Close inspector on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedSubmissionId !== null) {
        setSelectedSubmissionId(null);
        return;
      }
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    if (selectedSubmissionId !== null) {
      openerRef.current = document.activeElement as HTMLElement | null;
      window.addEventListener('keydown', handleKeyDown);
      // Focus close button on open
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      openerRef.current?.focus();
    };
  }, [selectedSubmissionId, setSelectedSubmissionId]);

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

  if (!selectedSub) return null;

  return (
    <>
      <div
        className="inspector-backdrop"
        onClick={() => setSelectedSubmissionId(null)}
        aria-hidden="true"
      />

      <aside
        ref={drawerRef}
        className="evidence-inspector-drawer drawer-open"
        aria-label="Evidence and Evaluation Inspector"
        aria-modal="true"
        role="dialog"
      >
        <div className="inspector-header">
          <div className="inspector-title-group">
            <h2 className="inspector-title">Evidence Inspector</h2>
            <span className="inspector-sub-id">Submission #{selectedSub.submission_id}</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn-close-inspector"
            onClick={() => setSelectedSubmissionId(null)}
            title="Close inspector (Esc)"
            aria-label="Close inspector"
          >
            ✕ Close
          </button>
        </div>

        <div className="inspector-content">
            <div className="inspector-section">
              <div className="inspector-status-row">
                <span className="meta-label">Current Status:</span>
                <StatusBadge status={selectedSub.status} />
              </div>

              <h3 className="inspector-question-title">{selectedSub.question_text}</h3>

              <div className="inspector-meta-grid">
                <div className="meta-item full-width-item">
                  <span className="meta-label">Canonical Subject Key:</span>
                  <code className="mono-value wrap-break">{selectedSub.canonical_subject_key}</code>
                </div>

                <div className="meta-item">
                  <span className="meta-label">Submitter Address:</span>
                  <code className="mono-hash wrap-break">{selectedSub.submitter}</code>
                </div>

                <div className="meta-item">
                  <span className="meta-label">Designated Reviewer:</span>
                  <code className="mono-hash wrap-break">{selectedSub.reviewer_address}</code>
                </div>

                <div className="meta-item full-width-item">
                  <span className="meta-label">Submission Timestamp:</span>
                  <span className="meta-val">{formatDate(selectedSub.submitted_at)}</span>
                </div>
              </div>
            </div>

            <div className="inspector-section">
              <h4 className="section-subtitle">
                Evidence Citations ({selectedSub.evidence_urls.length})
              </h4>
              <ul className="evidence-urls-list">
                {selectedSub.evidence_urls.map((url, idx) => (
                  <li key={idx} className="evidence-url-item">
                    <span className="url-index">[{idx + 1}]</span>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="meta-link wrap-break"
                      title={`Open evidence reference: ${url}`}
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {selectedEval ? (
              <div className="inspector-section evaluation-details-card">
                <div className="section-header-row">
                  <h4 className="section-subtitle">Consensus Evaluation</h4>
                  <div className={`outcome-pill outcome-${selectedEval.outcome.toLowerCase()}`}>
                    {selectedEval.outcome}
                  </div>
                </div>

                {selectedEval.outcome === 'SCORED' && (
                  <div className="score-matrix">
                    <div className="total-score-card">
                      <span className="total-score-label">Total Priority Score</span>
                      <div className="score-display">
                        <span className="total-score-number">{selectedEval.total_score}</span>
                        <span className="total-score-scale">/ 16</span>
                      </div>
                    </div>

                    <div className="criteria-grid">
                      <div className="criteria-row">
                        <div className="criteria-label-row">
                          <span className="criteria-name">Shortage Relevance</span>
                          <span className="criteria-bar-val">{selectedEval.relevance} / 4</span>
                        </div>
                        <div className="score-meter-bg">
                          <div
                            className="score-meter-fill"
                            style={{ width: `${(selectedEval.relevance / 4) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div className="criteria-row">
                        <div className="criteria-label-row">
                          <span className="criteria-name">Evidence Gap</span>
                          <span className="criteria-bar-val">{selectedEval.evidence_gap} / 4</span>
                        </div>
                        <div className="score-meter-bg">
                          <div
                            className="score-meter-fill"
                            style={{ width: `${(selectedEval.evidence_gap / 4) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div className="criteria-row">
                        <div className="criteria-label-row">
                          <span className="criteria-name">Urgency Signal</span>
                          <span className="criteria-bar-val">{selectedEval.urgency_signal} / 4</span>
                        </div>
                        <div className="score-meter-bg">
                          <div
                            className="score-meter-fill"
                            style={{ width: `${(selectedEval.urgency_signal / 4) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div className="criteria-row">
                        <div className="criteria-label-row">
                          <span className="criteria-name">Research Feasibility</span>
                          <span className="criteria-bar-val">{selectedEval.feasibility} / 4</span>
                        </div>
                        <div className="score-meter-bg">
                          <div
                            className="score-meter-fill"
                            style={{ width: `${(selectedEval.feasibility / 4) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="meta-item">
                  <span className="meta-label">Stored Reason Codes:</span>
                  <div className="reason-codes-tags">
                    {selectedEval.reason_codes.map((code) => (
                      <span key={code} className="reason-tag" title={`Stored Code: ${code}`}>
                        {REASON_CODE_LABELS[code] || code}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="meta-item">
                  <span className="meta-label">Validator Consensus Rationale:</span>
                  <blockquote className="rationale-quote">{selectedEval.rationale}</blockquote>
                </div>

                <div className="meta-item">
                  <span className="meta-label">Source Provenance:</span>
                  <code className="mono-value wrap-break">{selectedEval.source_provenance}</code>
                </div>

                <div className="meta-item">
                  <span className="meta-label">Evaluated Timestamp:</span>
                  <span className="meta-val">{formatDate(selectedEval.evaluated_at)}</span>
                </div>
              </div>
            ) : (
              <div className="inspector-section un-evaluated-card">
                <span className="meta-label">Evaluation State:</span>
                <p className="meta-val-block">
                  This question is pending leader fetch and consensus validation by GenLayer validators once the cohort is locked.
                </p>
              </div>
            )}

            {(selectedSub.status === 'ALLOCATED' ||
              selectedSub.status === 'ACKNOWLEDGED' ||
              selectedSub.status === 'EXPIRED') && (
              <div className="inspector-section allocation-state-card">
                <h4 className="section-subtitle">Slot Claim &amp; Reviewer State</h4>

                {selectedSub.allocated_at > 0 && (
                  <div className="meta-item">
                    <span className="meta-label">Allocated Timestamp:</span>
                    <span className="meta-val">{formatDate(selectedSub.allocated_at)}</span>
                  </div>
                )}

                {selectedSub.claim_deadline > 0 && (
                  <div className="meta-item">
                    <span className="meta-label">Claim Deadline:</span>
                    <span className="meta-val">{formatDate(selectedSub.claim_deadline)}</span>
                  </div>
                )}

                {selectedSub.acknowledged_at > 0 && (
                  <>
                    <div className="meta-item">
                      <span className="meta-label">Acknowledged By:</span>
                      <code className="mono-hash wrap-break">{selectedSub.acknowledged_by}</code>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Acknowledged Timestamp:</span>
                      <span className="meta-val">{formatDate(selectedSub.acknowledged_at)}</span>
                    </div>
                  </>
                )}

                {selectedSub.expired_at > 0 && (
                  <div className="meta-item">
                    <span className="meta-label">Expired Timestamp:</span>
                    <span className="meta-val">{formatDate(selectedSub.expired_at)}</span>
                  </div>
                )}
              </div>
            )}
        </div>
      </aside>
    </>
  );
};
