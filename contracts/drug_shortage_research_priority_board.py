# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import datetime
import hashlib
import json
import re
import urllib.parse
from typing import Any

from genlayer import *
import genlayer.gl as gl

# Explicit Bounds and Limits
MAX_ROUNDS: int = 100
MAX_SUBMISSIONS_PER_ROUND: int = 50
MAX_SLOTS_PER_ROUND: int = 20
MIN_QUESTION_LEN: int = 10
MAX_QUESTION_LEN: int = 500
MIN_SUBJECT_KEY_LEN: int = 1
MAX_SUBJECT_KEY_LEN: int = 100
MIN_EVIDENCE_URLS: int = 1
MAX_EVIDENCE_URLS: int = 5
MAX_URI_LEN: int = 512
MAX_SUBSET_DESC_LEN: int = 500
MAX_RUBRIC_VER_LEN: int = 64
MAX_RUBRIC_TEXT_LEN: int = 4000
MAX_DISCLAIMER_VER_LEN: int = 64
MAX_DATASET_DATE_LEN: int = 64
MAX_RATIONALE_LEN: int = 1000
MAX_SOURCE_PROVENANCE_LEN: int = 1000
MIN_CLAIM_DURATION: int = 60
MAX_CLAIM_DURATION: int = 30 * 86400
MAX_SNAPSHOT_AGE_SECONDS: int = 7 * 86400

# Round State Constants
STATE_OPEN: str = "OPEN"
STATE_LOCKED: str = "LOCKED"
STATE_EVALUATED: str = "EVALUATED"
STATE_ALLOCATED: str = "ALLOCATED"
STATE_CLAIM: str = "CLAIM"
STATE_FINAL: str = "FINAL"

VALID_STATES: set[str] = {
    STATE_OPEN,
    STATE_LOCKED,
    STATE_EVALUATED,
    STATE_ALLOCATED,
    STATE_CLAIM,
    STATE_FINAL,
}

# Submission Status Constants
STATUS_PENDING: str = "PENDING"
STATUS_SCORED: str = "SCORED"
STATUS_UNRESOLVED: str = "UNRESOLVED"
STATUS_ALLOCATED: str = "ALLOCATED"
STATUS_WAITLISTED: str = "WAITLISTED"
STATUS_ACKNOWLEDGED: str = "ACKNOWLEDGED"
STATUS_EXPIRED: str = "EXPIRED"

# Reason Codes Allowlist
VALID_REASON_CODES: set[str] = {
    "RELEVANT_SHORTAGE_PRIORITY",
    "SUBSTANTIAL_EVIDENCE_GAP",
    "SIGNIFICANT_URGENCY_SIGNAL",
    "HIGH_RESEARCH_FEASIBILITY",
    "LOW_RELEVANCE",
    "INSUFFICIENT_EVIDENCE_GAP",
    "LOW_URGENCY_SIGNAL",
    "LOW_FEASIBILITY",
    "SNAPSHOT_STALE",
    "SNAPSHOT_FETCH_FAILED",
    "SNAPSHOT_DIGEST_MISMATCH",
    "EVIDENCE_FETCH_FAILED",
    "MALFORMED_EVALUATION",
    "MATERIAL_EVIDENCE_CONFLICT",
    "SUBJECT_KEY_MISMATCH",
    "UNRESOLVED_EVIDENCE",
}

CONTRACT_DISCLAIMER: str = (
    "Drug Shortage Research Priority Board is a non-medical public research prioritization tool. "
    "It allocates symbolic research review slots using public data and research evidence. "
    "It does not provide medical advice, diagnosis, treatment, or drug substitution recommendations. "
    "openFDA dataset may be unvalidated and must not guide clinical decision-making or procurement."
)


def ensure_address(value: Any) -> Address:
    if isinstance(value, Address):
        return value
    if isinstance(value, int):
        hex_str = "0x" + hex(value)[2:].zfill(40)
        return Address(hex_str)
    if isinstance(value, bytes):
        if len(value) == 20:
            return Address("0x" + value.hex())
        raise gl.vm.UserError("Invalid address byte length")
    if isinstance(value, str):
        val = value.strip()
        if re.fullmatch(r"0x[0-9a-fA-F]{40}", val) is not None:
            return Address(val)
    raise gl.vm.UserError("Invalid address format")


def _get_current_time() -> int:
    return int(datetime.datetime.now(datetime.timezone.utc).timestamp())


def _canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _normalize_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip().lower())
    return cleaned


def _validate_uri(uri: str, field_name: str) -> str:
    s = uri.strip()
    if len(s) == 0:
        raise gl.vm.UserError(f"{field_name} cannot be empty")
    if len(s) > MAX_URI_LEN:
        raise gl.vm.UserError(f"{field_name} exceeds maximum length of {MAX_URI_LEN} chars")
    if any(ord(c) < 32 or ord(c) == 127 for c in s):
        raise gl.vm.UserError(f"{field_name} contains invalid control characters")
    try:
        parsed = urllib.parse.urlsplit(s)
    except Exception:
        raise gl.vm.UserError(f"{field_name} is not a valid URL")
    if parsed.scheme.lower() != "https":
        raise gl.vm.UserError(f"{field_name} must use HTTPS scheme")
    if not parsed.netloc:
        raise gl.vm.UserError(f"{field_name} missing host/netloc")
    return s


def _validate_hash(hash_str: str, field_name: str) -> str:
    s = hash_str.strip()
    if len(s) != 64 or not all(c in "0123456789abcdef" for c in s):
        raise gl.vm.UserError(f"{field_name} must be a 64-character lowercase hex SHA-256 string")
    if hash_str != s:
        raise gl.vm.UserError(f"{field_name} contains invalid padding")
    return s


