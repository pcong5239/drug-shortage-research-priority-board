# Drug Shortage Research Priority Board — Locked Specification v1

Status: SPEC_APPROVED
Submission category: PROJECT
Technical slug: `drug-shortage-research-priority-board`
Working folder: `E:\Genlayer-Projects\drug-shortage-research-priority-board`
Network target: Studionet only

## 1. Product boundary

Build a public, non-medical research-prioritization board. It allocates a fixed number of symbolic `RESEARCH_REVIEW` slots among submitted research questions using a frozen openFDA Drug Shortages snapshot and public research references. It never recommends treatment, substitutes drugs, diagnoses patients, directs procurement/distribution, or handles patient data, money, tokens, staking, escrow, or payouts.

One Intelligent Contract and one browser frontend are sufficient. No backend, database, indexer, relayer, cron service, multi-contract architecture, token, admin dashboard, appeal system, or off-chain verdict service.

## 2. Actors and trust answers

1. Round creator: creates a round and supplies its immutable snapshot descriptor, rubric, slot count, deadlines, and disclaimer version; cannot alter them after locking.
2. Submitter: submits one research question with public evidence references; cannot score, rank, allocate, acknowledge, reclaim, or finalize its own question by fiat.
3. Reviewer: claims an allocated slot by acknowledging it before the claim deadline; acknowledgment records reviewer address and time but does not imply medical endorsement.
4. Timeout caller: any address may trigger deterministic reclaim after the claim deadline and deterministic finalization when all allocations are acknowledged or reclaimed.
5. Evidence publishers: openFDA and public research publishers provide external content but do not control on-chain state.
6. GenLayer validators: independently refetch the same frozen evidence boundary and derive the normalized consequential assessment used by the contract.

Trust problem: submitters benefit from selection and the round creator controls intake terms, so neither may unilaterally determine ranking after the cohort is locked. GenLayer establishes a consensus-backed assessment from frozen public evidence; the contract turns it into allocation and waitlist state.

## 3. Evidence boundary

Each round freezes before evaluation:

- snapshot URI, SHA-256 hex digest, captured-at Unix timestamp, dataset `last_updated`, and canonical subset description;
- rubric version and exact rubric text;
- disclaimer version;
- submission and claim deadlines;
- positive slot count.

Each submission freezes:

- normalized question text;
- canonical subject key selected from the frozen subset;
- one or more HTTPS public research-reference URLs, sorted and duplicate-free;
- submission timestamp and submitter address.

The evaluator must refetch the snapshot and research references inside the nondeterministic block, verify the snapshot digest over the exact fetched text/bytes representation chosen by implementation, and evaluate only the frozen inputs. Missing, malformed, digest-mismatched, inaccessible, stale, or materially conflicting evidence produces `UNRESOLVED`; it must not create an allocation.

No user-entered source is treated as authenticated merely because it is a URL. The contract records canonical URLs and source provenance in the result. The README/UI must repeat openFDA's responsible-use limitation and state that public API data may be unvalidated and must not guide medical care.

## 4. Consensus decision

For every locked submission, validators independently derive stable integer scores from 0–4 for:

- `relevance`
- `evidence_gap`
- `urgency_signal`
- `feasibility`

They also return a bounded reason-code set and a short rationale. The normalized consequential fields are `outcome`, the four scores, total score, canonical subject key, and reason codes. Schema checks alone are insufficient: validator logic must independently rerun the same evidence fetch and evaluation and compare the consequential outcome region. For `SCORED`, the region requires the same outcome and provenance, each criterion within two points, total within six points, and at least one shared allowlisted reason code; for `UNRESOLVED`, both results must preserve zero scores. Free-form rationale is not compared byte-for-byte.

Allowed outcomes: `SCORED` or `UNRESOLVED`. Scores cannot encode treatment recommendations, drug substitution, individual clinical urgency, patient severity, procurement priority, or distribution priority.

## 5. Deterministic ranking and allocation

After every submission has a stored `SCORED` or `UNRESOLVED` result, anyone may call allocation. Rank only `SCORED` submissions by:

1. total score descending;
2. urgency-signal score descending;
3. evidence-gap score descending;
4. submission ID ascending.

The first `slot_count` become `ALLOCATED`; remaining scored submissions become `WAITLISTED`; unresolved submissions remain `UNRESOLVED`. Tie-breaking is deterministic and disclosed. Repeated evaluation, allocation, acknowledgment, reclaim, or finalization must be rejected or idempotent without duplicate consequences.

## 6. State machine

Round states: `OPEN -> LOCKED -> EVALUATED -> ALLOCATED -> CLAIM -> FINAL`.

