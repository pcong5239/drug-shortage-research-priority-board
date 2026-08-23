import React, { useState, useRef, useEffect } from 'react';
import { useContract } from '../hooks/useContract';
import {
  validateHttpsUri,
  validateSha256Hex,
} from '../services/validation';

interface CreateRoundModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateRoundModal: React.FC<CreateRoundModalProps> = ({ isOpen, onClose }) => {
  const { createRound, txState } = useContract();

  const nowSec = Math.floor(Date.now() / 1000);

  const [snapshotUri, setSnapshotUri] = useState(
    'https://api.fda.gov/download/drug_shortages_snapshot_20260801.json'
  );
  const [snapshotSha256, setSnapshotSha256] = useState(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  const [capturedAt, setCapturedAt] = useState<string>(String(nowSec));
  const [datasetLastUpdated, setDatasetLastUpdated] = useState('2026-08-01');
  const [subsetDescription, setSubsetDescription] = useState(
    'openFDA essential anti-infective and oncology shortages cohort'
  );
  const [rubricVersion, setRubricVersion] = useState('v1.0');
  const [rubricText, setRubricText] = useState(
    'Evaluate research gap, relevance to shortages, urgency signal, and public feasibility (0-4 integer scale).'
  );
  const [disclaimerVersion, setDisclaimerVersion] = useState('v1.0');
  const [submissionDeadlineSec, setSubmissionDeadlineSec] = useState<string>(
    String(nowSec + 86400 * 3)
  );
  const [claimDurationSec, setClaimDurationSec] = useState<string>('3600');
  const [slotCount, setSlotCount] = useState<string>('2');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    const uriCheck = validateHttpsUri(snapshotUri, 'Snapshot URI');
    if (!uriCheck.valid) errs.snapshotUri = uriCheck.error!;

    const hashCheck = validateSha256Hex(snapshotSha256);
    if (!hashCheck.valid) errs.snapshotSha256 = hashCheck.error!;

    const capAtNum = Number(capturedAt);
    const curTime = Math.floor(Date.now() / 1000);
    if (isNaN(capAtNum) || capAtNum <= 0) {
      errs.capturedAt = 'Captured-at must be a positive integer Unix timestamp';
    } else if (capAtNum > curTime + 300) {
      errs.capturedAt = 'Captured-at cannot be in the future';
    } else if (curTime - capAtNum > 7 * 86400) {
      errs.capturedAt = 'Snapshot age exceeds maximum allowed at round creation (7 days)';
    }

    if (!datasetLastUpdated.trim() || datasetLastUpdated.length > 64) {
      errs.datasetLastUpdated = 'Dataset last updated must be 1..64 characters';
    }

    if (!subsetDescription.trim() || subsetDescription.length > 500) {
      errs.subsetDescription = 'Subset description must be 1..500 characters';
    }

    if (!rubricVersion.trim() || rubricVersion.length > 64) {
      errs.rubricVersion = 'Rubric version must be 1..64 characters';
    }

    if (!rubricText.trim() || rubricText.length > 4000) {
      errs.rubricText = 'Rubric text must be 1..4000 characters';
    }

    if (!disclaimerVersion.trim() || disclaimerVersion.length > 64) {
      errs.disclaimerVersion = 'Disclaimer version must be 1..64 characters';
    }

    const deadNum = Number(submissionDeadlineSec);
    if (isNaN(deadNum) || deadNum <= curTime) {
      errs.submissionDeadlineSec = 'Submission deadline must be a future Unix timestamp';
    }

    const claimNum = Number(claimDurationSec);
    if (isNaN(claimNum) || claimNum < 60 || claimNum > 30 * 86400) {
      errs.claimDurationSec = 'Claim duration must be between 60 and 2,592,000 seconds (1 min – 30 days)';
    }

    const slotNum = Number(slotCount);
    if (isNaN(slotNum) || slotNum < 1 || slotNum > 20) {
      errs.slotCount = 'Slot count must be between 1 and 20';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const res = await createRound({
        snapshotUri: snapshotUri.trim(),
        snapshotSha256: snapshotSha256.trim().toLowerCase(),
        capturedAt: Number(capturedAt),
        datasetLastUpdated: datasetLastUpdated.trim(),
        subsetDescription: subsetDescription.trim(),
        rubricVersion: rubricVersion.trim(),
        rubricText: rubricText.trim(),
        disclaimerVersion: disclaimerVersion.trim(),
        submissionDeadline: Number(submissionDeadlineSec),
        claimDuration: Number(claimDurationSec),
        slotCount: Number(slotCount),
      });

      if (res.success) {
        onClose();
      }
    } catch {
      // Error handled via txState
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className="modal-dialog modal-large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-round-title"
      >
        <div className="modal-header">
          <h2 id="create-round-title" className="modal-title">
            Create Research Priority Round
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={isSubmitting}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body form-grid">
          <div className="form-group full-width">
            <label htmlFor="cr-uri">Snapshot HTTPS URI *</label>
            <input
              id="cr-uri"
              ref={firstInputRef}
              type="url"
              className={`input-text ${errors.snapshotUri ? 'input-error' : ''}`}
              value={snapshotUri}
              onChange={(e) => setSnapshotUri(e.target.value)}
              placeholder="https://api.fda.gov/download/snapshot.json"
              required
            />
            <div className="helper-slot">{errors.snapshotUri && <span className="error-text">{errors.snapshotUri}</span>}</div>
          </div>

          <div className="form-group full-width">
            <label htmlFor="cr-hash">Snapshot SHA-256 Digest (64 lowercase hex) *</label>
            <input
              id="cr-hash"
              type="text"
              className={`input-text mono-input ${errors.snapshotSha256 ? 'input-error' : ''}`}
              value={snapshotSha256}
              onChange={(e) => setSnapshotSha256(e.target.value)}
              placeholder="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              required
            />
            <div className="helper-slot">{errors.snapshotSha256 && <span className="error-text">{errors.snapshotSha256}</span>}</div>
          </div>

          <div className="form-group">
            <label htmlFor="cr-captured">Captured-at Timestamp (Unix sec) *</label>
            <input
              id="cr-captured"
              type="number"
              className={`input-text ${errors.capturedAt ? 'input-error' : ''}`}
              value={capturedAt}
              onChange={(e) => setCapturedAt(e.target.value)}
              required
            />
            <div className="helper-slot">{errors.capturedAt && <span className="error-text">{errors.capturedAt}</span>}</div>
          </div>

          <div className="form-group">
            <label htmlFor="cr-updated">Dataset Last Updated *</label>
            <input
              id="cr-updated"
              type="text"
              className={`input-text ${errors.datasetLastUpdated ? 'input-error' : ''}`}
              value={datasetLastUpdated}
              onChange={(e) => setDatasetLastUpdated(e.target.value)}
              placeholder="2026-08-01"
              required
            />
            <div className="helper-slot">{errors.datasetLastUpdated && <span className="error-text">{errors.datasetLastUpdated}</span>}</div>
          </div>

          <div className="form-group full-width">
            <label htmlFor="cr-subset">Canonical Subset Description *</label>
            <input
              id="cr-subset"
              type="text"
              className={`input-text ${errors.subsetDescription ? 'input-error' : ''}`}
              value={subsetDescription}
              onChange={(e) => setSubsetDescription(e.target.value)}
              placeholder="Cohort focus description"
              required
            />
            <div className="helper-slot">{errors.subsetDescription && <span className="error-text">{errors.subsetDescription}</span>}</div>
          </div>

          <div className="form-group">
            <label htmlFor="cr-rubric-ver">Rubric Version *</label>
            <input
              id="cr-rubric-ver"
              type="text"
              className={`input-text ${errors.rubricVersion ? 'input-error' : ''}`}
              value={rubricVersion}
              onChange={(e) => setRubricVersion(e.target.value)}
              required
            />
            <div className="helper-slot">{errors.rubricVersion && <span className="error-text">{errors.rubricVersion}</span>}</div>
          </div>

          <div className="form-group">
            <label htmlFor="cr-disc-ver">Disclaimer Version *</label>
            <input
              id="cr-disc-ver"
              type="text"
              className={`input-text ${errors.disclaimerVersion ? 'input-error' : ''}`}
              value={disclaimerVersion}
              onChange={(e) => setDisclaimerVersion(e.target.value)}
              required
            />
            <div className="helper-slot">{errors.disclaimerVersion && <span className="error-text">{errors.disclaimerVersion}</span>}</div>
          </div>

          <div className="form-group full-width">
            <label htmlFor="cr-rubric-txt">Evaluation Rubric Text *</label>
            <textarea
              id="cr-rubric-txt"
              className={`input-textarea ${errors.rubricText ? 'input-error' : ''}`}
              rows={3}
              value={rubricText}
              onChange={(e) => setRubricText(e.target.value)}
              required
            />
            <div className="helper-slot">{errors.rubricText && <span className="error-text">{errors.rubricText}</span>}</div>
          </div>

          <div className="form-group">
            <label htmlFor="cr-deadline">Submission Deadline (Unix sec) *</label>
            <input
              id="cr-deadline"
              type="number"
              className={`input-text ${errors.submissionDeadlineSec ? 'input-error' : ''}`}
              value={submissionDeadlineSec}
              onChange={(e) => setSubmissionDeadlineSec(e.target.value)}
              required
            />
            <div className="helper-slot">{errors.submissionDeadlineSec && <span className="error-text">{errors.submissionDeadlineSec}</span>}</div>
          </div>

          <div className="form-group">
            <label htmlFor="cr-claim">Claim Duration (Seconds, 60–2592000) *</label>
            <input
              id="cr-claim"
              type="number"
              className={`input-text ${errors.claimDurationSec ? 'input-error' : ''}`}
              value={claimDurationSec}
              onChange={(e) => setClaimDurationSec(e.target.value)}
              required
            />
            <div className="helper-slot">{errors.claimDurationSec && <span className="error-text">{errors.claimDurationSec}</span>}</div>
          </div>

          <div className="form-group">
            <label htmlFor="cr-slots">Research-Review Slot Count (1–20) *</label>
            <input
              id="cr-slots"
              type="number"
              min="1"
              max="20"
              className={`input-text ${errors.slotCount ? 'input-error' : ''}`}
              value={slotCount}
              onChange={(e) => setSlotCount(e.target.value)}
              required
            />
            <div className="helper-slot">{errors.slotCount && <span className="error-text">{errors.slotCount}</span>}</div>
          </div>

          <div className="modal-footer full-width">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || txState.stage === 'SIGNING' || txState.stage === 'SUBMITTED'}
            >
              {isSubmitting ? 'Creating Round...' : 'Create Round on Studionet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
