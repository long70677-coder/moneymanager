export interface SuspenseTransaction {
  id: number;
  transaction_no: string;
  suspense_date: string;
  suspense_type: "DAILY" | "MANUAL" | "SECONDARY";
  batch_no: string;
  bank_code: string;
  account_code: string;
  currency: string;
  prev_company_balance: number;
  prev_passbook_balance: number;
  today_company_balance: number;
  today_passbook_balance: number;
  total_suspense_amount: number;
  suspense_amount: number;
  exchange_rate: number;
  suspense_amount_local: number;
  is_confirmed: number;
  is_day_closed: number;
  is_report_locked: number;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  version: number;
  // joined
  account_purpose?: string;
  account_name?: string;
}

export interface BatchConfirmation {
  id: number;
  suspense_date: string;
  currency: string;
  batch_type: string;
  batch_no: string;
  confirm_status: "UNCONFIRMED" | "CONFIRMED";
  confirmed_by: string | null;
  confirmed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  version: number;
}

export interface BankAccount {
  id: number;
  account_code: string;
  account_long_code: string;
  bank_code: string;
  account_name: string;
  account_purpose: string;
  is_suspense: number;
  is_policy_account: number;
  currency_type: string;
}

export interface QueryParams {
  suspenseDate: string;
  suspenseType: string;
  currency: string;
  batchNo: string;
}

export const SUSPENSE_TYPE_MAP: Record<string, string> = {
  DAILY: "日常暫收",
  MANUAL: "手工暫收",
  SECONDARY: "二次暫收",
};
