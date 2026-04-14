"""
Goal:
1) Extract text from PDFs
2) Detect + remove (redact) common PII / regulated identifiers (Mexico + credit reports)
3) Extract “analysis-ready” structured features (ratios, totals, credit summary)
4) Produce GPT-safe inputs: (a) redacted text (b) JSON features (no identifiers)

Works on your uploaded PDFs at:
- /mnt/data/Domus_Balance_Sheet_LTM.pdf
- /mnt/data/Domus_Cashflow_Statement.pdf
- /mnt/data/Domus_Income_Statement_LTM.pdf
- /mnt/data/Reporte_Buro_Credito_PYME_Perfil_Favorable.pdf
"""

from __future__ import annotations
import re
import json
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional

import pdfplumber


# -----------------------------
# 1) PDF text extraction
# -----------------------------
def extract_text_pdf(path: str) -> str:
    pages: List[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return "\n".join(pages).strip()


# -----------------------------
# 2) PII detection + redaction
#    (heuristics tailored to Mexico + credit reports)
# -----------------------------
@dataclass
class PiiMatch:
    label: str
    value: str
    span: Tuple[int, int]


RFC_REGEX = re.compile(r"\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b")
DATE_DDMMYYYY_REGEX = re.compile(r"\b(0[1-9]|[12]\d|3[01])/(0[1-9]|1[0-2])/\d{4}\b")
CP_REGEX = re.compile(r"\bCP\s*\d{5}\b", re.IGNORECASE)
FOLIO_REGEX = re.compile(r"\bBCPM-\d+\b", re.IGNORECASE)

# Very common address cue words in MX credit docs:
ADDRESS_LINE_REGEX = re.compile(
    r"(?im)^\s*(Domicilio|Dirección)\s+(.+)$"
)

# Company name cues (persona moral)
RAZON_SOCIAL_REGEX = re.compile(r"(?im)^\s*Raz[oó]n Social\s+(.+)$")
# Generic “Domus, S.A. de C.V.” style capture at document header lines:
SA_DE_CV_LINE_REGEX = re.compile(r"(?im)^\s*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\.\,\-\& ]+S\.A\. de C\.V\.)\s*$")


def find_pii(text: str) -> List[PiiMatch]:
    matches: List[PiiMatch] = []

    def add_all(regex: re.Pattern, label: str):
        for m in regex.finditer(text):
            matches.append(PiiMatch(label=label, value=m.group(0), span=(m.start(), m.end())))

    add_all(RFC_REGEX, "RFC")
    add_all(DATE_DDMMYYYY_REGEX, "DATE")
    add_all(CP_REGEX, "POSTAL_CODE")
    add_all(FOLIO_REGEX, "REPORT_FOLIO")

    # Address lines
    for m in ADDRESS_LINE_REGEX.finditer(text):
        # redact full line content after cue word
        full = m.group(0)
        matches.append(PiiMatch(label="ADDRESS_LINE", value=full, span=(m.start(), m.end())))

    # Company name lines in buro report
    for m in RAZON_SOCIAL_REGEX.finditer(text):
        full = m.group(0)
        matches.append(PiiMatch(label="COMPANY_NAME_LINE", value=full, span=(m.start(), m.end())))

    # “S.A. de C.V.” entity name lines (financial statements often show this)
    for m in SA_DE_CV_LINE_REGEX.finditer(text):
        full = m.group(1)
        matches.append(PiiMatch(label="COMPANY_NAME", value=full, span=(m.start(1), m.end(1))))

    return matches


def redact_text(text: str, extra_replacements: Optional[Dict[str, str]] = None) -> str:
    """
    Redacts PII-like items. Also supports extra replacements for domain-specific
    items (e.g., known company name string, lender names, etc.)
    """
    pii = find_pii(text)

    # Sort by span descending so replacements don't shift later spans
    pii_sorted = sorted(pii, key=lambda x: x.span[0], reverse=True)
    redacted = text

    for m in pii_sorted:
        start, end = m.span
        token = f"[REDACTED_{m.label}]"
        redacted = redacted[:start] + token + redacted[end:]

    if extra_replacements:
        # Replace longer keys first to avoid partial overlaps
        for k in sorted(extra_replacements.keys(), key=len, reverse=True):
            redacted = redacted.replace(k, extra_replacements[k])

    return redacted


# -----------------------------
# 3) Feature extraction helpers
# -----------------------------
MXN_NUMBER = re.compile(r"(?<!\w)(\d{1,3}(?:,\d{3})+|\d+)(?!\w)")
MONEY_WITH_SYMBOL = re.compile(r"\$?\s*(\d{1,3}(?:,\d{3})+|\d+)")


def parse_int(num_str: str) -> int:
    return int(num_str.replace(",", "").replace(" ", ""))


def extract_labeled_mxn(text: str, label: str) -> Optional[int]:
    """
    Pulls first MXN-looking number after a label.
    Example: "Revenue MXN 4,455,000" -> 4455000
    """
    # permissive: label ... MXN? ... number
    pattern = re.compile(rf"(?i){re.escape(label)}.*?(?:MXN)?\s*{MXN_NUMBER.pattern}")
    m = pattern.search(text)
    if not m:
        return None
    # last capturing group might not exist because MXN_NUMBER has ( )
    # so we just re-find the first number in the match
    m2 = MXN_NUMBER.search(m.group(0))
    return parse_int(m2.group(1)) if m2 else None


# -----------------------------
# 4) Extract “analysis-ready” data
#    from the specific statement types
# -----------------------------
def extract_balance_sheet_features(text: str) -> Dict:
    feats = {
        "cash_mxn": extract_labeled_mxn(text, "Cash"),
        "other_assets_mxn": extract_labeled_mxn(text, "Other Assets"),
        "total_assets_mxn": extract_labeled_mxn(text, "Total Assets"),
        "short_term_liabilities_mxn": extract_labeled_mxn(text, "Short-Term Liabilities"),
        "total_liabilities_mxn": extract_labeled_mxn(text, "Total Liabilities"),
        "retained_earnings_mxn": extract_labeled_mxn(text, "Retained Earnings"),
        "total_equity_mxn": extract_labeled_mxn(text, "Total Equity"),
    }
    # Simple derived metrics
    if feats["total_assets_mxn"] and feats["total_liabilities_mxn"] is not None:
        feats["leverage_liabilities_over_assets"] = (
            feats["total_liabilities_mxn"] / feats["total_assets_mxn"]
            if feats["total_assets_mxn"] else None
        )
    return feats


def extract_income_statement_features(text: str) -> Dict:
    revenue = extract_labeled_mxn(text, "Revenue")
    op_income = extract_labeled_mxn(text, "Operating Income")
    net_income = extract_labeled_mxn(text, "Net Income")

    feats = {
        "revenue_mxn_ltm": revenue,
        "operating_income_mxn_ltm": op_income,
        "net_income_mxn_ltm": net_income,
    }
    if revenue and op_income is not None:
        feats["operating_margin"] = op_income / revenue if revenue else None
    if revenue and net_income is not None:
        feats["net_margin"] = net_income / revenue if revenue else None
    return feats


MONTH_ROW = re.compile(
    r"(?im)^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+"
    r"(\d{1,3}(?:,\d{3})+|\d+)\s+"
    r"(\d{1,3}(?:,\d{3})+|\d+)\s+"
    r"(\d{1,3}(?:,\d{3})+|\d+)\s*$"
)

def extract_cashflow_features(text: str) -> Dict:
    month_rows = []
    for m in MONTH_ROW.finditer(text):
        month_rows.append({
            "month": m.group(1),
            "inflows_mxn": parse_int(m.group(2)),
            "outflows_mxn": parse_int(m.group(3)),
            "net_cashflow_mxn": parse_int(m.group(4)),
        })

    total_inflows = extract_labeled_mxn(text, "Total Inflows")
    total_outflows = extract_labeled_mxn(text, "Total Outflows")
    total_net = extract_labeled_mxn(text, "Total Net Cash Flow")
    ending_cash = extract_labeled_mxn(text, "Ending Cash Balance")

    feats = {
        "monthly_cashflow": month_rows,
        "total_inflows_mxn_12m": total_inflows,
        "total_outflows_mxn_12m": total_outflows,
        "total_net_cashflow_mxn_12m": total_net,
        "ending_cash_balance_mxn": ending_cash,
    }

    # Simple volatility measure: coefficient of variation of net cashflow
    if month_rows:
        nets = [r["net_cashflow_mxn"] for r in month_rows]
        mean = sum(nets) / len(nets)
        var = sum((x - mean) ** 2 for x in nets) / len(nets)
        std = var ** 0.5
        feats["net_cashflow_cv"] = (std / mean) if mean else None
        feats["months_positive_net_cashflow"] = sum(1 for x in nets if x > 0)

    return feats


# -----------------------------
# 5) Credit report feature extraction (persona moral)
#    NOTE: We extract ONLY non-identifying / summary indicators
# -----------------------------
def extract_buro_credit_features(text: str) -> Dict:
    def grab_int_after(label: str) -> Optional[int]:
        pat = re.compile(rf"(?i){re.escape(label)}\s+(\d+)")
        m = pat.search(text)
        return int(m.group(1)) if m else None

    def grab_money_after(label: str) -> Optional[int]:
        pat = re.compile(rf"(?i){re.escape(label)}\s+\$?\s*(\d{{1,3}}(?:,\d{{3}})+|\d+)")
        m = pat.search(text)
        return parse_int(m.group(1)) if m else None

    total_reported = grab_int_after("Total de Créditos Reportados")
    current_credits = grab_int_after("Créditos Vigentes")
    past_due_credits = grab_int_after("Créditos Vencidos")
    total_granted = grab_money_after("Monto Total Otorgado")
    total_balance = grab_money_after("Saldo Actual Total")
    past_due_balance = grab_money_after("Saldo Vencido")
    max_delay_days = grab_int_after("Máximo Atraso Histórico")

    # Payment history lines: look for any digit not '1'
    # This is simplistic but effective for “Últimos 24 Meses” blocks like "2024 1 1 1..."
    pay_block = ""
    m_pay = re.search(r"(?is)Historial de Pagos.*?(?:Garantías|Consultas|Observaciones|$)", text)
    if m_pay:
        pay_block = m_pay.group(0)
    any_non1 = bool(re.search(r"\b(?!1\b)\d\b", pay_block))  # any single-digit not 1

    feats = {
        "credit_report_summary": {
            "total_credits_reported": total_reported,
            "credits_current": current_credits,
            "credits_past_due": past_due_credits,
            "total_amount_granted_mxn": total_granted,
            "total_current_balance_mxn": total_balance,
            "past_due_balance_mxn": past_due_balance,
            "max_historical_delay_days": max_delay_days,
            "any_non_on_time_payments_in_history": any_non1,
        }
    }
    return feats


# -----------------------------
# 6) Build GPT-safe inputs
#    - Redacted text (if you must send some narrative)
#    - Preferred: structured features JSON
# -----------------------------
def build_gpt_safe_package(
    balance_pdf: str,
    cashflow_pdf: str,
    income_pdf: str,
    buro_pdf: str,
) -> Dict:
    # Extract raw text
    bal_text = extract_text_pdf(balance_pdf)
    cf_text = extract_text_pdf(cashflow_pdf)
    inc_text = extract_text_pdf(income_pdf)
    buro_text = extract_text_pdf(buro_pdf)

    # Optional: add extra replacements for known strings (company names, lenders)
    # In a real system you’d populate these programmatically from detected “Razón Social”, etc.
    extra = {
        "Domus, S.A. de C.V.": "[REDACTED_COMPANY]",
        "MANUFACTURAS DEL CENTRO, S.A. DE C.V.": "[REDACTED_COMPANY]",
        # lender names are not “PII” but are often treated as sensitive in bureau contexts
        "BBVA México": "[REDACTED_LENDER]",
        "Santander": "[REDACTED_LENDER]",
        "Banorte": "[REDACTED_LENDER]",
        "HSBC": "[REDACTED_LENDER]",
        "Banco del Bajío": "[REDACTED_LENDER]",
        "Círculo de Crédito": "[REDACTED_BUREAU]",
        "BURÓ DE CRÉDITO": "[REDACTED_BUREAU]",
    }

    redacted = {
        "balance_sheet_redacted": redact_text(bal_text, extra),
        "cashflow_statement_redacted": redact_text(cf_text, extra),
        "income_statement_redacted": redact_text(inc_text, extra),
        "credit_report_redacted": redact_text(buro_text, extra),
    }

    # Preferred: structured features (no identifiers)
    features = {
        "financials": {
            "balance_sheet": extract_balance_sheet_features(bal_text),
            "income_statement": extract_income_statement_features(inc_text),
            "cashflow": extract_cashflow_features(cf_text),
        },
        # IMPORTANT: for bureau data, keep only summary indicators; never send raw report text
        "credit": extract_buro_credit_features(buro_text),
    }

    # Example “safe prompt input”: a compact, identifier-free summary
    # (use this instead of raw/redacted docs whenever possible)
    safe_summary = {
        "business_profile": {
            "entity": "ANONYMIZED_SME",
            "currency": "MXN",
            "period": "LTM / last 12 months",
        },
        "key_metrics": {
            "revenue_mxn_ltm": features["financials"]["income_statement"]["revenue_mxn_ltm"],
            "net_income_mxn_ltm": features["financials"]["income_statement"]["net_income_mxn_ltm"],
            "ending_cash_mxn": features["financials"]["cashflow"]["ending_cash_balance_mxn"],
            "leverage": features["financials"]["balance_sheet"].get("leverage_liabilities_over_assets"),
            "net_margin": features["financials"]["income_statement"].get("net_margin"),
            "credit_max_delay_days": features["credit"]["credit_report_summary"].get("max_historical_delay_days"),
            "credit_past_due_balance_mxn": features["credit"]["credit_report_summary"].get("past_due_balance_mxn"),
        }
    }

    return {
        "gpt_safe_features_json": features,     # best to send to LLM
        "gpt_safe_summary": safe_summary,       # best to send to LLM
        "redacted_texts_if_needed": redacted,   # avoid if possible
    }


# -----------------------------
# 7) Example usage on your uploaded PDFs
# -----------------------------
if __name__ == "__main__":
    pkg = build_gpt_safe_package(
        balance_pdf="/mnt/data/Domus_Balance_Sheet_LTM.pdf",
        cashflow_pdf="/mnt/data/Domus_Cashflow_Statement.pdf",
        income_pdf="/mnt/data/Domus_Income_Statement_LTM.pdf",
        buro_pdf="/mnt/data/Reporte_Buro_Credito_PYME_Perfil_Favorable.pdf",
    )

    # Write outputs for inspection
    with open("gpt_safe_features.json", "w", encoding="utf-8") as f:
        json.dump(pkg["gpt_safe_features_json"], f, ensure_ascii=False, indent=2)

    with open("gpt_safe_summary.json", "w", encoding="utf-8") as f:
        json.dump(pkg["gpt_safe_summary"], f, ensure_ascii=False, indent=2)

    # If you absolutely must keep redacted text versions:
    for k, v in pkg["redacted_texts_if_needed"].items():
        out = f"{k}.txt"
        with open(out, "w", encoding="utf-8") as f:
            f.write(v)

    print("Wrote: gpt_safe_features.json, gpt_safe_summary.json, and redacted_texts_*.txt")
