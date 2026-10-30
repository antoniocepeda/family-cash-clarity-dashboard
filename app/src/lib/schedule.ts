import { addDays, addMonths, addWeeks, isAfter, isBefore, isEqual, parseISO, startOfDay } from "date-fns";

/** How far ahead recurring bills stay materialized. Rolls forward on each read or sync. */
export const MATERIALIZE_MONTHS = 9;

/** Days of projection the calendar asks for, matching the materialize horizon. */
export const MATERIALIZE_DAYS = 270;

/** Past-due bills newer than this are created so bank payments can match them. */
export const RECONCILE_LOOKBACK_DAYS = 120;

/** Refresh Plaid on app open when the newest sync is older than this. */
export const STALE_SYNC_MINUTES = 15;
export const STALE_SYNC_MS = STALE_SYNC_MINUTES * 60 * 1000;

export function advanceByRule(base: Date, rule: string): Date {
  if (rule.startsWith("every_")) {
    if (rule.endsWith("_days")) {
      const n = parseInt(rule.slice(6, -5), 10);
      if (!isNaN(n) && n > 0) return addDays(base, n);
    }
    if (rule.endsWith("_weeks")) {
      const n = parseInt(rule.slice(6, -6), 10);
      if (!isNaN(n) && n > 0) return addWeeks(base, n);
    }
  }
  switch (rule) {
    case "weekly": return addDays(base, 7);
    case "biweekly": return addWeeks(base, 2);
    case "monthly": return addMonths(base, 1);
    case "quarterly": return addMonths(base, 3);
    case "annual": return addMonths(base, 12);
    default: return addMonths(base, 1);
  }
}

export type ScheduleCommitment = {
  due_date: string;
  recurrence_rule: string | null;
  recurrence_end_date?: string | null;
  recurrence_count?: number | null;
};

export function materializeHorizonEnd(today: Date): Date {
  return addMonths(startOfDay(today), MATERIALIZE_MONTHS);
}

export function normalizeRecurrenceEnd(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export function normalizeRecurrenceCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * Dates for a commitment inside [startDate, endDate].
 * Recurrence continues until recurrence_end_date or recurrence_count, otherwise it does not stop.
 * recurrence_count includes occurrences before the window.
 */
export function expandOccurrenceDates(commitment: ScheduleCommitment, startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const rule = commitment.recurrence_rule;
  const baseDate = startOfDay(parseISO(commitment.due_date));
  const windowStart = startOfDay(startDate);
  const windowEnd = startOfDay(endDate);
  const endLimit = commitment.recurrence_end_date ? startOfDay(parseISO(commitment.recurrence_end_date)) : null;
  const maxCount = commitment.recurrence_count && commitment.recurrence_count > 0 ? commitment.recurrence_count : null;

  const inWindow = (date: Date) =>
    (isAfter(date, windowStart) || isEqual(date, windowStart)) &&
    (isBefore(date, windowEnd) || isEqual(date, windowEnd));

  if (!rule) {
    if ((!endLimit || !isAfter(baseDate, endLimit)) && inWindow(baseDate)) dates.push(baseDate);
    return dates;
  }

  let cursor = baseDate;
  let index = 0;
  while (index < (maxCount ?? 600)) {
    if (endLimit && isAfter(cursor, endLimit)) break;
    if (isAfter(cursor, windowEnd)) break;
    if (inWindow(cursor)) dates.push(cursor);
    index += 1;
    const next = advanceByRule(cursor, rule);
    if (!isAfter(next, cursor)) break;
    cursor = next;
  }

  return dates;
}
