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
  due_date: string;
  recurrence_rule: string | null;
  priority: "critical" | "normal" | "flexible";
  autopay: number;
  account_id: string | null;
  active: number;
  paid: number;
  created_at: string;
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
