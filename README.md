# Drug Shortage Research Priority Board

A GenLayer workbench that uses validator consensus over frozen public evidence to allocate symbolic research-review slots to submitted questions.

## Verified links

- Live app: [drug-shortage-research-priority-boa.vercel.app](https://drug-shortage-research-priority-boa.vercel.app)
- Studionet contract: [`0xba5fC48885c201C3efcE04B8810EAdf5376433d9`](https://explorer-studio.genlayer.com/address/0xba5fC48885c201C3efcE04B8810EAdf5376433d9)
- Deployment transaction: [`0x3f226de5…03eb47`](https://explorer-studio.genlayer.com/tx/0x3f226de5c8dfb45f59efc93765d97a5c689e06f9f345f3ccf88ef2f8ed03eb47)
- Exact-source upgrade: [`0x1d40fb9c…20fd7`](https://explorer-studio.genlayer.com/tx/0x1d40fb9c8f0dbcc958eb63fb7be36428b62999f418463cb90e66636bbf120fd7)
- [Complete verification evidence](docs/VERIFICATION.md)

## Trust problem

Submitters benefit from selection while the round creator controls intake terms. Neither party should unilaterally score the locked cohort, and evidence-fetch failures must not be disguised as substantive denials.

## Why GenLayer is essential

Validators independently fetch the frozen snapshot and cited HTTPS evidence, verify the snapshot SHA-256 digest, and derive bounded rubric fields through nondeterministic execution. Consensus is bound to the consequential ranking keys. The Intelligent Contract then applies deterministic ranking, allocation, timeout promotion, and finalization on-chain.

## How it works

1. A creator opens a round with a frozen snapshot, digest, rubric, deadline, claim duration, and slot count.
2. Researchers submit questions with a canonical subject key, 1–5 public evidence URLs, and a designated reviewer.
3. The cohort is locked and each submission is evaluated by GenLayer validators.
4. Only `SCORED` submissions rank by total score, urgency, evidence gap, then submission ID.
5. Reviewers acknowledge allocations; expired slots permissionlessly promote the waitlist.
6. The round becomes an immutable archive when finalization conditions are satisfied.

Fetch, digest, freshness, schema, or consensus failures become retry-safe `UNRESOLVED` outcomes and never consume a slot.

## Architecture

- `contracts/`: the sole source of truth for rounds, submissions, evaluations, allocations, claims, and upgrade authorization.
- `frontend/`: a Vite/React interface that reads Studionet, binds writes to the wallet explicitly selected by the user, and displays authoritative readback.
- Vercel: serves static frontend assets and proxies browser read RPC to the official Studionet endpoint. It stores no verdict or application state.
- Public evidence remains off-chain; its URI, digest, rubric, evaluation result, reason codes, and provenance are recorded on-chain.

## Intelligent Contract

The state machine is `OPEN → LOCKED → EVALUATED → ALLOCATED/CLAIM → FINAL`. Key writes are `create_round`, `submit_question`, `lock_round`, `evaluate_submission`, `allocate_slots`, `acknowledge_slot`, `reclaim_expired_slots`, and `finalize_round`. Consensus requires exact agreement on outcome, total score, urgency, evidence gap, canonical subject, and provenance, with tightly bounded remaining fields. There is no token, escrow, payout, or financial value transfer.

The contract is root-slot upgradable only by the recorded Studio account. `get_upgraders()` exposes that authority, and unauthorized upgrades revert.

## Transaction lifecycle

Each action shows signing, submission, consensus, `FINALIZED`, execution verification, and authoritative readback. A write is submitted once per wallet authorization. Receipt polling and readback use bounded increasing delays; a timeout preserves the transaction hash and never silently replays the write. The UI updates from a deliberate post-write reconciliation and closes successful forms without a page reload.

## Run locally

Use the pinned project manifests and existing Node/Python tooling:

```powershell
cd frontend
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm test -- --run
pnpm run build
pnpm dev
```

The example environment contains the verified Studionet address and no secret.

## Tests and verification

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
genvm-lint check contracts\drug_shortage_research_priority_board.py
genvm-lint schema contracts\drug_shortage_research_priority_board.py
genvm-lint typecheck contracts\drug_shortage_research_priority_board.py
pnpm --dir frontend test -- --run
pnpm --dir frontend run typecheck
pnpm --dir frontend run build
```

Current result: 33 contract tests and 73 frontend tests pass; lint, schema, typecheck, production build, diff check, and secret scan pass. The full live transaction matrix is in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Deployment

- Network: GenLayer Studionet, chain ID `61999`
- Contract source commit: `1e759a14f54f243be64859a13926d63498616f3e`
- Contract source SHA-256: `b9f9b29a6e0c1615be91c5d1add658064cfa3cfbd13cad52d9b7d4624fa9f805`
- Locked deployer/upgrader: `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902`
- Frontend environment: `VITE_GENLAYER_CONTRACT_ADDRESS=0xba5fC48885c201C3efcE04B8810EAdf5376433d9`

After the authorized upgrade, `gen_getContractCode` returned 47,874 bytes with the exact source hash above and all 19 methods reloaded successfully.

## Security and trust boundaries

- Wallet support is exactly MetaMask, OKX Wallet, and Rabby through validated EIP-6963 discovery; opening the chooser makes zero account requests.
- Every reload starts disconnected. Writes use the exact selected provider/account and require Studionet.
- Identical in-flight reads are deduplicated; no background state polling runs. Transient rate limits retry at most three times with backoff.
- The frontend never treats a receipt, `ACCEPTED`, or finality alone as success: it requires `FINALIZED`, execution `SUCCESS`, and method-specific readback.
- HTTPS and schema validation reduce malformed input risk, but external evidence remains untrusted.

## Known limitations

- This is a non-medical public research-prioritization demo. It does not provide diagnosis, treatment, substitution, clinical priority, procurement, or distribution guidance.
- openFDA and linked evidence may be incomplete or unavailable; those cases can produce `UNRESOLVED`.
- Upgrade recovery depends on the recorded Studio account and surviving Studionet state; account loss or network reset requires a replacement deployment and fresh verification.
- The board allocates symbolic review slots only. It has no backend database, patient data, token, escrow, payout, or off-chain verdict service.
