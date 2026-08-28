# GenLayer Submission Category and Scorecard

Binding: this scorecard applies only to the exact Git commit and tree containing this file, the public repository at that revision, contract `0xba5fC48885c201C3efcE04B8810EAdf5376433d9`, and the production Vercel deployment identified in the final review package. Any source or deployment change requires a new review.

Category: `PROJECT`

Validity gate: `PASS`

## GenLayer fit: 4/5

Evidence: GenLayer consensus is necessary to refetch frozen public evidence and independently score research-priority submissions. No creator or submitter can unilaterally choose rankings; deterministic allocation consumes consensus-derived score, urgency, and evidence-gap keys. The contract, 33 direct tests, three completed live Studio rounds, and the production Round 4 lifecycle demonstrate the mechanism.

Exact evidence: `contracts/drug_shortage_research_priority_board.py`; consensus-equivalence tests; `docs/VERIFICATION.md`; deployed contract and Explorer transactions.

Weakness: evidence sources and validator model availability can still produce `UNRESOLVED`; this is handled safely but limits usefulness during shared infrastructure outages. The mechanism is strong and appropriate, but not exceptional enough for 5/5.

## Contract quality: 4/5

Evidence: The contract implements a bounded OPEN → LOCKED → EVALUATED → ALLOCATED/CLAIM → FINAL state machine, strict schemas and score arithmetic, stale-snapshot and failed-fetch fail-closed outcomes, exact consequential consensus matching, deterministic tie-breaking, permission checks, slot expiry/promotion, idempotent finalization, and Root Slot upgrade controls. Thirty-three direct tests plus lint, schema, typecheck, source parity, negative controls, and live readbacks passed.

Exact evidence: `contracts/drug_shortage_research_priority_board.py`; `tests/direct/test_drug_shortage_research_priority_board.py`; contract SHA-256 `b9f9b29a6e0c1615be91c5d1add658064cfa3cfbd13cad52d9b7d4624fa9f805`; `docs/VERIFICATION.md`.

Weakness: the contract remains upgradeable by one recorded account, so operational trust and key custody remain. External web evidence also cannot be guaranteed available. These documented limitations prevent 5/5.

## Engineering: 4/5

Evidence: Contract and frontend dependencies are pinned/locked; 33 contract and 76 frontend tests pass with GenVM lint/schema/typecheck, TypeScript typecheck, production build, dependency audit, secret scan, and clean exact-revision checks. Receipt classification requires finality plus execution success, normalized SDK return envelopes are decoded losslessly, both valid zero-submission and all-unresolved readback branches are covered, writes are never replayed, and RPC calls are deduplicated, cancellable, retry-bounded, and polling-bounded. Public GitHub source matches the deployed contract hash.

Exact evidence: `pyproject.toml`, `requirements.txt`, `frontend/pnpm-lock.yaml`, `frontend/src/services/contract.ts`, `frontend/src/context/ContractContext.tsx`, all automated suites, public Git commit/tree, Vercel deployment, and `docs/VERIFICATION.md`.

Weakness: Vercel production deployment is manual rather than Git-integrated, and Studionet can delay authoritative visibility after finality. Release evidence therefore requires disciplined manual revision binding. This prevents 5/5.

## Frontend / UX: 4/5

Evidence: The live frontend targets the submitted contract and supports EIP-6963 MetaMask, OKX Wallet, and Rabby selection with exact-provider write routing and disconnected reloads. It exposes the full round lifecycle, frozen provenance, score/ranking explanations, transaction stages, hashes, finality, execution status, authoritative readback, safe retry/reconcile states, automatic form closure and state refresh, zero-submission and all-unresolved terminal readback handling, accessibility controls, and a permanent non-medical disclaimer. The production OKX Round 4 journey completed create through FINAL, and the exact final-release Round 6 journey verified zero-submission lock and final no-allocation readback.

Exact evidence: production Vercel application; `frontend/src`; 76 frontend tests; the exact correction-release transaction/readback ledger in `docs/VERIFICATION.md`; final reload and console inspection.

Weakness: normal Studionet consensus can take tens of seconds, and the deliberate no-background-polling RPC budget means updates are not instant. Wallet coverage is implementation- and test-verified, while the final real-wallet journey used OKX only. These limitations prevent 5/5.

## Overall evidence-based assessment

The submission is a strong, complete GenLayer Project with a real consensus-critical decision, rigorous contract state machine, bounded production engineering, and a judge-usable live lifecycle. Remaining weaknesses are transparent operational constraints rather than unresolved correctness blockers.

Submission recommendation: `READY`, conditional on the mandatory exact-final Vercel create-case rerun and final anonymous approval.
