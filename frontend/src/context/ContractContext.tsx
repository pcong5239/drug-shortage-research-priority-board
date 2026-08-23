import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type {
  RoundData,
  SubmissionData,
  EvaluationData,
  AllocationsData,
  CallerStatus,
  ContractLimits,
} from '../types/contract';
import type { TransactionState } from '../types/transaction';
import {
  getContractAddress,
  fetchRoundCount,
  fetchRound,
  fetchSubmissionCount,
  fetchSubmission,
  fetchEvaluation,
  fetchAllocations,
  fetchCallerStatus,
  fetchLimits,
  fetchContractDisclaimer,
  fetchUpgraders,
  executeContractWrite,
} from '../services/contract';
import { useWallet } from './WalletContext';

export interface ContractContextValue {
  contractAddress: string | null;
  isContractConfigured: boolean;
  roundCount: number;
  selectedRoundId: number | null;
  setSelectedRoundId: (id: number | null) => void;
  currentRound: RoundData | null;
  submissions: SubmissionData[];
  evaluations: Record<number, EvaluationData>;
  allocations: AllocationsData | null;
  callerStatus: CallerStatus | null;
  limits: ContractLimits | null;
  contractDisclaimer: string;
  upgraders: string[];
  selectedSubmissionId: number | null;
  setSelectedSubmissionId: (id: number | null) => void;
  isLoading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  txState: TransactionState;
  resetTxState: () => void;

  // Writes
  createRound: (params: {
    snapshotUri: string;
    snapshotSha256: string;
    capturedAt: number;
    datasetLastUpdated: string;
    subsetDescription: string;
    rubricVersion: string;
    rubricText: string;
    disclaimerVersion: string;
    submissionDeadline: number;
    claimDuration: number;
    slotCount: number;
  }) => Promise<{ success: boolean; roundId: number | null; txHash: string | null }>;

  submitQuestion: (params: {
    roundId: number;
    questionText: string;
    canonicalSubjectKey: string;
    evidenceUrls: string[];
    reviewerAddress: string;
  }) => Promise<{ success: boolean; submissionId: number | null; txHash: string | null }>;

  lockRound: (roundId: number) => Promise<boolean>;
  evaluateSubmission: (roundId: number, submissionId: number) => Promise<boolean>;
  allocateSlots: (roundId: number) => Promise<boolean>;
  acknowledgeSlot: (roundId: number, submissionId: number) => Promise<boolean>;
  reclaimExpiredSlots: (roundId: number) => Promise<boolean>;
  finalizeRound: (roundId: number) => Promise<boolean>;
}

const ContractContext = createContext<ContractContextValue | null>(null);

const INITIAL_TX_STATE: TransactionState = {
  stage: 'IDLE',
  txHash: null,
  actionName: '',
  error: null,
  returnedId: null,
  readbackStatus: null,
};

interface ContractProviderProps {
  children: React.ReactNode;
  contractAddressOverride?: string;
}

