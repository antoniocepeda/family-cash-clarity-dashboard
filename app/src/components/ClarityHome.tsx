"use client";

import { format, parseISO } from "date-fns";
import { HelpPrompt } from "@/lib/reconcile";
import { SPEND_BUFFER, buildOutlook, computeSafeToSpend } from "@/lib/safe-spend";
import { Account, CommitmentWithInstances, ProjectionDay } from "@/lib/types";

interface Props {
  accounts: Account[];
  commitments: CommitmentWithInstances[];
  projection: ProjectionDay[];
  prompts: HelpPrompt[];
  lastSyncedAt: string | null;
  syncing: boolean;
  resolvingId?: string | null;
  resolveError?: string | null;
  onResolve?: (promptId: string, choiceId: string) => void;
}

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function HeroAmount({ value }: { value: number }) {
  const negative = value < 0;
  const abs = Math.abs(value);
  const dollars = Math.trunc(abs).toLocaleString("en-US");
  const cents = abs.toFixed(2).slice(-2);

  return (
    <p className={`money-xl ${negative ? "text-[var(--negative)]" : "text-[var(--text)]"}`}>
      <span className="mr-1 align-top text-[0.38em] text-[var(--muted)]">{negative ? "−$" : "$"}</span>
      {dollars}
      <span className="text-[0.38em] text-[var(--muted)]">.{cents}</span>
    </p>
  );
}

