import type {
  RoundData,
  SubmissionData,
  EvaluationData,
  AllocationsData,
  CallerStatus,
  ContractLimits,
  RoundState,
  SubmissionStatus,
} from '../types/contract';

const VALID_ROUND_STATES: Set<RoundState> = new Set([
  'OPEN',
  'LOCKED',
  'EVALUATED',
  'ALLOCATED',
  'CLAIM',
  'FINAL',
]);

const VALID_SUBMISSION_STATUSES: Set<SubmissionStatus> = new Set([
  'PENDING',
  'SCORED',
  'UNRESOLVED',
  'ALLOCATED',
  'WAITLISTED',
  'ACKNOWLEDGED',
  'EXPIRED',
]);

export function toSafeInteger(val: unknown, fallback: number = 0): number {
  if (typeof val === 'number') {
    if (Number.isSafeInteger(val)) return val;
    return fallback;
  }
  if (typeof val === 'bigint') {
    if (val <= BigInt(Number.MAX_SAFE_INTEGER) && val >= BigInt(Number.MIN_SAFE_INTEGER)) {
      return Number(val);
    }
    return fallback;
  }
  if (typeof val === 'string') {
    const parsed = Number(val);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return fallback;
}

export function toSafeBigInt(val: unknown): bigint {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') {
    if (Number.isSafeInteger(val)) return BigInt(val);
    return 0n;
  }
  if (typeof val === 'string') {
    try {
      return BigInt(val.trim());
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export function parseJsonSafe<T = unknown>(raw: unknown): { ok: true; data: T } | { ok: false; error: string } {
  if (typeof raw !== 'string') {
    if (typeof raw === 'object' && raw !== null) {
      return { ok: true, data: raw as T };
    }
    return { ok: false, error: 'Expected JSON string or object' };
  }
  try {
    const data = JSON.parse(raw);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function validateRoundData(raw: unknown): RoundData {
  const parsed = parseJsonSafe<Record<string, unknown>>(raw);
  if (!parsed.ok || typeof parsed.data !== 'object' || parsed.data === null) {
    throw new Error(`Failed to parse round data: ${parsed.ok ? 'Not an object' : parsed.error}`);
  }
  const d = parsed.data;

  const round_id = toSafeInteger(d.round_id, 0);
  const creator = typeof d.creator === 'string' ? d.creator.toLowerCase() : '';
  const snapshot_uri = typeof d.snapshot_uri === 'string' ? d.snapshot_uri : '';
  const snapshot_sha256 = typeof d.snapshot_sha256 === 'string' ? d.snapshot_sha256.toLowerCase() : '';
  const captured_at = toSafeInteger(d.captured_at, 0);
  const dataset_last_updated = typeof d.dataset_last_updated === 'string' ? d.dataset_last_updated : '';
  const subset_description = typeof d.subset_description === 'string' ? d.subset_description : '';
  const rubric_version = typeof d.rubric_version === 'string' ? d.rubric_version : '';
  const rubric_text = typeof d.rubric_text === 'string' ? d.rubric_text : '';
  const disclaimer_version = typeof d.disclaimer_version === 'string' ? d.disclaimer_version : '';
  const submission_deadline = toSafeInteger(d.submission_deadline, 0);
  const claim_duration = toSafeInteger(d.claim_duration, 0);
  const slot_count = toSafeInteger(d.slot_count, 1);
  const stateStr = typeof d.state === 'string' ? d.state.toUpperCase() : 'OPEN';
  const state: RoundState = VALID_ROUND_STATES.has(stateStr as RoundState) ? (stateStr as RoundState) : 'OPEN';
  const submission_count = toSafeInteger(d.submission_count, 0);
  const evaluated_count = toSafeInteger(d.evaluated_count, 0);
  const created_at = toSafeInteger(d.created_at, 0);
  const locked_at = toSafeInteger(d.locked_at, 0);
  const allocated_at = toSafeInteger(d.allocated_at, 0);
  const finalized_at = toSafeInteger(d.finalized_at, 0);

  return {
    round_id,
    creator,
    snapshot_uri,
    snapshot_sha256,
    captured_at,
    dataset_last_updated,
    subset_description,
    rubric_version,
    rubric_text,
    disclaimer_version,
    submission_deadline,
    claim_duration,
    slot_count,
    state,
    submission_count,
    evaluated_count,
    created_at,
    locked_at,
    allocated_at,
    finalized_at,
  };
}

export function validateSubmissionData(raw: unknown): SubmissionData {
  const parsed = parseJsonSafe<Record<string, unknown>>(raw);
  if (!parsed.ok || typeof parsed.data !== 'object' || parsed.data === null) {
    throw new Error(`Failed to parse submission data: ${parsed.ok ? 'Not an object' : parsed.error}`);
  }
  const d = parsed.data;

  const submission_id = toSafeInteger(d.submission_id, 0);
  const round_id = toSafeInteger(d.round_id, 0);
  const submitter = typeof d.submitter === 'string' ? d.submitter.toLowerCase() : '';
  const reviewer_address = typeof d.reviewer_address === 'string' ? d.reviewer_address.toLowerCase() : '';
  const question_text = typeof d.question_text === 'string' ? d.question_text : '';
  const normalized_question = typeof d.normalized_question === 'string' ? d.normalized_question : '';
  const canonical_subject_key = typeof d.canonical_subject_key === 'string' ? d.canonical_subject_key : '';
  const rawUrls = Array.isArray(d.evidence_urls) ? d.evidence_urls : [];
  const evidence_urls = rawUrls.filter((u): u is string => typeof u === 'string');
  const submitted_at = toSafeInteger(d.submitted_at, 0);
  const statusStr = typeof d.status === 'string' ? d.status.toUpperCase() : 'PENDING';
  const status: SubmissionStatus = VALID_SUBMISSION_STATUSES.has(statusStr as SubmissionStatus)
    ? (statusStr as SubmissionStatus)
    : 'PENDING';
  const allocated_at = toSafeInteger(d.allocated_at, 0);
  const claim_deadline = toSafeInteger(d.claim_deadline, 0);
  const acknowledged_at = toSafeInteger(d.acknowledged_at, 0);
  const acknowledged_by = typeof d.acknowledged_by === 'string' ? d.acknowledged_by.toLowerCase() : '';
  const expired_at = toSafeInteger(d.expired_at, 0);

  return {
    submission_id,
    round_id,
    submitter,
    reviewer_address,
    question_text,
    normalized_question,
    canonical_subject_key,
    evidence_urls,
    submitted_at,
    status,
    allocated_at,
    claim_deadline,
    acknowledged_at,
    acknowledged_by,
    expired_at,
  };
}

export function validateEvaluationData(raw: unknown): EvaluationData {
  const parsed = parseJsonSafe<Record<string, unknown>>(raw);
  if (!parsed.ok || typeof parsed.data !== 'object' || parsed.data === null) {
    throw new Error(`Failed to parse evaluation data: ${parsed.ok ? 'Not an object' : parsed.error}`);
  }
  const d = parsed.data;

  const outcomeStr = typeof d.outcome === 'string' ? d.outcome.toUpperCase() : 'UNRESOLVED';
  const outcome = outcomeStr === 'SCORED' ? 'SCORED' : 'UNRESOLVED';

  const scoresObj = typeof d.scores === 'object' && d.scores !== null ? (d.scores as Record<string, unknown>) : d;

  const relevance = toSafeInteger(scoresObj.relevance ?? d.relevance, 0);
  const evidence_gap = toSafeInteger(
    scoresObj.evidence_gap ?? scoresObj.substitutability_gap ?? d.evidence_gap,
    0
  );
  const urgency_signal = toSafeInteger(
    scoresObj.urgency_signal ?? scoresObj.shortage_urgency_signal ?? d.urgency_signal,
    0
  );
  const feasibility = toSafeInteger(
    scoresObj.feasibility ?? scoresObj.feasibility_impact ?? d.feasibility,
    0
  );
  const total_score = toSafeInteger(
    d.total_score ?? scoresObj.total_score,
    relevance + evidence_gap + urgency_signal + feasibility
  );

  if (outcome === 'SCORED') {
    if (
      relevance < 0 ||
      relevance > 4 ||
      evidence_gap < 0 ||
      evidence_gap > 4 ||
      urgency_signal < 0 ||
      urgency_signal > 4 ||
      feasibility < 0 ||
      feasibility > 4 ||
      total_score < 0 ||
      total_score > 16
    ) {
      throw new Error(
        `Evaluation scores out of bounds (0-4 individual, 0-16 total): relevance=${relevance}, gap=${evidence_gap}, urgency=${urgency_signal}, feasibility=${feasibility}, total=${total_score}`
      );
    }
  }

  const canonical_subject_key = typeof d.canonical_subject_key === 'string' ? d.canonical_subject_key : '';
  const rawCodes = Array.isArray(d.reason_codes) ? d.reason_codes : [];
  const reason_codes = rawCodes.filter((c): c is string => typeof c === 'string');
  const rationale = typeof d.rationale === 'string' ? d.rationale : '';
  const source_provenance = typeof d.source_provenance === 'string' ? d.source_provenance : '';
  const disclaimer_version = typeof d.disclaimer_version === 'string' ? d.disclaimer_version : '';
  const evaluated_at = toSafeInteger(d.evaluated_at, 0);
  const round_id = toSafeInteger(d.round_id, 0);
  const submission_id = toSafeInteger(d.submission_id, 0);

  return {
    outcome,
    relevance,
    evidence_gap,
    urgency_signal,
    feasibility,
    total_score,
    canonical_subject_key,
    reason_codes,
    rationale,
    source_provenance,
    disclaimer_version,
    evaluated_at,
    round_id,
    submission_id,
  };
}

export function validateAllocationsData(raw: unknown): AllocationsData {
  const parsed = parseJsonSafe<Record<string, unknown>>(raw);
  if (!parsed.ok || typeof parsed.data !== 'object' || parsed.data === null) {
    throw new Error(`Failed to parse allocations data: ${parsed.ok ? 'Not an object' : parsed.error}`);
  }
  const d = parsed.data;

  const round_id = toSafeInteger(d.round_id, 0);
  const allocated_ids = Array.isArray(d.allocated_submission_ids)
    ? d.allocated_submission_ids.map((id) => toSafeInteger(id, 0)).filter((id) => id > 0)
    : [];
  const waitlisted_ids = Array.isArray(d.waitlisted_submission_ids)
    ? d.waitlisted_submission_ids.map((id) => toSafeInteger(id, 0)).filter((id) => id > 0)
    : [];
  const unresolved_ids = Array.isArray(d.unresolved_submission_ids)
    ? d.unresolved_submission_ids.map((id) => toSafeInteger(id, 0)).filter((id) => id > 0)
    : [];
  const allocated_at = toSafeInteger(d.allocated_at, 0);

  return {
    round_id,
    allocated_submission_ids: allocated_ids,
    waitlisted_submission_ids: waitlisted_ids,
    unresolved_submission_ids: unresolved_ids,
    allocated_at,
  };
}

export function validateCallerStatus(raw: unknown): CallerStatus {
  const parsed = parseJsonSafe<Record<string, unknown>>(raw);
  if (!parsed.ok || typeof parsed.data !== 'object' || parsed.data === null) {
    throw new Error(`Failed to parse caller status: ${parsed.ok ? 'Not an object' : parsed.error}`);
  }
  const d = parsed.data;

  const round_id = toSafeInteger(d.round_id, 0);
  const caller = typeof d.caller === 'string' ? d.caller.toLowerCase() : '';
  const is_creator = Boolean(d.is_creator);
  const submitted_ids = Array.isArray(d.submitted_submission_ids)
    ? d.submitted_submission_ids.map((id) => toSafeInteger(id, 0)).filter((id) => id > 0)
    : [];
  const reviewer_ids = Array.isArray(d.reviewer_assigned_submission_ids)
    ? d.reviewer_assigned_submission_ids.map((id) => toSafeInteger(id, 0)).filter((id) => id > 0)
    : [];
  const claimable_ids = Array.isArray(d.claimable_submission_ids)
    ? d.claimable_submission_ids.map((id) => toSafeInteger(id, 0)).filter((id) => id > 0)
    : [];
  const can_lock = Boolean(d.can_lock);
  const can_allocate = Boolean(d.can_allocate);
  const can_reclaim = Boolean(d.can_reclaim);
  const can_finalize = Boolean(d.can_finalize);
  const stateStr = typeof d.round_state === 'string' ? d.round_state.toUpperCase() : 'OPEN';
  const round_state: RoundState = VALID_ROUND_STATES.has(stateStr as RoundState)
    ? (stateStr as RoundState)
    : 'OPEN';

  return {
    round_id,
    caller,
    is_creator,
    submitted_submission_ids: submitted_ids,
    reviewer_assigned_submission_ids: reviewer_ids,
    claimable_submission_ids: claimable_ids,
    can_lock,
    can_allocate,
    can_reclaim,
    can_finalize,
    round_state,
  };
}

export function validateContractLimits(raw: unknown): ContractLimits {
  const parsed = parseJsonSafe<Record<string, unknown>>(raw);
  if (!parsed.ok || typeof parsed.data !== 'object' || parsed.data === null) {
    throw new Error(`Failed to parse contract limits: ${parsed.ok ? 'Not an object' : parsed.error}`);
  }
  const d = parsed.data;

  return {
    max_rounds: toSafeInteger(d.max_rounds, 100),
    max_submissions_per_round: toSafeInteger(d.max_submissions_per_round, 50),
    max_slots_per_round: toSafeInteger(d.max_slots_per_round, 20),
    min_question_len: toSafeInteger(d.min_question_len, 10),
    max_question_len: toSafeInteger(d.max_question_len, 500),
    min_subject_key_len: toSafeInteger(d.min_subject_key_len, 1),
    max_subject_key_len: toSafeInteger(d.max_subject_key_len, 100),
    min_evidence_urls: toSafeInteger(d.min_evidence_urls, 1),
    max_evidence_urls: toSafeInteger(d.max_evidence_urls, 5),
    max_uri_len: toSafeInteger(d.max_uri_len, 512),
    max_subset_desc_len: toSafeInteger(d.max_subset_desc_len, 500),
    max_rubric_ver_len: toSafeInteger(d.max_rubric_ver_len, 64),
    max_rubric_text_len: toSafeInteger(d.max_rubric_text_len, 4000),
    max_disclaimer_ver_len: toSafeInteger(d.max_disclaimer_ver_len, 64),
    max_dataset_date_len: toSafeInteger(d.max_dataset_date_len, 64),
    max_rationale_len: toSafeInteger(d.max_rationale_len, 1000),
    max_source_provenance_len: toSafeInteger(d.max_source_provenance_len, 1000),
    min_claim_duration: toSafeInteger(d.min_claim_duration, 60),
    max_claim_duration: toSafeInteger(d.max_claim_duration, 2592000),
    max_snapshot_age_seconds: toSafeInteger(d.max_snapshot_age_seconds, 604800),
    valid_states: Array.isArray(d.valid_states) ? d.valid_states.map(String) : [],
    valid_reason_codes: Array.isArray(d.valid_reason_codes) ? d.valid_reason_codes.map(String) : [],
  };
}

// -----------------------------------------------------------------------------
// Form Field Validations
// -----------------------------------------------------------------------------

export function validateHttpsUri(uri: string, fieldName: string = 'URI'): { valid: boolean; error?: string } {
  const trimmed = uri.trim();
  if (!trimmed) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (trimmed.length > 512) {
    return { valid: false, error: `${fieldName} exceeds maximum length of 512 characters` };
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') {
      return { valid: false, error: `${fieldName} must use HTTPS scheme` };
    }
    if (!url.hostname || url.hostname.includes('..')) {
      return { valid: false, error: `${fieldName} has invalid hostname` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `${fieldName} must be a valid URL` };
  }
}

export function validateSha256Hex(hash: string): { valid: boolean; error?: string } {
  const trimmed = hash.trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, error: 'SHA-256 digest is required' };
  }
  if (!/^[0-9a-f]{64}$/.test(trimmed)) {
    return { valid: false, error: 'SHA-256 digest must be exactly 64 lowercase hexadecimal characters' };
  }
  return { valid: true };
}

export function validateQuestionText(text: string): { valid: boolean; error?: string } {
  const trimmed = text.trim();
  if (trimmed.length < 10) {
    return { valid: false, error: 'Question text must be at least 10 characters' };
  }
  if (trimmed.length > 500) {
    return { valid: false, error: 'Question text cannot exceed 500 characters' };
  }
  return { valid: true };
}

export function validateCanonicalSubjectKey(key: string): { valid: boolean; error?: string } {
  const trimmed = key.trim();
  if (trimmed.length < 1) {
    return { valid: false, error: 'Canonical subject key is required' };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Canonical subject key cannot exceed 100 characters' };
  }
  return { valid: true };
}

export function validateEthereumAddress(addr: string): { valid: boolean; error?: string } {
  const trimmed = addr.trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, error: 'Address is required' };
  }
  if (!/^0x[0-9a-f]{40}$/.test(trimmed)) {
    return { valid: false, error: 'Must be a valid 40-character hex address with 0x prefix' };
  }
  return { valid: true };
}
