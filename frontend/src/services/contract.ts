import { abi } from 'genlayer-js';
import { getPublicClient, createWalletBoundClient } from './client';
import {
  validateRoundData,
  validateSubmissionData,
  validateEvaluationData,
  validateAllocationsData,
  validateCallerStatus,
  validateContractLimits,
  toSafeInteger,
  toSafeBigInt,
} from './validation';
import type {
  RoundData,
  SubmissionData,
  EvaluationData,
  AllocationsData,
  CallerStatus,
  ContractLimits,
} from '../types/contract';
import type { TransactionState } from '../types/transaction';
import type { EIP1193Provider } from '../types/wallet';

export const CONTRACT_ABI = [
  {
    type: 'function',
    name: 'get_round_count',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_round',
    inputs: [{ name: 'round_id', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_submission_count',
    inputs: [{ name: 'round_id', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_submission',
    inputs: [
      { name: 'round_id', type: 'uint256' },
      { name: 'submission_id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_evaluation',
    inputs: [
      { name: 'round_id', type: 'uint256' },
      { name: 'submission_id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_allocations',
    inputs: [{ name: 'round_id', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_caller_status',
    inputs: [
      { name: 'round_id', type: 'uint256' },
      { name: 'caller_address', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_limits',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_contract_disclaimer',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'get_upgraders',
    inputs: [],
    outputs: [{ name: '', type: 'string[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'create_round',
    inputs: [
      { name: 'snapshot_uri', type: 'string' },
      { name: 'snapshot_sha256', type: 'string' },
      { name: 'captured_at', type: 'uint256' },
      { name: 'dataset_last_updated', type: 'string' },
      { name: 'subset_description', type: 'string' },
      { name: 'rubric_version', type: 'string' },
      { name: 'rubric_text', type: 'string' },
      { name: 'disclaimer_version', type: 'string' },
      { name: 'submission_deadline', type: 'uint256' },
      { name: 'claim_duration', type: 'uint256' },
      { name: 'slot_count', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'submit_question',
    inputs: [
      { name: 'round_id', type: 'uint256' },
      { name: 'question_text', type: 'string' },
      { name: 'canonical_subject_key', type: 'string' },
      { name: 'evidence_urls', type: 'string[]' },
      { name: 'reviewer_address', type: 'string' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'lock_round',
    inputs: [{ name: 'round_id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'evaluate_submission',
    inputs: [
      { name: 'round_id', type: 'uint256' },
      { name: 'submission_id', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allocate_slots',
    inputs: [{ name: 'round_id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'acknowledge_slot',
    inputs: [
      { name: 'round_id', type: 'uint256' },
      { name: 'submission_id', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'reclaim_expired_slots',
    inputs: [{ name: 'round_id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'finalize_round',
    inputs: [{ name: 'round_id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export function getContractAddress(): string | null {
  const addr = ((import.meta as any).env?.VITE_GENLAYER_CONTRACT_ADDRESS || '').trim();
  return normalizeContractAddress(addr);
}

export function normalizeContractAddress(addr: string): string | null {
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    return null;
  }
  return addr;
}

const inFlightReads = new Map<string, Promise<unknown>>();

function readKey(request: Record<string, unknown>): string {
  return JSON.stringify(request, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
}

function isTransientRpcError(error: unknown): boolean {
  const value = error as any;
  const text = `${value?.message || ''} ${value?.code || ''}`.toLowerCase();
  return text.includes('429') || text.includes('rate limit') || text.includes('server busy') || text.includes('-32029');
}

function abortError(): Error {
  const error = new Error('RPC read cancelled');
  error.name = 'AbortError';
  return error;
}

async function readContractDeduped(request: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw abortError();
  const key = readKey(request);
  const existing = inFlightReads.get(key);
  if (existing) return existing;

  const operation = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (signal?.aborted) throw abortError();
      try {
        const result = await getPublicClient().readContract(request as any);
        if (signal?.aborted) throw abortError();
        return result;
      } catch (error) {
        lastError = error;
        if (!isTransientRpcError(error) || attempt === 2) throw error;
        const delayMs = 500 * (2 ** attempt) + Math.floor(Math.random() * 150);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  })();

  inFlightReads.set(key, operation);
  try {
    return await operation;
  } finally {
    if (inFlightReads.get(key) === operation) inFlightReads.delete(key);
  }
}

// -----------------------------------------------------------------------------
// Read Calls with Runtime Validation
// -----------------------------------------------------------------------------

export async function fetchRoundCount(contractAddress: string, signal?: AbortSignal): Promise<number> {
  const raw = await readContractDeduped({
    address: contractAddress as `0x${string}`,
    functionName: 'get_round_count',
    args: [],
  }, signal);
  return toSafeInteger(raw, 0);
}

export async function fetchRound(contractAddress: string, roundId: number | bigint, signal?: AbortSignal): Promise<RoundData> {
  const raw = await readContractDeduped({
    address: contractAddress as `0x${string}`,
    functionName: 'get_round',
    args: [toSafeBigInt(roundId)],
  }, signal);
  return validateRoundData(raw);
}

export async function fetchSubmissionCount(contractAddress: string, roundId: number | bigint, signal?: AbortSignal): Promise<number> {
  const raw = await readContractDeduped({
    address: contractAddress as `0x${string}`,
    functionName: 'get_submission_count',
    args: [toSafeBigInt(roundId)],
  }, signal);
  return toSafeInteger(raw, 0);
}

export async function fetchSubmission(
  contractAddress: string,
  roundId: number | bigint,
  submissionId: number | bigint,
  signal?: AbortSignal
): Promise<SubmissionData> {
  const raw = await readContractDeduped({
    address: contractAddress as `0x${string}`,
    functionName: 'get_submission',
    args: [toSafeBigInt(roundId), toSafeBigInt(submissionId)],
  }, signal);
  return validateSubmissionData(raw);
}

export async function fetchEvaluation(
  contractAddress: string,
  roundId: number | bigint,
  submissionId: number | bigint,
  signal?: AbortSignal
): Promise<EvaluationData> {
  const raw = await readContractDeduped({
    address: contractAddress as `0x${string}`,
    functionName: 'get_evaluation',
    args: [toSafeBigInt(roundId), toSafeBigInt(submissionId)],
  }, signal);
  return validateEvaluationData(raw);
}

export async function fetchAllocations(contractAddress: string, roundId: number | bigint, signal?: AbortSignal): Promise<AllocationsData> {
  const raw = await readContractDeduped({
    address: contractAddress as `0x${string}`,
    functionName: 'get_allocations',
    args: [toSafeBigInt(roundId)],
  }, signal);
  return validateAllocationsData(raw);
}

export async function fetchCallerStatus(
  contractAddress: string,
  roundId: number | bigint,
  callerAddress: string,
  signal?: AbortSignal
): Promise<CallerStatus> {
  const raw = await readContractDeduped({
    address: contractAddress as `0x${string}`,
    functionName: 'get_caller_status',
    args: [toSafeBigInt(roundId), callerAddress],
  }, signal);
  return validateCallerStatus(raw);
}

export async function fetchLimits(contractAddress: string, signal?: AbortSignal): Promise<ContractLimits> {
  const raw = await readContractDeduped({
    address: contractAddress as `0x${string}`,
    functionName: 'get_limits',
    args: [],
  }, signal);
  return validateContractLimits(raw);
}

export async function fetchContractDisclaimer(contractAddress: string, signal?: AbortSignal): Promise<string> {
  const raw = await readContractDeduped({
    address: contractAddress as `0x${string}`,
    functionName: 'get_contract_disclaimer',
    args: [],
  }, signal);
  return typeof raw === 'string' ? raw : String(raw || '');
}

export async function fetchUpgraders(contractAddress: string, signal?: AbortSignal): Promise<string[]> {
  const raw = await readContractDeduped({
    address: contractAddress as `0x${string}`,
    functionName: 'get_upgraders',
    args: [],
  }, signal);
  if (Array.isArray(raw)) {
    return raw.map((a) => String(a).toLowerCase());
  }
  return [];
}

// -----------------------------------------------------------------------------
// Transaction Receipt & Execution Analysis (GenLayer 1.1.8 Specification)
// -----------------------------------------------------------------------------

export interface ClassifiedReceipt {
  status: 'SUCCESS' | 'ERROR' | 'UNDETERMINED';
  isFinalized: boolean;
  returnedValue?: unknown;
  rawReceipt: unknown;
  errorReason?: string;
}

function hexToBytes(value: string): Uint8Array {
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('Malformed GenVM return payload');
  }
  return Uint8Array.from(hex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
}

export function decodeReturnedId(value: unknown): bigint | null {
  let decoded: unknown;
  try {
    decoded = typeof value === 'string' ? abi.calldata.decode(hexToBytes(value)) : value;
  } catch {
    return null;
  }

  if (typeof decoded === 'bigint') return decoded >= 0n ? decoded : null;
  if (typeof decoded === 'number' && Number.isSafeInteger(decoded) && decoded >= 0) {
    return BigInt(decoded);
  }
  return null;
}

export function classifyReceipt(receipt: any): ClassifiedReceipt {
  if (!receipt || typeof receipt !== 'object') {
    return {
      status: 'UNDETERMINED',
      isFinalized: false,
      rawReceipt: receipt,
      errorReason: 'Malformed or empty transaction receipt',
    };
  }

  // 1. Inspect status representations from GenLayer
  const rawStatus = receipt.status;
  const statusName = String(receipt.status_name || receipt.statusName || (typeof rawStatus === 'string' ? rawStatus : '')).toUpperCase();
  const statusNum = typeof rawStatus === 'number' ? rawStatus : (typeof rawStatus === 'string' && /^\d+$/.test(rawStatus) ? parseInt(rawStatus, 10) : null);

  // Terminal consensus failure statuses
  if (
    statusName === 'UNDETERMINED' ||
    statusNum === 6 ||
    statusName === 'CANCELED' ||
    statusNum === 8 ||
    statusName === 'VALIDATORS_TIMEOUT' ||
    statusNum === 12 ||
    statusName === 'LEADER_TIMEOUT' ||
    statusNum === 13 ||
    statusName === 'ERROR' ||
    statusName === 'FAILED'
  ) {
    return {
      status: 'UNDETERMINED',
      isFinalized: true,
      rawReceipt: receipt,
      errorReason: receipt.error || receipt.errorMessage || `Consensus resolved with terminal status: ${statusName || statusNum}`,
    };
  }

  // Check whether transaction has reached authoritative FINALIZED status (Status 7 / 'FINALIZED')
  const isFinalized = statusName === 'FINALIZED' || statusNum === 7;

  if (!isFinalized) {
    // Non-terminal intermediate states (PENDING, PROPOSING, COMMITTING, REVEALING, ACCEPTED, APPEAL_*, etc.)
    // Note: mere EVM blockNumber or block number alone does NOT represent GenLayer finality.
    return {
      status: 'UNDETERMINED',
      isFinalized: false,
      rawReceipt: receipt,
      errorReason: `Transaction is in non-final state: ${statusName || (rawStatus !== undefined ? String(rawStatus) : 'PENDING')}`,
    };
  }

  // 2. Transaction is FINALIZED. Now verify execution success independently.
  // Execution result signals in GenLayer:
  // - txExecutionResult: 1 (FINISHED_WITH_RETURN), 2 (FINISHED_WITH_ERROR), 0 (NOT_VOTED)
  // - consensus_data.final_execution_result: "FINISHED_WITH_RETURN" vs "FINISHED_WITH_ERROR"
  // - consensus_data.leader_receipt[0].execution_result: "FINISHED_WITH_RETURN" or 1
  // - consensus_data.leader_receipt[0].genvm_result: "FINISHED_WITH_RETURN" or 1
  // - execution_result: "FINISHED_WITH_RETURN" or 1 or "SUCCESS"
  const leaderReceipt = Array.isArray(receipt.consensus_data?.leader_receipt)
    ? receipt.consensus_data.leader_receipt[0]
    : receipt.consensus_data?.leader_receipt;

  const rawExecResult =
    receipt.execution_result ??
    receipt.txExecutionResult ??
    receipt.consensus_data?.final_execution_result ??
    leaderReceipt?.execution_result ??
    leaderReceipt?.genvm_result;

  const execString = typeof rawExecResult === 'string' ? rawExecResult.toUpperCase() : '';
  const execNum = typeof rawExecResult === 'number' ? rawExecResult : null;

  const hasExplicitFailure =
    execString === 'FINISHED_WITH_ERROR' ||
    execString === 'FAILURE' ||
    execString === 'REVERTED' ||
    execNum === 2 ||
    Boolean(receipt.error) ||
    Boolean(receipt.errorMessage);

  if (hasExplicitFailure) {
    return {
      status: 'ERROR',
      isFinalized: true,
      rawReceipt: receipt,
      errorReason: receipt.error || receipt.errorMessage || 'Transaction finalized with on-chain execution error.',
    };
  }

  const isExecutionSuccess =
    execString === 'FINISHED_WITH_RETURN' ||
    execString === 'SUCCESS' ||
    execNum === 1;

  if (!isExecutionSuccess) {
    // Missing or unvoted execution result
    return {
      status: 'ERROR',
      isFinalized: true,
      rawReceipt: receipt,
      errorReason: 'Transaction finalized but on-chain execution result is unverified or not voted.',
    };
  }

  // Only the finalized leader receipt carries the contract return payload.
  // `receipt.result` is the consensus vote result (AGREE/DISAGREE), not the
  // Intelligent Contract return value, and `receipt.data` is transaction data.
  const returnedValue = leaderReceipt?.result;

  return {
    status: 'SUCCESS',
    isFinalized: true,
    returnedValue,
    rawReceipt: receipt,
  };
}

// -----------------------------------------------------------------------------
// Centralized Write Workflow with 6-Stage Lifecycle and Readback Confirmation
// -----------------------------------------------------------------------------

export interface ExecuteWriteOptions {
  contractAddress: string;
  provider: EIP1193Provider;
  accountAddress: string;
  functionName: string;
  args: unknown[];
  actionName: string;
  onStateChange: (state: TransactionState) => void;
  performReadback?: (returnedId: bigint | number | null) => Promise<boolean>;
  timeoutMs?: number;
  readbackTimeoutMs?: number;
}

export async function executeContractWrite({
  contractAddress,
  provider,
  accountAddress,
  functionName,
  args,
  actionName,
  onStateChange,
  performReadback,
  timeoutMs = 240000,
  readbackTimeoutMs = 20000,
}: ExecuteWriteOptions): Promise<{ success: boolean; txHash: string | null; returnedId: bigint | number | null }> {
  let currentState: TransactionState = {
    stage: 'SIGNING',
    txHash: null,
    actionName,
    error: null,
    returnedId: null,
    readbackStatus: null,
    details: 'Awaiting signature from selected wallet...',
  };
  onStateChange(currentState);

  let txHash: string | null = null;

  try {
    // 1. SIGNING & SUBMIT: Instantiate client bound strictly to selected provider
    const client = createWalletBoundClient(provider, accountAddress);

    // Call official genlayer-js writeContract flow
    const rawTxHash = await client.writeContract({
      address: contractAddress as `0x${string}`,
      functionName,
      args: args as any,
      value: 0n,
    });

    if (typeof rawTxHash !== 'string' || !rawTxHash.startsWith('0x')) {
      throw new Error('Wallet did not return a valid transaction hash');
    }
    txHash = rawTxHash;

    // 2. SUBMITTED
    currentState = {
      ...currentState,
      stage: 'SUBMITTED',
      txHash,
      details: 'Transaction submitted to GenLayer. Awaiting consensus...',
    };
    onStateChange(currentState);

    // 3. CONSENSUS POLLING (bounded deadline on bound client)
    currentState = {
      ...currentState,
      stage: 'CONSENSUS',
      details: 'Validators establishing consensus on frozen evidence...',
    };
    onStateChange(currentState);

    const startTime = Date.now();
    let classified: ClassifiedReceipt | null = null;

    let pollAttempt = 0;
    while (Date.now() - startTime < timeoutMs) {
      try {
        let receipt: any = null;
        if (typeof client.getTransaction === 'function') {
          receipt = await client.getTransaction({ hash: txHash as any });
        }
        if (!receipt && typeof client.getTransactionReceipt === 'function') {
          receipt = await client.getTransactionReceipt({ hash: txHash as any });
        }

        if (receipt) {
          classified = classifyReceipt(receipt);
          if (classified.isFinalized) {
            break;
          }
        }
      } catch (pollErr) {
        // Preserve the submitted hash and reconcile with bounded backoff.
      }
      const pollDelayMs = Math.min(8000, 2000 * (2 ** Math.min(pollAttempt, 2))) + Math.floor(Math.random() * 250);
      pollAttempt += 1;
      await new Promise((r) => setTimeout(r, pollDelayMs));
    }

    if (!classified || !classified.isFinalized) {
      currentState = {
        ...currentState,
        stage: 'ERROR',
        error: `Transaction consensus timed out after ${Math.round(timeoutMs / 1000)}s (Transaction hash preserved).`,
        details: 'You may reconcile current on-chain state before retrying.',
      };
      onStateChange(currentState);
      return { success: false, txHash, returnedId: null };
    }

    if (classified.status !== 'SUCCESS') {
      currentState = {
        ...currentState,
        stage: 'ERROR',
        error: classified.errorReason || 'Transaction finalized with execution failure.',
      };
      onStateChange(currentState);
      return { success: false, txHash, returnedId: null };
    }

    // 4. FINALIZED: Consensus reached and finalized
    currentState = {
      ...currentState,
      stage: 'FINALIZED',
      details: 'Consensus finalized. Verifying execution output...',
    };
    onStateChange(currentState);

    // 5. EXECUTION SUCCESS: Extract returned value
    const returnedId = decodeReturnedId(classified.returnedValue);

    currentState = {
      ...currentState,
      stage: 'EXECUTION_SUCCESS',
      returnedId,
      details: 'Execution verified. Running authoritative contract readback...',
    };
    onStateChange(currentState);

    // 6. READBACK CONFIRMED: Perform on-chain verification
    if (performReadback) {
      const readbackDeadline = Date.now() + readbackTimeoutMs;
      let lastReadbackError: unknown = null;

      let readbackAttempt = 0;
      do {
        try {
          const confirmed = await performReadback(returnedId);
          if (confirmed) {
            currentState = {
              ...currentState,
              stage: 'READBACK_CONFIRMED',
              readbackStatus: 'CONFIRMED',
              details: 'Readback confirmed on-chain state change.',
            };
            onStateChange(currentState);
            return { success: true, txHash, returnedId };
          }
        } catch (readbackErr) {
          lastReadbackError = readbackErr;
        }

        if (Date.now() < readbackDeadline) {
          const readbackDelayMs = Math.min(8000, 1000 * (2 ** Math.min(readbackAttempt, 3)));
          readbackAttempt += 1;
          await new Promise((resolve) => setTimeout(resolve, readbackDelayMs));
        }
      } while (Date.now() < readbackDeadline);

      if (lastReadbackError) {
        currentState = {
          ...currentState,
          stage: 'ERROR',
          readbackStatus: 'DELAYED',
          error: `Readback error: ${lastReadbackError instanceof Error ? lastReadbackError.message : String(lastReadbackError)}`,
        };
      } else {
          currentState = {
            ...currentState,
            stage: 'ERROR',
            readbackStatus: 'MISMATCH',
            error: 'Authoritative contract readback did not confirm expected on-chain state change.',
          };
      }
      onStateChange(currentState);
      return { success: false, txHash, returnedId };
    }

    currentState = {
      ...currentState,
      stage: 'READBACK_CONFIRMED',
      readbackStatus: 'CONFIRMED',
      details: 'Transaction completed and confirmed.',
    };
    onStateChange(currentState);
    return { success: true, txHash, returnedId };
  } catch (err: any) {
    const msg = err?.message || (typeof err === 'string' ? err : err?.error || '');
    const code = err?.code || err?.data?.originalError?.code;
    let userMessage = msg || 'Transaction failed';
    if (code === 4001 || msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
      userMessage = 'Transaction signature was rejected by user in wallet.';
    }
    currentState = {
      ...currentState,
      stage: 'ERROR',
      error: userMessage,
      details: txHash ? `Transaction hash: ${txHash}` : undefined,
    };
    onStateChange(currentState);
    return { success: false, txHash, returnedId: null };
  }
}
