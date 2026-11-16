"use client";

import { format, parseISO } from "date-fns";
import Link from "next/link";
import { cashBasisExplanation, householdCash, pendingListNote, visiblePending } from "@/lib/cash-balance";
import { HelpPrompt } from "@/lib/reconcile";
import { SPEND_BUFFER, buildOutlook, computeSafeToSpend } from "@/lib/safe-spend";
import { Account, CommitmentWithInstances, LedgerEntry, ProjectionDay } from "@/lib/types";
import ActivityRow from "@/components/ui/ActivityRow";
import HeroAmount from "@/components/ui/HeroAmount";
import StatusDot from "@/components/ui/StatusDot";

interface Props {
  accounts: Account[];
  commitments: CommitmentWithInstances[];
  projection: ProjectionDay[];
  ledger?: LedgerEntry[];
  prompts: HelpPrompt[];
  lastSyncedAt: string | null;
  syncing: boolean;
  resolveError?: string | null;
  onResolve?: (promptId: string, choiceId: string) => void;
}

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

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
  ledger = [],
  prompts,
  lastSyncedAt,
  syncing,
  resolveError = null,
  onResolve,
}: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const cash = householdCash(accounts);
  const pending = visiblePending(ledger);
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const recurringIncomeIds = commitments
    .filter((commitment) => commitment.active && commitment.type === "income" && commitment.recurrence_rule)
    .map((commitment) => commitment.id);

  const spend = computeSafeToSpend({
    cashOnHand: cash.amount,
    days: projection,
    recurringIncomeIds,
    today,
    buffer: SPEND_BUFFER,
  });
  const outlook = buildOutlook({ startingCash: cash.amount, days: projection, recurringIncomeIds });
  const cashWord = cash.basis === "current" ? "posted" : "available";

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

  const outlookTone = !outlook.covered ? "negative" : outlook.onTrack ? "positive" : "warning";

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="hero">
        <p className="eyebrow">Safe to spend</p>
        <HeroAmount value={spend.safeToSpend} />
        <div className="mt-6">
          <Link href="/expenses" className="btn btn-primary">
            Review bills
          </Link>
        </div>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-[var(--muted)]">
          {fmt(spend.cashOnHand)} {cashWord} − {fmt(spend.billsTotal)} due before{" "}
          {spend.paycheckDate ? format(parseISO(spend.paycheckDate), "MMM d") : "the next 2 weeks"} − {fmt(spend.buffer)} buffer.
        </p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">{cashBasisExplanation(cash.basis)}</p>
        {cash.reserved > 0 && <p className="mt-2 text-sm text-[var(--muted)]">{fmt(cash.reserved)} is set aside in savings.</p>}
        <p className="mt-3 text-sm text-[var(--faint)]">{syncedLabel(lastSyncedAt, syncing)}</p>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5">
      <section className="surface overflow-hidden">
        <div className="px-5 py-5 sm:px-6">
          <p className="eyebrow">Due before payday</p>
          <h2 className="mt-1 text-2xl font-medium text-[var(--text)]">
            {spend.paycheckDate
              ? `Next paycheck ${format(parseISO(spend.paycheckDate), "EEE, MMM d")}`
              : "No paycheck scheduled"}
          </h2>
          {spend.paycheckName && spend.paycheckDate && (
            <p className="mt-1 text-sm text-[var(--muted)]">{spend.paycheckName}</p>
          )}
        </div>
        {spend.bills.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-[var(--muted)] sm:px-6">Nothing unpaid before then.</p>
        ) : (
          <div className="activity-list">
            {spend.bills.map((bill) => {
              const overdue = bill.dueDate < today;
              return (
                <ActivityRow
                  key={`${bill.commitmentId ?? bill.name}-${bill.dueDate}`}
                  title={bill.name}
                  tone={overdue ? "overdue" : "neutral"}
                  amount={fmt(bill.amount)}
                  subtitle={
                    <>
                      <span className={overdue ? "is-overdue-text" : undefined}>
                        {format(parseISO(bill.dueDate), "EEE, MMM d")}
                      </span>
                      {overdue ? <StatusDot tone="negative" label="Overdue" /> : null}
                    </>
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="surface px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">On track</p>
          <StatusDot tone={outlookTone} label={outlookTitle} />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{outlookDetail}</p>
        {outlook.paychecks.length > 0 && (
          <ul className="mt-4 space-y-2">
            {outlook.paychecks.map((paycheck, index) => (
              <li key={`${paycheck.date}-${paycheck.name}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-2)] px-3 py-3">
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
      </div>

      {pending.length > 0 && (
        <section className="surface overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 py-5 sm:px-6">
            <div>
              <p className="eyebrow">Pending</p>
              <h2 className="mt-1 text-2xl font-medium text-[var(--text)]">
                {pending.length === 1 ? "1 transaction not posted yet" : `${pending.length} transactions not posted yet`}
              </h2>
            </div>
            <Link href="/transactions" className="text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]">
              Ledger
            </Link>
          </div>
          <p className="px-5 pb-2 text-sm leading-relaxed text-[var(--muted)] sm:px-6">{pendingListNote(cash.basis)}</p>
          <div className="activity-list">
            {pending.map((entry) => (
              <ActivityRow
                key={entry.id}
                title={entry.description}
                tone={entry.type === "income" ? "in" : "neutral"}
                amount={`${entry.type === "income" ? "+" : "−"}${fmt(entry.amount)}`}
                subtitle={
                  <>
                    <span>
                      {format(parseISO(entry.date), "EEE, MMM d")}
                      {accountName.get(entry.account_id) ? ` · ${accountName.get(entry.account_id)}` : ""}
                    </span>
                    <StatusDot tone="warning" label="Pending" />
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

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
                      disabled={!onResolve}
                      onClick={() => onResolve?.(prompt.id, choice.id)}
                      className={`btn min-h-11 w-full justify-start px-4 text-left text-sm ${
                        choice.action === "dismiss" ? "btn-ghost" : "btn-primary"
                      }`}
                    >
                      {choice.label}
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
