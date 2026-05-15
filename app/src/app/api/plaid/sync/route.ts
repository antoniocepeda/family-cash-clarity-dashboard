import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { decryptPlaidAccessToken, getPlaidClient } from "@/lib/plaid";
import {
  ensureUser,
  getPlaidCursor,
  getPlaidStatus,
  listPlaidItemsWithTokens,
  markPlaidItemError,
  markPlaidLedgerTransactionRemoved,
  savePlaidSyncState,
  upsertPlaidAccount,
  upsertPlaidLedgerTransaction,
} from "@/lib/repositories/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);
  return NextResponse.json(await getPlaidStatus(user.uid));
}

async function handlePOST(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);
  const plaid = getPlaidClient();
  const items = await listPlaidItemsWithTokens(user.uid);
  const summary = {
    items: items.length,
    accounts: 0,
    added: 0,
    modified: 0,
    removed: 0,
    pending: 0,
    errors: [] as { item_id: string; error: string }[],
  };

  for (const item of items) {
    try {
      if (!item.encrypted_access_token) throw new Error("Plaid item is missing its server token reference");
      const accessToken = decryptPlaidAccessToken(item.encrypted_access_token);
      const accountMap = new Map<string, string>();
      const accounts = await plaid.accountsGet({ access_token: accessToken });

      for (const account of accounts.data.accounts) {
        const appAccountId = await upsertPlaidAccount(user.uid, {
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

      let cursor = await getPlaidCursor(user.uid, item.item_id);
      let hasMore = true;
      while (hasMore) {
        const synced = await plaid.transactionsSync({
          access_token: accessToken,
          cursor: cursor ?? undefined,
          count: 500,
        });

        for (const transaction of synced.data.added) {
          const appAccountId = accountMap.get(transaction.account_id);
          if (!appAccountId) continue;
          const result = await upsertPlaidLedgerTransaction(user.uid, {
            plaidTransactionId: transaction.transaction_id,
            plaidAccountId: transaction.account_id,
            appAccountId,
            date: transaction.date,
            name: transaction.name,
            amount: Number(transaction.amount),
            pending: transaction.pending,
          });
          if (transaction.pending) summary.pending += 1;
          summary[result] += 1;
        }

        for (const transaction of synced.data.modified) {
          const appAccountId = accountMap.get(transaction.account_id);
          if (!appAccountId) continue;
          await upsertPlaidLedgerTransaction(user.uid, {
            plaidTransactionId: transaction.transaction_id,
            plaidAccountId: transaction.account_id,
            appAccountId,
            date: transaction.date,
            name: transaction.name,
            amount: Number(transaction.amount),
            pending: transaction.pending,
          });
          if (transaction.pending) summary.pending += 1;
          summary.modified += 1;
        }

        for (const removed of synced.data.removed) {
          summary.removed += await markPlaidLedgerTransactionRemoved(user.uid, removed.transaction_id);
        }

        cursor = synced.data.next_cursor;
        hasMore = synced.data.has_more;
      }

      await savePlaidSyncState(user.uid, item.item_id, cursor);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Plaid sync failed";
      summary.errors.push({ item_id: item.item_id, error: message });
      await markPlaidItemError(user.uid, item.item_id, "SYNC_ERROR", message);
    }
  }

  return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
}

export const GET = withAuth(handleGET);
export const POST = withAuth(handlePOST);
