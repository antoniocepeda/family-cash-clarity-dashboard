import { addDays, format, parseISO, isAfter, isBefore, isEqual, startOfDay } from "date-fns";
import { advanceByRule } from "./instances";
import { listAccounts, listCommitments, listInstances } from "./repositories/firestore";

interface CommitmentRow {
  id: string;
  name: string;
  type: "income" | "bill";
  amount: number;
  due_date: string;
  recurrence_rule: string | null;
  priority: string;
  autopay: number;
  account_id: string | null;
  active: number;
  paid: number;
}

interface ProjectionDay {
  date: string;
  balance: number;
  commitments: {
    commitment_id?: string;
    name: string;
    amount: number;
    type: string;
    priority: string;
    due_date?: string;
    original_due_date?: string;
    status?: string;
    paid_date?: string | null;
  }[];
}

function isSettledStatus(status?: string) {
  return status === "paid" || status === "funded" || status === "skipped";
}

export function expandRecurrence(commitment: CommitmentRow, startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const rule = commitment.recurrence_rule;
  const baseDate = startOfDay(parseISO(commitment.due_date));

  if (!rule) {
    if (
      (isAfter(baseDate, startDate) || isEqual(baseDate, startDate)) &&
      (isBefore(baseDate, endDate) || isEqual(baseDate, endDate))
    ) {
      dates.push(baseDate);
    }
    return dates;
  }

  let cursor = baseDate;

  while (isBefore(cursor, startDate)) {
    cursor = advanceByRule(cursor, rule);
  }

  while (isBefore(cursor, endDate) || isEqual(cursor, endDate)) {
    dates.push(cursor);
    cursor = advanceByRule(cursor, rule);
  }

  return dates;
}