function syncedLabel(lastSyncedAt: string | null, syncing: boolean) {
  if (syncing) return "Syncing bank…";
  if (!lastSyncedAt) return "No bank sync yet";
  const then = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(then)) return "No bank sync yet";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "Bank synced just now";
  if (minutes < 60) return `Bank synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `Bank synced ${hours}h ago`;
  return `Bank synced ${format(new Date(lastSyncedAt), "MMM d")}`;
}

export default function ClarityHome({
  accounts,
  commitments,
  projection,
  prompts,
  lastSyncedAt,
  syncing,
  resolvingId = null,
  resolveError = null,
  onResolve,
}: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const cashOnHand = accounts.filter((account) => !account.is_reserve).reduce((sum, account) => sum + account.current_balance, 0);
  const reserved = accounts.filter((account) => account.is_reserve).reduce((sum, account) => sum + account.current_balance, 0);
  const recurringIncomeIds = commitments
    .filter((commitment) => commitment.active && commitment.type === "income" && commitment.recurrence_rule)
    .map((commitment) => commitment.id);

  const spend = computeSafeToSpend({
    cashOnHand,
    days: projection,
    recurringIncomeIds,
    today,
    buffer: SPEND_BUFFER,
  });
  const outlook = buildOutlook({ startingCash: cashOnHand, days: projection, recurringIncomeIds });

  const outlookTitle = !outlook.covered
    ? "No"
    : outlook.onTrack
      ? "Yes"
      : outlook.trend === "down"
        ? "Covered, drifting down"
        : "Covered, holding steady";
  const outlookDetail = !outlook.covered
    ? outlook.shortfallDate
      ? `Cash goes negative on ${format(parseISO(outlook.shortfallDate), "MMM d")} before the later paychecks.`
      : "Cash does not stay positive through the next paychecks."
    : outlook.paychecks.length === 0
      ? "Add a repeating paycheck to see the next few pay cycles."
      : outlook.onTrack
        ? `Bills fit, and cash is higher by ${format(parseISO(outlook.paychecks[outlook.paychecks.length - 1].date), "MMM d")}.`
        : `Bills fit through ${format(parseISO(outlook.paychecks[outlook.paychecks.length - 1].date), "MMM d")}, and cash is ${outlook.trend === "down" ? "lower" : "about the same"} than at the first paycheck.`;

  return (
    <div className="space-y-3">
      <section className="surface px-5 py-6 sm:px-7 sm:py-8">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">Can I spend today?</p>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              spend.canSpend
                ? "bg-[var(--positive-soft)] text-[var(--positive)]"
                : "bg-[var(--negative-soft)] text-[var(--negative)]"
            }`}
          >
            {spend.canSpend ? "Yes" : "No"}
          </span>
        </div>
        <HeroAmount value={spend.safeToSpend} />
        <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--muted)]">
          {fmt(spend.cashOnHand)} in cash − {fmt(spend.billsTotal)} due before{" "}
          {spend.paycheckDate ? format(parseISO(spend.paycheckDate), "MMM d") : "the next 2 weeks"} − {fmt(spend.buffer)} buffer.
        </p>
        {reserved > 0 && <p className="mt-2 text-sm text-[var(--muted)]">{fmt(reserved)} is set aside in savings.</p>}
        <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-[var(--faint)]">{syncedLabel(lastSyncedAt, syncing)}</p>
      </section>

      <section className="surface px-5 py-5 sm:px-7">
        <p className="eyebrow">Due before payday</p>
        <h2 className="mt-1 text-2xl font-medium text-[var(--text)]">
          {spend.paycheckDate
            ? `Next paycheck ${format(parseISO(spend.paycheckDate), "EEE, MMM d")}`
            : "No paycheck scheduled"}
        </h2>
        {spend.paycheckName && spend.paycheckDate && (
          <p className="mt-1 text-sm text-[var(--muted)]">{spend.paycheckName}</p>
        )}
        {spend.bills.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Nothing unpaid before then.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {spend.bills.map((bill) => (
              <li key={`${bill.commitmentId ?? bill.name}-${bill.dueDate}`} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{bill.name}</p>
                  <p className={`text-xs ${bill.dueDate < today ? "font-semibold text-[var(--negative)]" : "text-[var(--muted)]"}`}>
                    {format(parseISO(bill.dueDate), "EEE, MMM d")}
                    {bill.dueDate < today ? " · Overdue" : ""}
                  </p>
                </div>
                <p className="money shrink-0 text-sm text-[var(--text)]">{fmt(bill.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface px-5 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">On track?</p>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              outlook.onTrack
                ? "bg-[var(--positive-soft)] text-[var(--positive)]"
                : outlook.covered
                  ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                  : "bg-[var(--negative-soft)] text-[var(--negative)]"
            }`}
          >
            {outlookTitle}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{outlookDetail}</p>
        {outlook.paychecks.length > 0 && (
          <ul className="mt-4 space-y-2">
            {outlook.paychecks.map((paycheck, index) => (
              <li key={`${paycheck.date}-${paycheck.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-2)] px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">
                    Paycheck {index + 1}
                    <span className="text-[var(--muted)]"> · {format(parseISO(paycheck.date), "MMM d")}</span>
                  </p>
                  <p className="text-xs text-[var(--muted)]">{paycheck.name} {fmt(paycheck.amount)}</p>
                </div>
                <p className="money text-sm text-[var(--text)]">{fmt(paycheck.balance)}</p>
              </li>
            ))}
          </ul>
        )}
        {outlook.paychecks.length > 0 && (
          <p className="mt-3 text-xs text-[var(--faint)]">
            Lowest cash along the way {fmt(outlook.minBalance)}. Balance shown is after that day’s paycheck.
          </p>
        )}
      </section>

      {prompts.length > 0 && (
        <section className="surface scroll-mb-[calc(var(--tabbar-height)+var(--safe-bottom)+0.75rem)] px-5 py-5 sm:px-7 md:scroll-mb-4">
          <p className="eyebrow">Needs your help</p>
          <h2 className="mt-1 text-2xl font-medium text-[var(--text)]">
            {prompts.length === 1 ? "1 thing to match" : `${prompts.length} things to match`}
          </h2>
          {resolveError && <p className="mt-3 text-sm text-[var(--negative)]">{resolveError}</p>}
          <ul className="mt-4 space-y-4">
            {prompts.map((prompt) => (
              <li key={prompt.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
                <p className="text-sm font-medium text-[var(--text)]">{prompt.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{prompt.detail}</p>
                <div className="mt-3 flex flex-col gap-2">
                  {prompt.choices.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={!onResolve || resolvingId !== null}
                      onClick={() => onResolve?.(prompt.id, choice.id)}
                      className={`btn min-h-11 w-full justify-start px-4 text-left text-sm ${
                        choice.action === "dismiss" ? "btn-ghost" : "btn-primary"
                      }`}
                    >
                      {resolvingId === prompt.id ? "Saving…" : choice.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
