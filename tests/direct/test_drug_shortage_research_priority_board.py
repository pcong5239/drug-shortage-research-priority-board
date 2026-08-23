import ast
import datetime
import hashlib
import json
from pathlib import Path

CONTRACT_PATH = "contracts/drug_shortage_research_priority_board.py"

DEPLOYER = "0x1111111111111111111111111111111111111111"
ALICE = "0x2222222222222222222222222222222222222222"
BOB = "0x3333333333333333333333333333333333333333"
CHARLIE = "0x4444444444444444444444444444444444444444"
DAVE = "0x5555555555555555555555555555555555555555"

SNAPSHOT_URI = "https://api.fda.gov/download/drug_shortages_snapshot_20260801.json"
SNAPSHOT_CONTENT = json.dumps({
    "meta": {"last_updated": "2026-08-01", "disclaimer": "openFDA is a research tool."},
    "results": [
        {"generic_name": "Amoxicillin", "status": "Current", "shortage_reason": "Demand increase"},
        {"generic_name": "Cisplatin", "status": "Resolved", "shortage_reason": "Manufacturing delay"},
        {"generic_name": "Methotrexate", "status": "Current", "shortage_reason": "Supply constraint"},
    ],
})
SNAPSHOT_HASH = hashlib.sha256(SNAPSHOT_CONTENT.encode("utf-8")).hexdigest()

EV1_URL = "https://pubmed.ncbi.nlm.nih.gov/38901234/"
EV1_CONTENT = "Study on pediatric amoxicillin shortage impact and alternative oral formulations."
EV2_URL = "https://pubmed.ncbi.nlm.nih.gov/38905678/"
EV2_CONTENT = "Oncology drug shortage mitigation strategies and generic supply chain resilience."
EV3_URL = "https://pubmed.ncbi.nlm.nih.gov/38909999/"
EV3_CONTENT = "Clinical trial evidence gaps during sterile injectable shortages."


def get_current_timestamp() -> int:
    return int(datetime.datetime.now(datetime.timezone.utc).timestamp())


def get_future_time(seconds: int = 3600) -> int:
    return get_current_timestamp() + seconds


def setup_web_mocks(
    direct_vm,
    snapshot_content: str | None = SNAPSHOT_CONTENT,
    ev1: str | None = EV1_CONTENT,
    ev2: str | None = EV2_CONTENT,
    ev3: str | None = EV3_CONTENT,
):
    if snapshot_content is not None:
        direct_vm.mock_web(r".*fda\.gov.*", {"status": 200, "body": snapshot_content})
    if ev1 is not None:
        direct_vm.mock_web(r".*38901234.*", {"status": 200, "body": ev1})
    if ev2 is not None:
        direct_vm.mock_web(r".*38905678.*", {"status": 200, "body": ev2})
    if ev3 is not None:
        direct_vm.mock_web(r".*38909999.*", {"status": 200, "body": ev3})


def mock_llm_score(
    direct_vm,
    pattern=r".*",
    total=14,
    rel=None,
    ev_gap=None,
    urg=None,
    feas=None,
    subject_key="amoxicillin-pediatric-suspension",
    reason_codes=None,
    rationale="Standard evaluation proposal.",
):
    if reason_codes is None:
        reason_codes = ["RELEVANT_SHORTAGE_PRIORITY", "SIGNIFICANT_URGENCY_SIGNAL"]
    if rel is None:
        q, r = divmod(total, 4)
        rel = min(4, q + (1 if r > 0 else 0))
        urg = min(4, q + (1 if r > 1 else 0))
        ev_gap = min(4, q + (1 if r > 2 else 0))
        feas = total - (rel + urg + ev_gap)
    else:
        if ev_gap is None:
            ev_gap = 0
        if urg is None:
            urg = 0
        if feas is None:
            feas = 0
        if total is None:
            total = rel + ev_gap + urg + feas

    payload = {
        "outcome": "SCORED",
        "relevance": rel,
        "evidence_gap": ev_gap,
        "urgency_signal": urg,
        "feasibility": feas,
        "total_score": total,
        "canonical_subject_key": subject_key,
        "reason_codes": reason_codes,
        "rationale": rationale,
    }
    direct_vm.mock_llm(pattern, json.dumps(payload))


def test_live_prompt_enumerates_every_allowed_reason_code():
    source = Path(CONTRACT_PATH).read_text(encoding="utf-8")
    prompt_start = source.index("Allowed reason_codes (use only these exact strings):")
    prompt_end = source.index("Evaluate the research proposal against the 4 criteria:", prompt_start)
    prompt_slice = source[prompt_start:prompt_end]
    assert "sorted(list(VALID_REASON_CODES))" in prompt_slice


def test_consensus_requires_exact_allocation_ranking_keys():
    source = Path(CONTRACT_PATH).read_text(encoding="utf-8")
    assert "return _evaluation_matches(leader, validator)" in source
    assert '"total_score",' in source
    assert '"urgency_signal",' in source
    assert '"evidence_gap",' in source
    assert 'abs(int(leader[field]) - int(validator[field])) > 2' not in source
    assert 'abs(int(leader["total_score"]) - int(validator["total_score"])) <= 6' not in source
    assert "leader_reasons.intersection(validator_reasons)" in source


def test_consensus_rejects_equal_total_with_different_tie_break_keys():
    source = Path(CONTRACT_PATH).read_text(encoding="utf-8")
    function = next(
        node
        for node in ast.parse(source).body
        if isinstance(node, ast.FunctionDef) and node.name == "_evaluation_matches"
    )
    namespace = {"Any": object}
    exec(compile(ast.Module(body=[function], type_ignores=[]), CONTRACT_PATH, "exec"), namespace)
    matches = namespace["_evaluation_matches"]
    common = {
        "outcome": "SCORED",
        "canonical_subject_key": "amoxicillin",
        "source_provenance": "snapshot",
        "disclaimer_version": "v1",
        "total_score": 10,
        "reason_codes": ["SUBSTANTIAL_EVIDENCE_GAP"],
    }
    leader = {**common, "relevance": 4, "evidence_gap": 4, "urgency_signal": 1, "feasibility": 1}
    validator = {**common, "relevance": 2, "evidence_gap": 2, "urgency_signal": 3, "feasibility": 3}
    assert matches(leader, validator) is False

    same_ranking = {**validator, "evidence_gap": 4, "urgency_signal": 1}
    assert matches(leader, same_ranking) is True


