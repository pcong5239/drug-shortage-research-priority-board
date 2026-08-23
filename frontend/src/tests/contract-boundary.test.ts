import { describe, it, expect, vi } from 'vitest';
import { abi } from 'genlayer-js';
import {
  parseJsonSafe,
  validateRoundData,
  validateEvaluationData,
  toSafeInteger,
  toSafeBigInt,
} from '../services/validation';
import { classifyReceipt, executeContractWrite, normalizeContractAddress } from '../services/contract';
import * as clientService from '../services/client';

const encodeReturn = (value: bigint): `0x${string}` =>
  `0x${Array.from(abi.calldata.encode(value), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;

describe('Contract Boundary & Data Parsing (Scenarios 27–38)', () => {
  it('preserves checksum case required by the Studionet contract lookup', () => {
    const address = '0x26C0413ED148085A8187D5dC47CEA06Ea4931A6A';
    expect(normalizeContractAddress(address)).toBe(address);
  });

  // Scenario 27: Malformed JSON view return is handled safely without crashing
  it('Scenario 27: safely rejects malformed JSON with error outcome', () => {
    const malformedJson = '{ "round_id": 1, "title": "Incomplete json...';
    const result = parseJsonSafe(malformedJson);
    expect(result.ok).toBe(false);

    expect(() => validateRoundData(malformedJson)).toThrow(/Failed to parse round data/i);
  });

  // Scenario 28: Out-of-bounds score in evaluation JSON is rejected by schema validator
  it('Scenario 28: rejects evaluation JSON containing invalid score range (> 4)', () => {
    const invalidEvaluation = {
      outcome: 'SCORED',
      scores: {
        shortage_urgency_signal: 5, // Invalid: exceeds 4
        substitutability_gap: 3,
        evidence_clarity: 2,
        feasibility_impact: 4,
      },
      reason_codes: ['URGENCY_DOCUMENTED'],
      rationale: 'Valid rationale',
      snapshot_freshness_seconds: 60,
    };

    expect(() => validateEvaluationData(invalidEvaluation)).toThrow(/out of bounds/i);
  });

  // Scenario 29: Unsafe integer exceeding Number.MAX_SAFE_INTEGER handled losslessly via BigInt
  it('Scenario 29: safely handles integers exceeding Number.MAX_SAFE_INTEGER', () => {
    const unsafeIntString = '90071992547409999999999999999999';
    const safeBig = toSafeBigInt(unsafeIntString);
    expect(safeBig).toBe(BigInt('90071992547409999999999999999999'));

    const safeNum = toSafeInteger(42);
    expect(safeNum).toBe(42);

    expect(toSafeInteger('not-a-number', 10)).toBe(10);
  });

  // Scenario 30: Contract call returns non-zero exit code / execution failure
  it('Scenario 30: classifies non-zero exit code as execution error', () => {
    const failedReceipt = {
      status: 'FINALIZED',
      execution_result: 'FINISHED_WITH_ERROR',
      error: 'Execution reverted: Round is not open',
    };

    const outcome = classifyReceipt(failedReceipt);
    expect(outcome.status).toBe('ERROR');
    expect(outcome.errorReason).toMatch(/Round is not open/i);
  });

  // Scenario 31: Missing receipt fields handled gracefully
  it('Scenario 31: classifies malformed/missing receipt fields without crashing', () => {
    const malformedReceipt = null;

    const outcome = classifyReceipt(malformedReceipt);
    expect(outcome.status).toBe('UNDETERMINED');
    expect(outcome.isFinalized).toBe(false);
    expect(outcome.errorReason).toBeDefined();
  });

  // Scenario 32: Transaction rejected by user (4001) transitions to ERROR with description
  it('Scenario 32: handles user rejection (code 4001) with clean error description', async () => {
    const onStateChange = vi.fn();
    const mockProvider = {
      request: vi.fn().mockRejectedValue({ code: 4001, message: 'User rejected transaction' }),
    };

    const outcome = await executeContractWrite({
      contractAddress: '0x1111111111111111111111111111111111111111',
      provider: mockProvider as any,
      accountAddress: '0x2222222222222222222222222222222222222222',
      functionName: 'create_round',
      args: ['https://fda.gov', '0x123', 0, '2026', 'desc', 'v1', 'rubric', 'v1', 3600, 86400, 2],
      actionName: 'Create Round',
      onStateChange,
    });

    expect(outcome.success).toBe(false);
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'ERROR',
        error: expect.stringMatching(/rejected/i),
      })
    );
  });

  // Scenario 33: Consensus timeout during finalization preserves transaction hash
  it('Scenario 33: preserves transaction hash on timeout error', async () => {
    const onStateChange = vi.fn();
    const mockProvider = {
      request: vi.fn().mockResolvedValue('0xpreservedtxhash123'),
    };

    vi.spyOn(clientService, 'createWalletBoundClient').mockReturnValue({
      writeContract: vi.fn().mockResolvedValue('0xpreservedtxhash123'),
      getTransaction: vi.fn().mockResolvedValue(null),
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
    } as any);

    const outcome = await executeContractWrite({
      contractAddress: '0x1111111111111111111111111111111111111111',
      provider: mockProvider as any,
      accountAddress: '0x2222222222222222222222222222222222222222',
      functionName: 'create_round',
      args: [],
      actionName: 'Create Round',
      onStateChange,
      timeoutMs: 100, // Short timeout for test
    });

    expect(outcome.success).toBe(false);
    expect(outcome.txHash).toBe('0xpreservedtxhash123');
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'ERROR',
        txHash: '0xpreservedtxhash123',
        error: expect.stringMatching(/timed out/i),
      })
    );
  });

  // Scenario 34: Successful transaction transitions through all stages
  it('Scenario 34: successfully transitions through complete state machine', async () => {
    const stageHistory: string[] = [];
    const onStateChange = vi.fn((state) => stageHistory.push(state.stage));

    const mockReceipt = {
      status: 'FINALIZED',
      execution_result: 'FINISHED_WITH_RETURN',
      consensus_data: { leader_receipt: [{ result: encodeReturn(1n) }] },
    };

    const mockProvider = {
      request: vi.fn().mockResolvedValue('0xsuccesshash'),
    };

    vi.spyOn(clientService, 'createWalletBoundClient').mockReturnValue({
      writeContract: vi.fn().mockResolvedValue('0xsuccesshash'),
      getTransaction: vi.fn().mockResolvedValue(mockReceipt),
      getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
    } as any);

    const readbackCheck = vi.fn().mockResolvedValue(true);

    const outcome = await executeContractWrite({
      contractAddress: '0x1111111111111111111111111111111111111111',
      provider: mockProvider as any,
      accountAddress: '0x2222222222222222222222222222222222222222',
      functionName: 'create_round',
      args: [],
      actionName: 'Create Round',
      onStateChange,
      performReadback: readbackCheck,
    });

    expect(outcome.success).toBe(true);
    expect(outcome.txHash).toBe('0xsuccesshash');
    expect(stageHistory).toContain('SIGNING');
    expect(stageHistory).toContain('SUBMITTED');
    expect(stageHistory).toContain('CONSENSUS');
    expect(stageHistory).toContain('FINALIZED');
    expect(stageHistory).toContain('EXECUTION_SUCCESS');
    expect(stageHistory).toContain('READBACK_CONFIRMED');
    expect(readbackCheck).toHaveBeenCalled();
  });

  // Scenario 35: Readback confirmation fails when contract state unchanged
  it('Scenario 35: flags error if readback verification returns false', async () => {
    const onStateChange = vi.fn();
    const mockReceipt = {
      status: 'FINALIZED',
      execution_result: 'FINISHED_WITH_RETURN',
      consensus_data: { leader_receipt: [{ result: encodeReturn(1n) }] },
    };

    const mockProvider = {
      request: vi.fn().mockResolvedValue('0xsuccesshash'),
    };

    vi.spyOn(clientService, 'createWalletBoundClient').mockReturnValue({
      writeContract: vi.fn().mockResolvedValue('0xsuccesshash'),
      getTransaction: vi.fn().mockResolvedValue(mockReceipt),
      getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
    } as any);

    const failingReadback = vi.fn().mockResolvedValue(false);

    const outcome = await executeContractWrite({
      contractAddress: '0x1111111111111111111111111111111111111111',
      provider: mockProvider as any,
      accountAddress: '0x2222222222222222222222222222222222222222',
      functionName: 'create_round',
      args: [],
      actionName: 'Create Round',
      onStateChange,
      performReadback: failingReadback,
    });

    expect(outcome.success).toBe(false);
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'ERROR',
        readbackStatus: 'MISMATCH',
        error: expect.stringMatching(/readback/i),
      })
    );
  });

  // Scenario 36: Readback confirmation succeeds when contract state matches
  it('Scenario 36: completes successfully when readback check passes', async () => {
    const onStateChange = vi.fn();
    const mockReceipt = {
      status: 'FINALIZED',
      execution_result: 'FINISHED_WITH_RETURN',
      consensus_data: { leader_receipt: [{ result: encodeReturn(1n) }] },
    };

    const mockProvider = {
      request: vi.fn().mockResolvedValue('0xhash123'),
    };

    vi.spyOn(clientService, 'createWalletBoundClient').mockReturnValue({
      writeContract: vi.fn().mockResolvedValue('0xhash123'),
      getTransaction: vi.fn().mockResolvedValue(mockReceipt),
      getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
    } as any);

    const passingReadback = vi.fn().mockResolvedValue(true);

    const outcome = await executeContractWrite({
      contractAddress: '0x1111111111111111111111111111111111111111',
      provider: mockProvider as any,
      accountAddress: '0x2222222222222222222222222222222222222222',
      functionName: 'create_round',
      args: [],
      actionName: 'Create Round',
      onStateChange,
      performReadback: passingReadback,
    });

    expect(outcome.success).toBe(true);
    expect(outcome.returnedId).toBe(1n);
    expect(passingReadback).toHaveBeenCalled();
  });

  // Scenario 37: Write returns new round ID
  it('Scenario 37: extracts and parses returned round ID from receipt', async () => {
    const onStateChange = vi.fn();
    const mockReceipt = {
      status: 'FINALIZED',
      execution_result: 'FINISHED_WITH_RETURN',
      consensus_data: { leader_receipt: [{ result: encodeReturn(5n) }] },
    };

    const mockProvider = {
      request: vi.fn().mockResolvedValue('0xroundhash'),
    };

    vi.spyOn(clientService, 'createWalletBoundClient').mockReturnValue({
      writeContract: vi.fn().mockResolvedValue('0xroundhash'),
      getTransaction: vi.fn().mockResolvedValue(mockReceipt),
      getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
    } as any);

    const outcome = await executeContractWrite({
      contractAddress: '0x1111111111111111111111111111111111111111',
      provider: mockProvider as any,
      accountAddress: '0x2222222222222222222222222222222222222222',
      functionName: 'create_round',
      args: [],
      actionName: 'Create Round',
      onStateChange,
    });

    expect(outcome.returnedId).toBe(5n);
  });

  // Scenario 38: Write returns new submission ID
  it('Scenario 38: extracts and parses returned submission ID from receipt', async () => {
    const onStateChange = vi.fn();
    const mockReceipt = {
      status: 'FINALIZED',
      execution_result: 'FINISHED_WITH_RETURN',
      consensus_data: { leader_receipt: [{ result: encodeReturn(12n) }] },
    };

    const mockProvider = {
      request: vi.fn().mockResolvedValue('0xsubhash'),
    };

    vi.spyOn(clientService, 'createWalletBoundClient').mockReturnValue({
      writeContract: vi.fn().mockResolvedValue('0xsubhash'),
      getTransaction: vi.fn().mockResolvedValue(mockReceipt),
      getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
    } as any);

    const outcome = await executeContractWrite({
      contractAddress: '0x1111111111111111111111111111111111111111',
      provider: mockProvider as any,
      accountAddress: '0x2222222222222222222222222222222222222222',
      functionName: 'submit_question',
      args: [],
      actionName: 'Submit Question',
      onStateChange,
    });

    expect(outcome.returnedId).toBe(12n);
  });
});
