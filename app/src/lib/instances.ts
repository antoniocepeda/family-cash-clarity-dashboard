import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { addDays, format, startOfDay } from "date-fns";
import { expandRecurrence } from "./projection";
import { EventInstance } from "./types";

interface EventRow {
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

export function ensureInstance(
  db: Database.Database,
  eventId: string,
  dueDate: string,
  plannedAmount: number
): string {
  db.prepare(
    `INSERT OR IGNORE INTO event_instances (id, event_id, due_date, planned_amount)
     VALUES (?, ?, ?, ?)`
  ).run(randomUUID(), eventId, dueDate, plannedAmount);

  const row = db
    .prepare("SELECT id FROM event_instances WHERE event_id = ? AND due_date = ?")
    .get(eventId, dueDate) as { id: string };

  return row.id;
}

export function getInstanceRow(
  db: Database.Database,
  eventId: string,
  dueDate: string
): EventInstance | null {
  const row = db
    .prepare(
      `SELECT ei.*, e.name as event_name, e.type as event_type
       FROM event_instances ei
       JOIN events e ON e.id = ei.event_id
       WHERE ei.event_id = ? AND ei.due_date = ?`
    )
    .get(eventId, dueDate) as (EventInstance & { event_name: string; event_type: string }) | undefined;

  if (!row) return null;

  return {
    ...row,
    remaining_amount: row.planned_amount - row.allocated_amount,
  };
}

export function getOrExpandInstances(
  db: Database.Database,
  eventId: string,
  windowEnd: Date
): EventInstance[] {
  const event = db
    .prepare("SELECT * FROM events WHERE id = ?")
    .get(eventId) as EventRow | undefined;

  if (!event) return [];

  const today = startOfDay(new Date());
  const occurrences = expandRecurrence(event, today, windowEnd);

  for (const occ of occurrences) {
    const dateStr = format(occ, "yyyy-MM-dd");
    ensureInstance(db, eventId, dateStr, event.amount);
  }

  const rows = db
    .prepare(
      `SELECT ei.*, e.name as event_name, e.type as event_type
       FROM event_instances ei
       JOIN events e ON e.id = ei.event_id
       WHERE ei.event_id = ? AND ei.due_date >= ? AND ei.due_date <= ?
       ORDER BY ei.due_date ASC`
    )
    .all(eventId, format(today, "yyyy-MM-dd"), format(windowEnd, "yyyy-MM-dd")) as EventInstance[];

  return rows.map((r) => ({
    ...r,
    remaining_amount: r.planned_amount - r.allocated_amount,
  }));
}

export function getEligibleInstances(db: Database.Database): EventInstance[] {
  const today = startOfDay(new Date());
  const windowEnd = addDays(today, 28);

  const events = db
    .prepare("SELECT * FROM events WHERE active = 1 AND paid = 0")
    .all() as EventRow[];

  for (const event of events) {
    const occurrences = expandRecurrence(event, today, windowEnd);
    for (const occ of occurrences) {
      const dateStr = format(occ, "yyyy-MM-dd");
      ensureInstance(db, event.id, dateStr, event.amount);
    }
  }

  const rows = db
    .prepare(
      `SELECT ei.*, e.name as event_name, e.type as event_type
       FROM event_instances ei
       JOIN events e ON e.id = ei.event_id
       WHERE ei.status = 'open'
         AND e.active = 1
         AND ei.due_date >= ?
         AND ei.due_date <= ?
       ORDER BY ei.due_date ASC`
    )
    .all(format(today, "yyyy-MM-dd"), format(windowEnd, "yyyy-MM-dd")) as EventInstance[];

  return rows.map((r) => ({
    ...r,
    remaining_amount: r.planned_amount - r.allocated_amount,
  }));
}

export function getAllInstancesForEvents(
  db: Database.Database,
  windowEnd: Date
): EventInstance[] {
  const today = startOfDay(new Date());

  const events = db
    .prepare("SELECT * FROM events WHERE active = 1")
    .all() as EventRow[];

  for (const event of events) {
    if (event.paid && !event.recurrence_rule) continue;
    const occurrences = expandRecurrence(event, today, windowEnd);
    for (const occ of occurrences) {
      const dateStr = format(occ, "yyyy-MM-dd");
      ensureInstance(db, event.id, dateStr, event.amount);
    }
  }

  const rows = db
    .prepare(
      `SELECT ei.*, e.name as event_name, e.type as event_type
       FROM event_instances ei
       JOIN events e ON e.id = ei.event_id
       WHERE e.active = 1
         AND ei.due_date >= ?
         AND ei.due_date <= ?
       ORDER BY ei.due_date ASC`
    )
    .all(format(today, "yyyy-MM-dd"), format(windowEnd, "yyyy-MM-dd")) as EventInstance[];

  return rows.map((r) => ({
    ...r,
    remaining_amount: r.planned_amount - r.allocated_amount,
  }));
}
