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

export function generateProjection(days: number = 28): ProjectionDay[] {
  const db = getDb();
  const accounts = db.prepare("SELECT * FROM accounts").all() as {
    current_balance: number;
    is_reserve: number;
  }[];
  const events = db.prepare("SELECT * FROM events WHERE active = 1").all() as Event[];

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

    const occurrences = expandRecurrence(event, today, endDate);
    for (const occ of occurrences) {
      const key = format(occ, "yyyy-MM-dd");
      const day = dayMap.get(key);
      if (!day) continue;

      const impact = event.type === "income" ? event.amount : -event.amount;
      day.events.push({
        name: event.name,
        amount: event.amount,
        type: event.type,
        priority: event.priority,
      });

      // Apply to this day and all subsequent
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

    if (hoursUntil < 0 && event.priority === "critical") {
      alerts.push({
        severity: "critical",
        message: `Overdue critical bill: ${event.name} ($${event.amount})`,
        action_text: `Pay ${event.name} immediately`,
      });
    } else if (hoursUntil >= 0 && hoursUntil <= 48 && !event.autopay) {
      alerts.push({
        severity: "critical",
        message: `${event.name} ($${event.amount}) due within 48 hours`,
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
      const summary = day.events.map((e) => `${e.name} ($${e.amount})`).join(", ");
      alerts.push({
        severity: "info",
        message: `${day.date}: ${summary}`,
        action_text: "Review upcoming transactions",
      });
    }
  }

  return alerts;
}
