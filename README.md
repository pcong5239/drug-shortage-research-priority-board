# Drug Shortage Research Priority Board

A public GenLayer workbench that allocates symbolic `RESEARCH_REVIEW` slots to submitted research questions. Validators assess frozen public evidence, while the contract ranks scored questions deterministically and preserves unresolved evidence failures without treating them as substantive denials.

> This is a non-medical research-prioritization demo. It does not provide diagnosis, treatment advice, drug substitution, clinical priority, procurement guidance, or distribution decisions. openFDA and linked public research data may be incomplete or unvalidated and must not guide clinical care.

## Why GenLayer

Submitters benefit from selection and the round creator controls intake terms, so neither party should score the locked cohort unilaterally. GenLayer validators independently fetch the same frozen snapshot and evidence, verify the snapshot digest, and agree on bounded consequential fields. The contract then applies deterministic ranking, allocation, timeout promotion, and finalization.

## Workflow

1. Create a round with a frozen snapshot URI, SHA-256 digest, rubric, deadlines, and slot count.
2. Submit research questions with canonical subject keys, public HTTPS evidence, and a designated reviewer.
3. Lock the cohort and evaluate each submission through validator consensus.
4. Allocate only `SCORED` submissions by total score, urgency, evidence gap, then submission ID.
5. Acknowledge allocated slots or permissionlessly promote the waitlist after expiry.
6. Finalize the immutable round when its deterministic conditions are met.

Evidence fetch, digest, freshness, schema, or consensus failures become retry-safe `UNRESOLVED` outcomes and never consume a slot.

## Studionet deployment

The address below is the superseded diagnostic deployment. A corrected release candidate with contract SHA-256 `40d65955e75a15741a8f27a79fcc60b9b6256c6055f33dc5b4c978ee2412561c` is awaiting governed PRE_DEPLOY review and a fresh Studionet deployment. Do not treat the prior address as the final candidate.

- Network: GenLayer Studionet (`61999`)
- Contract: [`0x26C0413ED148085A8187D5dC47CEA06Ea4931A6A`](https://explorer-studio.genlayer.com/address/0x26C0413ED148085A8187D5dC47CEA06Ea4931A6A)
- Deployment transaction: [`0x4999f6bc…8e193`](https://explorer-studio.genlayer.com/tx/0x4999f6bc8972e695e3c0f241aeea7bd489f867807200b293f1bc1b9bd788e193)
- Contract source SHA-256: `1f56f9df2fc6a2e0f4063dc90a57860a225b30e83568caf65ec17892622a8d9a`

Full transaction and source-parity evidence is in [docs/VERIFICATION.md](docs/VERIFICATION.md).

Live app: [drug-shortage-research-priority-boa.vercel.app](https://drug-shortage-research-priority-boa.vercel.app)

## Wallet support

The frontend discovers MetaMask, OKX Wallet, and Rabby via EIP-6963. Opening the chooser sends no account request; a request is sent only to the exact provider selected by the user. Every full reload starts disconnected.

## Run locally

Requirements are already pinned in the project files.

```powershell
cd frontend
Copy-Item .env.example .env
# Set VITE_GENLAYER_CONTRACT_ADDRESS to the Studionet address above.
pnpm test -- --run
pnpm run build
pnpm dev
```

Contract checks:

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
genvm-lint check contracts\drug_shortage_research_priority_board.py
genvm-lint schema contracts\drug_shortage_research_priority_board.py
genvm-lint typecheck contracts\drug_shortage_research_priority_board.py
```

## Limits

- Public evidence availability and model consensus can produce `UNRESOLVED`; callers may retry only while the contract permits it.
- The board prioritizes research review, not products, patients, care, purchasing, or supply distribution.
- No backend, token, escrow, payout, patient data, or off-chain verdict service is used.
