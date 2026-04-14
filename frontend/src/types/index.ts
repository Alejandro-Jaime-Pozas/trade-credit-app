export interface UploadDocument {
    id: number;
    original_title: string;
    file: string; // url
    file_type_name: 'balance_sheet' | 'bank_statement' | 'cashflow_statement' | 'income_statement' | 'unknown' | null;
    friendly_file_name: string | null;
}

export interface LoanVerdictAI {
    id: number;
    status: 'approved' | 'rejected';
    loan_amount: number;
    annual_interest_rate: number;
    payment_amount: number;
    term_months: number;
    analysis_summary: string;
}

export interface LoanAgreementDocument {
    id: number;
    file: string;
    created_at: string;
    signed_at: string | null;
}

export interface LoanAccountApplication {
    id: number;
    loan_verdicts_ai: LoanVerdictAI[];
    missing_file_type_names: string[];
}

export interface AccountApplication {
    id: number;
    status: string;
    type: string;
    upload_documents: UploadDocument[];
    loan_account_application?: LoanAccountApplication;
    loan_agreement_documents: LoanAgreementDocument[];
}
