export type TransactionStage =
  | 'IDLE'
  | 'SIGNING'
  | 'SUBMITTED'
  | 'CONSENSUS'
  | 'FINALIZED'
  | 'EXECUTION_SUCCESS'
  | 'READBACK_CONFIRMED'
  | 'ERROR';

export type ReadbackStatus = 'PENDING' | 'CONFIRMED' | 'MISMATCH' | 'DELAYED' | null;

export interface TransactionState {
  stage: TransactionStage;
  txHash: string | null;
  actionName: string;
  error: string | null;
  returnedId: bigint | number | null;
  readbackStatus: ReadbackStatus;
  details?: string;
}
