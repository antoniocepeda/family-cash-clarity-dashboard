import { getDb } from "./db";
import { addDays, addWeeks, addMonths, format, parseISO, isAfter, isBefore, isEqual, startOfDay } from "date-fns";

interface Event {
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
  events: { name: string; amount: number; type: string; priority: string }[];
}

export function expandRecurrence(event: Event, startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const rule = event.recurrence_rule;
  const baseDate = startOfDay(parseISO(event.due_date));

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
  const advanceFn =
    rule === "weekly"
      ? (d: Date) => addDays(d, 7)
      : rule === "biweekly"
      ? (d: Date) => addWeeks(d, 2)
      : rule === "monthly"
      ? (d: Date) => addMonths(d, 1)
      : rule === "quarterly"
      ? (d: Date) => addMonths(d, 3)
      : rule === "annual"
      ? (d: Date) => addMonths(d, 12)
      : null;

  if (!advanceFn) {
    if (
      (isAfter(baseDate, startDate) || isEqual(baseDate, startDate)) &&
      (isBefore(baseDate, endDate) || isEqual(baseDate, endDate))
    ) {
      dates.push(baseDate);
    }
    return dates;
  }

  while (isBefore(cursor, startDate)) {
    cursor = advanceFn(cursor);
  }

  while (isBefore(cursor, endDate) || isEqual(cursor, endDate)) {
    dates.push(cursor);
    cursor = advanceFn(cursor);
  }

  return dates;
}

export function generateProjection(days: number = 28, simulateEarlyIds: string[] = []): ProjectionDay[] {
  const db = getDb();
  const accounts = db.prepare("SELECT * FROM accounts").all() as {
    current_balance: number;
    is_reserve: number;
  }[];
  const events = db.prepare("SELECT * FROM events WHERE active = 1").all() as Event[];

  const instanceRows = db.prepare(
    `SELECT event_id, due_date, planned_amount, allocated_amount, status
     FROM event_instances`
  ).all() as { event_id: string; due_date: string; planned_amount: number; allocated_amount: number; status: string }[];

  const instanceMap = new Map<string, typeof instanceRows[0]>();
  for (const row of instanceRows) {
    instanceMap.set(`${row.event_id}|${row.due_date}`, row);
  }

  const simulateSet = new Set(simulateEarlyIds);

  const totalBalance = accounts
    .filter((a) => !a.is_reserve)
    .reduce((sum, a) => sum + a.current_balance, 0);

  const today = startOfDay(new Date());
  const endDate = addDays(today, days);

  const dayMap = new Map<string, ProjectionDay>();
  let runningBalance = totalBalance;

  for (let i = 0; i <= days; i++) {
    const d = addDays(today, i);
    const key = format(d, "yyyy-MM-dd");
    dayMap.set(key, { date: key, balance: runningBalance, events: [] });
  }

  for (const event of events) {
    if (event.paid && !event.recurrence_rule) continue;

    const isSimulated = simulateSet.has(event.id);

    let occurrences: Date[];
    let overdueDateStr: string | null = null;
    if (isSimulated && !event.recurrence_rule) {
      occurrences = [today];
    } else {
      occurrences = expandRecurrence(event, today, endDate);
      const baseDate = startOfDay(parseISO(event.due_date));
      if (isBefore(baseDate, today)) {
        const baseDateStr = format(baseDate, "yyyy-MM-dd");
        const overdueKey = `${event.id}|${baseDateStr}`;
        const inst = instanceMap.get(overdueKey);
        if (!inst || inst.status !== "funded") {
          occurrences = [today, ...occurrences];
          overdueDateStr = baseDateStr;
        }
      }
    }

    for (const occ of occurrences) {
      const key = format(occ, "yyyy-MM-dd");
      const day = dayMap.get(key);
      if (!day) continue;

      const isOverdueOcc = overdueDateStr && isEqual(occ, today);
      const instanceLookup = isOverdueOcc ? `${event.id}|${overdueDateStr}` : `${event.id}|${key}`;
      const instance = instanceMap.get(instanceLookup);

      let effectiveAmount = event.amount;
      if (instance) {
        if (instance.status === "funded") continue;
        effectiveAmount = instance.planned_amount - instance.allocated_amount;
        if (effectiveAmount <= 0.005) continue;
      }

      const impact = event.type === "income" ? effectiveAmount : -effectiveAmount;
      day.events.push({
        name: event.name + (isSimulated ? " (simulated)" : ""),
        amount: effectiveAmount,
        type: event.type,
        priority: event.priority,
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

export function generateAlerts(): {
  severity: "critical" | "warning" | "info";
  message: string;
  action_text: string;
}[] {
  const projection = generateProjection(14);
  const alerts: { severity: "critical" | "warning" | "info"; message: string; action_text: string }[] = [];
  const db = getDb();

  const BUFFER_THRESHOLD = 500;

  for (const day of projection) {
    if (day.balance < 0) {
      alerts.push({
        severity: "critical",
        message: `Projected balance goes negative ($${day.balance.toFixed(2)}) on ${day.date}`,
        action_text: "Move funds from savings or defer a flexible bill",
      });
      break;
    }
  }

  const events = db.prepare(
    "SELECT * FROM events WHERE active = 1 AND type = 'bill' AND paid = 0"
  ).all() as Event[];
  const now = new Date();

  for (const event of events) {
    const due = parseISO(event.due_date);
    const hoursUntil = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

    const instanceRow = db.prepare(
      "SELECT allocated_amount, planned_amount, status FROM event_instances WHERE event_id = ? AND due_date = ?"
    ).get(event.id, event.due_date) as { allocated_amount: number; planned_amount: number; status: string } | undefined;

    if (instanceRow?.status === "funded") continue;

    const remaining = instanceRow
      ? instanceRow.planned_amount - instanceRow.allocated_amount
      : event.amount;

    if (hoursUntil < 0 && event.priority === "critical") {
      alerts.push({
        severity: "critical",
        message: `Overdue critical bill: ${event.name} ($${remaining.toFixed(2)} remaining)`,
        action_text: `Pay ${event.name} immediately`,
      });
    } else if (hoursUntil >= 0 && hoursUntil <= 48 && !event.autopay) {
      alerts.push({
        severity: "critical",
        message: `${event.name} ($${remaining.toFixed(2)} remaining) due within 48 hours`,
        action_text: `Schedule payment for ${event.name}`,
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
    if (day.events.length > 0) {
      const summary = day.events.map((e) => `${e.name} ($${e.amount.toFixed(2)})`).join(", ");
      alerts.push({
        severity: "info",
        message: `${day.date}: ${summary}`,
        action_text: "Review upcoming transactions",
      });
    }
  }

  return alerts;
}
