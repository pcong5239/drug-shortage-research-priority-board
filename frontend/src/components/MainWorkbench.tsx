import React, { useState } from 'react';
import { useContract } from '../hooks/useContract';
import { useWallet } from '../hooks/useWallet';
import { QuestionQueue } from './QuestionQueue';
import { SubmitQuestionModal } from './SubmitQuestionModal';
import { TransactionLiveRegion } from './TransactionLiveRegion';

export const MainWorkbench: React.FC = () => {
  const {
    currentRound,
    callerStatus,
    submissions,
    lockRound,
    allocateSlots,
    reclaimExpiredSlots,
    finalizeRound,
    isContractConfigured,
    isLoading,
    error,
    refreshData,
    txState,
  } = useContract();

  const { connectedAccount, isCorrectChain } = useWallet();

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [showTrustDetails, setShowTrustDetails] = useState(false);

  if (!isContractConfigured) {
    return (
      <main className="main-workbench" role="main">
        <div className="workbench-banner-state state-unconfigured">
          <div className="banner-state-icon" aria-hidden="true">⚠️</div>
          <h2>Intelligent Contract Not Configured</h2>
          <p>
            The environment variable <code>VITE_GENLAYER_CONTRACT_ADDRESS</code> is not set or empty.
            To connect to an active contract on GenLayer Studionet, specify a valid contract address in your <code>.env</code> file.
          </p>
        </div>
      </main>
    );
  }

  if (error && !currentRound) {
    return (
      <main className="main-workbench" role="main">
        <div className="workbench-banner-state state-error" role="alert">
          <div className="banner-state-icon" aria-hidden="true">⚠️</div>
          <h2>Unable to Load Studionet State</h2>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => refreshData()} disabled={isLoading}>
            {isLoading ? 'Retrying…' : 'Retry On-chain Readback'}
          </button>
        </div>
      </main>
    );
  }

  if (!currentRound) {
    return (
      <main className="main-workbench" role="main">
        <div className="workbench-banner-state state-empty">
          <div className="banner-state-icon" aria-hidden="true">📋</div>
          <h2>No Research Priority Round Selected</h2>
          <p>Create a new round using the round controls or select an existing round from the dropdown above.</p>
        </div>
      </main>
    );
  }

  const isWriting = !['IDLE', 'ERROR', 'READBACK_CONFIRMED'].includes(txState.stage);

  // Stage checks
  const isOpen = currentRound.state === 'OPEN';
  const isLocked = currentRound.state === 'LOCKED';
  const isEvaluated = currentRound.state === 'EVALUATED';
  const isClaimOrAllocated = currentRound.state === 'CLAIM' || currentRound.state === 'ALLOCATED';
  const isFinal = currentRound.state === 'FINAL';

  const isCreator =
    connectedAccount &&
    currentRound.creator.toLowerCase() === connectedAccount.toLowerCase();

  const canLock = Boolean(callerStatus?.can_lock || (isCreator && submissions.length > 0));

  const evalProgress =
    currentRound.submission_count > 0
      ? Math.round((currentRound.evaluated_count / currentRound.submission_count) * 100)
      : 0;

  return (
    <main className="main-workbench" role="main">
      <TransactionLiveRegion />

      {error && (
        <div className="tx-error-box" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => refreshData()} disabled={isLoading}>
            {isLoading ? 'Retrying…' : 'Retry On-chain Readback'}
          </button>
        </div>
      )}

      {/* Judge & Trust Model Explainer Card */}
      <section className="trust-model-banner" aria-label="GenLayer Trust & Consensus Model">
        <div className="trust-header">
          <div className="trust-title-group">
            <span className="trust-shield-icon" aria-hidden="true">🛡️</span>
            <div className="trust-titles">
              <h3 className="trust-heading">Decentralized Evidence Scoring via GenLayer Consensus</h3>
              <p className="trust-subheading">
                Resolving intake self-interest: neither submitters nor round creators can unilaterally rank questions.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-toggle-trust"
            onClick={() => setShowTrustDetails(!showTrustDetails)}
            aria-expanded={showTrustDetails}
          >
            {showTrustDetails ? 'Hide Trust Model' : 'How Consensus Works'}
          </button>
        </div>

        {showTrustDetails && (
          <div className="trust-details-grid">
            <div className="trust-step-card">
              <div className="step-badge">1. Evidence Freeze</div>
              <p>Each round freezes an openFDA snapshot digest and 1–5 PubMed/HTTPS citations per question.</p>
            </div>
            <div className="trust-step-card">
              <div className="step-badge">2. Validator Refetch</div>
              <p>GenLayer validators independently refetch frozen citations and verify the SHA-256 snapshot hash.</p>
            </div>
            <div className="trust-step-card">
              <div className="step-badge">3. 16-Point Rubric</div>
              <p>Validators derive 0–4 integer scores for Urgency Signal, Evidence Gap, Relevance, and Feasibility.</p>
            </div>
            <div className="trust-step-card">
              <div className="step-badge">4. Deterministic Ranking</div>
              <p>Total score descending &rarr; Urgency descending &rarr; Gap descending &rarr; ID ascending.</p>
            </div>
          </div>
        )}
      </section>

      {/* Stage Actions Panel */}
      <section className="stage-actions-panel" aria-label="Current Stage Actions">
        <div className="stage-actions-header">
          <div className="stage-info">
            <span className="meta-label">Active Workflow Stage:</span>
            <h2 className="stage-title">
              {isOpen && 'Round Open — Accepting Research Questions'}
              {isLocked && 'Round Locked — Consensus Evidence Evaluation'}
              {isEvaluated && 'Evaluation Complete — Ready for Slot Allocation'}
              {isClaimOrAllocated && 'Claim Window Active — Acknowledgment & Expiry'}
              {isFinal && 'Round Finalized — Immutable Allocation Archive'}
            </h2>
          </div>

          <div className="stage-buttons-cluster">
            {isOpen && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsSubmitModalOpen(true)}
                  disabled={!isCorrectChain || !connectedAccount || isWriting}
                  data-testid="submit-question-trigger"
                >
                  + Submit Research Question
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => lockRound(currentRound.round_id)}
                  disabled={!canLock || !isCorrectChain || isWriting}
                  title={
                    canLock
                      ? 'Lock cohort to begin consensus evaluation'
                      : 'Locking requires creator permissions or post-deadline status with submissions'
                  }
                >
                  Lock Round Cohort
                </button>
              </>
            )}

            {isLocked && (
              <div className="eval-progress-cluster">
                <div className="eval-progress-bar-bg">
                  <div
                    className="eval-progress-bar-fill"
                    style={{ width: `${evalProgress}%` }}
                    aria-valuenow={evalProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <span className="eval-counter">
                  Evaluated: <strong>{currentRound.evaluated_count}</strong> /{' '}
                  <strong>{currentRound.submission_count}</strong> questions ({evalProgress}%)
                </span>
              </div>
            )}

            {isEvaluated && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => allocateSlots(currentRound.round_id)}
                disabled={!isCorrectChain || !connectedAccount || isWriting}
              >
                Allocate {currentRound.slot_count} Research-Review Slots
              </button>
            )}

            {isClaimOrAllocated && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => reclaimExpiredSlots(currentRound.round_id)}
                  disabled={!isCorrectChain || !connectedAccount || !callerStatus?.can_reclaim || isWriting}
                  title="Reclaim unacknowledged slots whose claim deadline has passed"
                >
                  Reclaim Expired Slots
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => finalizeRound(currentRound.round_id)}
                  disabled={!isCorrectChain || !connectedAccount || !callerStatus?.can_finalize || isWriting}
                  title="Finalize round when all slots are acknowledged or waitlist is exhausted"
                >
                  Finalize Round
                </button>
              </>
            )}

            {isFinal && (
              <div className="finalized-stamp">
                <span className="stamp-icon">✓</span> Round Finalized ({currentRound.slot_count} Slots Allocated)
              </div>
            )}
          </div>
        </div>

        <div className="stage-explanation-text">
          {isOpen && (
            <p>
              Submitters may submit research questions with 1–5 HTTPS public evidence citations.
              The cohort creator may lock the round early if questions exist; after the deadline, locking is permissionless.
            </p>
          )}
          {isLocked && (
            <p>
              Independent GenLayer validators refetch frozen openFDA snapshots and PubMed citations to derive integer scores (0–4) and reason codes. Click <strong>Evaluate</strong> on any pending question below to process.
            </p>
          )}
          {isEvaluated && (
            <p>
              All submissions have terminal evaluation outcomes. Allocation executes deterministic ranking by total score descending, urgency signal descending, evidence gap descending, and submission ID ascending.
            </p>
          )}
          {isClaimOrAllocated && (
            <p>
              Designated reviewers must acknowledge allocated slots before their claim deadline expires. Unacknowledged expired slots can be reclaimed to promote the next eligible waitlisted candidate.
            </p>
          )}
          {isFinal && (
            <p>
              All available slots have been acknowledged or waitlist candidates exhausted. Round results and provenance hashes are permanently frozen on GenLayer Studionet.
            </p>
          )}
        </div>
      </section>

      <QuestionQueue />

      <SubmitQuestionModal
        isOpen={isSubmitModalOpen}
        roundId={currentRound.round_id}
        onClose={() => setIsSubmitModalOpen(false)}
      />
    </main>
  );
};
