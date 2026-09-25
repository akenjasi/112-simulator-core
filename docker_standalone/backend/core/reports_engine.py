"""Core logic for calculating evaluation metrics, scores, and generating reports."""

import csv
import io
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple
from jinja2 import Environment, FileSystemLoader, select_autoescape


def calculate_final_score(
    comm_metrics: Dict[str, Any],
    card_metrics: Dict[str, Any],
    sla_metrics: Dict[str, Any],
) -> Tuple[int, Dict[str, Any]]:
    """Calculate the final evaluation score and penalty details from 3 blocks.

    Blocks:
    1. Communication:
       - greeting_success: penalty 10 if False ('no_greeting')
       - filler_words: penalty min(20, count * 2) if > 0 ('filler_words')
       - script_followed_pct: penalty based on deviation, 'script_violation' if < 80%
    2. Incident Card:
       - address_correct: penalty 15 if False ('address_error')
       - services_matched: penalty 10 if False ('services_mismatched')
       - over_dispatched_services: penalty 15 per extra service ('over_dispatching')
       - missed_critical_factoids: penalty 20 per missed factoid ('missed_factoid')
    3. SLA:
       - sla_breached_count: penalty 10 per breach ('sla_breach')
       - time_to_first_dispatch_sec: penalty 15 if > 60s ('slow_dispatch')

    Returns:
        (final_score: int, details: dict)
    """
    penalties_list: List[str] = []
    breakdown: Dict[str, int] = {}

    # ─── 1. Communication block ───────────────────────────────────────────────
    comm_penalty = 0
    greeting_success = comm_metrics.get("greeting_success", True)
    if not greeting_success:
        comm_penalty += 10
        penalties_list.append("no_greeting")
        breakdown["no_greeting"] = 10

    filler_words = comm_metrics.get("filler_words", 0)
    if filler_words > 0:
        fw_pen = min(20, int(filler_words * 2))
        comm_penalty += fw_pen
        penalties_list.append("filler_words")
        breakdown["filler_words"] = fw_pen

    script_followed = comm_metrics.get("script_followed_pct", 100)
    if script_followed < 100:
        sf_pen = int(round((100 - script_followed) * 0.3))
        comm_penalty += sf_pen
        breakdown["script_violation"] = sf_pen
        if script_followed < 80:
            penalties_list.append("script_violation")

    # ─── 2. Incident Card block ───────────────────────────────────────────────
    card_penalty = 0
    address_correct = card_metrics.get("address_correct", True)
    if not address_correct:
        card_penalty += 15
        penalties_list.append("address_error")
        breakdown["address_error"] = 15

    services_matched = card_metrics.get("services_matched", True)
    if not services_matched:
        card_penalty += 10
        penalties_list.append("services_mismatched")
        breakdown["services_mismatched"] = 10

    over_dispatched = card_metrics.get("over_dispatched_services") or []
    if over_dispatched:
        od_pen = 15 * len(over_dispatched)
        card_penalty += od_pen
        penalties_list.append("over_dispatching")
        breakdown["over_dispatching"] = od_pen

    missed_factoids = card_metrics.get("missed_critical_factoids") or []
    if missed_factoids:
        mf_pen = 20 * len(missed_factoids)
        card_penalty += mf_pen
        penalties_list.append("missed_factoid")
        breakdown["missed_factoid"] = mf_pen

    # ─── 3. SLA block ─────────────────────────────────────────────────────────
    sla_penalty = 0
    sla_breaches = sla_metrics.get("sla_breached_count", 0)
    if sla_breaches > 0:
        sb_pen = 10 * sla_breaches
        sla_penalty += sb_pen
        penalties_list.append("sla_breach")
        breakdown["sla_breach"] = sb_pen

    time_to_first = sla_metrics.get("time_to_first_dispatch_sec", 0)
    if time_to_first > 60:
        tt_pen = 15
        sla_penalty += tt_pen
        penalties_list.append("slow_dispatch")
        breakdown["slow_dispatch"] = tt_pen

    # ─── Aggregation ──────────────────────────────────────────────────────────
    total_penalty = comm_penalty + card_penalty + sla_penalty
    final_score = max(0, min(100, 100 - total_penalty))
    comm_score = max(0, min(100, 100 - comm_penalty))
    card_score = max(0, min(100, 100 - card_penalty))
    sla_score = max(0, min(100, 100 - sla_penalty))

    details = {
        "penalty": total_penalty,
        "penalties_list": penalties_list,
        "comm_score": comm_score,
        "card_score": card_score,
        "sla_score": sla_score,
        "final_score": final_score,
        "penalties": breakdown,
    }

    return final_score, details


def generate_pdf_from_html(html_content: str, output_path: str) -> str:
    """Convert HTML string to PDF file using weasyprint with xhtml2pdf fallback.

    Ensures the target directory exists and writes output to output_path.
    """
    out_file = Path(output_path).resolve()
    out_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        import weasyprint
        weasyprint.HTML(string=html_content).write_pdf(str(out_file))
        return str(out_file)
    except Exception as wp_exc:
        # Fallback to xhtml2pdf if weasyprint encounters issues
        try:
            from xhtml2pdf import pisa
            with open(out_file, "wb") as f:
                res = pisa.CreatePDF(html_content, dest=f, encoding="utf-8")
                if res.err:
                    raise RuntimeError(f"xhtml2pdf error: {res.err}") from wp_exc
            return str(out_file)
        except Exception as xh_exc:
            raise RuntimeError(
                f"Failed to generate PDF. WeasyPrint: {wp_exc}; xhtml2pdf: {xh_exc}"
            ) from xh_exc


def get_templates_dir() -> Path:
    """Resolve backend/templates directory."""
    current_dir = Path(__file__).resolve().parent
    templates_dir = current_dir.parent / "templates"
    if not templates_dir.exists():
        templates_dir.mkdir(parents=True, exist_ok=True)
    return templates_dir


def render_report_html(context: Dict[str, Any], template_name: str = "report_layout.html") -> str:
    """Render the report HTML using Jinja2."""
    templates_dir = get_templates_dir()
    env = Environment(
        loader=FileSystemLoader(str(templates_dir)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = env.get_template(template_name)
    return template.render(**context)


def generate_csv_from_data(cadets: List[Dict[str, Any]]) -> str:
    """Generate CSV string from cadet reports with UTF-8 BOM."""
    output = io.StringIO()
    # UTF-8 BOM for Excel compatibility
    output.write("\ufeff")
    writer = csv.writer(output, delimiter=";", quoting=csv.QUOTE_MINIMAL)

    writer.writerow([
        "Курсант",
        "Билет",
        "Итоговый балл",
        "Балл коммуникация",
        "Балл карточка",
        "Балл SLA",
        "Время диспетчеризации (сек)",
        "Лишние службы (гипер-диспетчеризация)",
        "Пропущенные фактоиды",
        "Штрафы",
    ])

    for c in cadets:
        writer.writerow([
            c.get("cadet_name", "—"),
            c.get("ticket_id", "—"),
            c.get("final_score", 0),
            c.get("comm_score", 0),
            c.get("card_score", 0),
            c.get("sla_score", 0),
            c.get("time_to_first_dispatch_sec", 0),
            ", ".join(c.get("over_dispatched_services", [])) or "Нет",
            ", ".join(c.get("missed_critical_factoids", [])) or "Нет",
            ", ".join(c.get("penalties_list", [])) or "Нет",
        ])

    return output.getvalue()