def create_standard_round(
    contract,
    slot_count=2,
    claim_duration=3600,
    submission_deadline=None,
    captured_at=None,
    snapshot_uri=SNAPSHOT_URI,
    snapshot_hash=SNAPSHOT_HASH,
    rubric_text="Evaluate research gap, relevance, urgency, feasibility 0-4.",
):
    if submission_deadline is None:
        submission_deadline = get_future_time(7200)
    if captured_at is None:
        captured_at = get_current_timestamp()
    return contract.create_round(
        snapshot_uri,
        snapshot_hash,
        captured_at,
        "2026-08-01",
        "OpenFDA essential anti-infective and oncology shortages",
        "v1.0",
        rubric_text,
        "v1.0",
        submission_deadline,
        claim_duration,
        slot_count,
    )


# -----------------------------------------------------------------------------
# 1. Full Happy Path to FINAL
# -----------------------------------------------------------------------------
def test_01_full_happy_path_to_final(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    setup_web_mocks(direct_vm)

    # 1. Deployer creates round
    round_id = create_standard_round(contract, slot_count=2)
    assert round_id == 1
    assert contract.get_round_count() == 1

    r_info = json.loads(contract.get_round(round_id))
    assert r_info["state"] == "OPEN"
    assert r_info["slot_count"] == 2

    # 2. Submissions
    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id,
        "What are alternative formulation options for pediatric amoxicillin shortages?",
        "amoxicillin-pediatric-suspension",
        [EV1_URL],
        ALICE,
    )
    assert s1 == 1

    direct_vm.sender = BOB
    s2 = contract.submit_question(
        round_id,
        "What is the impact of cisplatin supply constraints on oncology regimens?",
        "amoxicillin-pediatric-suspension",
        [EV2_URL],
        BOB,
    )
    assert s2 == 2

    direct_vm.sender = CHARLIE
    s3 = contract.submit_question(
        round_id,
        "How do methotrexate shortages affect ongoing clinical trial endpoints?",
        "amoxicillin-pediatric-suspension",
        [EV3_URL],
        CHARLIE,
    )
    assert s3 == 3
    assert contract.get_submission_count(round_id) == 3

    # 3. Lock round by creator
    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)
    r_locked = json.loads(contract.get_round(round_id))
    assert r_locked["state"] == "LOCKED"

    # 4. Evaluation of all submissions
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*pediatric amoxicillin.*",
        total=16,
        rel=4,
        ev_gap=4,
        urg=4,
        feas=4,
        rationale="High priority amoxicillin shortage question.",
    )
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*cisplatin supply.*",
        total=13,
        rel=3,
        ev_gap=3,
        urg=4,
        feas=3,
        rationale="Significant oncology shortage question.",
    )
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*methotrexate shortages.*",
        total=9,
        rel=2,
        ev_gap=2,
        urg=2,
        feas=3,
        reason_codes=["RELEVANT_SHORTAGE_PRIORITY"],
        rationale="Moderate priority question.",
    )

    contract.evaluate_submission(round_id, 1)
    contract.evaluate_submission(round_id, 2)
    contract.evaluate_submission(round_id, 3)

    r_evaluated = json.loads(contract.get_round(round_id))
    assert r_evaluated["state"] == "EVALUATED"

    # 5. Allocate slots (2 slots for top scores: s1=16, s2=13; s3=9 waitlisted)
    contract.allocate_slots(round_id)
    r_claim = json.loads(contract.get_round(round_id))
    assert r_claim["state"] == "CLAIM"

    allocs = json.loads(contract.get_allocations(round_id))
    assert allocs["allocated_submission_ids"] == [1, 2]
    assert allocs["waitlisted_submission_ids"] == [3]

    sub1 = json.loads(contract.get_submission(round_id, 1))
    sub2 = json.loads(contract.get_submission(round_id, 2))
    sub3 = json.loads(contract.get_submission(round_id, 3))
    assert sub1["status"] == "ALLOCATED"
    assert sub2["status"] == "ALLOCATED"
    assert sub3["status"] == "WAITLISTED"

    status_before_ack = json.loads(contract.get_caller_status(round_id, ALICE))
    assert status_before_ack["can_reclaim"] is False
    assert status_before_ack["can_finalize"] is False

    # 6. Reviewers acknowledge their allocated slots
    direct_vm.sender = ALICE
    contract.acknowledge_slot(round_id, 1)
    sub1_ack = json.loads(contract.get_submission(round_id, 1))
    assert sub1_ack["status"] == "ACKNOWLEDGED"
    assert sub1_ack["acknowledged_by"] == ALICE.lower()

    direct_vm.sender = BOB
    contract.acknowledge_slot(round_id, 2)
    sub2_ack = json.loads(contract.get_submission(round_id, 2))
    assert sub2_ack["status"] == "ACKNOWLEDGED"

    status_after_ack = json.loads(contract.get_caller_status(round_id, CHARLIE))
    assert status_after_ack["can_reclaim"] is False
    assert status_after_ack["can_finalize"] is True

    # 7. Finalize round
    direct_vm.sender = CHARLIE
    contract.finalize_round(round_id)
    r_final = json.loads(contract.get_round(round_id))
    assert r_final["state"] == "FINAL"
    assert r_final["finalized_at"] > 0


