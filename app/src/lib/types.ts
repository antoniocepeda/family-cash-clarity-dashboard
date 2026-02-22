export interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "cash" | "credit";
  current_balance: number;
  is_reserve: number;
  updated_at: string;
}

export interface CashEvent {
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

export interface EventHistory {
  id: string;
  event_id: string;
  amount: number;
  actual_amount: number;
  paid_date: string;
  due_date: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "expense" | "income";
  account_id: string;
  event_id: string | null;
  created_at: string;
  allocations?: EventAllocation[];
}

export interface EventInstance {
  id: string;
  event_id: string;
  due_date: string;
  planned_amount: number;
  allocated_amount: number;
  remaining_amount: number;
  status: "open" | "funded";
  created_at?: string;
  event_name?: string;
  event_type?: "income" | "bill";
}

export interface EventAllocation {
  id: string;
  ledger_id: string;
  instance_id: string;
  event_id: string;
  amount: number;
  created_at?: string;
}

export interface AllocationInput {
  event_id: string;
  instance_due_date: string;
  amount: number;
}

export interface CashEventWithInstances extends CashEvent {
  instances: EventInstance[];
}

export interface ProjectionDay {
  date: string;
  balance: number;
  events: { name: string; amount: number; type: string; priority: string }[];
}

export interface Alert {
  severity: "critical" | "warning" | "info";
  message: string;
  action_text: string;
}
