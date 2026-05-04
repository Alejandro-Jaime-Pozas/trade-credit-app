"""Run buro de credito api process, create a bdc db obj."""

import json
from processing.loan_term_calculations.constants import (
    CREDIT_SCORE_VERDICT,
)
from processing.loan_term_calculations.constants import (
    METRIC_CONFIG,
)
from integrations.buro_de_credito.json_response_sample import json_response
from processing.choices_for_models import (
    BuroDeCreditoVerdictStatus,
    LoanVerdictStatus,
)
from processing.loan_term_calculations.interest_rate.final_rates import get_total_interest_rate
from processing.loan_term_calculations.interest_rate.risk_premium.repayment_capacity.base_calculations import (
    get_avg_monthly_cashflow,
    get_dscr,
    get_growth_trend_metrics,
    get_residual_volatility,
    get_worst_month_coverage_ratio,
)
from processing.loan_term_calculations.interest_rate.risk_premium.scorecard.scores import score_repayment_capacity
from processing.models import (
    AccountApplication,
    BuroDeCreditoReport,
    LoanVerdict,
)
from storage.models import UploadDocument


def run_buro_de_credito_process(
    doc: UploadDocument,
    acct_app: AccountApplication,
    score_verdict: dict = CREDIT_SCORE_VERDICT,
):
    """
    Create BuroDeCreditoReport object.

    Use rfc and razon social to retrieve Buro De Credito API
    response with credit score and credit history (mocked).

    Determine if score is pass or fail, meaning the account
    application process should stop since user is high risk.
    If pass, then can continue the process.

    Returns dict with keys: passed, bdc_report_obj
    """

    # Check if the new uploaded doc is a constancia de situacion fiscal file
    data = doc.extracted_data
    if data:
        rfc = data.get('rfc')  # TODO use this with bdc api call
        razon_social = data.get('razon_social')  # TODO use this with bdc api call

    # Use extracted_data inputs to make request to Buro De Credito API (mock for now)
    res = json_response  # mocked response
    res_dict = json.loads(res)
    score = res_dict.get('score')
    score = score.get('valor') if score else None

    # Store the json data in the BuroDeCreditoReport db model
    bdc_report_obj = BuroDeCreditoReport.objects.create(
        json_response=res_dict,
        score=score,
    )
    bdc_report_obj.account_applications.add(acct_app)

    # If credit score response is in high risk range (or no score), return failed
    if not bdc_report_obj.score or bdc_report_obj.score < score_verdict['high_risk']:
        bdc_report_obj.status = BuroDeCreditoVerdictStatus.FAILED
        bdc_report_obj.verdict = f'Credit score does not pass minimum threshold.'
        bdc_report_obj.save()
        return {
            'passed': False,
            'bdc_report_obj': bdc_report_obj,
        }

    # If credit score is better than high risk threshold, return passed
    else:
        bdc_report_obj.status = BuroDeCreditoVerdictStatus.PASSED
        bdc_report_obj.verdict = f'Credit score does pass minimum threshold.'
        bdc_report_obj.save()
        return {
            'passed': True,
            'bdc_report_obj': bdc_report_obj,
        }


def get_aggregate_cashflows(acct_app: AccountApplication) -> list[float]:
    """
    Get all cashflow_statements from an acct_app's UploadDocuments.

    Returns dict of net cashflows, inflows, outflows.
    """
    all_docs = acct_app.upload_documents.order_by('-id')  # most recent

    if not all_docs: return f'No cashflow statements for app: {acct_app}'

    all_cashflow_docs = [d for d in all_docs if d.file_type_name == 'cashflow_statement']

    # Aggregate all cashflow statements
    cashflow_series = []
    # If repeat dates, always keep dates from the most recent file(s)
    dates = set()

    for d in all_cashflow_docs:
        data = d.extracted_data
        if data:
            monthly_net_cashflows = data.get('monthly_net_cashflows', [])
            for c in monthly_net_cashflows:
                date_month = c.get('date')
                if date_month:
                    # Add dict to cashflow_series if date is unique
                    if date_month not in dates:
                        cashflow_series.append(c)
                        dates.add(date_month)

    # Sort the cashflows by date, desc and extract the net cashflow only
    sorted_cashflow_series = sorted(cashflow_series, key=(lambda c: c['date']))
    all_series = {
        'cashflow_series': [e['net_cashflow'] for e in sorted_cashflow_series],
        'inflow_series': [e['inflow'] for e in sorted_cashflow_series],
        'outflow_series': [e['outflow'] for e in sorted_cashflow_series],
    }

    return all_series


