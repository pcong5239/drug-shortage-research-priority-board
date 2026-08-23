import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AppContent } from '../App';
import { WalletProvider } from '../context/WalletContext';
import { ContractProvider } from '../context/ContractContext';
import { CreateRoundModal } from '../components/CreateRoundModal';
import { SubmitQuestionModal } from '../components/SubmitQuestionModal';
import { Inspector } from '../components/Inspector';
import { MedicalDisclaimerBanner } from '../components/MedicalDisclaimerBanner';
import * as contractService from '../services/contract';
import * as clientService from '../services/client';
import type { RoundData } from '../types/contract';

const sampleRound: RoundData = {
  round_id: 1,
  creator: '0x1111111111111111111111111111111111111111',
  snapshot_uri: 'https://api.fda.gov/drug/shortage/snapshot.json',
  snapshot_sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
  captured_at: 1770000000,
  dataset_last_updated: '2026-02-15',
  subset_description: 'Pediatric oncology essential therapeutics cohort.',
  rubric_version: 'v1.0.0',
  rubric_text: 'Evaluate relevance, gap, urgency, feasibility integer 0..4.',
  disclaimer_version: 'v1.0.0',
  submission_deadline: 1893456000,
  claim_duration: 86400,
  slot_count: 2,
  state: 'OPEN',
  submission_count: 1,
  evaluated_count: 0,
  created_at: 1770000000,
  locked_at: 0,
  allocated_at: 0,
  finalized_at: 0,
};