export async function generateProjection(userId: string, days: number = 28, simulateEarlyIds: string[] = []): Promise<ProjectionDay[]> {
  const accounts = await listAccounts(userId);
  const commitments = await listCommitments(userId);
  const instanceRows = await listInstances(userId);

  const instanceMap = new Map<string, typeof instanceRows[0]>();
  for (const row of instanceRows) {
    instanceMap.set(`${row.commitment_id}|${row.original_due_date || row.due_date}`, row);
  }

  const simulateSet = new Set(simulateEarlyIds);

  const totalBalance = accounts
    .filter((a) => !a.is_reserve)
    .reduce((sum, a) => sum + a.current_balance, 0);

  const today = startOfDay(new Date());
  const endDate = addDays(today, days);

  const dayMap = new Map<string, ProjectionDay>();
  const runningBalance = totalBalance;

  for (let i = 0; i <= days; i++) {
    const d = addDays(today, i);
    const key = format(d, "yyyy-MM-dd");
    dayMap.set(key, { date: key, balance: runningBalance, commitments: [] });
  }

  for (const commitment of commitments) {
    if (commitment.paid && !commitment.recurrence_rule) continue;

    const isSimulated = simulateSet.has(commitment.id);

    let occurrences: Date[];
    let overdueDateStr: string | null = null;
    if (isSimulated && !commitment.recurrence_rule) {
      occurrences = [today];
    } else {
      occurrences = expandRecurrence(commitment, today, endDate);
      const baseDate = startOfDay(parseISO(commitment.due_date));
      if (isBefore(baseDate, today)) {
        const baseDateStr = format(baseDate, "yyyy-MM-dd");
        const overdueKey = `${commitment.id}|${baseDateStr}`;
        const inst = instanceMap.get(overdueKey);
        if (!inst || inst.status !== "funded") {
          occurrences = [today, ...occurrences];
          overdueDateStr = baseDateStr;
        }
      }
    }

    for (const occ of occurrences) {
      const isOverdueOcc = overdueDateStr && isEqual(occ, today);
      const originalDueDate = isOverdueOcc && overdueDateStr ? overdueDateStr : format(occ, "yyyy-MM-dd");
      const instanceLookup = `${commitment.id}|${originalDueDate}`;
      const instance = instanceMap.get(instanceLookup);
      const key = instance?.due_date ?? originalDueDate;
      const day = dayMap.get(key);
      if (!day) continue;

      let effectiveAmount = commitment.amount;
      if (instance) {
        if (isSettledStatus(instance.status)) continue;
        effectiveAmount = instance.planned_amount - instance.allocated_amount;
        if (effectiveAmount <= 0.005) continue;
      }

      const impact = commitment.type === "income" ? effectiveAmount : -effectiveAmount;
      day.commitments.push({
        commitment_id: commitment.id,
        name: (instance?.name_override || commitment.name) + (isSimulated ? " (simulated)" : ""),
        amount: effectiveAmount,
        type: commitment.type,
        priority: commitment.priority,
        due_date: key,
        original_due_date: originalDueDate,
        status: instance?.status ?? "planned",
        paid_date: instance?.paid_date,
      });

      for (let j = dayMap.size - 1; j >= 0; j--) {
        const checkDate = format(addDays(today, j), "yyyy-MM-dd");
        const checkDay = dayMap.get(checkDate);
        if (checkDay && checkDate >= key) {
          checkDay.balance += impact;
        }
      }
    }
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function generateAlerts(userId: string): Promise<{
  severity: "critical" | "warning" | "info";
  message: string;
  action_text: string;
}[]> {
  const projection = await generateProjection(userId, 14);
  const alerts: { severity: "critical" | "warning" | "info"; message: string; action_text: string }[] = [];

  const BUFFER_THRESHOLD = 500;

  for (const day of projection) {
    if (day.balance < 0) {
      alerts.push({
        severity: "critical",
        message: `Projected balance goes negative ($${day.balance.toFixed(2)}) on ${day.date}`,
        action_text: "Move money from savings or defer a flexible bill",
      });
      break;
    }
  }

  const commitments = (await listCommitments(userId)).filter((c) => c.active === 1 && c.type === "bill" && c.paid === 0);
  const now = new Date();

  for (const commitment of commitments) {
    const due = parseISO(commitment.due_date);
    const hoursUntil = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

    const instanceRow = (await listInstances(userId)).find((i) => i.commitment_id === commitment.id && i.due_date === commitment.due_date);

    if (isSettledStatus(instanceRow?.status)) continue;

    const remaining = instanceRow
      ? instanceRow.planned_amount - instanceRow.allocated_amount
      : commitment.amount;

    if (hoursUntil < 0 && commitment.priority === "critical") {
      alerts.push({
        severity: "critical",
        message: `Overdue critical bill: ${commitment.name} ($${remaining.toFixed(2)} remaining)`,
        action_text: `Handle ${commitment.name} immediately`,
      });
    } else if (hoursUntil >= 0 && hoursUntil <= 48 && !commitment.autopay) {
      alerts.push({
        severity: "critical",
        message: `${commitment.name} ($${remaining.toFixed(2)} remaining) due within 48 hours`,
        action_text: `Review ${commitment.name} — due soon`,
      });
    }
  }

  for (const day of projection) {
    if (day.balance > 0 && day.balance < BUFFER_THRESHOLD) {
      alerts.push({
        severity: "warning",
        message: `Balance drops below $${BUFFER_THRESHOLD} buffer on ${day.date} ($${day.balance.toFixed(2)})`,
        action_text: "Review upcoming flexible expenses to defer",
      });
      break;
    }
  }

  for (const day of projection.slice(0, 4)) {
    if (day.commitments.length > 0) {
      const summary = day.commitments.map((c) => `${c.name} ($${c.amount.toFixed(2)})`).join(", ");
      alerts.push({
        severity: "info",
        message: `${day.date}: ${summary}`,
        action_text: "Review upcoming transactions",
      });
    }
  }

  return alerts;
}
