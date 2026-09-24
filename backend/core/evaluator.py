"""Core ticket evaluator functions for Scenario 5: Post-analytics and Expert Evaluation."""

from typing import Any, Dict
from backend.schemas.domain_04 import TicketEvaluationRequest, TicketEvaluationResult


def normalize_text(text: str) -> str:
    """Normalize text: lowercase, remove punctuation, keep alphanumeric characters and collapse whitespace."""
    if not text:
        return ""
    text = str(text).lower()
    cleaned = "".join(c if (c.isalnum() or c.isspace()) else " " for c in text)
    return " ".join(cleaned.split())


def evaluate_ticket(req: TicketEvaluationRequest) -> TicketEvaluationResult:
    """Evaluate cadet's ticket submission against the etalon data."""
    errors_count = 0
    error_details: Dict[str, Any] = {}

    # 1. Compare services (set comparison)
    etalon_services = set(req.etalon_services or [])
    student_services = set(req.student_services or [])
    missing_services = etalon_services - student_services
    extra_services = student_services - etalon_services

    if missing_services or extra_services:
        errors_count += 1
        service_issues = []
        if missing_services:
            service_issues.append(f"Не вызванные службы: {', '.join(sorted(missing_services))}")
        if extra_services:
            service_issues.append(f"Лишние службы: {', '.join(sorted(extra_services))}")
        error_details["services"] = "; ".join(service_issues)

    # 2. Compare text fields
    for key, etalon_val in (req.etalon_fields or {}).items():
        student_val = (req.student_fields or {}).get(key, "")
        norm_etalon = normalize_text(str(etalon_val) if etalon_val is not None else "")
        norm_student = normalize_text(str(student_val) if student_val is not None else "")

        if norm_etalon not in norm_student:
            errors_count += 1
            error_details[key] = f"Ожидалось '{etalon_val}', получено '{student_val}'"

    is_passed = errors_count <= req.error_limit

    return TicketEvaluationResult(
        is_passed=is_passed,
        errors_count=errors_count,
        error_details=error_details,
    )
