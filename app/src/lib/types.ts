export interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "cash" | "credit";
  current_balance: number;
  is_reserve: number;
  updated_at: string;
  plaid_account_id?: string | null;
  plaid_item_id?: string | null;
}

export interface Commitment {
  id: string;
  name: string;
  type: "income" | "bill";
  amount: number;
  actual_amount: number | null;
  due_date: string;
  recurrence_rule: string | null;
  priority: "critical" | "normal" | "flexible";
  autopay: number;
  account_id: string | null;
  active: number;
  paid: number;
  paid_date: string | null;
  created_at: string;
}

export interface CommitmentHistory {
  id: string;
  commitment_id: string;
  amount: number;
  actual_amount: number;
  paid_date: string;
  due_date: string;
}

export interface LedgerItem {
  id: string;
  ledger_id: string;
  description: string;
  amount: number;
  commitment_id: string | null;
  instance_due_date: string | null;
  commitment_name?: string;
}

export interface LedgerItemInput {
  description: string;
  amount: number;
  commitment_id?: string;
  instance_due_date?: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "expense" | "income";
  account_id: string;
  commitment_id: string | null;
  created_at: string;
  plaid_transaction_id?: string | null;
  pending?: boolean;
  removed?: boolean;
  allocations?: CommitmentAllocation[];
  items?: LedgerItem[];
}

export interface PlaidItem {
  id: string;
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  available_products: string[];
  billed_products: string[];
  status: "connected" | "error";
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
}

export interface PlaidAccount {
  id: string;
  plaid_account_id: string;
  plaid_item_id: string;
  app_account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number;
  available_balance: number | null;
  iso_currency_code: string | null;
  updated_at: string;
}

export interface PlaidStatus {
  items: PlaidItem[];
  accounts: PlaidAccount[];
}

export interface CommitmentInstance {
  id: string;
  commitment_id: string;
  due_date: string;
  planned_amount: number;
  allocated_amount: number;
  remaining_amount: number;
  status: "open" | "funded";
  created_at?: string;
  commitment_name?: string;
  commitment_type?: "income" | "bill";
}

export interface CommitmentAllocation {
  id: string;
  ledger_id: string;
  instance_id: string;
  commitment_id: string;
  amount: number;
  note?: string | null;
  created_at?: string;
}

export interface AllocationInput {
  commitment_id: string;
  instance_due_date: string;
  amount: number;
  note?: string;
}

export interface CommitmentWithInstances extends Commitment {
  instances: CommitmentInstance[];
}

export interface ProjectionDay {
  date: string;
  balance: number;
  commitments: { name: string; amount: number; type: string; priority: string }[];
}

export interface Alert {
  severity: "critical" | "warning" | "info";
  message: string;
  action_text: string;
}