def get_aggregate_debt_payments(acct_app: AccountApplication) -> list[float]:
    """
    Get all of an acct_app's monthly_debt_payments from buro de credito
    (for now).

    Returns list of monthly debt payments.
    """

    # Check if acct_app has at least 1 buro de credito obj
    bdc_obj = acct_app.buro_de_credito_reports.order_by('-id').first()

    if not bdc_obj:
        return []

    # Extract all monthly debt payments from buro de credito json obj
    monthly_debt_payments = []
    json_field = bdc_obj.json_response

    if json_field:
        accounts = json_field.get('cuentas', [])
        for a in accounts:
            if 'pagoMensual' in a:
                monthly_debt_payments.append(a['pagoMensual'])

    return monthly_debt_payments


def get_repayment_capacity_metrics(
    monthly_debt_payments: list[float] = [],
    **cashflow_series,
):
    """
    Get the repayment capacity metrics.

    Returns dict.
    """

    # Check if avg cashflow negative to reject loan
    average_net_cashflow = get_avg_monthly_cashflow(
        cashflow_series=cashflow_series['cashflow_series'],
    )
    # Get the dscr, residual volatility, worst month coverage ratio, growth trend pct
    dscr = get_dscr(
        cashflow_series=cashflow_series['cashflow_series'],
        monthly_debt_payments=monthly_debt_payments,
    )
    residual_volatility = get_residual_volatility(**cashflow_series)
    worst_month_coverage_ratio = get_worst_month_coverage_ratio(
        cashflow_series=cashflow_series['cashflow_series'],
        monthly_debt_payments=monthly_debt_payments,
    )
    growth_trends = get_growth_trend_metrics(**cashflow_series)  # returns multiple trends
    growth_trend_percent = growth_trends['trend_percent_per_month']
    print('average_net_cashflow:', average_net_cashflow)
    print('dscr:', dscr)
    print('vlty:', residual_volatility)
    print('worst_month:', worst_month_coverage_ratio)
    print('growth_trend_percent:', growth_trend_percent)

    return {
        'dscr': dscr,
        'residual_volatility': residual_volatility,
        'worst_month_coverage_ratio': worst_month_coverage_ratio,
        'growth_trend_percent': growth_trend_percent,
        'average_net_cashflow': average_net_cashflow
    }


def get_repayment_capacity_score(
    dscr: float,
    residual_volatility: float,
    worst_month_coverage_ratio: float,
    growth_trend_percent: float,
    *args,
    **kwargs,
) -> float:
    """
    Get the repayment capacity score for further use in determining
    loan interest rate.

    Returns float.
    """

    # Get the scores for each
    repayment_capacity_score = score_repayment_capacity(
        dscr_res=dscr,
        residual_volatility_res=residual_volatility,
        worst_month_coverage_res=worst_month_coverage_ratio,
        growth_trend_percent_res=growth_trend_percent,
    )
    print('rpmt capacity score:', repayment_capacity_score)

    return repayment_capacity_score


def check_if_passes_min_threshold(
    metrics: dict,  # name, value
    metric_config: dict = METRIC_CONFIG,
) -> dict:
    """
    Check if a metric passes its minimum requirement.

    Returns dict.
    """

    passes = {
        'passed': True,
        'metrics': {}
    }

    for name, cfg in metric_config.items():
        # Skip checks if metric wasn't provided
        print(name)
        if name not in metrics:
            continue

        value = metrics[name]
        threshold = cfg["threshold"]
        comparator = cfg["comparator"]

        # If metric value < min threshold, fails requirements, log response
        if not comparator(float(value), float(threshold)):  # comparator(value, threshold)
            if passes['passed'] == True:
                passes['passed'] = False
            passes['metrics'][name] = {
                'value': value,
                'threshold': threshold,
                'reason': f'Value for {name}: {value} does not pass threshold: {threshold}',
            }

    return passes


