# Verification

## Release identity

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
| Frontend suite | 69 passed |
| Frontend typecheck/build | passed |

## Studionet RPC budget

- Initial disconnected load of the latest finalized demo round: 11 bounded reads (round count, round, submission count, two submissions, two evaluations, allocations, limits, disclaimer, upgraders). No background state polling.
- RPC health probe: zero automatic calls; one call only when the user selects **Refresh RPC Latency**.
- Identical concurrent reads share one in-flight request. Overlapping React refresh effects coalesce; a successful write performs one deliberate reconciliation after its authoritative method-specific readback.
- Transient `429`, `-32029`, rate-limit, and server-busy reads retry at most three attempts with exponential backoff and jitter. Cancellation is checked before submission and before every retry.
- Transaction submission executes once per wallet authorization. Receipt polling is deadline-bounded with increasing delay; timeout preserves the transaction hash and never replays the write. Success still requires `FINALIZED`, execution `SUCCESS`, and authoritative readback with bounded backoff.
- Regression evidence covers concurrent-read deduplication, pre-submit cancellation, bounded 429 attempts, preserved hash on timeout, delayed readback without duplicate write, and the full wallet/provider suite.

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

The live Studio matrix is complete for the exact deployed contract. Production Vercel E2E and the final anonymous checkpoint remain later gates and are not claimed here.