- `OPEN`: creator may accept valid submissions until the submission deadline.
- `LOCKED`: immutable cohort and terms; no more submissions.
- `EVALUATED`: every submission has one terminal evaluation result (`SCORED` or `UNRESOLVED`).
- `ALLOCATED`: deterministic ranking, allocations, and waitlist recorded.
- `CLAIM`: allocated reviewers may acknowledge; expired unacknowledged slots are reclaimed and offered to the next eligible waitlist entry, preserving rank.
- `FINAL`: all available allocations are acknowledged or no eligible waitlist entry remains after expiry processing.

Lock may be permissionless after the submission deadline; the creator may lock early only if at least one submission exists. Evaluation of one submission is permissionless after lock. Allocation, reclaim, and finalization are permissionless when their deterministic preconditions hold. Contract authorization, not UI role gating, is authoritative.

## 7. Required contract views and writes

Exact names may be adjusted only for current GenVM compatibility while preserving behavior.

Writes: `create_round`, `submit_question`, `lock_round`, `evaluate_submission`, `allocate_slots`, `acknowledge_slot`, `reclaim_expired_slots`, `finalize_round`.

Views: round count/details, submission count/details, ordered allocation/waitlist, evaluation result with provenance/rationale/disclaimer version, and caller-relevant eligibility/status.

Every input has explicit length/count bounds, HTTPS URL validation, deterministic normalization, duplicate protection, and `UserError` failures. Storage remains bounded per round and per submission.

## 8. Frontend

Single-page responsive application with:

- always-visible medical-limitation banner;
- round creation, shortage snapshot context, question submission, cohort locking, per-question evaluation, ranking/allocation, reviewer acknowledgment, timeout reclaim, and finalization;
- research-question cards with source links, score breakdown, reason codes, rationale, provenance, allocation/waitlist status, and transaction history relevant to the current session;
- honest empty/loading/error/retry states and explicit signing -> submitted -> consensus -> finalized -> execution success -> readback lifecycle;
- no success state before `FINALIZED`, successful execution classification, and authoritative contract readback;
- reconciliation by retained transaction hash before any retry.

Wallet support is exactly MetaMask, OKX Wallet, and Rabby through EIP-6963. `Connect wallet` opens an accessible selector and requests accounts only after explicit provider choice. Writes remain bound to the exact selected provider object. Every full reload starts disconnected; no automatic account request or session restoration.

## 9. Acceptance and adversarial matrix

Contract tests must cover at minimum:

- complete happy path through finalization;
- duplicate normalized question and duplicate evidence URL;
- zero/oversized slots, empty/oversized text, malformed/non-HTTPS source;
- stale snapshot, hash mismatch, missing source, source fetch failure, malformed LLM result, validator disagreement;
- below/exactly-on/above score boundaries and deterministic tie ordering;
- unauthorized creator-only action, submit after lock/deadline, evaluate before lock, allocate before all evaluations;
- repeated evaluation/allocation/acknowledgment/reclaim/finalize;
- acknowledgment by wrong address;
- reclaim immediately before, exactly at, and after timeout;
- waitlist promotion and exhaustion;
- finalization with unresolved submissions and no available eligible replacement;
- provenance/disclaimer persistence.

Frontend tests must cover provider discovery/isolation, chooser cancellation with zero RPC, reload-disconnected behavior, account/chain changes, transaction terminal errors, delayed readback, retry without replay, direct route/reload behavior, and every advertised first-mile action from a fresh external wallet.

## 10. Live proof plan

PRE_DEPLOY requires exact-source local checks, deployment/recovery classification, manifest, locked Studio deployer/upgrader account, and anonymous approval. The smallest sufficient Studio matrix will prove one full allocation path, one evidence-failure `UNRESOLVED` path, deterministic tie handling, unauthorized action rejection, timeout reclaim/waitlist promotion, replay rejection, finality/execution success, and authoritative readback.

After verified Studionet deployment, wire only the real address. Before final review, the user runs the numbered judge-like E2E matrix on the exact final Vercel release with an independent browser wallet; Codex verifies every consequential transaction on-chain.

## 11. Applicable experience controls

- Custom consensus must independently rederive the consequential judgment.
- Every evidence view must reproduce the frozen contract decision boundary.
- Evidence unavailability must remain distinct from substantive denial.
- Web-render mode and evidence truncation/ordering must be explicit and regression-tested.
- Contract JSON and receipts are untrusted protocol boundaries; parse losslessly and classify terminal execution centrally.
- Returned identities must come from the exact transaction, not aggregate counters.
- Injected-wallet discovery and write routing must preserve exact provider object identity.
- Git is initialized before implementation; accepted increments receive truthful commits.

## 12. Explicit exclusions

No medical recommendation, treatment ranking, drug substitution, patient data, health record, procurement/distribution decision, real-world shortage prediction, money, token, payout, staking, governance voting, admin override of scores, backend AI, or unsupported source-authentication claim.