def _parse_llm_json(raw_input: Any) -> dict[str, Any]:
    if isinstance(raw_input, dict):
        res_dict: dict[str, Any] = dict(raw_input)
        return res_dict
    if not isinstance(raw_input, str):
        raise gl.vm.UserError("invalid LLM output type: expected string or dict")
    text = raw_input.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    start_idx = text.find("{")
    end_idx = text.rfind("}")
    if start_idx == -1 or end_idx == -1 or end_idx < start_idx:
        raise gl.vm.UserError("LLM response contains no JSON object")
    json_str = text[start_idx : end_idx + 1]
    try:
        data: Any = json.loads(json_str)
    except Exception as e:
        raise gl.vm.UserError(f"malformed LLM JSON: {e}")
    if not isinstance(data, dict):
        raise gl.vm.UserError("LLM JSON root is not an object")
    out: dict[str, Any] = dict(data)
    return out


def _unresolved_result(
    canonical_subject_key: str,
    reason_codes: list[str],
    rationale: str,
    snapshot_hash: str,
    disclaimer_version: str,
) -> dict[str, Any]:
    valid_reasons: list[str] = sorted(list(set([r for r in reason_codes if r in VALID_REASON_CODES])))
    if not valid_reasons:
        valid_reasons = ["UNRESOLVED_EVIDENCE"]
    res: dict[str, Any] = {
        "outcome": "UNRESOLVED",
        "relevance": 0,
        "evidence_gap": 0,
        "urgency_signal": 0,
        "feasibility": 0,
        "total_score": 0,
        "canonical_subject_key": canonical_subject_key,
        "reason_codes": valid_reasons[:4],
        "rationale": str(rationale)[:MAX_RATIONALE_LEN],
        "source_provenance": f"snapshot:{snapshot_hash[:16]}|unresolved",
        "disclaimer_version": disclaimer_version,
    }
    return res


