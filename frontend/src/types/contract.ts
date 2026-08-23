export type RoundState = 'OPEN' | 'LOCKED' | 'EVALUATED' | 'ALLOCATED' | 'CLAIM' | 'FINAL';

export type SubmissionStatus =
  | 'PENDING'
  | 'SCORED'
  | 'UNRESOLVED'
  | 'ALLOCATED'
  | 'WAITLISTED'
  | 'ACKNOWLEDGED'
  | 'EXPIRED';

export interface RoundData {
  round_id: number;
  creator: string;
  snapshot_uri: string;
  snapshot_sha256: string;
  captured_at: number;
  dataset_last_updated: string;
  subset_description: string;
  rubric_version: string;
  rubric_text: string;
  disclaimer_version: string;
  submission_deadline: number;
  claim_duration: number;
  slot_count: number;
  state: RoundState;
  submission_count: number;
  evaluated_count: number;
  created_at: number;
  locked_at: number;
  allocated_at: number;
  finalized_at: number;
}

export interface SubmissionData {
  submission_id: number;
  round_id: number;
  submitter: string;
  reviewer_address: string;
  question_text: string;
  normalized_question: string;
  canonical_subject_key: string;
  evidence_urls: string[];
  submitted_at: number;
  status: SubmissionStatus;
  allocated_at: number;
  claim_deadline: number;
  acknowledged_at: number;
  acknowledged_by: string;
  expired_at: number;
}

export interface EvaluationData {
  outcome: 'SCORED' | 'UNRESOLVED';
  relevance: number;
  evidence_gap: number;
  urgency_signal: number;
  feasibility: number;
  total_score: number;
  canonical_subject_key: string;
  reason_codes: string[];
  rationale: string;
  source_provenance: string;
  disclaimer_version: string;
  evaluated_at: number;
  round_id: number;
  submission_id: number;
}

export interface AllocationsData {
  round_id: number;
  allocated_submission_ids: number[];
  waitlisted_submission_ids: number[];
  unresolved_submission_ids: number[];
  allocated_at: number;
}

export interface CallerStatus {
  round_id: number;
  caller: string;
  is_creator: boolean;
  submitted_submission_ids: number[];
  reviewer_assigned_submission_ids: number[];
  claimable_submission_ids: number[];
  can_lock: boolean;
  can_allocate: boolean;
  can_reclaim: boolean;
  can_finalize: boolean;
  round_state: RoundState;
}

export interface ContractLimits {
  max_rounds: number;
  max_submissions_per_round: number;
  max_slots_per_round: number;
  min_question_len: number;
  max_question_len: number;
  min_subject_key_len: number;
  max_subject_key_len: number;
  min_evidence_urls: number;
  max_evidence_urls: number;
  max_uri_len: number;
  max_subset_desc_len: number;
  max_rubric_ver_len: number;
  max_rubric_text_len: number;
  max_disclaimer_ver_len: number;
  max_dataset_date_len: number;
  max_rationale_len: number;
  max_source_provenance_len: number;
  min_claim_duration: number;
  max_claim_duration: number;
  max_snapshot_age_seconds: number;
  valid_states: string[];
  valid_reason_codes: string[];
}