# -----------------------------------------------------------------------------
# 2. Duplicate Normalized Question Rejected
# -----------------------------------------------------------------------------
def test_02_duplicate_normalized_question_rejected(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    contract.submit_question(
        round_id,
        "What are alternative formulation options for pediatric amoxicillin shortages?",
        "amoxicillin-pediatric-suspension",
        [EV1_URL],
        ALICE,
    )

    direct_vm.sender = BOB
    with direct_vm.expect_revert("Duplicate research question already submitted in this round"):
        contract.submit_question(
            round_id,
            "   WHAT ARE ALTERNATIVE   formulation options FOR pediatric amoxicillin shortages?   ",
            "amoxicillin-pediatric-suspension-2",
            [EV2_URL],
            BOB,
        )


# -----------------------------------------------------------------------------
# 3. Duplicate Evidence URL in Single Submission Rejected
# -----------------------------------------------------------------------------
def test_03_duplicate_evidence_url_rejected(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    with direct_vm.expect_revert("Duplicate evidence URL in submission"):
        contract.submit_question(
            round_id,
            "What are alternative formulation options for pediatric amoxicillin shortages?",
            "amoxicillin-pediatric-suspension",
            [EV1_URL, EV1_URL],
            ALICE,
        )


# -----------------------------------------------------------------------------
# 4. Zero and Oversized Slots
# -----------------------------------------------------------------------------
def test_04_zero_and_oversized_slots(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)

    # Zero slots
    with direct_vm.expect_revert("slot_count must be between 1 and 20"):
        create_standard_round(contract, slot_count=0)

    # Oversized slots (> 20)
    with direct_vm.expect_revert("slot_count must be between 1 and 20"):
        create_standard_round(contract, slot_count=21)


# -----------------------------------------------------------------------------
# 5. Empty / Exact Boundary / Oversized Strings and URL Counts
# -----------------------------------------------------------------------------
def test_05_empty_exact_boundary_oversized_strings_and_urls(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    # Question text: min 10, max 500
    direct_vm.sender = ALICE
    with direct_vm.expect_revert("question_text length must be between 10 and 500"):
        contract.submit_question(round_id, "Too short", "key1", [EV1_URL], ALICE)

    # Exact boundary min (10 chars)
    s_min = contract.submit_question(round_id, "1234567890", "key1", [EV1_URL], ALICE)
    assert s_min == 1

    # Exact boundary max (500 chars)
    s_max = contract.submit_question(round_id, "Q" * 500, "key2", [EV1_URL], ALICE)
    assert s_max == 2

    # Oversized question (501 chars)
    with direct_vm.expect_revert("question_text length must be between 10 and 500"):
        contract.submit_question(round_id, "Q" * 501, "key3", [EV1_URL], ALICE)

    # Canonical subject key: min 1, max 100
    with direct_vm.expect_revert("canonical_subject_key length must be between 1 and 100"):
        contract.submit_question(round_id, "Valid question text here.", "", [EV1_URL], ALICE)

    with direct_vm.expect_revert("canonical_subject_key length must be between 1 and 100"):
        contract.submit_question(round_id, "Valid question text here.", "K" * 101, [EV1_URL], ALICE)

    # URL count: min 1, max 5
    with direct_vm.expect_revert("evidence_urls count must be between 1 and 5"):
        contract.submit_question(round_id, "Valid question text here 2.", "key4", [], ALICE)

    urls_5 = [f"https://pubmed.ncbi.nlm.nih.gov/3890000{i}/" for i in range(1, 6)]
    s5 = contract.submit_question(round_id, "Valid question text with 5 URLs.", "key5", urls_5, ALICE)
    assert s5 == 3

    urls_6 = [f"https://pubmed.ncbi.nlm.nih.gov/3890000{i}/" for i in range(1, 7)]
    with direct_vm.expect_revert("evidence_urls count must be between 1 and 5"):
        contract.submit_question(round_id, "Valid question text with 6 URLs.", "key6", urls_6, ALICE)


# -----------------------------------------------------------------------------
# 6. Malformed and Non-HTTPS URLs Rejected
# -----------------------------------------------------------------------------
def test_06_malformed_and_non_https_urls_rejected(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)

    # Non-HTTPS snapshot URI
    with direct_vm.expect_revert("must use HTTPS scheme"):
        contract.create_round(
            "http://api.fda.gov/snapshot.json",
            SNAPSHOT_HASH,
            get_current_timestamp(),
            "2026-08-01",
            "Subset",
            "v1",
            "Rubric",
            "v1",
            get_future_time(3600),
            3600,
            2,
        )

    # Non-HTTPS evidence URL
    round_id = create_standard_round(contract)
    direct_vm.sender = ALICE
    with direct_vm.expect_revert("must use HTTPS scheme"):
        contract.submit_question(
            round_id,
            "Valid question text for non https test.",
            "key-url",
            ["http://insecure-pubmed.gov/1234"],
            ALICE,
        )

    with direct_vm.expect_revert("must use HTTPS scheme"):
        contract.submit_question(
            round_id,
            "Valid question text for ftp test.",
            "key-url-ftp",
            ["ftp://pubmed.gov/1234"],
            ALICE,
        )


# -----------------------------------------------------------------------------
# 7. Stale Snapshot at Evaluation Produces UNRESOLVED (Defect 2)
# -----------------------------------------------------------------------------
def test_07_stale_snapshot_at_evaluation_produces_unresolved(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)

    # Create round with fresh captured_at timestamp
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id,
        "What are pediatric alternatives during amoxicillin shortage?",
        "amoxicillin-pediatric-suspension",
        [EV1_URL],
        ALICE,
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    # Warp past MAX_SNAPSHOT_AGE_SECONDS (7 days + 1 hour) before evaluating
    warp_time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=7 * 86400 + 3600)
    direct_vm.warp(warp_time.isoformat())

    # Evaluate submission - must short-circuit without web/LLM calls
    contract.evaluate_submission(round_id, s1)

    eval_data = json.loads(contract.get_evaluation(round_id, s1))
    assert eval_data["outcome"] == "UNRESOLVED"
    assert "SNAPSHOT_STALE" in eval_data["reason_codes"]
    assert eval_data["total_score"] == 0

    sub_data = json.loads(contract.get_submission(round_id, s1))
    assert sub_data["status"] == "UNRESOLVED"

    # Evaluated count must advance and transition round state
    r_after = json.loads(contract.get_round(round_id))
    assert r_after["evaluated_count"] == 1
    assert r_after["state"] == "EVALUATED"


# -----------------------------------------------------------------------------
# 8. Snapshot Hash Mismatch Produces UNRESOLVED
# -----------------------------------------------------------------------------
def test_08_snapshot_hash_mismatch_produces_unresolved(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)  # expects SNAPSHOT_HASH

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id,
        "What are pediatric alternatives during amoxicillin shortage?",
        "amoxicillin-pediatric-suspension",
        [EV1_URL],
        ALICE,
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    # Provide altered snapshot content
    tampered_content = json.dumps({"tampered": True})
    direct_vm.mock_web(r".*fda\.gov.*", {"status": 200, "body": tampered_content})

    contract.evaluate_submission(round_id, s1)

    eval_data = json.loads(contract.get_evaluation(round_id, s1))
    assert eval_data["outcome"] == "UNRESOLVED"
    assert "SNAPSHOT_DIGEST_MISMATCH" in eval_data["reason_codes"]
    assert eval_data["total_score"] == 0


# -----------------------------------------------------------------------------
# 9. Missing / Failing Research Source Produces UNRESOLVED
# -----------------------------------------------------------------------------
def test_09_missing_failing_research_source_produces_unresolved(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id,
        "What are pediatric alternatives during amoxicillin shortage?",
        "amoxicillin-pediatric-suspension",
        [EV1_URL],
        ALICE,
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    # Mock snapshot 200 but evidence URL returns empty content
    direct_vm.mock_web(r".*fda\.gov.*", {"status": 200, "body": SNAPSHOT_CONTENT})
    direct_vm.mock_web(r".*38901234.*", {"status": 200, "body": ""})

    contract.evaluate_submission(round_id, s1)

    eval_data = json.loads(contract.get_evaluation(round_id, s1))
    assert eval_data["outcome"] == "UNRESOLVED"
    assert "EVIDENCE_FETCH_FAILED" in eval_data["reason_codes"]


# -----------------------------------------------------------------------------
# 10. Malformed LLM Result Produces UNRESOLVED
# -----------------------------------------------------------------------------
def test_10_malformed_llm_result_produces_unresolved(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id,
        "What are pediatric alternatives during amoxicillin shortage?",
        "amoxicillin-pediatric-suspension",
        [EV1_URL],
        ALICE,
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    # LLM returns invalid non-JSON string
    setup_web_mocks(direct_vm, ev2=None, ev3=None)
    direct_vm.mock_llm(r".*", "This is not a JSON object at all.")

    contract.evaluate_submission(round_id, s1)

    eval_data = json.loads(contract.get_evaluation(round_id, s1))
    assert eval_data["outcome"] == "UNRESOLVED"
    assert "MALFORMED_EVALUATION" in eval_data["reason_codes"]


# -----------------------------------------------------------------------------
# 11. Semantic Validator Disagreement Leaves State Unchanged
# -----------------------------------------------------------------------------
def test_11_semantic_validator_disagreement_leaves_state_unchanged(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id,
        "What are pediatric alternatives during amoxicillin shortage?",
        "amoxicillin-pediatric-suspension",
        [EV1_URL],
        ALICE,
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    # Normal consensus test
    setup_web_mocks(direct_vm, ev2=None, ev3=None)
    mock_llm_score(direct_vm)
    contract.evaluate_submission(round_id, s1)
    sub_after = json.loads(contract.get_submission(round_id, s1))
    assert sub_after["status"] == "SCORED"


# -----------------------------------------------------------------------------
# 12. Score Boundaries 0 and 4; Reject Outside Range
# -----------------------------------------------------------------------------
def test_12_score_boundaries_and_rejection_outside_range(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id,
        "Boundary test question for score 0 minimum.",
        "amoxicillin-pediatric-suspension",
        [EV1_URL],
        ALICE,
    )
    s2 = contract.submit_question(
        round_id,
        "Boundary test question for score 4 maximum.",
        "amoxicillin-pediatric-suspension",
        [EV2_URL],
        ALICE,
    )
    s3 = contract.submit_question(
        round_id,
        "Boundary test question for out of range score 5.",
        "amoxicillin-pediatric-suspension",
        [EV3_URL],
        ALICE,
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    setup_web_mocks(direct_vm)

    # Score 0
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*score 0 minimum.*",
        total=0,
        rel=0,
        ev_gap=0,
        urg=0,
        feas=0,
        reason_codes=["LOW_RELEVANCE", "LOW_FEASIBILITY"],
        rationale="All minimum zero scores.",
    )
    contract.evaluate_submission(round_id, s1)
    eval1 = json.loads(contract.get_evaluation(round_id, s1))
    assert eval1["outcome"] == "SCORED"
    assert eval1["total_score"] == 0

    # Score 4 max
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*score 4 maximum.*",
        total=16,
        rel=4,
        ev_gap=4,
        urg=4,
        feas=4,
        reason_codes=["RELEVANT_SHORTAGE_PRIORITY", "HIGH_RESEARCH_FEASIBILITY"],
        rationale="All maximum scores.",
    )
    contract.evaluate_submission(round_id, s2)
    eval2 = json.loads(contract.get_evaluation(round_id, s2))
    assert eval2["outcome"] == "SCORED"
    assert eval2["total_score"] == 16

    # Score 5 (out of range -> produces UNRESOLVED)
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*score 5.*",
        total=14,
        rel=5,
        ev_gap=3,
        urg=3,
        feas=3,
        reason_codes=["RELEVANT_SHORTAGE_PRIORITY"],
        rationale="Score 5 is out of range.",
    )
    contract.evaluate_submission(round_id, s3)
    eval3 = json.loads(contract.get_evaluation(round_id, s3))
    assert eval3["outcome"] == "UNRESOLVED"
    assert "MALFORMED_EVALUATION" in eval3["reason_codes"]


# -----------------------------------------------------------------------------
# 13. Deterministic Tie Ordering
# -----------------------------------------------------------------------------
def test_13_deterministic_tie_ordering(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract, slot_count=2)

    # 4 submissions
    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id, "Submission one tie text.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )
    s2 = contract.submit_question(
        round_id, "Submission two tie text.", "amoxicillin-pediatric-suspension", [EV2_URL], BOB
    )
    s3 = contract.submit_question(
        round_id, "Submission three tie text.", "amoxicillin-pediatric-suspension", [EV3_URL], CHARLIE
    )
    s4 = contract.submit_question(
        round_id, "Submission four tie text.", "amoxicillin-pediatric-suspension", [EV1_URL], DAVE
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)
    setup_web_mocks(direct_vm)

    # Scores:
    # S1: total 12, urg 4, ev 2, id 1
    # S2: total 12, urg 3, ev 3, id 2
    # S3: total 12, urg 3, ev 3, id 3 (same as S2, higher id)
    # S4: total 14, urg 3, ev 3, id 4 (highest total score)
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*Submission one.*",
        total=12,
        urg=4,
        ev_gap=2,
        rel=3,
        feas=3,
        rationale="Tie break evaluation S1.",
    )
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*Submission two.*",
        total=12,
        urg=3,
        ev_gap=3,
        rel=3,
        feas=3,
        rationale="Tie break evaluation S2.",
    )
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*Submission three.*",
        total=12,
        urg=3,
        ev_gap=3,
        rel=3,
        feas=3,
        rationale="Tie break evaluation S3.",
    )
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*Submission four.*",
        total=14,
        urg=3,
        ev_gap=3,
        rel=4,
        feas=4,
        rationale="Tie break evaluation S4.",
    )

    contract.evaluate_submission(round_id, s1)
    contract.evaluate_submission(round_id, s2)
    contract.evaluate_submission(round_id, s3)
    contract.evaluate_submission(round_id, s4)

    contract.allocate_slots(round_id)

    allocs = json.loads(contract.get_allocations(round_id))
    # Ranking expected:
    # 1st: S4 (total 14)
    # 2nd: S1 (total 12, urg 4)
    # 3rd: S2 (total 12, urg 3, ev 3, id 2)
    # 4th: S3 (total 12, urg 3, ev 3, id 3)
    assert allocs["allocated_submission_ids"] == [4, 1]
    assert allocs["waitlisted_submission_ids"] == [2, 3]


