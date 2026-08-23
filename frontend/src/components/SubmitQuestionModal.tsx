import React, { useState, useRef, useEffect } from 'react';
import { useContract } from '../hooks/useContract';
import { useWallet } from '../hooks/useWallet';
import {
  validateQuestionText,
  validateCanonicalSubjectKey,
  validateHttpsUri,
  validateEthereumAddress,
} from '../services/validation';

interface SubmitQuestionModalProps {
  isOpen: boolean;
  roundId: number;
  onClose: () => void;
}

export const SubmitQuestionModal: React.FC<SubmitQuestionModalProps> = ({
  isOpen,
  roundId,
  onClose,
}) => {
  const { submitQuestion, txState } = useContract();
  const { connectedAccount } = useWallet();

  const [questionText, setQuestionText] = useState(
    'What are alternative formulation options for pediatric amoxicillin shortages?'
  );
  const [canonicalSubjectKey, setCanonicalSubjectKey] = useState(
    'amoxicillin-pediatric-suspension'
  );
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([
    'https://pubmed.ncbi.nlm.nih.gov/38901234/',
  ]);
  const [reviewerAddress, setReviewerAddress] = useState<string>('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const firstInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (connectedAccount && !reviewerAddress) {
        setReviewerAddress(connectedAccount);
      }
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, connectedAccount, reviewerAddress]);

  if (!isOpen) return null;

  const handleAddUrl = () => {
    if (evidenceUrls.length < 5) {
      setEvidenceUrls([...evidenceUrls, '']);
    }
  };

  const handleRemoveUrl = (index: number) => {
    if (evidenceUrls.length > 1) {
      setEvidenceUrls(evidenceUrls.filter((_, i) => i !== index));
    }
  };

  const handleUrlChange = (index: number, val: string) => {
    const updated = [...evidenceUrls];
    updated[index] = val;
    setEvidenceUrls(updated);
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    const qCheck = validateQuestionText(questionText);
    if (!qCheck.valid) errs.questionText = qCheck.error!;

    const keyCheck = validateCanonicalSubjectKey(canonicalSubjectKey);
    if (!keyCheck.valid) errs.canonicalSubjectKey = keyCheck.error!;

    if (evidenceUrls.length < 1 || evidenceUrls.length > 5) {
      errs.evidenceUrls = 'Must provide between 1 and 5 evidence URLs';
    } else {
      for (let i = 0; i < evidenceUrls.length; i++) {
        const uCheck = validateHttpsUri(evidenceUrls[i], `Evidence URL #${i + 1}`);
        if (!uCheck.valid) {
          errs[`evidenceUrl_${i}`] = uCheck.error!;
        }
      }
    }

    if (reviewerAddress.trim()) {
      const addrCheck = validateEthereumAddress(reviewerAddress);
      if (!addrCheck.valid) errs.reviewerAddress = addrCheck.error!;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const res = await submitQuestion({
        roundId,
        questionText: questionText.trim(),
        canonicalSubjectKey: canonicalSubjectKey.trim(),
        evidenceUrls: evidenceUrls.map((u) => u.trim()),
        reviewerAddress: reviewerAddress.trim().toLowerCase() || connectedAccount || '',
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
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-question-title"
      >
        <div className="modal-header">
          <h2 id="submit-question-title" className="modal-title">
            Submit Question to Round #{roundId}
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

        <form onSubmit={handleSubmit} className="modal-body form-stack">
          <div className="form-group">
            <label htmlFor="sq-text">Research Question Text (10–500 chars) *</label>
            <textarea
              id="sq-text"
              ref={firstInputRef}
              className={`input-textarea ${errors.questionText ? 'input-error' : ''}`}
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="e.g. What are alternative formulation options for pediatric amoxicillin shortages?"
              required
            />
            <div className="helper-slot">{errors.questionText && <span className="error-text">{errors.questionText}</span>}</div>
          </div>

          <div className="form-group">
            <label htmlFor="sq-key">Canonical Subject Key (1–100 chars) *</label>
            <input
              id="sq-key"
              type="text"
              className={`input-text ${errors.canonicalSubjectKey ? 'input-error' : ''}`}
              value={canonicalSubjectKey}
              onChange={(e) => setCanonicalSubjectKey(e.target.value)}
              placeholder="e.g. amoxicillin-pediatric-suspension"
              required
            />
            <div className="helper-slot">{errors.canonicalSubjectKey && <span className="error-text">{errors.canonicalSubjectKey}</span>}</div>
          </div>

          <div className="form-group">
            <div className="label-row">
              <label>Evidence Reference URLs (1–5 HTTPS URLs) *</label>
              {evidenceUrls.length < 5 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleAddUrl}
                >
                  + Add URL
                </button>
              )}
            </div>

            {evidenceUrls.map((url, idx) => (
              <div key={idx} className="url-input-row">
                <input
                  type="url"
                  className={`input-text ${errors[`evidenceUrl_${idx}`] ? 'input-error' : ''}`}
                  value={url}
                  onChange={(e) => handleUrlChange(idx, e.target.value)}
                  placeholder={`https://pubmed.ncbi.nlm.nih.gov/...`}
                  required
                />
                {evidenceUrls.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => handleRemoveUrl(idx)}
                    aria-label={`Remove URL #${idx + 1}`}
                  >
                    Remove
                  </button>
                )}
                {errors[`evidenceUrl_${idx}`] && (
                  <span className="error-text full-width">{errors[`evidenceUrl_${idx}`]}</span>
                )}
              </div>
            ))}
          </div>

          <div className="form-group">
            <label htmlFor="sq-reviewer">Reviewer Address (Designated Claim Address)</label>
            <input
              id="sq-reviewer"
              type="text"
              className={`input-text mono-input ${errors.reviewerAddress ? 'input-error' : ''}`}
              value={reviewerAddress}
              onChange={(e) => setReviewerAddress(e.target.value)}
              placeholder="0x... (leave blank to default to your connected wallet)"
            />
            <div className="helper-slot">
              {errors.reviewerAddress ? (
                <span className="error-text">{errors.reviewerAddress}</span>
              ) : (
                <span className="helper-text">
                  Address permitted to acknowledge the allocated slot during the claim window.
                </span>
              )}
            </div>
          </div>

          <div className="modal-footer">
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
              {isSubmitting ? 'Submitting Question...' : 'Submit Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