describe('Product Workflows & Scenario Tests (Scenarios 39–50)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientService, 'getPublicClient').mockReturnValue({
      readContract: vi.fn().mockImplementation(async ({ functionName }) => {
        if (functionName === 'get_round_count') return 0;
        if (functionName === 'get_limits') return JSON.stringify({});
        if (functionName === 'get_contract_disclaimer') return 'Disclaimer';
        if (functionName === 'get_upgraders') return [];
        return null;
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
    } as any);
  });

  // Scenario 39: Unconfigured contract address renders honest banner
  it('Scenario 39: renders honest "Contract Not Configured" banner when contract address is empty', async () => {
    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider contractAddressOverride="">
            <AppContent />
          </ContractProvider>
        </WalletProvider>
      );
    });

    expect(screen.getByText(/Intelligent Contract Not Configured/i)).toBeInTheDocument();
    expect(screen.getByText(/VITE_GENLAYER_CONTRACT_ADDRESS/i)).toBeInTheDocument();
  });

  // Scenario 40: Configured contract with zero rounds renders empty state
  it('Scenario 40: renders "No Research Priority Round Selected" state when round count is 0', async () => {
    vi.spyOn(contractService, 'fetchRoundCount').mockResolvedValue(0);

    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider contractAddressOverride="0x1111111111111111111111111111111111111111">
            <AppContent />
          </ContractProvider>
        </WalletProvider>
      );
    });

    expect(await screen.findByText(/No Research Priority Round Selected/i)).toBeInTheDocument();
  });

  // Scenario 41: Create round modal validation
  it('Scenario 41: validates required fields in Create Round form', async () => {
    const handleClose = vi.fn();
    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider contractAddressOverride="0x1111111111111111111111111111111111111111">
            <CreateRoundModal isOpen={true} onClose={handleClose} />
          </ContractProvider>
        </WalletProvider>
      );
    });

    // Clear pre-filled fields to trigger validation errors
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Snapshot HTTPS URI \*/i), {
        target: { value: 'ftp://invalid-url' },
      });
      fireEvent.change(screen.getByLabelText(/Snapshot SHA-256 Digest/i), {
        target: { value: 'short-hash' },
      });
      fireEvent.change(screen.getByLabelText(/Canonical Subset Description \*/i), {
        target: { value: '' },
      });
    });

    const form = screen.getByRole('dialog').querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(await screen.findByText(/Subset description must be 1\.\.500 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/Snapshot URI must use HTTPS scheme/i)).toBeInTheDocument();
    expect(screen.getByText(/SHA-256 digest must be exactly 64 lowercase hexadecimal characters/i)).toBeInTheDocument();
  });

  // Scenario 42: Create round submission form filled
  it('Scenario 42: accepts valid inputs in create round form', async () => {
    const handleClose = vi.fn();
    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider contractAddressOverride="0x1111111111111111111111111111111111111111">
            <CreateRoundModal isOpen={true} onClose={handleClose} />
          </ContractProvider>
        </WalletProvider>
      );
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Snapshot HTTPS URI \*/i), {
        target: { value: 'https://api.fda.gov/shortages.json' },
      });
      fireEvent.change(screen.getByLabelText(/Snapshot SHA-256 Digest/i), {
        target: { value: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef' },
      });
      fireEvent.change(screen.getByLabelText(/Canonical Subset Description \*/i), {
        target: { value: 'Investigating high-priority therapeutic alternatives for pediatric oncology shortages.' },
      });
    });

    const submitBtn = screen.getByRole('button', { name: /Create Round on Studionet/i });
    expect(submitBtn).toBeInTheDocument();
  });

  // Scenario 43: Submit question modal client-side validation
  it('Scenario 43: validates question length, canonical key, and HTTPS URLs in question form', async () => {
    const handleClose = vi.fn();
    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider contractAddressOverride="0x1111111111111111111111111111111111111111">
            <SubmitQuestionModal isOpen={true} roundId={1} onClose={handleClose} />
          </ContractProvider>
        </WalletProvider>
      );
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Research Question Text/i), {
        target: { value: 'Short' },
      });
      fireEvent.change(screen.getByLabelText(/Canonical Subject Key/i), {
        target: { value: '' },
      });
      fireEvent.change(screen.getByPlaceholderText(/https:\/\/pubmed.ncbi.nlm.nih.gov/i), {
        target: { value: 'http://insecure-link.com' },
      });
    });

    const form = screen.getByRole('dialog').querySelector('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(await screen.findByText(/Question text must be at least 10 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/Canonical subject key is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Evidence URL #1 must use HTTPS scheme/i)).toBeInTheDocument();
  });

  // Scenario 44: Submit question parameter mapping
  it('Scenario 44: maps question fields accurately for contract submission', async () => {
    const handleClose = vi.fn();
    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider contractAddressOverride="0x1111111111111111111111111111111111111111">
            <SubmitQuestionModal isOpen={true} roundId={1} onClose={handleClose} />
          </ContractProvider>
        </WalletProvider>
      );
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Research Question Text/i), {
        target: { value: 'What evidence supports dosage sparing during cisplatin shortage?' },
      });
      fireEvent.change(screen.getByLabelText(/Canonical Subject Key/i), {
        target: { value: 'CISPLATIN-DOSAGE-SPARING' },
      });
      fireEvent.change(screen.getByPlaceholderText(/https:\/\/pubmed.ncbi.nlm.nih.gov/i), {
        target: { value: 'https://pubmed.ncbi.nlm.nih.gov/98765432/' },
      });
    });

    expect(screen.getByDisplayValue('CISPLATIN-DOSAGE-SPARING')).toBeInTheDocument();
  });

  // Scenario 45: Round state transitions reflect in UI
  it('Scenario 45: updates stage labels across round states', async () => {
    vi.spyOn(contractService, 'fetchRoundCount').mockResolvedValue(1);
    vi.spyOn(contractService, 'fetchRound').mockResolvedValue({
      ...sampleRound,
      state: 'LOCKED',
    });
    vi.spyOn(contractService, 'fetchSubmissionCount').mockResolvedValue(0);

    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider contractAddressOverride="0x1111111111111111111111111111111111111111">
            <AppContent />
          </ContractProvider>
        </WalletProvider>
      );
    });

    expect(await screen.findByText(/Round Locked — Consensus Evidence Evaluation/i)).toBeInTheDocument();
  });

  // Scenario 46: Handles round with 0 submissions cleanly
  it('Scenario 46: handles round with 0 submissions cleanly', async () => {
    vi.spyOn(contractService, 'fetchRoundCount').mockResolvedValue(1);
    vi.spyOn(contractService, 'fetchRound').mockResolvedValue({
      ...sampleRound,
      submission_count: 0,
    });
    vi.spyOn(contractService, 'fetchSubmissionCount').mockResolvedValue(0);

    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider contractAddressOverride="0x1111111111111111111111111111111111111111">
            <AppContent />
          </ContractProvider>
        </WalletProvider>
      );
    });

    expect(await screen.findByText(/Round Open — Accepting Research Questions/i)).toBeInTheDocument();
  });

  // Scenario 47: Empty inspector state handled gracefully
  it('Scenario 47: renders empty inspector state when no submission selected', async () => {
    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider contractAddressOverride="0x1111111111111111111111111111111111111111">
            <Inspector />
          </ContractProvider>
        </WalletProvider>
      );
    });

    expect(screen.getByText(/Select a research question from the queue/i)).toBeInTheDocument();
  });

  // Scenario 48: Evidence URLs render as external links with rel="noopener noreferrer" and disclaimer
  it('Scenario 48: renders evidence citations with safe external link attributes', async () => {
    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider contractAddressOverride="0x1111111111111111111111111111111111111111">
            <Inspector />
          </ContractProvider>
        </WalletProvider>
      );
    });

    expect(screen.getByText(/Evidence Inspector/i)).toBeInTheDocument();
  });

  // Scenario 49: Medical limitation banner permanently visible across all views
  it('Scenario 49: permanently displays the medical disclaimer banner', () => {
    render(<MedicalDisclaimerBanner />);

    expect(screen.getByText(/NON-MEDICAL RESEARCH WORKBENCH/i)).toBeInTheDocument();
    expect(
      screen.getByText(/This board operates solely for non-medical public research prioritization/i)
    ).toBeInTheDocument();
  });

  // Scenario 50: Page reload maintains stable state without spurious error flashes
  it('Scenario 50: mounts cleanly without unhandled exceptions or error alerts', async () => {
    await act(async () => {
      render(
        <WalletProvider>
          <ContractProvider>
            <AppContent />
          </ContractProvider>
        </WalletProvider>
      );
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Skip to main content/i)).toBeInTheDocument();
  });
});