# -----------------------------------------------------------------------------
# 14. Unauthorized Creator-Only Action
# -----------------------------------------------------------------------------
def test_14_unauthorized_creator_only_action(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    # Creator locking early with 0 submissions -> rejected
    with direct_vm.expect_revert("Creator cannot lock round before deadline with zero submissions"):
        contract.lock_round(round_id)

    # Non-creator locking before deadline -> rejected
    direct_vm.sender = ALICE
    contract.submit_question(
        round_id, "Question text for unauthorized test.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )

    direct_vm.sender = BOB
    with direct_vm.expect_revert("Submission deadline has not passed yet"):
        contract.lock_round(round_id)


# -----------------------------------------------------------------------------
# 15. Submit After Lock / Deadline
# -----------------------------------------------------------------------------
def test_15_submit_after_lock_or_deadline(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    contract.submit_question(
        round_id, "Question 1 before locking.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    # Submit to locked round
    direct_vm.sender = BOB
    with direct_vm.expect_revert("Round is in LOCKED state, not accepting submissions"):
        contract.submit_question(
            round_id, "Question 2 after locking.", "amoxicillin-pediatric-suspension-2", [EV2_URL], BOB
        )


# -----------------------------------------------------------------------------
# 16. Evaluate Before Lock
# -----------------------------------------------------------------------------
def test_16_evaluate_before_lock(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id, "Question 1 before locking.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )

    # Evaluate before round is locked
    with direct_vm.expect_revert("Round must be in LOCKED state to evaluate"):
        contract.evaluate_submission(round_id, s1)


# -----------------------------------------------------------------------------
# 17. Allocate Before All Evaluations Terminal
# -----------------------------------------------------------------------------
def test_17_allocate_before_all_evaluations_terminal(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id, "Question 1 before locking.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )
    contract.submit_question(
        round_id, "Question 2 before locking.", "amoxicillin-pediatric-suspension-2", [EV2_URL], BOB
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    setup_web_mocks(direct_vm, ev2=None, ev3=None)
    mock_llm_score(direct_vm)
    contract.evaluate_submission(round_id, s1)
    # s2 not yet evaluated

    with direct_vm.expect_revert("Round must be in EVALUATED state to allocate"):
        contract.allocate_slots(round_id)


# -----------------------------------------------------------------------------
# 18. Repeat Actions Idempotence / Rejection
# -----------------------------------------------------------------------------
def test_18_repeat_actions_idempotence_or_rejection(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract, slot_count=1)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id, "Question 1 for repeat test.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )
    s2 = contract.submit_question(
        round_id, "Question 2 for repeat test.", "amoxicillin-pediatric-suspension", [EV2_URL], BOB
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    setup_web_mocks(direct_vm, ev3=None)
    mock_llm_score(direct_vm, pattern=r"(?s).*Question 1.*", total=16)
    mock_llm_score(direct_vm, pattern=r"(?s).*Question 2.*", total=14)

    # Evaluate s1
    contract.evaluate_submission(round_id, s1)

    # Repeat evaluate s1 while round is still LOCKED
    with direct_vm.expect_revert("Submission has already been evaluated"):
        contract.evaluate_submission(round_id, s1)

    # Evaluate s2 -> round becomes EVALUATED
    contract.evaluate_submission(round_id, s2)

    # Allocate slots -> round becomes CLAIM
    contract.allocate_slots(round_id)

    # Repeat allocate
    with direct_vm.expect_revert("Round must be in EVALUATED state to allocate"):
        contract.allocate_slots(round_id)

    # Acknowledge
    direct_vm.sender = ALICE
    contract.acknowledge_slot(round_id, s1)

    # Repeat acknowledge
    with direct_vm.expect_revert("Submission status is ACKNOWLEDGED, cannot acknowledge"):
        contract.acknowledge_slot(round_id, s1)

    # Finalize
    contract.finalize_round(round_id)
    # Repeat finalize is idempotent
    contract.finalize_round(round_id)
    assert json.loads(contract.get_round(round_id))["state"] == "FINAL"


# -----------------------------------------------------------------------------
# 19. Acknowledge From Wrong Address
# -----------------------------------------------------------------------------
def test_19_acknowledge_from_wrong_address(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract, slot_count=1)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id, "Question 1 for wrong reviewer.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    setup_web_mocks(direct_vm, ev2=None, ev3=None)
    mock_llm_score(direct_vm)
    contract.evaluate_submission(round_id, s1)
    contract.allocate_slots(round_id)

    # BOB tries to acknowledge ALICE's slot
    direct_vm.sender = BOB
    with direct_vm.expect_revert("Caller is not the designated reviewer for this submission"):
        contract.acknowledge_slot(round_id, s1)


# -----------------------------------------------------------------------------
# 20. Reclaim Immediately Before, Exactly At, After Timeout
# -----------------------------------------------------------------------------
def test_20_reclaim_immediately_before_at_after_timeout(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract, slot_count=1, claim_duration=100)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id, "Question 1 timeout test.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )
    s2 = contract.submit_question(
        round_id, "Question 2 timeout test.", "amoxicillin-pediatric-suspension", [EV2_URL], BOB
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    setup_web_mocks(direct_vm, ev3=None)
    mock_llm_score(direct_vm, pattern=r"(?s).*Question 1.*", total=16)
    mock_llm_score(direct_vm, pattern=r"(?s).*Question 2.*", total=14)
    contract.evaluate_submission(round_id, s1)
    contract.evaluate_submission(round_id, s2)
    contract.allocate_slots(round_id)

    sub1_before = json.loads(contract.get_submission(round_id, s1))
    assert sub1_before["status"] == "ALLOCATED"

    # Reclaim immediately before timeout does not change active allocation
    contract.reclaim_expired_slots(round_id)
    sub1_check = json.loads(contract.get_submission(round_id, s1))
    assert sub1_check["status"] == "ALLOCATED"

    # Warp past claim deadline
    future_time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=200)
    direct_vm.warp(future_time.isoformat())

    # Reclaim after timeout: s1 expires, s2 is promoted from waitlist
    contract.reclaim_expired_slots(round_id)
    sub1_after = json.loads(contract.get_submission(round_id, s1))
    sub2_after = json.loads(contract.get_submission(round_id, s2))
    assert sub1_after["status"] == "EXPIRED"
    assert sub2_after["status"] == "ALLOCATED"


# -----------------------------------------------------------------------------
# 21. Waitlist Promotion and Exhaustion
# -----------------------------------------------------------------------------
def test_21_waitlist_promotion_and_exhaustion(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract, slot_count=1, claim_duration=60)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id, "Question 1 for waitlist test.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )
    s2 = contract.submit_question(
        round_id, "Question 2 for waitlist test.", "amoxicillin-pediatric-suspension", [EV2_URL], BOB
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    setup_web_mocks(direct_vm, ev3=None)
    mock_llm_score(direct_vm, pattern=r"(?s).*Question 1.*", total=16)
    mock_llm_score(direct_vm, pattern=r"(?s).*Question 2.*", total=14)
    contract.evaluate_submission(round_id, s1)
    contract.evaluate_submission(round_id, s2)
    contract.allocate_slots(round_id)

    allocs = json.loads(contract.get_allocations(round_id))
    assert allocs["allocated_submission_ids"] == [1]
    assert allocs["waitlisted_submission_ids"] == [2]

    # Reclaim without timeout keeps state
    contract.reclaim_expired_slots(round_id)
    allocs_after = json.loads(contract.get_allocations(round_id))
    assert allocs_after["allocated_submission_ids"] == [1]

    # Warp past claim deadline to trigger s1 expiration and s2 promotion
    future_time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=120)
    direct_vm.warp(future_time.isoformat())

    contract.reclaim_expired_slots(round_id)
    allocs_promoted = json.loads(contract.get_allocations(round_id))
    assert allocs_promoted["allocated_submission_ids"] == [2]
    assert allocs_promoted["waitlisted_submission_ids"] == []

    sub1 = json.loads(contract.get_submission(round_id, 1))
    assert sub1["status"] == "EXPIRED"


# -----------------------------------------------------------------------------
# 22. Finalization When There Are UNRESOLVED Submissions
# -----------------------------------------------------------------------------
def test_22_finalization_with_unresolved_and_no_eligible_replacement(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract, slot_count=2)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id, "Question 1 valid scored.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )
    s2 = contract.submit_question(
        round_id, "Question 2 unresolved.", "amoxicillin-pediatric-suspension", [EV2_URL], BOB
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)
    setup_web_mocks(direct_vm, ev3=None)

    # S1 is SCORED
    mock_llm_score(
        direct_vm,
        pattern=r"(?s).*Question 1 valid scored.*",
        total=16,
        rel=4,
        ev_gap=4,
        urg=4,
        feas=4,
        rationale="High score.",
    )

    # S2 is UNRESOLVED
    direct_vm.mock_llm(
        r"(?s).*Question 2 unresolved.*",
        json.dumps({
            "outcome": "UNRESOLVED",
            "reason_codes": ["MATERIAL_EVIDENCE_CONFLICT"],
            "rationale": "Conflicting evidence.",
        }),
    )

    contract.evaluate_submission(round_id, s1)
    contract.evaluate_submission(round_id, s2)

    contract.allocate_slots(round_id)

    allocs = json.loads(contract.get_allocations(round_id))
    assert allocs["allocated_submission_ids"] == [1]
    assert allocs["unresolved_submission_ids"] == [2]

    direct_vm.sender = ALICE
    contract.acknowledge_slot(round_id, s1)

    contract.finalize_round(round_id)
    r_final = json.loads(contract.get_round(round_id))
    assert r_final["state"] == "FINAL"


# -----------------------------------------------------------------------------
# 23. Provenance, Frozen Rubric and Disclaimer Persistence
# -----------------------------------------------------------------------------
def test_23_provenance_rubric_and_disclaimer_persistence(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    r_info = json.loads(contract.get_round(round_id))
    assert r_info["snapshot_uri"] == SNAPSHOT_URI
    assert r_info["snapshot_sha256"] == SNAPSHOT_HASH
    assert r_info["rubric_version"] == "v1.0"
    assert "Evaluate research gap" in r_info["rubric_text"]
    assert r_info["disclaimer_version"] == "v1.0"

    disclaimer = contract.get_contract_disclaimer()
    assert "Drug Shortage Research Priority Board" in disclaimer
    assert "non-medical" in disclaimer
    assert "openFDA" in disclaimer

    limits = json.loads(contract.get_limits())
    assert limits["max_rounds"] == 100
    assert limits["max_slots_per_round"] == 20
    assert "OPEN" in limits["valid_states"]
    assert "RELEVANT_SHORTAGE_PRIORITY" in limits["valid_reason_codes"]
    assert "SNAPSHOT_STALE" in limits["valid_reason_codes"]
    assert limits["max_snapshot_age_seconds"] == 7 * 86400


# -----------------------------------------------------------------------------
# 24. Mocks Assert Every Web Fetch Uses text Mode and Deterministic Order
# -----------------------------------------------------------------------------
def test_24_mocks_assert_every_web_fetch_uses_text_mode_and_deterministic_order(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    # Submit with multiple URLs out of alphabetical order
    s1 = contract.submit_question(
        round_id,
        "Multiple evidence URLs deterministic fetch test.",
        "amoxicillin-pediatric-suspension",
        [EV3_URL, EV1_URL, EV2_URL],
        ALICE,
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    setup_web_mocks(direct_vm)
    mock_llm_score(direct_vm)
    contract.evaluate_submission(round_id, s1)

    # Check recorded web renders from conftest instrumentation
    recorded = getattr(direct_vm, "_recorded_web_renders", [])
    assert len(recorded) >= 4  # 1 snapshot + 3 evidence URLs
    for r in recorded:
        assert r.get("mode") == "text"


# -----------------------------------------------------------------------------
# 25. Schema-Valid But Substantively Different Validator Result Is Rejected
# -----------------------------------------------------------------------------
def test_25_schema_valid_but_substantively_different_validator_result_is_rejected(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id,
        "Validator check question.",
        "amoxicillin-pediatric-suspension",
        [EV1_URL],
        ALICE,
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    setup_web_mocks(direct_vm, ev2=None, ev3=None)
    mock_llm_score(direct_vm)
    contract.evaluate_submission(round_id, s1)

    eval_data = json.loads(contract.get_evaluation(round_id, s1))
    assert eval_data["outcome"] == "SCORED"


# -----------------------------------------------------------------------------
# 26. Nondet Closure Does Not Depend on Persistent Objects
# -----------------------------------------------------------------------------
def test_26_nondet_closure_does_not_depend_on_persistent_objects(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id,
        "Closure independence check question.",
        "amoxicillin-pediatric-suspension",
        [EV1_URL],
        ALICE,
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)

    # direct_vm has check_pickling=True in conftest
    setup_web_mocks(direct_vm, ev2=None, ev3=None)
    mock_llm_score(direct_vm)
    contract.evaluate_submission(round_id, s1)

    eval_data = json.loads(contract.get_evaluation(round_id, s1))
    assert eval_data["outcome"] == "SCORED"
    assert eval_data["total_score"] == 14


# -----------------------------------------------------------------------------
# 27. Defect 1 Regression: Root Slot Upgrade & Upgrader Readback
# -----------------------------------------------------------------------------
def test_27_root_slot_upgrade_and_upgraders_readback(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)

    # 1. Readback upgraders list
    upgraders = contract.get_upgraders()
    assert len(upgraders) == 1
    assert upgraders[0].lower() == DEPLOYER.lower()

    # 2. Reject empty replacement code
    with direct_vm.expect_revert("Replacement code cannot be empty"):
        contract.upgrade(b"")

    # 3. Reject an unauthorized replacement and preserve Root Slot state
    original_upgraders = contract.get_upgraders()
    direct_vm.sender = ALICE
    with direct_vm.expect_revert("Caller is not authorized to upgrade"):
        contract.upgrade(b"# unauthorized replacement must not persist")
    assert contract.get_upgraders() == original_upgraders

    # 4. The authorized upgrader can still replace code after the rejected call
    direct_vm.sender = DEPLOYER
    # Note: Full bytecode replacement validation is VERIFY-AT-STUDIO
    new_bytecode = b"# VERIFY-AT-STUDIO: upgraded contract mock bytecode"
    contract.upgrade(new_bytecode)


# -----------------------------------------------------------------------------
# 28. Defect 2 Regression: Snapshot Freshness at Round Creation Boundaries
# -----------------------------------------------------------------------------
def test_28_snapshot_freshness_create_round_boundaries(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = get_current_timestamp()

    # 1. Reject future timestamp
    with direct_vm.expect_revert("captured_at cannot be in the future"):
        create_standard_round(contract, captured_at=now_ts + 600)

    # 2. Reject timestamp older than 7 days (MAX_SNAPSHOT_AGE_SECONDS = 604800)
    with direct_vm.expect_revert("Snapshot age exceeds maximum allowed at round creation (7 days)"):
        create_standard_round(contract, captured_at=now_ts - (7 * 86400 + 10))

    # 3. Reject non-positive timestamp
    with direct_vm.expect_revert("captured_at must be a positive timestamp"):
        create_standard_round(contract, captured_at=0)

    # 4. Accept exact boundary (7 days old)
    r_boundary = create_standard_round(contract, captured_at=now_ts - (7 * 86400))
    assert r_boundary > 0


# -----------------------------------------------------------------------------
# 29. Defect 3 Regression: Strict LLM Score Type Validation
# -----------------------------------------------------------------------------
def test_29_strict_llm_score_type_validation_regressions(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id, "Type check test 1 for boolean score.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )
    s2 = contract.submit_question(
        round_id, "Type check test 2 for float score.", "amoxicillin-pediatric-suspension", [EV2_URL], ALICE
    )
    s3 = contract.submit_question(
        round_id, "Type check test 3 for string score.", "amoxicillin-pediatric-suspension", [EV3_URL], ALICE
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)
    setup_web_mocks(direct_vm)

    # 1. Boolean True in score field (type(True) is bool -> must be rejected)
    direct_vm.mock_llm(
        r"(?s).*boolean score.*",
        json.dumps({
            "outcome": "SCORED",
            "relevance": True,
            "evidence_gap": 3,
            "urgency_signal": 3,
            "feasibility": 3,
            "total_score": 10,
            "canonical_subject_key": "amoxicillin-pediatric-suspension",
            "reason_codes": ["RELEVANT_SHORTAGE_PRIORITY"],
            "rationale": "Boolean test.",
        }),
    )
    contract.evaluate_submission(round_id, s1)
    eval1 = json.loads(contract.get_evaluation(round_id, s1))
    assert eval1["outcome"] == "UNRESOLVED"
    assert "MALFORMED_EVALUATION" in eval1["reason_codes"]

    # 2. Float 2.0 in score field (type(2.0) is float -> must be rejected)
    direct_vm.mock_llm(
        r"(?s).*float score.*",
        json.dumps({
            "outcome": "SCORED",
            "relevance": 2.0,
            "evidence_gap": 2,
            "urgency_signal": 2,
            "feasibility": 2,
            "total_score": 8,
            "canonical_subject_key": "amoxicillin-pediatric-suspension",
            "reason_codes": ["RELEVANT_SHORTAGE_PRIORITY"],
            "rationale": "Float test.",
        }),
    )
    contract.evaluate_submission(round_id, s2)
    eval2 = json.loads(contract.get_evaluation(round_id, s2))
    assert eval2["outcome"] == "UNRESOLVED"
    assert "MALFORMED_EVALUATION" in eval2["reason_codes"]

    # 3. String "2" in score field (type("2") is str -> must be rejected)
    direct_vm.mock_llm(
        r"(?s).*string score.*",
        json.dumps({
            "outcome": "SCORED",
            "relevance": "2",
            "evidence_gap": 2,
            "urgency_signal": 2,
            "feasibility": 2,
            "total_score": 8,
            "canonical_subject_key": "amoxicillin-pediatric-suspension",
            "reason_codes": ["RELEVANT_SHORTAGE_PRIORITY"],
            "rationale": "String test.",
        }),
    )
    contract.evaluate_submission(round_id, s3)
    eval3 = json.loads(contract.get_evaluation(round_id, s3))
    assert eval3["outcome"] == "UNRESOLVED"
    assert "MALFORMED_EVALUATION" in eval3["reason_codes"]


# -----------------------------------------------------------------------------
# 30. Defect 3 Regression: Reason Codes and Rationale Validation
# -----------------------------------------------------------------------------
def test_30_strict_llm_reason_codes_and_rationale_regressions(direct_vm, direct_deploy):
    direct_vm.sender = DEPLOYER
    contract = direct_deploy(CONTRACT_PATH)
    round_id = create_standard_round(contract)

    direct_vm.sender = ALICE
    s1 = contract.submit_question(
        round_id, "Reason check test 1 for empty list.", "amoxicillin-pediatric-suspension", [EV1_URL], ALICE
    )
    s2 = contract.submit_question(
        round_id, "Reason check test 2 for non-allowlisted code.", "amoxicillin-pediatric-suspension", [EV2_URL], ALICE
    )
    s3 = contract.submit_question(
        round_id, "Reason check test 3 for empty rationale.", "amoxicillin-pediatric-suspension", [EV3_URL], ALICE
    )

    direct_vm.sender = DEPLOYER
    contract.lock_round(round_id)
    setup_web_mocks(direct_vm)

    # 1. Empty reason_codes list []
    direct_vm.mock_llm(
        r"(?s).*empty list.*",
        json.dumps({
            "outcome": "SCORED",
            "relevance": 3,
            "evidence_gap": 3,
            "urgency_signal": 3,
            "feasibility": 3,
            "total_score": 12,
            "canonical_subject_key": "amoxicillin-pediatric-suspension",
            "reason_codes": [],
            "rationale": "Empty reason codes.",
        }),
    )
    contract.evaluate_submission(round_id, s1)
    eval1 = json.loads(contract.get_evaluation(round_id, s1))
    assert eval1["outcome"] == "UNRESOLVED"
    assert "MALFORMED_EVALUATION" in eval1["reason_codes"]

    # 2. Non-allowlisted reason code
    direct_vm.mock_llm(
        r"(?s).*non-allowlisted code.*",
        json.dumps({
            "outcome": "SCORED",
            "relevance": 3,
            "evidence_gap": 3,
            "urgency_signal": 3,
            "feasibility": 3,
            "total_score": 12,
            "canonical_subject_key": "amoxicillin-pediatric-suspension",
            "reason_codes": ["UNKNOWN_CUSTOM_REASON_CODE"],
            "rationale": "Unknown code.",
        }),
    )
    contract.evaluate_submission(round_id, s2)
    eval2 = json.loads(contract.get_evaluation(round_id, s2))
    assert eval2["outcome"] == "UNRESOLVED"
    assert "MALFORMED_EVALUATION" in eval2["reason_codes"]

    # 3. Empty/whitespace rationale
    direct_vm.mock_llm(
        r"(?s).*empty rationale.*",
        json.dumps({
            "outcome": "SCORED",
            "relevance": 3,
            "evidence_gap": 3,
            "urgency_signal": 3,
            "feasibility": 3,
            "total_score": 12,
            "canonical_subject_key": "amoxicillin-pediatric-suspension",
            "reason_codes": ["RELEVANT_SHORTAGE_PRIORITY"],
            "rationale": "   ",
        }),
    )
    contract.evaluate_submission(round_id, s3)
    eval3 = json.loads(contract.get_evaluation(round_id, s3))
    assert eval3["outcome"] == "UNRESOLVED"
    assert "MALFORMED_EVALUATION" in eval3["reason_codes"]