export const ContractProvider: React.FC<ContractProviderProps> = ({ children, contractAddressOverride }) => {
  const contractAddress = (contractAddressOverride || getContractAddress() || '').trim() || null;
  const isContractConfigured = Boolean(contractAddress);

  const { connectedAccount, connectedProvider, isCorrectChain } = useWallet();

  const [roundCount, setRoundCount] = useState<number>(0);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [currentRound, setCurrentRound] = useState<RoundData | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionData[]>([]);
  const [evaluations, setEvaluations] = useState<Record<number, EvaluationData>>({});
  const [allocations, setAllocations] = useState<AllocationsData | null>(null);
  const [callerStatus, setCallerStatus] = useState<CallerStatus | null>(null);
  const [limits, setLimits] = useState<ContractLimits | null>(null);
  const [contractDisclaimer, setContractDisclaimer] = useState<string>('');
  const [upgraders, setUpgraders] = useState<string[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [txState, setTxState] = useState<TransactionState>(INITIAL_TX_STATE);

  const resetTxState = useCallback(() => {
    setTxState(INITIAL_TX_STATE);
  }, []);

  const refreshData = useCallback(async () => {
    if (!contractAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch static / high-level metadata
      const [count, lims, disc, upgs] = await Promise.all([
        fetchRoundCount(contractAddress).catch(() => 0),
        fetchLimits(contractAddress).catch(() => null),
        fetchContractDisclaimer(contractAddress).catch(() => ''),
        fetchUpgraders(contractAddress).catch(() => []),
      ]);

      setRoundCount(count);
      if (lims) setLimits(lims);
      if (disc) setContractDisclaimer(disc);
      setUpgraders(upgs);

      // Determine active round
      let activeRoundId = selectedRoundId;
      if (activeRoundId === null && count > 0) {
        activeRoundId = count; // Default to latest round
        setSelectedRoundId(count);
      }

      if (activeRoundId && activeRoundId > 0 && activeRoundId <= count) {
        // 2. Fetch round details
        const rData = await fetchRound(contractAddress, activeRoundId);
        setCurrentRound(rData);

        // 3. Fetch submissions
        const subCount = await fetchSubmissionCount(contractAddress, activeRoundId).catch(() => 0);
        const subList: SubmissionData[] = [];
        const evalMap: Record<number, EvaluationData> = {};

        for (let i = 1; i <= subCount; i++) {
          try {
            const sub = await fetchSubmission(contractAddress, activeRoundId, i);
            subList.push(sub);

            if (sub.status !== 'PENDING') {
              try {
                const ev = await fetchEvaluation(contractAddress, activeRoundId, i);
                evalMap[i] = ev;
              } catch {
                // Ignore missing evaluation
              }
            }
          } catch {
            // Ignore single submission fetch error
          }
        }
        setSubmissions(subList);
        setEvaluations(evalMap);

        // Auto-select first submission if none selected
        if (subList.length > 0) {
          setSelectedSubmissionId((prev) => (prev && subList.some((s) => s.submission_id === prev) ? prev : subList[0].submission_id));
        } else {
          setSelectedSubmissionId(null);
        }

        // 4. Fetch allocations if evaluated or beyond
        if (['ALLOCATED', 'CLAIM', 'FINAL'].includes(rData.state)) {
          try {
            const alloc = await fetchAllocations(contractAddress, activeRoundId);
            setAllocations(alloc);
          } catch {
            setAllocations(null);
          }
        } else {
          setAllocations(null);
        }

        // 5. Fetch caller status if wallet is connected
        if (connectedAccount) {
          try {
            const cStatus = await fetchCallerStatus(contractAddress, activeRoundId, connectedAccount);
            setCallerStatus(cStatus);
          } catch {
            setCallerStatus(null);
          }
        } else {
          setCallerStatus(null);
        }
      } else {
        setCurrentRound(null);
        setSubmissions([]);
        setEvaluations({});
        setAllocations(null);
        setCallerStatus(null);
      }
    } catch (err: any) {
      setError(`Failed to fetch on-chain state: ${err?.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress, selectedRoundId, connectedAccount]);

  useEffect(() => {
    if (isContractConfigured) {
      refreshData();
    }
  }, [isContractConfigured, refreshData]);

  // ---------------------------------------------------------------------------
  // Write Handlers
  // ---------------------------------------------------------------------------

  const createRound = useCallback(
    async (params: {
      snapshotUri: string;
      snapshotSha256: string;
      capturedAt: number;
      datasetLastUpdated: string;
      subsetDescription: string;
      rubricVersion: string;
      rubricText: string;
      disclaimerVersion: string;
      submissionDeadline: number;
      claimDuration: number;
      slotCount: number;
    }) => {
      if (!contractAddress || !connectedProvider || !connectedAccount || !isCorrectChain) {
        throw new Error('Wallet not connected on Studionet or contract not configured');
      }

      const args = [
        params.snapshotUri,
        params.snapshotSha256,
        BigInt(params.capturedAt),
        params.datasetLastUpdated,
        params.subsetDescription,
        params.rubricVersion,
        params.rubricText,
        params.disclaimerVersion,
        BigInt(params.submissionDeadline),
        BigInt(params.claimDuration),
        BigInt(params.slotCount),
      ];

      const res = await executeContractWrite({
        contractAddress,
        provider: connectedProvider,
        accountAddress: connectedAccount,
        functionName: 'create_round',
        args,
        actionName: 'Create Research Priority Round',
        onStateChange: setTxState,
        performReadback: async (returnedId) => {
          // Readback: check if round exists and matches parameters
          if (returnedId === null) return false;
          const id = Number(returnedId);
          try {
            const rd = await fetchRound(contractAddress, id);
            return rd.round_id === id && rd.snapshot_sha256 === params.snapshotSha256.toLowerCase();
          } catch {
            return false;
          }
        },
      });

      if (res.success) {
        await refreshData();
      }

      return {
        success: res.success,
        roundId: res.returnedId ? Number(res.returnedId) : null,
        txHash: res.txHash,
      };
    },
    [contractAddress, connectedProvider, connectedAccount, isCorrectChain, refreshData]
  );

  const submitQuestion = useCallback(
    async (params: {
      roundId: number;
      questionText: string;
      canonicalSubjectKey: string;
      evidenceUrls: string[];
      reviewerAddress: string;
    }) => {
      if (!contractAddress || !connectedProvider || !connectedAccount || !isCorrectChain) {
        throw new Error('Wallet not connected on Studionet or contract not configured');
      }

      const args = [
        BigInt(params.roundId),
        params.questionText,
        params.canonicalSubjectKey,
        params.evidenceUrls,
        params.reviewerAddress || connectedAccount,
      ];

      const res = await executeContractWrite({
        contractAddress,
        provider: connectedProvider,
        accountAddress: connectedAccount,
        functionName: 'submit_question',
        args,
        actionName: 'Submit Research Question',
        onStateChange: setTxState,
        performReadback: async (returnedId) => {
          if (!returnedId) return false;
          try {
            const sub = await fetchSubmission(contractAddress, params.roundId, Number(returnedId));
            return sub.round_id === params.roundId && sub.submission_id === Number(returnedId);
          } catch {
            return false;
          }
        },
      });

      if (res.success) {
        await refreshData();
      }

      return {
        success: res.success,
        submissionId: res.returnedId ? Number(res.returnedId) : null,
        txHash: res.txHash,
      };
    },
    [contractAddress, connectedProvider, connectedAccount, isCorrectChain, refreshData]
  );

  const lockRound = useCallback(
    async (roundId: number) => {
      if (!contractAddress || !connectedProvider || !connectedAccount || !isCorrectChain) {
        throw new Error('Wallet not connected on Studionet or contract not configured');
      }

      const res = await executeContractWrite({
        contractAddress,
        provider: connectedProvider,
        accountAddress: connectedAccount,
        functionName: 'lock_round',
        args: [BigInt(roundId)],
        actionName: `Lock Round #${roundId}`,
        onStateChange: setTxState,
        performReadback: async () => {
          const rd = await fetchRound(contractAddress, roundId);
          return rd.state === 'LOCKED';
        },
      });

      if (res.success) {
        await refreshData();
      }
      return res.success;
    },
    [contractAddress, connectedProvider, connectedAccount, isCorrectChain, refreshData]
  );

  const evaluateSubmission = useCallback(
    async (roundId: number, submissionId: number) => {
      if (!contractAddress || !connectedProvider || !connectedAccount || !isCorrectChain) {
        throw new Error('Wallet not connected on Studionet or contract not configured');
      }

      const res = await executeContractWrite({
        contractAddress,
        provider: connectedProvider,
        accountAddress: connectedAccount,
        functionName: 'evaluate_submission',
        args: [BigInt(roundId), BigInt(submissionId)],
        actionName: `Evaluate Question #${submissionId} in Round #${roundId}`,
        onStateChange: setTxState,
        performReadback: async () => {
          const sub = await fetchSubmission(contractAddress, roundId, submissionId);
          return sub.status === 'SCORED' || sub.status === 'UNRESOLVED';
        },
      });

      if (res.success) {
        await refreshData();
      }
      return res.success;
    },
    [contractAddress, connectedProvider, connectedAccount, isCorrectChain, refreshData]
  );

  const allocateSlots = useCallback(
    async (roundId: number) => {
      if (!contractAddress || !connectedProvider || !connectedAccount || !isCorrectChain) {
        throw new Error('Wallet not connected on Studionet or contract not configured');
      }

      const res = await executeContractWrite({
        contractAddress,
        provider: connectedProvider,
        accountAddress: connectedAccount,
        functionName: 'allocate_slots',
        args: [BigInt(roundId)],
        actionName: `Allocate Slots for Round #${roundId}`,
        onStateChange: setTxState,
        performReadback: async () => {
          const rd = await fetchRound(contractAddress, roundId);
          return rd.state === 'CLAIM' || rd.state === 'ALLOCATED';
        },
      });

      if (res.success) {
        await refreshData();
      }
      return res.success;
    },
    [contractAddress, connectedProvider, connectedAccount, isCorrectChain, refreshData]
  );

  const acknowledgeSlot = useCallback(
    async (roundId: number, submissionId: number) => {
      if (!contractAddress || !connectedProvider || !connectedAccount || !isCorrectChain) {
        throw new Error('Wallet not connected on Studionet or contract not configured');
      }

      const res = await executeContractWrite({
        contractAddress,
        provider: connectedProvider,
        accountAddress: connectedAccount,
        functionName: 'acknowledge_slot',
        args: [BigInt(roundId), BigInt(submissionId)],
        actionName: `Acknowledge Slot #${submissionId}`,
        onStateChange: setTxState,
        performReadback: async () => {
          const sub = await fetchSubmission(contractAddress, roundId, submissionId);
          return sub.status === 'ACKNOWLEDGED';
        },
      });

      if (res.success) {
        await refreshData();
      }
      return res.success;
    },
    [contractAddress, connectedProvider, connectedAccount, isCorrectChain, refreshData]
  );

  const reclaimExpiredSlots = useCallback(
    async (roundId: number) => {
      if (!contractAddress || !connectedProvider || !connectedAccount || !isCorrectChain) {
        throw new Error('Wallet not connected on Studionet or contract not configured');
      }

      const res = await executeContractWrite({
        contractAddress,
        provider: connectedProvider,
        accountAddress: connectedAccount,
        functionName: 'reclaim_expired_slots',
        args: [BigInt(roundId)],
        actionName: `Reclaim Expired Slots in Round #${roundId}`,
        onStateChange: setTxState,
        performReadback: async () => {
          // Verify on-chain allocations are readable
          const alloc = await fetchAllocations(contractAddress, roundId);
          return Boolean(alloc && alloc.round_id === roundId);
        },
      });

      if (res.success) {
        await refreshData();
      }
      return res.success;
    },
    [contractAddress, connectedProvider, connectedAccount, isCorrectChain, refreshData]
  );

  const finalizeRound = useCallback(
    async (roundId: number) => {
      if (!contractAddress || !connectedProvider || !connectedAccount || !isCorrectChain) {
        throw new Error('Wallet not connected on Studionet or contract not configured');
      }

      const res = await executeContractWrite({
        contractAddress,
        provider: connectedProvider,
        accountAddress: connectedAccount,
        functionName: 'finalize_round',
        args: [BigInt(roundId)],
        actionName: `Finalize Round #${roundId}`,
        onStateChange: setTxState,
        performReadback: async () => {
          const rd = await fetchRound(contractAddress, roundId);
          return rd.state === 'FINAL';
        },
      });

      if (res.success) {
        await refreshData();
      }
      return res.success;
    },
    [contractAddress, connectedProvider, connectedAccount, isCorrectChain, refreshData]
  );

  return (
    <ContractContext.Provider
      value={{
        contractAddress,
        isContractConfigured,
        roundCount,
        selectedRoundId,
        setSelectedRoundId,
        currentRound,
        submissions,
        evaluations,
        allocations,
        callerStatus,
        limits,
        contractDisclaimer,
        upgraders,
        selectedSubmissionId,
        setSelectedSubmissionId,
        isLoading,
        error,
        refreshData,
        txState,
        resetTxState,
        createRound,
        submitQuestion,
        lockRound,
        evaluateSubmission,
        allocateSlots,
        acknowledgeSlot,
        reclaimExpiredSlots,
        finalizeRound,
      }}
    >
      {children}
    </ContractContext.Provider>
  );
};

export function useContract(): ContractContextValue {
  const context = useContext(ContractContext);
  if (!context) {
    throw new Error('useContract must be used within a ContractProvider');
  }
  return context;
}
