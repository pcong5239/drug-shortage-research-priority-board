# Verification

## Release identity

- Reviewed contract commit: `70c277d14e8cebfc6a5b6dd58ed313c44f84a772`
- Reviewed tree: `6b3d21b0d35a4722e80348d649fc583e345c4c21`
- Contract source SHA-256: `1f56f9df2fc6a2e0f4063dc90a57860a225b30e83568caf65ec17892622a8d9a`
- Network: GenLayer Studionet, chain ID `61999`
- RPC: `https://studio.genlayer.com/api`
- Contract: [`0x26C0413ED148085A8187D5dC47CEA06Ea4931A6A`](https://explorer-studio.genlayer.com/address/0x26C0413ED148085A8187D5dC47CEA06Ea4931A6A)
- Deployment: [`0x4999f6bc8972e695e3c0f241aeea7bd489f867807200b293f1bc1b9bd788e193`](https://explorer-studio.genlayer.com/tx/0x4999f6bc8972e695e3c0f241aeea7bd489f867807200b293f1bc1b9bd788e193) — `FINALIZED`, execution `SUCCESS`, consensus `Accepted`
- Locked deployer/upgrader: `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902`
- Live web URL: populated after the governed Vercel release

The final public-release commit may add presentation and evidence files, but the deployed contract file must retain the source hash above.

## Source parity and recovery

Studionet `gen_getContractCode` returned 46,881 bytes whose SHA-256 equals the reviewed source hash. `get_upgraders()` returned the locked address.

- Unauthorized exact-source upgrade: [`0xb8235ce2…2448d`](https://explorer-studio.genlayer.com/tx/0xb8235ce23f709c91d31bc73f4bffd661433feeebb098230e9af9de5138b2448d) — expected finalized rollback; source and upgrader state unchanged.
- Authorized exact-source upgrade: [`0xcf6963e4…53572`](https://explorer-studio.genlayer.com/tx/0xcf6963e43fc83f02ca62f8245a363c45bd6a3585792024702ed5d0aa0e853572) — finalized success; post-write code hash and upgrader readback matched.

## Automated verification

| Check | Command | Result |
|---|---|---|
| Direct contract suite | `.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider` | 31 passed |
| GenVM lint/validation | `genvm-lint check contracts\drug_shortage_research_priority_board.py` | 3 checks passed; 19 methods validated |
| GenVM schema | `genvm-lint schema contracts\drug_shortage_research_priority_board.py` | passed |
| GenVM typecheck | `genvm-lint typecheck contracts\drug_shortage_research_priority_board.py` | no type errors |
| Frontend suite | `pnpm test -- --run` | 62 passed |
| Frontend typecheck | `pnpm run typecheck` | passed |
| Production build | `pnpm run build` with the contract address | passed |

## Live Studionet proof

The governed 43-row Studio ledger covers deployment, recovery, expected rollback paths, evidence failure, replay rejection, deterministic ties, allocation, timeout promotion, reviewer acknowledgment, and finalization. The decisive journeys are:

- Evidence failure: [`evaluate_submission(1,1)`](https://explorer-studio.genlayer.com/tx/0x2ba5b5f3d617a0da23aec8586be0472dd82aaa4c32bc838116dc246f82373fce) finalized successfully; readback was `UNRESOLVED`, score `0`, reason `EVIDENCE_FETCH_FAILED`. The [repeat evaluation](https://explorer-studio.genlayer.com/tx/0x074c840fced8e739fc8709d4863d91950983bf69848f78e38f602f73b3f524e2) produced the expected rollback.
- Deterministic tie: [allocation](https://explorer-studio.genlayer.com/tx/0x2a06985572f07841199c1e383818669d2ca7ce5e1dfdf4a999a2254446ef02a9) selected submission `1` before equal-scoring submission `2`; [expiry reclaim](https://explorer-studio.genlayer.com/tx/0xcac6d4569c15fac15e158d52d5f25b888f06308f7b142eba0236e91343f557cb) promoted submission `2`.
- Happy path: [acknowledgment](https://explorer-studio.genlayer.com/tx/0x99840d3372c8a498035f83b46d84f41cfeb9b41284affaced0233ca667e0662f) recorded the designated reviewer; [finalization](https://explorer-studio.genlayer.com/tx/0x0b52bdbe81451a55a0a321284e2fffc4e005ead3b2c5078380f00816f5a51331) produced round state `FINAL`.

Every positive case required `FINALIZED`, successful execution, accepted consensus where applicable, and authoritative readback. Failed and `Undetermined` diagnostic attempts are retained in the internal evidence ledger but are not counted as passes.

## Remaining release gate

The exact Vercel URL, compiled production configuration, user-executed external-wallet E2E transactions, and final anonymous review are added only after deployment. Until then, this project is not claimed complete.