def _evaluate_nondet(
    p_round_id: int,
    p_submission_id: int,
    p_snapshot_uri: str,
    p_snapshot_sha256: str,
    p_captured_at: int,
    p_dataset_last_updated: str,
    p_subset_description: str,
    p_rubric_version: str,
    p_rubric_text: str,
    p_disclaimer_version: str,
    p_question_text: str,
    p_canonical_subject_key: str,
    p_evidence_urls: list[str],
    p_submitter: str,
) -> dict[str, Any]:
    # 1. Fetch snapshot URI in text mode
    try:
        snapshot_raw: Any = gl.nondet.web.render(p_snapshot_uri, mode="text")
        if not snapshot_raw:
            return _unresolved_result(
                p_canonical_subject_key,
                ["SNAPSHOT_FETCH_FAILED"],
                "Snapshot content was empty or unrenderable.",
                p_snapshot_sha256,
                p_disclaimer_version,
            )
        snapshot_text = str(snapshot_raw)
    except Exception as e:
        return _unresolved_result(
            p_canonical_subject_key,
            ["SNAPSHOT_FETCH_FAILED"],
            f"Failed to fetch snapshot: {e}",
            p_snapshot_sha256,
            p_disclaimer_version,
        )

    # 2. Verify snapshot SHA-256
    actual_hash = hashlib.sha256(snapshot_text.encode("utf-8")).hexdigest().lower()
    if actual_hash != p_snapshot_sha256:
        return _unresolved_result(
            p_canonical_subject_key,
            ["SNAPSHOT_DIGEST_MISMATCH"],
            f"Snapshot SHA-256 mismatch: expected {p_snapshot_sha256}, got {actual_hash}",
            actual_hash,
            p_disclaimer_version,
        )

    # 3. Fetch each evidence URL in deterministic sorted order
    evidence_contents: list[dict[str, str]] = []
    for url in sorted(p_evidence_urls):
        try:
            ev_raw: Any = gl.nondet.web.render(url, mode="text")
            if not ev_raw:
                return _unresolved_result(
                    p_canonical_subject_key,
                    ["EVIDENCE_FETCH_FAILED"],
                    f"Evidence URL returned empty text: {url}",
                    actual_hash,
                    p_disclaimer_version,
                )
            ev_text = str(ev_raw)
            evidence_contents.append({"url": url, "text": ev_text[:2000]})
        except Exception as e:
            return _unresolved_result(
                p_canonical_subject_key,
                ["EVIDENCE_FETCH_FAILED"],
                f"Failed to fetch evidence URL {url}: {e}",
                actual_hash,
                p_disclaimer_version,
            )

    # 4. Construct LLM prompt
    evidence_summary = "\n".join(
        [f"Source: {ev['url']}\nExcerpt: {ev['text']}" for ev in evidence_contents]
    )
    llm_prompt = f"""You are evaluating a drug shortage research question priority proposal for a research board.
IMPORTANT: Do NOT provide medical advice, diagnosis, treatment, or drug substitution recommendations.

Frozen Rubric (Version {p_rubric_version}):
{p_rubric_text}

openFDA Drug Shortage Snapshot Context (Digest: {p_snapshot_sha256}, Captured: {p_captured_at}, Updated: {p_dataset_last_updated}, Subset: {p_subset_description}):
{snapshot_text[:2000]}

Research Question:
{p_question_text}

Canonical Subject Key:
{p_canonical_subject_key}

Evidence Sources:
{evidence_summary}

Allowed reason_codes (use only these exact strings):
{_canonical_json(sorted(list(VALID_REASON_CODES)))}

Evaluate the research proposal against the 4 criteria:
1. relevance (integer 0 to 4): How directly does this address an active shortage research gap?
2. evidence_gap (integer 0 to 4): How clearly is a research evidence gap identified?
3. urgency_signal (integer 0 to 4): Magnitude of shortage research urgency from public data.
4. feasibility (integer 0 to 4): Feasibility of investigating the research question.

Output ONLY a single JSON object with these exact keys:
{{
  "outcome": "SCORED",
  "relevance": <integer 0..4>,
  "evidence_gap": <integer 0..4>,
  "urgency_signal": <integer 0..4>,
  "feasibility": <integer 0..4>,
  "total_score": <sum of 4 scores>,
  "canonical_subject_key": "{p_canonical_subject_key}",
  "reason_codes": [<1 to 4 allowlisted reason codes>],
  "rationale": "<brief explanation up to 500 chars>"
}}
If evidence is materially conflicting, malformed, or out of scope, set outcome to "UNRESOLVED".
"""
    try:
        llm_response = gl.nondet.exec_prompt(llm_prompt, response_format="json")
        parsed = _parse_llm_json(llm_response)
    except Exception as e:
        return _unresolved_result(
            p_canonical_subject_key,
            ["MALFORMED_EVALUATION"],
            f"Failed to parse LLM evaluation JSON: {e}",
            actual_hash,
            p_disclaimer_version,
        )

    # 5. Validate LLM parsed result
    outcome = parsed.get("outcome")
    if outcome not in ("SCORED", "UNRESOLVED"):
        return _unresolved_result(
            p_canonical_subject_key,
            ["MALFORMED_EVALUATION"],
            f"Invalid outcome: {outcome}",
            actual_hash,
            p_disclaimer_version,
        )

    if outcome == "UNRESOLVED":
        raw_reasons: Any = parsed.get("reason_codes")
        if not isinstance(raw_reasons, list):
            reason_codes: list[str] = ["UNRESOLVED_EVIDENCE"]
        else:
            raw_codes_list: list[Any] = raw_reasons
            reason_codes = [
                str(r) for r in raw_codes_list if isinstance(r, str) and r in VALID_REASON_CODES
            ] or ["UNRESOLVED_EVIDENCE"]
        rationale_val = parsed.get("rationale")
        rationale_str = (
            str(rationale_val)
            if isinstance(rationale_val, str) and len(rationale_val.strip()) > 0
            else "Evaluation resulted in UNRESOLVED."
        )
        return _unresolved_result(
            p_canonical_subject_key,
            sorted(list(set(reason_codes)))[:4],
            rationale_str[:MAX_RATIONALE_LEN],
            actual_hash,
            p_disclaimer_version,
        )

    # Strict SCORED outcome validation
    # Check exact integer types (strictly reject bool, float, str, etc.)
    for field_name in ("relevance", "evidence_gap", "urgency_signal", "feasibility", "total_score"):
        if field_name not in parsed:
            return _unresolved_result(
                p_canonical_subject_key,
                ["MALFORMED_EVALUATION"],
                f"Missing numeric field: {field_name}",
                actual_hash,
                p_disclaimer_version,
            )
        val = parsed[field_name]
        if type(val) is not int:
            return _unresolved_result(
                p_canonical_subject_key,
                ["MALFORMED_EVALUATION"],
                f"Field {field_name} must be exact integer, got {type(val).__name__}",
                actual_hash,
                p_disclaimer_version,
            )

    rel = int(parsed["relevance"])
    ev_gap = int(parsed["evidence_gap"])
    urg = int(parsed["urgency_signal"])
    feas = int(parsed["feasibility"])
    tot = int(parsed["total_score"])

    if not (0 <= rel <= 4 and 0 <= ev_gap <= 4 and 0 <= urg <= 4 and 0 <= feas <= 4):
        return _unresolved_result(
            p_canonical_subject_key,
            ["MALFORMED_EVALUATION"],
            f"Criteria score out of range 0..4: rel={rel}, ev_gap={ev_gap}, urg={urg}, feas={feas}",
            actual_hash,
            p_disclaimer_version,
        )

    if not (0 <= tot <= 16):
        return _unresolved_result(
            p_canonical_subject_key,
            ["MALFORMED_EVALUATION"],
            f"Total score out of range 0..16: {tot}",
            actual_hash,
            p_disclaimer_version,
        )

    if tot != rel + ev_gap + urg + feas:
        return _unresolved_result(
            p_canonical_subject_key,
            ["MALFORMED_EVALUATION"],
            f"Total score mismatch: sum={rel + ev_gap + urg + feas}, total_score={tot}",
            actual_hash,
            p_disclaimer_version,
        )

    subject_val = parsed.get("canonical_subject_key")
    if type(subject_val) is not str or subject_val != p_canonical_subject_key:
        return _unresolved_result(
            p_canonical_subject_key,
            ["SUBJECT_KEY_MISMATCH"],
            f"Subject key mismatch: expected '{p_canonical_subject_key}', got '{subject_val}'",
            actual_hash,
            p_disclaimer_version,
        )

    raw_reasons_scored: Any = parsed.get("reason_codes")
    if not isinstance(raw_reasons_scored, list) or len(raw_reasons_scored) < 1 or len(raw_reasons_scored) > 4:
        return _unresolved_result(
            p_canonical_subject_key,
            ["MALFORMED_EVALUATION"],
            "reason_codes must be a list containing 1 to 4 allowlisted codes",
            actual_hash,
            p_disclaimer_version,
        )

    scored_codes_list: list[Any] = raw_reasons_scored
    for code_item in scored_codes_list:
        if type(code_item) is not str or str(code_item) not in VALID_REASON_CODES:
            return _unresolved_result(
                p_canonical_subject_key,
                ["MALFORMED_EVALUATION"],
                f"Invalid or non-allowlisted reason code: {code_item}",
                actual_hash,
                p_disclaimer_version,
            )

    normalized_reasons: list[str] = sorted(list(set([str(c) for c in scored_codes_list])))

    raw_rationale = parsed.get("rationale")
    if type(raw_rationale) is not str or len(raw_rationale.strip()) == 0:
        return _unresolved_result(
            p_canonical_subject_key,
            ["MALFORMED_EVALUATION"],
            "rationale must be a non-empty string",
            actual_hash,
            p_disclaimer_version,
        )

    rationale = raw_rationale.strip()[:MAX_RATIONALE_LEN]
    source_provenance = f"snapshot:{p_snapshot_sha256[:16]}|sources:{len(p_evidence_urls)}|rubric:{p_rubric_version}"

    return {
        "outcome": "SCORED",
        "relevance": rel,
        "evidence_gap": ev_gap,
        "urgency_signal": urg,
        "feasibility": feas,
        "total_score": tot,
        "canonical_subject_key": p_canonical_subject_key,
        "reason_codes": normalized_reasons,
        "rationale": rationale,
        "source_provenance": source_provenance,
        "disclaimer_version": p_disclaimer_version,
    }


