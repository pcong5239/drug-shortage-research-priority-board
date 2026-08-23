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
    txState,
  } = useContract();

  const { connectedAccount, isCorrectChain } = useWallet();

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  if (!isContractConfigured) {
    return (
      <main className="main-workbench" role="main">
        <div className="workbench-banner-state state-unconfigured">
          <h2>Intelligent Contract Not Configured</h2>
          <p>
            The environment variable <code>VITE_GENLAYER_CONTRACT_ADDRESS</code> is not set or empty.
            To connect to an active contract on GenLayer Studionet, specify a valid contract address in your <code>.env</code> file.
          </p>
        </div>
      </main>
    );
  }

  if (!currentRound) {
    return (
      <main className="main-workbench" role="main">
        <div className="workbench-banner-state state-empty">
          <h2>No Research Priority Round Selected</h2>
          <p>Create a new round using the left context rail or select an existing round from the dropdown.</p>
        </div>
      </main>
    );
  }

  const isWriting = txState.stage === 'SIGNING' || txState.stage === 'SUBMITTED';

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

  return (
    <main className="main-workbench" role="main">
      <TransactionLiveRegion />

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
                <span className="eval-counter">
                  Evaluated: <strong>{currentRound.evaluated_count}</strong> /{' '}
                  <strong>{currentRound.submission_count}</strong> questions
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
                  disabled={!isCorrectChain || !connectedAccount || isWriting}
                  title="Reclaim unacknowledged slots whose claim deadline has passed"
                >
                  Reclaim Expired Slots
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => finalizeRound(currentRound.round_id)}
                  disabled={!isCorrectChain || !connectedAccount || isWriting}
                  title="Finalize round when all slots are acknowledged or waitlist is exhausted"
                >
                  Finalize Round
                </button>
              </>
            )}

            {isFinal && (
              <div className="finalized-stamp">
                ✓ Round Finalized ({currentRound.slot_count} Slots Allocated)
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