def get_loan_interest_rate(acct_app: AccountApplication) -> float:
    """
    Get the total loan interest rate. This includes base_rate, risk_premium_rate,
    operating_margin_rate, adjustments_rate.

    Returns a rate (float).
    """
    # TEMP for testing only, replace afterwards with gpt extracted data
    # CAN BE USEFUL TO COMPARE PROCESS WITH GOOD, AVG, BAD CASHFLOWS
    # # excellent
    # cashflow_series = [70000, 75000, 80000, 88000, 95000, 102000, 110000, 113000, 115000, 122000, 130000, 135000]
    # monthly_debt_payments = [31000.00]
    # # avg
    # cashflow_series = [
    #     85000,  78000,  92000,  88000,
    #     76000,  81000,  97000,  89000,
    #     83000,  91000,  86000,  94000
    # ]
    # monthly_debt_payments = [70000.00]
    # # poor
    # cashflow_series = [
    #     60000,  25000,  70000,  15000,
    #     80000,  10000,  55000,  20000,
    #     90000,  12000,  65000,  18000
    # ]

    # TODO implement other interest rate components: base_rate, operating_margin_rate, adjustments
    # Aggregate cashflows into single list, ordered by date ascending
    cashflow_series = get_aggregate_cashflows(acct_app=acct_app)
    print(cashflow_series)

    # Aggregate monthly debt payments from buro de credito into a list
    monthly_debt_payments = get_aggregate_debt_payments(acct_app=acct_app)
    print(monthly_debt_payments)

    # Get repayment capacity metrics first
    repayment_capacity_metrics = get_repayment_capacity_metrics(
        **cashflow_series,
        monthly_debt_payments=monthly_debt_payments,
    )

    # Check if any metric doesn't meet min requirements, reject loan if so with reason
    passes = check_if_passes_min_threshold(metrics=repayment_capacity_metrics)
    print('check_if_passes_min_threshold():', passes)
    if passes['passed'] == False:
        return passes

    # Get the repayment_capacity_score
    repayment_capacity_score = get_repayment_capacity_score(
        **repayment_capacity_metrics
    )

    # Get the final interest rate
    total_interest_rate = get_total_interest_rate(
        rpmt_cap_score=repayment_capacity_score,
        credit_score=0,  # TODO implement
        collateral_score=0,  # TODO implement
        loan_str_score=0,  # TODO implement
        busn_qlty_score=0,  # TODO implement
    )
    print('total interest rate:', total_interest_rate)

    return total_interest_rate


def get_loan_term_duration(acct_app: AccountApplication) -> int:
    # TODO TEMP remove
    return 24


def get_loan_monthly_payment(acct_app: AccountApplication) -> float:
    # TODO TEMP remove
    return 56_000


def get_loan_principal(
    interest_rate: float,
    term: int,
    payment: float,
):
    # TODO TEMP remove
    return 900_000


def build_loan_terms_dict(acct_app: AccountApplication):

    interest_rate = get_loan_interest_rate(acct_app)
    term = get_loan_term_duration(acct_app)
    payment = get_loan_monthly_payment(acct_app)
    principal = get_loan_principal(
        interest_rate=interest_rate,
        term=term,
        payment=payment,
    )

    return {
        'interest_rate': interest_rate,
        'term': term,
        'payment': payment,
        'principal': principal,
    }


def create_loan_verdict_obj(acct_app: AccountApplication):
    """
    Create a loan verdict obj given an acct_app's file data.

    Returns a LoanVerdict db obj.
    """

    # Build the loan terms dict
    loan_terms_dict = build_loan_terms_dict(acct_app)
    temp = {
        'passes_thresholds': [],
    }

    # If any loan term does not pass thresholds
        # set passes_thresholds for loan_verdict_obj to returned value from build fn
        # set status to rejected
        # set the loan term to null
    for loan_term, value in loan_terms_dict.items():
        if not isinstance(value, (float, int)):
            temp['status'] = LoanVerdictStatus.REJECTED
            temp['passes_thresholds'].append(value)
            loan_terms_dict[loan_term] = None

    loan_terms_dict.update(temp)

    # If all loan terms passed, set status to APPROVED
    if not loan_terms_dict.get('status'):
        loan_terms_dict['status'] = LoanVerdictStatus.APPROVED

    # Create the loan verdict obj
    print(loan_terms_dict)
    loan_verdict_obj = LoanVerdict.objects.create(
        **loan_terms_dict,
        loan_account_application=acct_app.loan_account_application,
    )  # TODO first create a simple version, don't worry about additional fields for now

    return loan_verdict_obj
