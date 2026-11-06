/** Cash figures shared by the home card and the projection. */

export type CashAccount = {
  id?: string;
  type?: string;
  current_balance: number;
  available_balance?: number | null;
  is_reserve?: number | boolean;
};

export type CashBasis = "available" | "current" | "mixed";

export type HouseholdCash = {
  amount: number;
  reserved: number;
  basis: CashBasis;
};

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function isReserve(account: CashAccount) {
  return Boolean(account.is_reserve);
}

/**
 * Depository accounts use Plaid's available balance when the bank sent one.
 * That number already has pending charges taken out.
 * Credit-card "available" is unused credit, not cash, so those stay on the posted balance.
 */
export function usesAvailableBalance(account: CashAccount) {
  if (account.type === "credit") return false;
  return typeof account.available_balance === "number" && Number.isFinite(account.available_balance);
}

export function spendableBalance(account: CashAccount) {
  if (usesAvailableBalance(account)) return account.available_balance as number;
  return account.current_balance;
}

export function householdCash(accounts: readonly CashAccount[], mode: "spendable" | "posted" = "spendable"): HouseholdCash {
  let amount = 0;
  let usedAvailable = false;
  let usedPosted = false;

  for (const account of accounts) {
    if (isReserve(account)) continue;
    if (mode === "spendable" && usesAvailableBalance(account)) {
      amount += account.available_balance as number;
      usedAvailable = true;
    } else {
      amount += account.current_balance;
      usedPosted = true;
    }
  }

  const basis: CashBasis = mode === "posted" || !usedAvailable ? "current" : usedPosted ? "mixed" : "available";
  const reserved = accounts
    .filter((account) => isReserve(account))
    .reduce((sum, account) => sum + (mode === "spendable" ? spendableBalance(account) : account.current_balance), 0);

  return { amount: cents(amount), reserved: cents(reserved), basis };
}

/** Checked "Include pending" starts from available cash. Unchecked starts from the posted balance. */
export function projectionStartingBalance(accounts: readonly CashAccount[], includePending: boolean) {
  return householdCash(accounts, includePending ? "spendable" : "posted").amount;
}

/**
 * Pending ledger rows are an extra subtraction only when they are not already
 * inside the starting balance. Available balance already includes them.
 */
export function shouldApplyPendingTransaction(account: CashAccount | undefined, includePending: boolean) {
  if (!includePending || !account || isReserve(account)) return false;
  if (account.type === "credit") return false;
  return !usesAvailableBalance(account);
}

export function cashBasisExplanation(basis: CashBasis) {
  if (basis === "available") return "Available balance from the bank. Pending charges are already taken out.";
  if (basis === "mixed") return "Available balance where the bank sent it. Other accounts use the posted balance.";
  return "Posted balance. The bank did not send an available balance.";
}

export function pendingListNote(basis: CashBasis) {
  if (basis === "current") {
    return "The bank did not send an available balance, so these are not in the cash number yet. They are not matched to bills until they post.";
  }
  if (basis === "mixed") {
    return "Taken out of available cash where the bank sent it. They are not matched to bills until they post.";
  }
  return "Already taken out of available cash. They are not subtracted again, and they are not matched to bills until they post.";
}

export type PlaidTxnFields = {
  name?: string | null;
  merchant_name?: string | null;
  date: string;
  authorized_date?: string | null;
};

export function plaidTransactionLabel(transaction: PlaidTxnFields) {
  const merchant = transaction.merchant_name?.trim();
  if (merchant) return merchant;
  const name = transaction.name?.trim();
  return name || "Bank transaction";
}

/** The day the charge was authorized when Plaid has it, otherwise the posted date. */
export function plaidTransactionDate(transaction: PlaidTxnFields) {
  return transaction.authorized_date || transaction.date;
}

export function visiblePending<T extends { pending?: boolean; removed?: boolean; date: string; created_at?: string }>(entries: readonly T[]): T[] {
  return entries
    .filter((entry) => entry.pending && !entry.removed)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}
