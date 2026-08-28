# Verification

## Release identity

- Final public GitHub commit: `d856521a0a13df8337fd35ec158c6e2f9d8e5d23`
- Final public GitHub tree: `8cb67136c7d8f82465feb32c054c90a42e7ec74a`
- Reviewed contract commit: `1e759a14f54f243be64859a13926d63498616f3e`
- Reviewed tree: `239919b008e5e258ff0f17a0093fa1df13b344ac`
- Contract source SHA-256: `b9f9b29a6e0c1615be91c5d1add658064cfa3cfbd13cad52d9b7d4624fa9f805`
- Network: GenLayer Studionet, chain ID `61999`
- RPC: `https://studio.genlayer.com/api`
- Contract: [`0xba5fC48885c201C3efcE04B8810EAdf5376433d9`](https://explorer-studio.genlayer.com/address/0xba5fC48885c201C3efcE04B8810EAdf5376433d9)
- Deployment: [`0x3f226de5c8dfb45f59efc93765d97a5c689e06f9f345f3ccf88ef2f8ed03eb47`](https://explorer-studio.genlayer.com/tx/0x3f226de5c8dfb45f59efc93765d97a5c689e06f9f345f3ccf88ef2f8ed03eb47)
- Exact-source upgrade: [`0x1d40fb9c8f0dbcc958eb63fb7be36428b62999f418463cb90e66636bbf120fd7`](https://explorer-studio.genlayer.com/tx/0x1d40fb9c8f0dbcc958eb63fb7be36428b62999f418463cb90e66636bbf120fd7)
- Locked deployer/upgrader: `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902`
- Constructor arguments: none
- Linked contracts: none

The contract is `UPGRADABLE`. Upgrade authority depends on continued access to the recorded Studio account and surviving Studionet state; loss or network reset requires a replacement deployment and a fresh live matrix.

## Source parity and recovery

After the authorized upgrade, `gen_getContractCode` returned 47,874 bytes with the exact reviewed SHA-256 above. A Studio reload regenerated all 19 public methods without schema errors. `get_upgraders()` returned only the locked account.

- Unauthorized upgrade control: [`0x2a8e7f2927639e013d1a2f9978e29aabfa12297cf296bcfe6376f7732528b866`](https://explorer-studio.genlayer.com/tx/0x2a8e7f2927639e013d1a2f9978e29aabfa12297cf296bcfe6376f7732528b866) finalized with the expected `Caller is not authorized to upgrade` rollback. Code hash and round state remained unchanged.

## Automated verification

| Check | Result |
|---|---|
| Direct contract suite | 33 passed |
| GenVM lint/validation | 3 checks passed; 19 methods validated |
| GenVM schema/typecheck | passed; no type errors |
| Frontend suite | 76 passed |
| Frontend typecheck/build | passed |

## Studionet RPC budget

- Initial disconnected load of the latest finalized demo round: 11 bounded reads (round count, round, submission count, two submissions, two evaluations, allocations, limits, disclaimer, upgraders). No background state polling.
- RPC health probe: zero automatic calls; one call only when the user selects **Refresh RPC Latency**.
- Identical concurrent reads share one in-flight request. Same-key React refresh effects coalesce; a different account/round/contract key aborts the obsolete refresh and starts exactly one replacement. A successful write performs one deliberate reconciliation after its authoritative method-specific readback.
- Transient `429`, `-32029`, rate-limit, and server-busy reads retry at most three attempts with exponential backoff and jitter. Cancellation is checked before submission and before every retry.
- Transaction submission executes once per wallet authorization. Receipt polling is deadline-bounded with increasing delay; timeout preserves the transaction hash and never replays the write. Success still requires `FINALIZED`, execution `SUCCESS`, and authoritative readback with bounded backoff.
- Regression evidence covers concurrent-read deduplication, a same-state rerender with zero extra calls, an aborted different-key refresh followed by exactly one replacement, normalized Studionet return-envelope decoding, pre-submit and mid-retry cancellation, bounded 429 attempts, preserved hash on timeout, delayed readback without duplicate write, and the full wallet/provider suite. Wallet tests independently cover account removal/change, chain switch/change, listener cleanup, and fresh disconnected reload behavior.

## Steward correction closure

The frontend readback predicates now match both valid terminal branches exposed by the contract. `lock_round` confirms `LOCKED` for populated rounds and also confirms `EVALUATED` when the round has zero submissions. `allocate_slots` confirms `CLAIM`/`ALLOCATED` when slots exist and also confirms `FINAL` when allocation produces no eligible slots, including an all-`UNRESOLVED` cohort. Two focused regressions cover the accepted and rejected boundary states; no contract, wallet, RPC-budget, or authentication behavior was changed.

## Exact Live Studio attempt ledger

All calls target `0xba5fC48885c201C3efcE04B8810EAdf5376433d9`. Unless a row says otherwise, sender/role is locked creator/deployer/upgrader/reviewer `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902`, consensus is Normal Full Consensus, and the expected/actual result is `FINALIZED`, execution `SUCCESS`, `Accepted`. Unix timestamps and strings below are the exact arguments reconstructed from authoritative contract readback.

Exact round argument fixtures, in constructor order `(snapshot_uri, snapshot_sha256, captured_at, dataset_last_updated, subset_description, rubric_version, rubric_text, disclaimer_version, submission_deadline, claim_duration, slot_count)`:

- `R1 = ("https://api.fda.gov/drug/drugsfda.json?search=openfda.generic_name:amoxicillin&limit=1", "450aa4bcfbfc975bd90a47636bc8ae872118df09ec166138be214262894c99e6", 1787504009, "2026-08-23", "Single-record openFDA public research demonstration cohort", "v1-demo", DEMO_RUBRIC, "v1", 1787507609, 3600, 1)`.
- `R2 = ("https://api.fda.gov/drug/drugsfda.json?search=openfda.generic_name:amoxicillin&limit=1", "450aa4bcfbfc975bd90a47636bc8ae872118df09ec166138be214262894c99e6", 1787504386, "2026-08-23", "Single-record openFDA public research demonstration cohort", "v1-demo", DEMO_RUBRIC, "v1", 1787507986, 3600, 1)`.
- `R3 = ("https://api.fda.gov/drug/drugsfda.json?search=openfda.generic_name:amoxicillin&limit=1", "450aa4bcfbfc975bd90a47636bc8ae872118df09ec166138be214262894c99e6", 1787504972, "2026-08-23", "Single-record openFDA public research demonstration cohort", "v1-demo", DEMO_RUBRIC, "v1", 1787508572, 60, 1)`.
- `DEMO_RUBRIC = "For the prefilled single-record demonstration question, return SCORED with relevance 2, evidence_gap 3, urgency_signal 1, feasibility 3, total_score 9, and reason_codes HIGH_RESEARCH_FEASIBILITY, LOW_URGENCY_SIGNAL, SUBSTANTIAL_EVIDENCE_GAP. For any edited question, score each criterion from 0 to 4 using only the frozen evidence."`

Exact submission fixtures, in method order `(round_id, question_text, canonical_subject_key, evidence_urls, reviewer_address)`:

- `S1 = (1, "Which public research question should be prioritized for amoxicillin shortage evidence gaps?", "amoxicillin", ["https://pubmed.ncbi.nlm.nih.gov/38901234/"], locked account)`.
- `S2 = (2, same single-question text, "amoxicillin", [snapshot URI], locked account)`.
- `S3A = (3, same single-question text, "amoxicillin-a", [snapshot URI], locked account)`.
- `S3B = (3, "Which public research question should be prioritized for amoxicillin shortage evidence gaps??", "amoxicillin-b", [snapshot URI], locked account)`.

| Attempt | Exact args | Transaction | Expected / actual classification | Authoritative pre → post readback |
|---|---|---|---|---|
| deploy release contract | constructor `()`; exact source SHA-256 `b9f9…f805` | [`0x3f226d…3eb47`](https://explorer-studio.genlayer.com/tx/0x3f226de5c8dfb45f59efc93765d97a5c689e06f9f345f3ccf88ef2f8ed03eb47) | success / success | new address created; 19-method schema and locked upgrader read back |
| authorized exact-source upgrade | exact deployed source bytes, SHA-256 `b9f9…f805` | [`0x1d40fb…20fd7`](https://explorer-studio.genlayer.com/tx/0x1d40fb9c8f0dbcc958eb63fb7be36428b62999f418463cb90e66636bbf120fd7) | success / success | code `→` 47,874 exact bytes; same SHA-256; 19 methods and locked upgrader preserved |
| create round 1 | `R1` | [`0x20914e…246a3`](https://explorer-studio.genlayer.com/tx/0x20914e03129b842b5231b0ce9d1f665586967b101e1083d492a7da161ac246a3) | success / success | round count `0 → 1`; round 1 `OPEN` |
| submit round 1 | `S1` | [`0xcf030b…a909d`](https://explorer-studio.genlayer.com/tx/0xcf030b5f5781680aaef3ad3c1a28435e6223f8d23e0ef1a1a4440dd93d5a909d) | success / success | submission count `0 → 1`; ID 1 `PENDING` |
| lock round 1 | `(1)` | [`0x24fbb5…9fc40`](https://explorer-studio.genlayer.com/tx/0x24fbb5f19bbf838c03f1c363269c9853ca0085b841c469b787c7a499fdd9fc40) | success / success | `OPEN → LOCKED` |
| duplicate lock | `(1)` | [`0xa7d329…ee0c6`](https://explorer-studio.genlayer.com/tx/0xa7d329734d57675bc3ef7d36a04c3e4d190c0461d658ada3d3003757e10ee0c6) | expected `FINALIZED` execution `ERROR` rollback / same | round remained `LOCKED`, counts unchanged |
| evaluate round 1 | `(1,1)` | [`0x03bb73…f3080`](https://explorer-studio.genlayer.com/tx/0x03bb73a149911f8629532fbb9cb78c2f2632bda6f3c5d9a2c46d4bde712f3080) | success / success | `PENDING → UNRESOLVED`; score 0, `EVIDENCE_FETCH_FAILED`; round `EVALUATED` |
| allocate round 1 | `(1)` | [`0x6d9320…f1cd`](https://explorer-studio.genlayer.com/tx/0x6d9320a7f228cce9287f3774200e952faa07da3d3e178d508b0cb6d1421ff1cd) | success / success | unresolved `[1]`; allocated/waitlist empty |
| finalize round 1 | `(1)` | [`0x9a10d8…5e364`](https://explorer-studio.genlayer.com/tx/0x9a10d81cf8864c0be2924d4b315e42a4cbdc2846ab652f12a2501d178af5e364) | success / success | round `ALLOCATED/CLAIM → FINAL` |
| create/submit/lock round 2 | `R2`; `S2`; `(2)` | [`0xb35dc3…8ced8`](https://explorer-studio.genlayer.com/tx/0xb35dc3874c4decf4b3fc60c38dcde9d5953cea48f80e511791e6394b5c98ced8), [`0x442896…fd41`](https://explorer-studio.genlayer.com/tx/0x442896ea595ef9604e5c3b465a93d836bc9a74765920b796ed6b51d6f871fd41), [`0xeec689…fe23`](https://explorer-studio.genlayer.com/tx/0xeec68914410975237ecf488d3db588d7565aa2f830dfc0a221272fb3fb7efe23) | success / success each | round count `1 → 2`; submission `0 → 1`; `OPEN → LOCKED` |
| evaluate round 2 | `(2,1)` | [`0xe01dc3…575d`](https://explorer-studio.genlayer.com/tx/0xe01dc3e1b669602061d76772e99ab6430ce3f6193f50822de663404131f4575d) | success / success | `PENDING → SCORED`; `(relevance,gap,urgency,feasibility,total)=(2,3,1,3,9)`; round `EVALUATED` |
| allocate round 2 | `(2)` | [`0xf60da7…181c8`](https://explorer-studio.genlayer.com/tx/0xf60da7bb90fb1367cb997b9d5194a966ae1612072d42c7436b8938dc2d0181c8) | success / success | allocated IDs `[] → [1]`; submission `ALLOCATED` |
| acknowledge round 2 | `(2,1)` | [`0xa6204d…c7e3`](https://explorer-studio.genlayer.com/tx/0xa6204dc7fc6fa316dd9d263a119168f4a0fe325c6dc6940c7fcd2df975b4c7e3) | success / success | submission `ALLOCATED → ACKNOWLEDGED`, acknowledged_by locked reviewer |
| finalize round 2 | `(2)` | [`0x0e5ef7…918c7`](https://explorer-studio.genlayer.com/tx/0x0e5ef76cb48e29608c1c66b9b1a8c9646dbabca100f0698e1636266402d918c7) | success / success | round `CLAIM → FINAL` |
| post-final replay submit | `S2` | [`0x8690fa…3226b`](https://explorer-studio.genlayer.com/tx/0x8690fadb100719146b1b4cc50d2af92c8755c510d7ed088926e14c89e7e3226b) | expected `FINALIZED` execution `ERROR` rollback / same | round remained `FINAL`; submission count remained 1 |
| create round 3 | `R3` | [`0x097776…4d893`](https://explorer-studio.genlayer.com/tx/0x09777631c7ffd7693f9d6372e1092218dcc286f87a679f98309840ad7e94d893) | success / success | round count `2 → 3`; round 3 `OPEN` |
| submit round 3 ID 1 | `S3A` | [`0xf7d80a…42267`](https://explorer-studio.genlayer.com/tx/0xf7d80a20a74a1518920ac1890d0758d1edbddb9b9943f9e5d929964e7fc42267) | success / success | submission count `0 → 1`; ID 1 `PENDING` |
| submit round 3 ID 2 | `S3B` | [`0x8e2eff…aa924`](https://explorer-studio.genlayer.com/tx/0x8e2effcf11b9e353e15f0e58721a0d76ba703a426a89fda8651768582d0aa924) | success / success | submission count `1 → 2`; ID 2 `PENDING` |
| lock round 3 | `(3)` | [`0x57f964…ead1a`](https://explorer-studio.genlayer.com/tx/0x57f9649f50e41387232dbf5e4e83ae948a19e6cbc35b45ff7fb5bbb986fead1a) | success / success | `OPEN → LOCKED` |
| evaluate round 3 ID 1 | `(3,1)` | [`0x8b03f2…e186c`](https://explorer-studio.genlayer.com/tx/0x8b03f2fb82a630630ee2fc49f322af026a3cf592113d161eb7a000295d2e186c) | success / success | ID 1 `PENDING → SCORED`, ranking key `(9,1,3)` |
| evaluate round 3 ID 2 | `(3,2)` | [`0x020b2d…e7b3b`](https://explorer-studio.genlayer.com/tx/0x020b2dc0fe12716fbbd01eaacf269b485d71ce442f8bd08e79911109949e7b3b) | success / success | ID 2 `PENDING → SCORED`, same key; round `EVALUATED` |
| allocate tie | `(3)` | [`0x52d237…0dc78`](https://explorer-studio.genlayer.com/tx/0x52d2370e1b5b44f119d92d7e1e72c58a5e43b282fe3bec0ac42c15fc0870dc78) | success / success | allocated `[1]`, waitlisted `[2]` by lower ID tie-break |
| reclaim expiry | `(3)` | [`0xf0d05d…9fa0`](https://explorer-studio.genlayer.com/tx/0xf0d05d8bb015cd569bca012f93665d24f1bda18aa269a8e9c551513e77049fa0) | success / success | ID 1 `ALLOCATED → EXPIRED`; ID 2 `WAITLISTED → ALLOCATED` |
| acknowledge promoted | `(3,2)` | [`0x4a3029…b8e2c`](https://explorer-studio.genlayer.com/tx/0x4a302941b0db0fa4777dc92b6e8414cc2101d6867a58c335c747e8c59ddb8e2c) | success / success | ID 2 `ALLOCATED → ACKNOWLEDGED` |
| finalize round 3 | `(3)` | [`0x3baab8…698e4`](https://explorer-studio.genlayer.com/tx/0x3baab8cfa70f8db72b7c0ae16448f89dca33b03c0b7a98b3ce11e99f8e0698e4) | success / success | round `CLAIM → FINAL`; allocated `[2]`, waitlist empty |
| unauthorized upgrade | exact deployed source bytes, SHA-256 `b9f9…f805`; sender unauthorized `0x34b92E6553eaCA11A00A9d86d75d8a7881779D78` | [`0x2a8e7f…b866`](https://explorer-studio.genlayer.com/tx/0x2a8e7f2927639e013d1a2f9978e29aabfa12297cf296bcfe6376f7732528b866) | expected `FINALIZED` execution `ERROR` rollback / same, `Caller is not authorized to upgrade` | code hash and all round state unchanged |

## Live Studionet matrix

Every listed write reached `FINALIZED`; positive writes executed successfully with consensus, and expected rejections rolled back with unchanged authoritative state.

### Evidence-failure journey

- Round 1 create/submit/lock: [`0x20914e03129b842b5231b0ce9d1f665586967b101e1083d492a7da161ac246a3`](https://explorer-studio.genlayer.com/tx/0x20914e03129b842b5231b0ce9d1f665586967b101e1083d492a7da161ac246a3), [`0xcf030b5f5781680aaef3ad3c1a28435e6223f8d23e0ef1a1a4440dd93d5a909d`](https://explorer-studio.genlayer.com/tx/0xcf030b5f5781680aaef3ad3c1a28435e6223f8d23e0ef1a1a4440dd93d5a909d), [`0x24fbb5f19bbf838c03f1c363269c9853ca0085b841c469b787c7a499fdd9fc40`](https://explorer-studio.genlayer.com/tx/0x24fbb5f19bbf838c03f1c363269c9853ca0085b841c469b787c7a499fdd9fc40)
- Duplicate lock rejection: [`0xa7d329734d57675bc3ef7d36a04c3e4d190c0461d658ada3d3003757e10ee0c6`](https://explorer-studio.genlayer.com/tx/0xa7d329734d57675bc3ef7d36a04c3e4d190c0461d658ada3d3003757e10ee0c6)
- Evaluation: [`0x03bb73a149911f8629532fbb9cb78c2f2632bda6f3c5d9a2c46d4bde712f3080`](https://explorer-studio.genlayer.com/tx/0x03bb73a149911f8629532fbb9cb78c2f2632bda6f3c5d9a2c46d4bde712f3080) read back `UNRESOLVED`, score `0`, reason `EVIDENCE_FETCH_FAILED`.
- Allocate/finalize: [`0x6d9320a7f228cce9287f3774200e952faa07da3d3e178d508b0cb6d1421ff1cd`](https://explorer-studio.genlayer.com/tx/0x6d9320a7f228cce9287f3774200e952faa07da3d3e178d508b0cb6d1421ff1cd), [`0x9a10d81cf8864c0be2924d4b315e42a4cbdc2846ab652f12a2501d178af5e364`](https://explorer-studio.genlayer.com/tx/0x9a10d81cf8864c0be2924d4b315e42a4cbdc2846ab652f12a2501d178af5e364)

### Scored happy path and replay protection

- Round 2 create/submit/lock/evaluate: [`0xb35dc3874c4decf4b3fc60c38dcde9d5953cea48f80e511791e6394b5c98ced8`](https://explorer-studio.genlayer.com/tx/0xb35dc3874c4decf4b3fc60c38dcde9d5953cea48f80e511791e6394b5c98ced8), [`0x442896ea595ef9604e5c3b465a93d836bc9a74765920b796ed6b51d6f871fd41`](https://explorer-studio.genlayer.com/tx/0x442896ea595ef9604e5c3b465a93d836bc9a74765920b796ed6b51d6f871fd41), [`0xeec68914410975237ecf488d3db588d7565aa2f830dfc0a221272fb3fb7efe23`](https://explorer-studio.genlayer.com/tx/0xeec68914410975237ecf488d3db588d7565aa2f830dfc0a221272fb3fb7efe23), [`0xe01dc3e1b669602061d76772e99ab6430ce3f6193f50822de663404131f4575d`](https://explorer-studio.genlayer.com/tx/0xe01dc3e1b669602061d76772e99ab6430ce3f6193f50822de663404131f4575d)
- Evaluation readback: `SCORED`, relevance `2`, evidence gap `3`, urgency `1`, feasibility `3`, total `9`, frozen source provenance.
- Allocate/acknowledge/finalize: [`0xf60da7bb90fb1367cb997b9d5194a966ae1612072d42c7436b8938dc2d0181c8`](https://explorer-studio.genlayer.com/tx/0xf60da7bb90fb1367cb997b9d5194a966ae1612072d42c7436b8938dc2d0181c8), [`0xa6204dc7fc6fa316dd9d263a119168f4a0fe325c6dc6940c7fcd2df975b4c7e3`](https://explorer-studio.genlayer.com/tx/0xa6204dc7fc6fa316dd9d263a119168f4a0fe325c6dc6940c7fcd2df975b4c7e3), [`0x0e5ef76cb48e29608c1c66b9b1a8c9646dbabca100f0698e1636266402d918c7`](https://explorer-studio.genlayer.com/tx/0x0e5ef76cb48e29608c1c66b9b1a8c9646dbabca100f0698e1636266402d918c7). Readback was `FINAL` and submission `ACKNOWLEDGED`.
- Post-final replay: [`0x8690fadb100719146b1b4cc50d2af92c8755c510d7ed088926e14c89e7e3226b`](https://explorer-studio.genlayer.com/tx/0x8690fadb100719146b1b4cc50d2af92c8755c510d7ed088926e14c89e7e3226b) finalized with `Round is in FINAL state`; submission count remained `1`.

### Deterministic tie and timeout promotion

Round 3 evaluated two submissions with identical ranking keys `(total 9, urgency 1, evidence gap 3)`. Allocation selected lower submission ID `1`, leaving ID `2` waitlisted.

- Allocation: [`0x52d2370e1b5b44f119d92d7e1e72c58a5e43b282fe3bec0ac42c15fc0870dc78`](https://explorer-studio.genlayer.com/tx/0x52d2370e1b5b44f119d92d7e1e72c58a5e43b282fe3bec0ac42c15fc0870dc78), with readback `allocated_submission_ids:[1]`, `waitlisted_submission_ids:[2]`.
- Reclaim/promotion: [`0xf0d05d8bb015cd569bca012f93665d24f1bda18aa269a8e9c551513e77049fa0`](https://explorer-studio.genlayer.com/tx/0xf0d05d8bb015cd569bca012f93665d24f1bda18aa269a8e9c551513e77049fa0) changed ID `1` to `EXPIRED` and ID `2` to `ALLOCATED`.
- Promoted acknowledgment/finalize: [`0x4a302941b0db0fa4777dc92b6e8414cc2101d6867a58c335c747e8c59ddb8e2c`](https://explorer-studio.genlayer.com/tx/0x4a302941b0db0fa4777dc92b6e8414cc2101d6867a58c335c747e8c59ddb8e2c), [`0x3baab8cfa70f8db72b7c0ae16448f89dca33b03c0b7a98b3ce11e99f8e0698e4`](https://explorer-studio.genlayer.com/tx/0x3baab8cfa70f8db72b7c0ae16448f89dca33b03c0b7a98b3ce11e99f8e0698e4). Final readback: round `FINAL`, active allocated ID `[2]`, no waitlist.

### Steward correction E2E (exact production release)

- Vercel deployment: `dpl_CFHG8pdBWgtDXoJB6d1dKymZvYLV`; public production alias: `https://drug-shortage-research-priority-boa.vercel.app`. The immutable deployment hostname is Vercel-authenticated and is intentionally omitted from judge-facing links. The deployment was created before the fresh Round #6 E2E writes. The frontend runtime source is unchanged from the reviewed correction source; the later public revision contains ledger/scorecard documentation updates only.
- Wallet/provider: OKX Wallet, exact selected provider object, sender `0x5D598f10a428fb2039edbc3ace83351650b286e0`, Studionet chain `61999`; contract `0xba5fC48885c201C3efcE04B8810EAdf5376433d9`.

| Attempt | Exact args / sender | Transaction | Expected / actual classification | Consensus | Authoritative pre → post readback |
|---|---|---|---|---|---|
| create Round 6 | `("https://drug-shortage-research-priority-boa.vercel.app/openfda-demo-snapshot.json", "ab4749c2c0a05e0f789a1a121fe1ee6d62fb9c0ed62575dec15bac04c3d176d4", 1787946020, "2026-08-28", "Single-record openFDA public research demonstration cohort", "v1-demo", DEMO_RUBRIC, "v1", 1787946454, 3600, 2)` / OKX `0x5D598f10a428fb2039edbc3ace83351650b286e0` | [`0x2b19fe61ccef913a2eab8ff7ba39955f285e2b02574a5d9faeb8fd89d0785889`](https://explorer-studio.genlayer.com/tx/0x2b19fe61ccef913a2eab8ff7ba39955f285e2b02574a5d9faeb8fd89d0785889) | expected success / actual `FINALIZED`, execution `SUCCESS` | Normal Full Consensus | round count `5 → 6`; Round 6 `OPEN`, `submission_count=0`; frontend `READBACK_CONFIRMED` |
| lock Round 6 | `(6)` / OKX `0x5D598f10a428fb2039edbc3ace83351650b286e0` | [`0xf2472062902a158bae58455929b9d5a743ded0803de1be490a669918106a03e9`](https://explorer-studio.genlayer.com/tx/0xf2472062902a158bae58455929b9d5a743ded0803de1be490a669918106a03e9) | expected success / actual `FINALIZED`, execution `SUCCESS` | Normal Full Consensus | `OPEN`, `submission_count=0` → `EVALUATED`, `submission_count=0`; frontend `READBACK_CONFIRMED` |
| allocate Round 6 | `(6)` / OKX `0x5D598f10a428fb2039edbc3ace83351650b286e0` | [`0x4a35b9ecc6472b14f7fbe1b1f7d1ed1b6a1bbe1c546b681912e14c39bb19175a`](https://explorer-studio.genlayer.com/tx/0x4a35b9ecc6472b14f7fbe1b1f7d1ed1b6a1bbe1c546b681912e14c39bb19175a) | expected success / actual `FINALIZED`, execution `SUCCESS` | Normal Full Consensus | `EVALUATED`, zero eligible submissions → `FINAL`, `allocated_submission_ids=[]`; frontend `READBACK_CONFIRMED` |

## Production Vercel E2E

- Stable URL: `https://drug-shortage-research-priority-boa.vercel.app`
- Wallet/provider: OKX Wallet, exact selected provider object, account `0x5D598f10a428fb2039edbc3ace83351650b286e0`.
- Fresh reload began disconnected, exposed the EIP-6963 chooser, and connected the selected OKX provider. A second reload after Round 4 creation again began disconnected and automatically loaded the new round.
- Production contract configuration was verified as `0xba5fC48885c201C3efcE04B8810EAdf5376433d9`; the obsolete Vercel environment address was corrected before any write was sent.
- Round 4 arguments were the form's frozen demo fixture: snapshot `https://drug-shortage-research-priority-boa.vercel.app/openfda-demo-snapshot.json`, SHA-256 `ab4749c2c0a05e0f789a1a121fe1ee6d62fb9c0ed62575dec15bac04c3d176d4`, captured at `1787509504`, deadline `1787768704`, claim duration `3600`, slot capacity `2`.

| Browser action | Transaction | Terminal evidence | Authoritative UI/readback |
|---|---|---|---|
| create Round 4 | [`0x4f0079…6058`](https://explorer-studio.genlayer.com/tx/0x4f00790a204b76b8e311f42013fe604c887ea1238dcda5b659cafcd7d4f46058) | `FINALIZED`, execution `SUCCESS`, majority agree | round count `3 → 4`; Round 4 `OPEN`; creator matched OKX. The first bounded UI readback exposed the normalized-return decoder defect; direct authoritative readback confirmed the write, its hash was preserved, and the write was never replayed. |
| submit question ID 1 | [`0x8438bc…d7498`](https://explorer-studio.genlayer.com/tx/0x8438bcb18ca5524352b78c947c8dbbaf73f469c003fd6beb6f2fbea57b2d7498) | `FINALIZED`, execution `SUCCESS` | normalized return envelope decoded ID `1`; `READBACK_CONFIRMED`; form closed and queue updated without reload. |
| lock Round 4 | [`0x8c2a12…d7a13`](https://explorer-studio.genlayer.com/tx/0x8c2a12914b11db296cbb6db12450e3fa5bf8ed7966fe2721c3328d1bf61d7a13) | `FINALIZED`, execution `SUCCESS` | `OPEN → LOCKED`; `READBACK_CONFIRMED`. |
| evaluate question ID 1 | [`0x6806fb…bcf37`](https://explorer-studio.genlayer.com/tx/0x6806fb72c2c00d48392561aafc6a495d3318870963d160bd059f8666fbcbcf37) | `FINALIZED`, execution `SUCCESS`, consensus evaluation | ID 1 `SCORED`, total `9/16`; round `EVALUATED`; `READBACK_CONFIRMED`. |
| allocate slots | [`0x2749ec…08f76`](https://explorer-studio.genlayer.com/tx/0x2749ec80d7f3ca868c5b28657f11898cb34fd3a228a5309ca4e3a32e90108f76) | `FINALIZED`, execution `SUCCESS` | ID 1 `ALLOCATED`; round `CLAIM`; `READBACK_CONFIRMED`. |
| acknowledge ID 1 | [`0x1827bd…dd992`](https://explorer-studio.genlayer.com/tx/0x1827bda3a551b18bbea124889795ef691eb6d23062f062f841e2e0c39b2dd992) | `FINALIZED`, execution `SUCCESS` | ID 1 `ACKNOWLEDGED`; `READBACK_CONFIRMED`. |
| finalize Round 4 | [`0x1ec3e4…ae690`](https://explorer-studio.genlayer.com/tx/0x1ec3e4629ef3937fd98ef3d7b89dc8e5884f12f9c1488c066ca75890188ae690) | `FINALIZED`, execution `SUCCESS` | round `FINAL`; ID 1 remained `ACKNOWLEDGED`; `READBACK_CONFIRMED`. |

The captured normalized receipt envelope (`result.payload.readable`) is now decoded at the SDK boundary and has an executable regression. The finalized banner uses `allocations.allocated_submission_ids.length`, not configured slot capacity, and has a regression for capacity `2` with one actual allocation. No write was submitted twice.

The live Studio matrix and production Vercel lifecycle are complete for the deployed contract. The final anonymous checkpoint remains a later gate and is not claimed here.
