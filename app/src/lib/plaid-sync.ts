import "server-only";

import { plaidTransactionDate, plaidTransactionLabel } from "@/lib/cash-balance";
import { describePlaidSyncError } from "@/lib/plaid-errors";
import { decryptPlaidAccessToken, getPlaidClient } from "@/lib/plaid";
import {
  clearPlaidItemError,
  getPlaidCursor,
  listPlaidItemsWithTokens,
  markPlaidItemError,
  markPlaidLedgerTransactionRemoved,
  savePlaidSyncState,
  upsertPlaidAccount,
  upsertPlaidLedgerTransaction,
} from "@/lib/repositories/firestore";

export class PlaidItemNotFoundError extends Error {
  constructor() {
    super("Linked bank not found");
    this.name = "PlaidItemNotFoundError";
  }
}

export type PlaidSyncSummary = {
  items: number;
  accounts: number;
  added: number;
  modified: number;
  removed: number;
  pending: number;
  refresh_requested: number;
  refresh_skipped: number;
  errors: { item_id: string; error: string; error_code: string }[];
};

export async function syncPlaidForUser(
  userId: string,
  options: { refresh?: boolean; itemId?: string; reconnected?: boolean } = {}
): Promise<PlaidSyncSummary> {
  const requestRefresh = options.refresh !== false;
  const plaid = getPlaidClient();
  const allItems = await listPlaidItemsWithTokens(userId);
  const items = options.itemId ? allItems.filter((item) => item.item_id === options.itemId) : allItems;
  if (options.itemId && items.length === 0) throw new PlaidItemNotFoundError();

  // A finished Link update repairs the existing item. Drop the stale error
  // before pulling; a failed pull writes the new Plaid error in its place.
  if (options.reconnected && options.itemId) {
    await clearPlaidItemError(userId, options.itemId);
  }

  const summary: PlaidSyncSummary = {
    items: items.length,
    accounts: 0,
    added: 0,
    modified: 0,
    removed: 0,
    pending: 0,
    refresh_requested: 0,
    refresh_skipped: 0,
    errors: [],
  };

  for (const item of items) {
    try {
      if (!item.encrypted_access_token) throw new Error("Plaid item is missing its server token reference");
      const accessToken = decryptPlaidAccessToken(item.encrypted_access_token);
      const accountMap = new Map<string, string>();
      const accounts = await plaid.accountsGet({ access_token: accessToken });

      for (const account of accounts.data.accounts) {
        const appAccountId = await upsertPlaidAccount(userId, {
          plaidAccountId: account.account_id,
          plaidItemId: item.item_id,
          name: account.name,
          officialName: account.official_name,
          mask: account.mask,
          type: account.type,
          subtype: account.subtype,
          currentBalance: Number(account.balances.current ?? 0),
          availableBalance: account.balances.available === null ? null : Number(account.balances.available ?? 0),
          isoCurrencyCode: account.balances.iso_currency_code,
        });
        accountMap.set(account.account_id, appAccountId);
        summary.accounts += 1;
      }

      if (requestRefresh) {
        try {
          // Refresh is asynchronous. The follow-up sync pulls charges that land after this returns.
          await plaid.transactionsRefresh({ access_token: accessToken });
          summary.refresh_requested += 1;
        } catch {
          summary.refresh_skipped += 1;
        }
      }

      let cursor = await getPlaidCursor(userId, item.item_id);
      let hasMore = true;
      while (hasMore) {
        const synced = await plaid.transactionsSync({
          access_token: accessToken,
          cursor: cursor ?? undefined,
          count: 500,
        });

        // Pending rows are kept. Plaid's first historical sync often omits them;
        // later syncs add them, then replace each one when it posts.
        const writeTransaction = async (transaction: (typeof synced.data.added)[number], countAs: "result" | "modified") => {
          const appAccountId = accountMap.get(transaction.account_id);
          if (!appAccountId) return;
          const result = await upsertPlaidLedgerTransaction(userId, {
            plaidTransactionId: transaction.transaction_id,
            plaidPendingTransactionId: transaction.pending_transaction_id ?? null,
            plaidAccountId: transaction.account_id,
            appAccountId,
            date: plaidTransactionDate(transaction),
            name: plaidTransactionLabel(transaction),
            amount: Number(transaction.amount),
            pending: Boolean(transaction.pending),
          });
          if (transaction.pending) summary.pending += 1;
          if (countAs === "result") summary[result] += 1;
          else summary.modified += 1;
        };

        for (const transaction of synced.data.added) await writeTransaction(transaction, "result");
        for (const transaction of synced.data.modified) await writeTransaction(transaction, "modified");

        for (const removed of synced.data.removed) {
          summary.removed += await markPlaidLedgerTransactionRemoved(userId, removed.transaction_id);
        }

        cursor = synced.data.next_cursor;
        hasMore = synced.data.has_more;
      }

      await savePlaidSyncState(userId, item.item_id, cursor);
    } catch (err) {
      const described = describePlaidSyncError(err, item.institution_name);
      summary.errors.push({
        item_id: item.item_id,
        error: described.error_message,
        error_code: described.error_code,
      });
      await markPlaidItemError(userId, item.item_id, described.error_code, described.error_message);
      // Log the code only. Axios errors include the access token in the request body.
      console.error("Plaid sync item error", {
        item_id: item.item_id,
        institution_name: item.institution_name,
        error_code: described.error_code,
      });
    }
  }

  return summary;
}
