import React from 'react';
import type { RoundState, SubmissionStatus } from '../types/contract';

interface StatusBadgeProps {
  status: RoundState | SubmissionStatus | string;
  type?: 'round' | 'submission';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'submission' }) => {
  const norm = status.toUpperCase();

  let className = 'status-badge status-default';
  let label = norm;

  if (norm === 'FINAL' || norm === 'ACKNOWLEDGED') {
    className = 'status-badge status-final';
    label = norm === 'FINAL' ? 'Finalized' : 'Acknowledged';
  } else if (norm === 'OPEN' || norm === 'CLAIM' || norm === 'ALLOCATED') {
    className = 'status-badge status-active';
    label = norm === 'OPEN' ? 'Open for Submissions' : norm === 'CLAIM' ? 'In Claim Window' : 'Allocated';
  } else if (norm === 'LOCKED' || norm === 'EVALUATED' || norm === 'WAITLISTED') {
    className = 'status-badge status-pending';
    label = norm === 'LOCKED' ? 'Locked (In Evaluation)' : norm === 'EVALUATED' ? 'Evaluated' : 'Waitlisted';
  } else if (norm === 'UNRESOLVED' || norm === 'EXPIRED') {
    className = 'status-badge status-unresolved';
    label = norm === 'UNRESOLVED' ? 'Unresolved' : 'Expired';
  } else if (norm === 'SCORED') {
    className = 'status-badge status-scored';
    label = 'Scored';
  }

  return (
    <span className={className} data-status={norm} data-type={type}>
      <span className="status-indicator" aria-hidden="true"></span>
      <span className="status-label">{label}</span>
    </span>
  );
};