class DrugShortageResearchPriorityBoard(gl.Contract):
    rounds: TreeMap[u256, str]
    submissions: TreeMap[str, str]  # key: f"{round_id}:{submission_id}"
    evaluations: TreeMap[str, str]  # key: f"{round_id}:{submission_id}"
    allocations: TreeMap[u256, str]  # key: round_id
    round_questions: TreeMap[str, u256]  # key: f"{round_id}:{normalized_question}" -> submission_id
    next_round_id: u256

    def __init__(self):
        self.next_round_id = u256(1)
        # VERIFY-AT-STUDIO: confirm the deployed Root Slot records the locked
        # Studio deployer as its sole upgrader on the reviewed Studionet build.
        root = gl.storage.Root.get()
        root.upgraders.get().append(Address(str(gl.message.sender_address)))

    # -------------------------------------------------------------------------
    # Internal Storage Helpers
    # -------------------------------------------------------------------------
    def _load_round(self, round_id: int | u256) -> dict[str, Any]:
        raw = self.rounds.get(u256(int(round_id)), "")
        if not raw:
            raise gl.vm.UserError("Round does not exist")
        return json.loads(raw)

    def _save_round(self, round_id: int | u256, data: dict[str, Any]) -> None:
        self.rounds[u256(int(round_id))] = _canonical_json(data)

    def _load_submission(self, round_id: int | u256, submission_id: int | u256) -> dict[str, Any]:
        key = f"{int(round_id)}:{int(submission_id)}"
        raw = self.submissions.get(key, "")
        if not raw:
            raise gl.vm.UserError("Submission does not exist")
        return json.loads(raw)

    def _save_submission(
        self, round_id: int | u256, submission_id: int | u256, data: dict[str, Any]
    ) -> None:
        key = f"{int(round_id)}:{int(submission_id)}"
        self.submissions[key] = _canonical_json(data)

    def _load_evaluation(self, round_id: int | u256, submission_id: int | u256) -> dict[str, Any]:
        key = f"{int(round_id)}:{int(submission_id)}"
        raw = self.evaluations.get(key, "")
        if not raw:
            raise gl.vm.UserError("Evaluation does not exist for this submission")
        return json.loads(raw)

    def _save_evaluation(
        self, round_id: int | u256, submission_id: int | u256, data: dict[str, Any]
    ) -> None:
        key = f"{int(round_id)}:{int(submission_id)}"
        self.evaluations[key] = _canonical_json(data)

    def _load_allocations(self, round_id: int | u256) -> dict[str, Any]:
        raw = self.allocations.get(u256(int(round_id)), "")
        if not raw:
            raise gl.vm.UserError("Allocations do not exist for this round")
        return json.loads(raw)

    def _save_allocations(self, round_id: int | u256, data: dict[str, Any]) -> None:
        self.allocations[u256(int(round_id))] = _canonical_json(data)

    # -------------------------------------------------------------------------
    # Public Writes
    # -------------------------------------------------------------------------
    @gl.public.write
    def create_round(
        self,
        snapshot_uri: str,
        snapshot_sha256: str,
        captured_at: u256,
        dataset_last_updated: str,
        subset_description: str,
        rubric_version: str,
        rubric_text: str,
        disclaimer_version: str,
        submission_deadline: u256,
        claim_duration: u256,
        slot_count: u256,
    ) -> u256:
        if int(self.next_round_id) > MAX_ROUNDS:
            raise gl.vm.UserError(f"Maximum round limit of {MAX_ROUNDS} reached")

        val_uri = _validate_uri(snapshot_uri, "snapshot_uri")
        val_hash = _validate_hash(snapshot_sha256, "snapshot_sha256")

        current_time = _get_current_time()
        cap_at = int(captured_at)
        if cap_at <= 0:
            raise gl.vm.UserError("captured_at must be a positive timestamp")
        if cap_at > current_time:
            raise gl.vm.UserError("captured_at cannot be in the future")
        if current_time - cap_at > MAX_SNAPSHOT_AGE_SECONDS:
            raise gl.vm.UserError("Snapshot age exceeds maximum allowed at round creation (7 days)")

        updated_str = dataset_last_updated.strip()
        if len(updated_str) == 0 or len(updated_str) > MAX_DATASET_DATE_LEN:
            raise gl.vm.UserError(f"dataset_last_updated length must be 1..{MAX_DATASET_DATE_LEN}")

        subset_str = subset_description.strip()
        if len(subset_str) == 0 or len(subset_str) > MAX_SUBSET_DESC_LEN:
            raise gl.vm.UserError(f"subset_description length must be 1..{MAX_SUBSET_DESC_LEN}")

        rubric_ver_str = rubric_version.strip()
        if len(rubric_ver_str) == 0 or len(rubric_ver_str) > MAX_RUBRIC_VER_LEN:
            raise gl.vm.UserError(f"rubric_version length must be 1..{MAX_RUBRIC_VER_LEN}")

        rubric_txt_str = rubric_text.strip()
        if len(rubric_txt_str) == 0 or len(rubric_txt_str) > MAX_RUBRIC_TEXT_LEN:
            raise gl.vm.UserError(f"rubric_text length must be 1..{MAX_RUBRIC_TEXT_LEN}")

        disclaimer_ver_str = disclaimer_version.strip()
        if len(disclaimer_ver_str) == 0 or len(disclaimer_ver_str) > MAX_DISCLAIMER_VER_LEN:
            raise gl.vm.UserError(f"disclaimer_version length must be 1..{MAX_DISCLAIMER_VER_LEN}")

        if int(submission_deadline) <= current_time:
            raise gl.vm.UserError("submission_deadline must be in the future")

        if not (MIN_CLAIM_DURATION <= int(claim_duration) <= MAX_CLAIM_DURATION):
            raise gl.vm.UserError(
                f"claim_duration must be between {MIN_CLAIM_DURATION} and {MAX_CLAIM_DURATION} seconds"
            )

        if not (1 <= int(slot_count) <= MAX_SLOTS_PER_ROUND):
            raise gl.vm.UserError(f"slot_count must be between 1 and {MAX_SLOTS_PER_ROUND}")

        round_id = int(self.next_round_id)
        self.next_round_id = u256(round_id + 1)

        creator_addr = str(gl.message.sender_address).lower()

        round_data = {
            "round_id": round_id,
            "creator": creator_addr,
            "snapshot_uri": val_uri,
            "snapshot_sha256": val_hash,
            "captured_at": cap_at,
            "dataset_last_updated": updated_str,
            "subset_description": subset_str,
            "rubric_version": rubric_ver_str,
            "rubric_text": rubric_txt_str,
            "disclaimer_version": disclaimer_ver_str,
            "submission_deadline": int(submission_deadline),
            "claim_duration": int(claim_duration),
            "slot_count": int(slot_count),
            "state": STATE_OPEN,
            "submission_count": 0,
            "evaluated_count": 0,
            "created_at": current_time,
            "locked_at": 0,
            "allocated_at": 0,
            "finalized_at": 0,
        }
        self._save_round(round_id, round_data)
        return u256(round_id)

    @gl.public.write
    def submit_question(
        self,
        round_id: u256,
        question_text: str,
        canonical_subject_key: str,
        evidence_urls: list[str],
        reviewer_address: str,
    ) -> u256:
        round_data = self._load_round(round_id)
        if round_data["state"] != STATE_OPEN:
            raise gl.vm.UserError(f"Round is in {round_data['state']} state, not accepting submissions")

        current_time = _get_current_time()
        if current_time >= round_data["submission_deadline"]:
            raise gl.vm.UserError("Round submission deadline has passed")

        if round_data["submission_count"] >= MAX_SUBMISSIONS_PER_ROUND:
            raise gl.vm.UserError(f"Maximum submissions per round ({MAX_SUBMISSIONS_PER_ROUND}) reached")

        q_clean = question_text.strip()
        if len(q_clean) < MIN_QUESTION_LEN or len(q_clean) > MAX_QUESTION_LEN:
            raise gl.vm.UserError(
                f"question_text length must be between {MIN_QUESTION_LEN} and {MAX_QUESTION_LEN} chars"
            )

        norm_q = _normalize_text(q_clean)
        q_key = f"{int(round_id)}:{norm_q}"
        if int(self.round_questions.get(q_key, u256(0))) != 0:
            raise gl.vm.UserError("Duplicate research question already submitted in this round")

        sub_key = canonical_subject_key.strip()
        if len(sub_key) < MIN_SUBJECT_KEY_LEN or len(sub_key) > MAX_SUBJECT_KEY_LEN:
            raise gl.vm.UserError(
                f"canonical_subject_key length must be between {MIN_SUBJECT_KEY_LEN} and {MAX_SUBJECT_KEY_LEN} chars"
            )

        if not (MIN_EVIDENCE_URLS <= len(evidence_urls) <= MAX_EVIDENCE_URLS):
            raise gl.vm.UserError(
                f"evidence_urls count must be between {MIN_EVIDENCE_URLS} and {MAX_EVIDENCE_URLS}"
            )

        validated_urls: list[str] = []
        seen_urls: set[str] = set()
        for idx, u in enumerate(evidence_urls):
            val_u = _validate_uri(u, f"evidence_urls[{idx}]")
            if val_u in seen_urls:
                raise gl.vm.UserError(f"Duplicate evidence URL in submission: {val_u}")
            seen_urls.add(val_u)
            validated_urls.append(val_u)

        validated_urls.sort()

        submitter_addr = str(gl.message.sender_address).lower()
        if reviewer_address.strip():
            rev_addr = str(ensure_address(reviewer_address)).lower()
        else:
            rev_addr = submitter_addr

        submission_id = int(round_data["submission_count"]) + 1

        sub_data = {
            "submission_id": submission_id,
            "round_id": int(round_id),
            "submitter": submitter_addr,
            "reviewer_address": rev_addr,
            "question_text": q_clean,
            "normalized_question": norm_q,
            "canonical_subject_key": sub_key,
            "evidence_urls": validated_urls,
            "submitted_at": current_time,
            "status": STATUS_PENDING,
            "allocated_at": 0,
            "claim_deadline": 0,
            "acknowledged_at": 0,
            "acknowledged_by": "",
            "expired_at": 0,
        }

        self._save_submission(round_id, submission_id, sub_data)
        self.round_questions[q_key] = u256(submission_id)

        round_data["submission_count"] = submission_id
        self._save_round(round_id, round_data)

        return u256(submission_id)

    @gl.public.write
    def lock_round(self, round_id: u256) -> None:
        round_data = self._load_round(round_id)
        if round_data["state"] != STATE_OPEN:
            raise gl.vm.UserError(f"Cannot lock round in {round_data['state']} state")

        current_time = _get_current_time()
        caller = str(gl.message.sender_address).lower()
        is_creator = caller == round_data["creator"]

        if is_creator:
            if current_time < round_data["submission_deadline"] and round_data["submission_count"] == 0:
                raise gl.vm.UserError("Creator cannot lock round before deadline with zero submissions")
        else:
            if current_time < round_data["submission_deadline"]:
                raise gl.vm.UserError("Submission deadline has not passed yet")

        round_data["locked_at"] = current_time
        if round_data["submission_count"] == 0:
            round_data["state"] = STATE_EVALUATED
        else:
            round_data["state"] = STATE_LOCKED

        self._save_round(round_id, round_data)

    @gl.public.write
    def evaluate_submission(self, round_id: u256, submission_id: u256) -> None:
        round_data = self._load_round(round_id)
        if round_data["state"] != STATE_LOCKED:
            raise gl.vm.UserError(f"Round must be in LOCKED state to evaluate (currently {round_data['state']})")

        sub_data = self._load_submission(round_id, submission_id)
        if sub_data["status"] != STATUS_PENDING:
            raise gl.vm.UserError(f"Submission has already been evaluated (status: {sub_data['status']})")

        current_eval_time = _get_current_time()
        cap_at = int(round_data["captured_at"])

        # Timestamp freshness check at evaluation time
        if cap_at > current_eval_time or (current_eval_time - cap_at > MAX_SNAPSHOT_AGE_SECONDS):
            stale_eval = {
                "outcome": "UNRESOLVED",
                "relevance": 0,
                "evidence_gap": 0,
                "urgency_signal": 0,
                "feasibility": 0,
                "total_score": 0,
                "canonical_subject_key": str(sub_data["canonical_subject_key"]),
                "reason_codes": ["SNAPSHOT_STALE"],
                "rationale": "Snapshot dataset timestamp is stale at evaluation time.",
                "source_provenance": f"snapshot:{str(round_data['snapshot_sha256'])[:16]}|stale",
                "disclaimer_version": str(round_data["disclaimer_version"]),
                "evaluated_at": current_eval_time,
                "round_id": int(round_id),
                "submission_id": int(submission_id),
            }
            self._save_evaluation(round_id, submission_id, stale_eval)
            sub_data["status"] = STATUS_UNRESOLVED
            self._save_submission(round_id, submission_id, sub_data)

            round_data["evaluated_count"] = int(round_data["evaluated_count"]) + 1
            if round_data["evaluated_count"] >= round_data["submission_count"]:
                round_data["state"] = STATE_EVALUATED
            self._save_round(round_id, round_data)
            return

        p_round_id = int(round_id)
        p_submission_id = int(submission_id)
        p_snapshot_uri = str(round_data["snapshot_uri"])
        p_snapshot_sha256 = str(round_data["snapshot_sha256"])
        p_captured_at = cap_at
        p_dataset_last_updated = str(round_data["dataset_last_updated"])
        p_subset_description = str(round_data["subset_description"])
        p_rubric_version = str(round_data["rubric_version"])
        p_rubric_text = str(round_data["rubric_text"])
        p_disclaimer_version = str(round_data["disclaimer_version"])
        p_question_text = str(sub_data["question_text"])
        p_canonical_subject_key = str(sub_data["canonical_subject_key"])
        p_evidence_urls = [str(u) for u in sub_data["evidence_urls"]]
        p_submitter = str(sub_data["submitter"])

        def leader_fn() -> str:
            res = _evaluate_nondet(
                p_round_id,
                p_submission_id,
                p_snapshot_uri,
                p_snapshot_sha256,
                p_captured_at,
                p_dataset_last_updated,
                p_subset_description,
                p_rubric_version,
                p_rubric_text,
                p_disclaimer_version,
                p_question_text,
                p_canonical_subject_key,
                p_evidence_urls,
                p_submitter,
            )
            return _canonical_json(res)

        def validator_fn(leader_result: Any) -> bool:
            try:
                if hasattr(leader_result, "calldata"):
                    leader_str = str(leader_result.calldata)
                elif isinstance(leader_result, str):
                    leader_str = leader_result
                else:
                    leader_str = _canonical_json(leader_result)
                leader: dict[str, Any] = json.loads(leader_str)
                validator = _evaluate_nondet(
                    p_round_id,
                    p_submission_id,
                    p_snapshot_uri,
                    p_snapshot_sha256,
                    p_captured_at,
                    p_dataset_last_updated,
                    p_subset_description,
                    p_rubric_version,
                    p_rubric_text,
                    p_disclaimer_version,
                    p_question_text,
                    p_canonical_subject_key,
                    p_evidence_urls,
                    p_submitter,
                )
            except Exception:
                return False

            consequential_fields = (
                "outcome",
                "relevance",
                "evidence_gap",
                "urgency_signal",
                "feasibility",
                "total_score",
                "canonical_subject_key",
                "reason_codes",
                "source_provenance",
                "disclaimer_version",
            )
            return all(leader.get(f) == validator.get(f) for f in consequential_fields)

        agreed_raw: Any = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        if isinstance(agreed_raw, str):
            agreed: dict[str, Any] = json.loads(agreed_raw)
        elif hasattr(agreed_raw, "calldata"):
            agreed = json.loads(str(agreed_raw.calldata))
        else:
            agreed = json.loads(str(agreed_raw))

        agreed["evaluated_at"] = current_eval_time
        agreed["round_id"] = int(round_id)
        agreed["submission_id"] = int(submission_id)

        self._save_evaluation(round_id, submission_id, agreed)

        sub_data["status"] = agreed["outcome"]
        self._save_submission(round_id, submission_id, sub_data)

        round_data["evaluated_count"] = int(round_data["evaluated_count"]) + 1
        if round_data["evaluated_count"] >= round_data["submission_count"]:
            round_data["state"] = STATE_EVALUATED

        self._save_round(round_id, round_data)

    @gl.public.write
    def allocate_slots(self, round_id: u256) -> None:
        round_data = self._load_round(round_id)
        if round_data["state"] != STATE_EVALUATED:
            raise gl.vm.UserError(
                f"Round must be in EVALUATED state to allocate (currently {round_data['state']})"
            )

        sub_count = int(round_data["submission_count"])
        scored_candidates: list[dict[str, Any]] = []
        unresolved_ids: list[int] = []

        for sid in range(1, sub_count + 1):
            sub = self._load_submission(round_id, sid)
            if sub["status"] == STATUS_SCORED:
                eval_data = self._load_evaluation(round_id, sid)
                scored_candidates.append({
                    "submission_id": sid,
                    "total_score": eval_data["total_score"],
                    "urgency_signal": eval_data["urgency_signal"],
                    "evidence_gap": eval_data["evidence_gap"],
                })
            elif sub["status"] == STATUS_UNRESOLVED:
                unresolved_ids.append(sid)

        # Deterministic ranking:
        # 1. total_score descending
        # 2. urgency_signal descending
        # 3. evidence_gap descending
        # 4. submission_id ascending
        scored_candidates.sort(
            key=lambda x: (
                -x["total_score"],
                -x["urgency_signal"],
                -x["evidence_gap"],
                x["submission_id"],
            )
        )

        slot_count = int(round_data["slot_count"])
        allocated_ids: list[int] = []
        waitlisted_ids: list[int] = []
        current_time = _get_current_time()
        claim_deadline = current_time + int(round_data["claim_duration"])

        for idx, item in enumerate(scored_candidates):
            sid = int(item["submission_id"])
            sub = self._load_submission(round_id, sid)
            if idx < slot_count:
                sub["status"] = STATUS_ALLOCATED
                sub["allocated_at"] = current_time
                sub["claim_deadline"] = claim_deadline
                allocated_ids.append(sid)
            else:
                sub["status"] = STATUS_WAITLISTED
                waitlisted_ids.append(sid)
            self._save_submission(round_id, sid, sub)

        alloc_data = {
            "round_id": int(round_id),
            "slot_count": slot_count,
            "allocated_submission_ids": allocated_ids,
            "waitlisted_submission_ids": waitlisted_ids,
            "unresolved_submission_ids": unresolved_ids,
            "allocated_at": current_time,
        }
        self._save_allocations(round_id, alloc_data)

        round_data["allocated_at"] = current_time
        if len(allocated_ids) > 0:
            round_data["state"] = STATE_CLAIM
        else:
            round_data["state"] = STATE_FINAL
            round_data["finalized_at"] = current_time

        self._save_round(round_id, round_data)

    @gl.public.write
    def acknowledge_slot(self, round_id: u256, submission_id: u256) -> None:
        round_data = self._load_round(round_id)
        if round_data["state"] not in (STATE_CLAIM, STATE_ALLOCATED):
            raise gl.vm.UserError(f"Round is in {round_data['state']} state, not in CLAIM window")

        sub = self._load_submission(round_id, submission_id)
        if sub["status"] != STATUS_ALLOCATED:
            raise gl.vm.UserError(f"Submission status is {sub['status']}, cannot acknowledge")

        current_time = _get_current_time()
        if current_time > sub["claim_deadline"]:
            raise gl.vm.UserError("Claim deadline has expired for this allocation")

        caller = str(gl.message.sender_address).lower()
        if caller != sub["reviewer_address"]:
            raise gl.vm.UserError("Caller is not the designated reviewer for this submission")

        sub["status"] = STATUS_ACKNOWLEDGED
        sub["acknowledged_at"] = current_time
        sub["acknowledged_by"] = caller
        self._save_submission(round_id, submission_id, sub)

    @gl.public.write
    def reclaim_expired_slots(self, round_id: u256) -> None:
        round_data = self._load_round(round_id)
        if round_data["state"] != STATE_CLAIM:
            raise gl.vm.UserError(f"Round is in {round_data['state']} state, not in CLAIM state")

        alloc_data = self._load_allocations(round_id)
        current_time = _get_current_time()

        allocated_ids: list[int] = [int(i) for i in alloc_data["allocated_submission_ids"]]
        waitlisted_ids: list[int] = [int(i) for i in alloc_data["waitlisted_submission_ids"]]

        new_allocated_ids: list[int] = []

        for sid in allocated_ids:
            sub = self._load_submission(round_id, sid)
            if sub["status"] == STATUS_ALLOCATED and current_time > sub["claim_deadline"]:
                # Expired slot
                sub["status"] = STATUS_EXPIRED
                sub["expired_at"] = current_time
                self._save_submission(round_id, sid, sub)

                # Promote next eligible waitlist submission
                promoted = False
                while waitlisted_ids and not promoted:
                    next_sid = waitlisted_ids.pop(0)
                    w_sub = self._load_submission(round_id, next_sid)
                    if w_sub["status"] == STATUS_WAITLISTED:
                        w_sub["status"] = STATUS_ALLOCATED
                        w_sub["allocated_at"] = current_time
                        w_sub["claim_deadline"] = current_time + int(round_data["claim_duration"])
                        self._save_submission(round_id, next_sid, w_sub)
                        new_allocated_ids.append(next_sid)
                        promoted = True
            else:
                new_allocated_ids.append(sid)

        alloc_data["allocated_submission_ids"] = new_allocated_ids
        alloc_data["waitlisted_submission_ids"] = waitlisted_ids
        self._save_allocations(round_id, alloc_data)

    @gl.public.write
    def finalize_round(self, round_id: u256) -> None:
        round_data = self._load_round(round_id)
        if round_data["state"] == STATE_FINAL:
            return  # Idempotent return

        if round_data["state"] not in (STATE_CLAIM, STATE_ALLOCATED, STATE_EVALUATED):
            raise gl.vm.UserError(f"Round in {round_data['state']} state cannot be finalized")

        if int(round_data["submission_count"]) == 0:
            round_data["state"] = STATE_FINAL
            round_data["finalized_at"] = _get_current_time()
            self._save_round(round_id, round_data)
            return

        alloc_data = self._load_allocations(round_id)
        current_time = _get_current_time()

        # Check all allocated slots
        allocated_ids: list[int] = [int(i) for i in alloc_data["allocated_submission_ids"]]
        for sid in allocated_ids:
            sub = self._load_submission(round_id, sid)
            if sub["status"] == STATUS_ALLOCATED:
                if current_time <= sub["claim_deadline"]:
                    raise gl.vm.UserError("Claim period is still active for an allocated slot")
                else:
                    raise gl.vm.UserError(
                        "Expired allocated slot must be reclaimed before finalizing"
                    )

        round_data["state"] = STATE_FINAL
        round_data["finalized_at"] = current_time
        self._save_round(round_id, round_data)

    @gl.public.write
    def upgrade(self, new_code: bytes) -> None:
        if not new_code or len(new_code) == 0:
            raise gl.vm.UserError("Replacement code cannot be empty")
        # VERIFY-AT-STUDIO: rehearse authorized replacement on an isolated
        # deployment and prove unauthorized rollback plus unchanged code/state.
        root = gl.storage.Root.get()
        sender = str(gl.message.sender_address).lower()
        allowed = [address.as_hex.lower() for address in root.upgraders.get()]
        if sender not in allowed:
            raise gl.vm.UserError("Caller is not authorized to upgrade")
        code = root.code.get()
        code.truncate()
        code.extend(new_code)

    # -------------------------------------------------------------------------
    # Public Views
    # -------------------------------------------------------------------------
    @gl.public.view
    def get_round_count(self) -> u256:
        return u256(int(self.next_round_id) - 1)

    @gl.public.view
    def get_round(self, round_id: u256) -> str:
        return _canonical_json(self._load_round(round_id))

    @gl.public.view
    def get_submission_count(self, round_id: u256) -> u256:
        r = self._load_round(round_id)
        return u256(int(r["submission_count"]))

    @gl.public.view
    def get_submission(self, round_id: u256, submission_id: u256) -> str:
        return _canonical_json(self._load_submission(round_id, submission_id))

    @gl.public.view
    def get_evaluation(self, round_id: u256, submission_id: u256) -> str:
        return _canonical_json(self._load_evaluation(round_id, submission_id))

    @gl.public.view
    def get_allocations(self, round_id: u256) -> str:
        return _canonical_json(self._load_allocations(round_id))

    @gl.public.view
    def get_caller_status(self, round_id: u256, caller_address: str) -> str:
        round_data = self._load_round(round_id)
        caller = str(ensure_address(caller_address)).lower()
        current_time = _get_current_time()

        is_creator = caller == round_data["creator"]
        sub_count = int(round_data["submission_count"])

        submitted_ids: list[int] = []
        reviewer_assigned_ids: list[int] = []
        claimable_ids: list[int] = []

        for sid in range(1, sub_count + 1):
            sub = self._load_submission(round_id, sid)
            if sub["submitter"] == caller:
                submitted_ids.append(sid)
            if sub["reviewer_address"] == caller:
                reviewer_assigned_ids.append(sid)
                if sub["status"] == STATUS_ALLOCATED and current_time <= sub["claim_deadline"]:
                    claimable_ids.append(sid)

        can_lock = False
        if round_data["state"] == STATE_OPEN:
            if is_creator and (sub_count > 0 or current_time >= round_data["submission_deadline"]):
                can_lock = True
            elif current_time >= round_data["submission_deadline"]:
                can_lock = True

        can_allocate = round_data["state"] == STATE_EVALUATED
        can_reclaim = round_data["state"] == STATE_CLAIM
        can_finalize = round_data["state"] in (STATE_CLAIM, STATE_ALLOCATED, STATE_EVALUATED)

        return _canonical_json({
            "round_id": int(round_id),
            "caller": caller,
            "is_creator": is_creator,
            "submitted_submission_ids": submitted_ids,
            "reviewer_assigned_submission_ids": reviewer_assigned_ids,
            "claimable_submission_ids": claimable_ids,
            "can_lock": can_lock,
            "can_allocate": can_allocate,
            "can_reclaim": can_reclaim,
            "can_finalize": can_finalize,
            "round_state": round_data["state"],
        })

    @gl.public.view
    def get_limits(self) -> str:
        return _canonical_json({
            "max_rounds": MAX_ROUNDS,
            "max_submissions_per_round": MAX_SUBMISSIONS_PER_ROUND,
            "max_slots_per_round": MAX_SLOTS_PER_ROUND,
            "min_question_len": MIN_QUESTION_LEN,
            "max_question_len": MAX_QUESTION_LEN,
            "min_subject_key_len": MIN_SUBJECT_KEY_LEN,
            "max_subject_key_len": MAX_SUBJECT_KEY_LEN,
            "min_evidence_urls": MIN_EVIDENCE_URLS,
            "max_evidence_urls": MAX_EVIDENCE_URLS,
            "max_uri_len": MAX_URI_LEN,
            "max_subset_desc_len": MAX_SUBSET_DESC_LEN,
            "max_rubric_ver_len": MAX_RUBRIC_VER_LEN,
            "max_rubric_text_len": MAX_RUBRIC_TEXT_LEN,
            "max_disclaimer_ver_len": MAX_DISCLAIMER_VER_LEN,
            "max_dataset_date_len": MAX_DATASET_DATE_LEN,
            "max_rationale_len": MAX_RATIONALE_LEN,
            "max_source_provenance_len": MAX_SOURCE_PROVENANCE_LEN,
            "min_claim_duration": MIN_CLAIM_DURATION,
            "max_claim_duration": MAX_CLAIM_DURATION,
            "max_snapshot_age_seconds": MAX_SNAPSHOT_AGE_SECONDS,
            "valid_states": sorted(list(VALID_STATES)),
            "valid_reason_codes": sorted(list(VALID_REASON_CODES)),
        })

    @gl.public.view
    def get_contract_disclaimer(self) -> str:
        return CONTRACT_DISCLAIMER

    @gl.public.view
    def get_upgraders(self) -> list[str]:
        root = gl.storage.Root.get()
        return [address.as_hex for address in root.upgraders.get()]
