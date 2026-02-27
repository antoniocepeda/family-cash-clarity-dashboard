export interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "cash" | "credit";
  current_balance: number;
  is_reserve: number;
  updated_at: string;
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
  allocations?: CommitmentAllocation[];
  items?: LedgerItem[];
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
