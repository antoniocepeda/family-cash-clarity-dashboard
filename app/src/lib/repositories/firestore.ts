import "server-only";

import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { format } from "date-fns";
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin";
import {
  Account,
  AllocationInput,
  Commitment,
  CommitmentAllocation,
  CommitmentInstance,
  LedgerEntry,
  LedgerItem,
  LedgerItemInput,
  PlaidAccount,
  PlaidItem,
  PlaidStatus,
} from "@/lib/types";

export const COLLECTIONS = {
  accounts: "accounts",
  commitments: "commitments",
  commitmentInstances: "commitmentInstances",
  ledger: "ledger",
  commitmentAllocations: "commitmentAllocations",
  ledgerItems: "ledgerItems",
  plaidItems: "plaidItems",
  plaidAccounts: "plaidAccounts",
  plaidSync: "plaidSync",
} as const;

export function userRef(userId: string) {
  return getFirebaseAdminFirestore().collection("users").doc(userId);
}

function collection(userId: string, name: string) {
  return userRef(userId).collection(name);
}

function stampCreate(userId: string) {
  const now = new Date().toISOString();
  return { ownerId: userId, createdAt: now, updatedAt: now, created_at: now, updated_at: now };
}

function stampUpdate() {
  const now = new Date().toISOString();
  return { updatedAt: now, updated_at: now };
}

function row<T>(id: string, data: FirebaseFirestore.DocumentData): T {
  return { id, ...data } as unknown as T;
}

function isTruthyNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") return value ? 1 : 0;
  return value ? 1 : fallback;
}

function normalizeAccount(id: string, data: FirebaseFirestore.DocumentData): Account {
  return {
    id,
    name: String(data.name ?? ""),
    type: (data.type ?? "checking") as Account["type"],
    current_balance: Number(data.current_balance ?? data.currentBalance ?? 0),
    is_reserve: isTruthyNumber(data.is_reserve ?? data.isReserve),
    updated_at: String(data.updated_at ?? data.updatedAt ?? new Date().toISOString()),
    plaid_account_id: (data.plaid_account_id ?? data.plaidAccountId ?? null) as string | null,
    plaid_item_id: (data.plaid_item_id ?? data.plaidItemId ?? null) as string | null,
  };
}

function normalizeCommitment(id: string, data: FirebaseFirestore.DocumentData): Commitment {
  return {
    id,
    name: String(data.name ?? ""),
    type: (data.type ?? "bill") as Commitment["type"],
    amount: Number(data.amount ?? 0),
    actual_amount: data.actual_amount === undefined ? null : Number(data.actual_amount),
    due_date: String(data.due_date ?? data.dueDate ?? ""),
    recurrence_rule: (data.recurrence_rule ?? data.recurrenceRule ?? null) as string | null,
    priority: (data.priority ?? "normal") as Commitment["priority"],
    autopay: isTruthyNumber(data.autopay),
    account_id: (data.account_id ?? data.accountId ?? null) as string | null,
    active: isTruthyNumber(data.active, 1),
    paid: isTruthyNumber(data.paid),
    paid_date: (data.paid_date ?? data.paidDate ?? null) as string | null,
    created_at: String(data.created_at ?? data.createdAt ?? new Date().toISOString()),
  };
}

function normalizeInstance(id: string, data: FirebaseFirestore.DocumentData): CommitmentInstance {
  const planned = Number(data.planned_amount ?? data.plannedAmount ?? 0);
  const allocated = Number(data.allocated_amount ?? data.allocatedAmount ?? 0);
  const dueDate = String(data.due_date ?? data.dueDate ?? "");
  return {
    id,
    commitment_id: String(data.commitment_id ?? data.commitmentId ?? ""),
    due_date: dueDate,
    override_due_date: (data.override_due_date ?? data.overrideDueDate ?? null) as string | null,
    original_due_date: String(data.original_due_date ?? data.originalDueDate ?? data.template_due_date ?? dueDate),
    planned_amount: planned,
    actual_amount: data.actual_amount === undefined && data.actualAmount === undefined ? null : Number(data.actual_amount ?? data.actualAmount),
    allocated_amount: allocated,
    remaining_amount: planned - allocated,
    status: (data.status ?? "open") as CommitmentInstance["status"],
    edited_from_template: Boolean(data.edited_from_template ?? data.editedFromTemplate ?? false),
    paid_date: (data.paid_date ?? data.paidDate ?? null) as string | null,
    created_at: data.created_at as string | undefined,
    commitment_name: data.commitment_name as string | undefined,
    commitment_type: data.commitment_type as CommitmentInstance["commitment_type"],
    name_override: (data.name_override ?? data.nameOverride ?? null) as string | null,
  };
}

function normalizeLedger(id: string, data: FirebaseFirestore.DocumentData): LedgerEntry {
  return {
    id,
    date: String(data.date ?? ""),
    description: String(data.description ?? ""),
    amount: Number(data.amount ?? 0),
    type: (data.type ?? "expense") as LedgerEntry["type"],
    account_id: String(data.account_id ?? data.accountId ?? ""),
    commitment_id: (data.commitment_id ?? data.commitmentId ?? null) as string | null,
    created_at: String(data.created_at ?? data.createdAt ?? new Date().toISOString()),
    plaid_transaction_id: (data.plaid_transaction_id ?? data.plaidTransactionId ?? null) as string | null,
    pending: Boolean(data.pending ?? false),
    removed: Boolean(data.removed ?? false),
  };
}

function normalizePlaidItem(id: string, data: FirebaseFirestore.DocumentData): PlaidItem {
  return {
    id,
    item_id: String(data.item_id ?? id),
    institution_id: (data.institution_id ?? null) as string | null,
    institution_name: (data.institution_name ?? null) as string | null,
    available_products: Array.isArray(data.available_products) ? data.available_products : [],
    billed_products: Array.isArray(data.billed_products) ? data.billed_products : [],
    status: (data.status ?? "connected") as PlaidItem["status"],
    error_code: (data.error_code ?? null) as string | null,
    error_message: (data.error_message ?? null) as string | null,
    created_at: String(data.created_at ?? data.createdAt ?? new Date().toISOString()),
    updated_at: String(data.updated_at ?? data.updatedAt ?? new Date().toISOString()),
    last_synced_at: (data.last_synced_at ?? null) as string | null,
  };
}

function normalizePlaidAccount(id: string, data: FirebaseFirestore.DocumentData): PlaidAccount {
  return {
    id,
    plaid_account_id: String(data.plaid_account_id ?? id),
    plaid_item_id: String(data.plaid_item_id ?? ""),
    app_account_id: String(data.app_account_id ?? ""),
    name: String(data.name ?? ""),
    official_name: (data.official_name ?? null) as string | null,
    mask: (data.mask ?? null) as string | null,
    type: String(data.type ?? ""),
    subtype: (data.subtype ?? null) as string | null,
    current_balance: Number(data.current_balance ?? 0),
    available_balance: data.available_balance === undefined || data.available_balance === null ? null : Number(data.available_balance),
    iso_currency_code: (data.iso_currency_code ?? null) as string | null,
    updated_at: String(data.updated_at ?? data.updatedAt ?? new Date().toISOString()),
  };
}

export async function ensureUser(userId: string, email?: string) {
  await userRef(userId).set(
    { uid: userId, email: email ?? null, updatedAt: new Date().toISOString(), createdAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export async function listAccounts(userId: string): Promise<Account[]> {
  const snap = await collection(userId, COLLECTIONS.accounts).orderBy("name").get();
  return snap.docs.map((d) => normalizeAccount(d.id, d.data()));
}

export async function createAccount(userId: string, body: Partial<Account>) {
  const id = randomUUID();
  await collection(userId, COLLECTIONS.accounts).doc(id).set({
    ...stampCreate(userId),
    name: body.name,
    type: body.type,
    current_balance: Number(body.current_balance ?? 0),
    currentBalance: Number(body.current_balance ?? 0),
    is_reserve: body.is_reserve ? 1 : 0,
    isReserve: Boolean(body.is_reserve),
  });
  return getAccount(userId, id);
}

export async function getAccount(userId: string, id: string) {
  const snap = await collection(userId, COLLECTIONS.accounts).doc(id).get();
  return snap.exists ? normalizeAccount(snap.id, snap.data()!) : null;
}

export async function updateAccount(userId: string, body: Partial<Account> & { id: string }) {
  await collection(userId, COLLECTIONS.accounts).doc(body.id).set(
    {
      ...stampUpdate(),
      name: body.name,
      type: body.type,
      current_balance: Number(body.current_balance ?? 0),
      currentBalance: Number(body.current_balance ?? 0),
      is_reserve: body.is_reserve ? 1 : 0,
      isReserve: Boolean(body.is_reserve),
    },
    { merge: true }
  );
  return getAccount(userId, body.id);
}

export async function syncAccountBalance(userId: string, id: string, actualBalance: number) {
  await collection(userId, COLLECTIONS.accounts).doc(id).set(
    { ...stampUpdate(), current_balance: actualBalance, currentBalance: actualBalance },
    { merge: true }
  );
  return getAccount(userId, id);
}

export async function deleteAccount(userId: string, id: string) {
  const batch = getFirebaseAdminFirestore().batch();
  const commitments = await collection(userId, COLLECTIONS.commitments).where("account_id", "==", id).get();
  commitments.docs.forEach((d) => batch.update(d.ref, { account_id: null, accountId: null, ...stampUpdate() }));
  batch.delete(collection(userId, COLLECTIONS.accounts).doc(id));
  await batch.commit();
}

export async function listCommitments(userId: string, activeOnly = true): Promise<Commitment[]> {
  let q: FirebaseFirestore.Query = collection(userId, COLLECTIONS.commitments);
  if (activeOnly) q = q.where("active", "==", 1);
  const snap = await q.get();
  return snap.docs.map((d) => normalizeCommitment(d.id, d.data())).sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export async function getCommitment(userId: string, id: string) {
  const snap = await collection(userId, COLLECTIONS.commitments).doc(id).get();
  return snap.exists ? normalizeCommitment(snap.id, snap.data()!) : null;
}

export async function createCommitment(userId: string, body: Partial<Commitment>) {
  const id = randomUUID();
  await collection(userId, COLLECTIONS.commitments).doc(id).set({
    ...stampCreate(userId),
    name: body.name,
    type: body.type,
    amount: Number(body.amount ?? 0),
    actual_amount: null,
    actualAmount: null,
    due_date: body.due_date,
    dueDate: body.due_date,
    recurrence_rule: body.recurrence_rule || null,
    recurrenceRule: body.recurrence_rule || null,
    priority: body.priority || "normal",
    autopay: body.autopay ? 1 : 0,
    account_id: body.account_id || null,
    accountId: body.account_id || null,
    active: 1,
    paid: 0,
    paid_date: null,
    paidDate: null,
  });
  return getCommitment(userId, id);
}

export async function updateCommitment(userId: string, body: Partial<Commitment> & { id: string }) {
  await collection(userId, COLLECTIONS.commitments).doc(body.id).set(
    {
      ...stampUpdate(),
      name: body.name,
      type: body.type,
      amount: Number(body.amount ?? 0),
      due_date: body.due_date,
      dueDate: body.due_date,
      recurrence_rule: body.recurrence_rule || null,
      recurrenceRule: body.recurrence_rule || null,
      priority: body.priority || "normal",
      autopay: body.autopay ? 1 : 0,
      account_id: body.account_id || null,
      accountId: body.account_id || null,
      active: body.active ?? 1,
      paid: body.paid ?? 0,
    },
    { merge: true }
  );
  return getCommitment(userId, body.id);
}

export async function deleteCommitment(userId: string, id: string) {
  const db = getFirebaseAdminFirestore();
  const batch = db.batch();
  for (const name of [COLLECTIONS.commitmentAllocations, COLLECTIONS.commitmentInstances]) {
    const snap = await collection(userId, name).where("commitment_id", "==", id).get();
    snap.docs.forEach((d) => batch.delete(d.ref));
  }
  const ledger = await collection(userId, COLLECTIONS.ledger).where("commitment_id", "==", id).get();
  ledger.docs.forEach((d) => batch.update(d.ref, { commitment_id: null, commitmentId: null, ...stampUpdate() }));
  batch.delete(collection(userId, COLLECTIONS.commitments).doc(id));
  await batch.commit();
}

export function instanceId(commitmentId: string, dueDate: string) {
  return `${commitmentId}_${dueDate}`;
}

export async function ensureInstance(userId: string, commitmentId: string, dueDate: string, plannedAmount: number) {
  const id = instanceId(commitmentId, dueDate);
  const ref = collection(userId, COLLECTIONS.commitmentInstances).doc(id);
  const existing = await ref.get();
  if (existing.exists) return id;

  await ref.set(
    {
      ...stampCreate(userId),
      commitment_id: commitmentId,
      commitmentId,
      due_date: dueDate,
      dueDate,
      original_due_date: dueDate,
      originalDueDate: dueDate,
      planned_amount: plannedAmount,
      plannedAmount,
      allocated_amount: 0,
      allocatedAmount: 0,
      remaining_amount: plannedAmount,
      remainingAmount: plannedAmount,
      status: "planned",
    }
  );
  return id;
}

export async function getInstance(userId: string, commitmentId: string, dueDate: string) {
  const snap = await collection(userId, COLLECTIONS.commitmentInstances).doc(instanceId(commitmentId, dueDate)).get();
  if (!snap.exists) return null;
  const instance = normalizeInstance(snap.id, snap.data()!);
  const commitment = await getCommitment(userId, instance.commitment_id);
  return { ...instance, commitment_name: commitment?.name, commitment_type: commitment?.type };
}

export async function listInstances(userId: string): Promise<CommitmentInstance[]> {
  const snap = await collection(userId, COLLECTIONS.commitmentInstances).get();
  return snap.docs.map((d) => normalizeInstance(d.id, d.data()));
}

export async function listInstancesForCommitment(userId: string, commitmentId: string, endDate: string) {
  const snap = await collection(userId, COLLECTIONS.commitmentInstances)
    .where("commitment_id", "==", commitmentId)
    .get();
  return snap.docs
    .map((d) => normalizeInstance(d.id, d.data()))
    .filter((i) => i.due_date <= endDate || i.original_due_date <= endDate)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

async function setInstanceAmounts(
  userId: string,
  id: string,
  planned: number,
  allocated: number,
  status?: CommitmentInstance["status"]
) {
  const newStatus = status ?? (allocated >= planned - 0.005 ? "paid" : allocated > 0.005 ? "partially_funded" : "planned");
  await collection(userId, COLLECTIONS.commitmentInstances).doc(id).set(
    {
      ...stampUpdate(),
      planned_amount: planned,
      plannedAmount: planned,
      allocated_amount: allocated,
      allocatedAmount: allocated,
      remaining_amount: planned - allocated,
      remainingAmount: planned - allocated,
      status: newStatus,
    },
    { merge: true }
  );
}

export async function updateInstancePlan(userId: string, commitmentId: string, dueDate: string, plannedAmount: number) {
  const commitment = await getCommitment(userId, commitmentId);
  if (!commitment) throw new Error("Commitment not found");
  const id = await ensureInstance(userId, commitmentId, dueDate, commitment.amount);
  const snap = await collection(userId, COLLECTIONS.commitmentInstances).doc(id).get();
  const inst = normalizeInstance(snap.id, snap.data()!);
  await setInstanceAmounts(userId, id, plannedAmount, inst.allocated_amount);
}

export async function updateCommitmentInstance(
  userId: string,
  input: {
    commitment_id: string;
    original_due_date: string;
    due_date: string;
    planned_amount: number;
    status: CommitmentInstance["status"];
    scope: "instance" | "future" | "template";
    name?: string;
  }
) {
  const commitment = await getCommitment(userId, input.commitment_id);
  if (!commitment) throw new Error("Commitment not found");
  if (!input.original_due_date || !input.due_date) throw new Error("Due dates are required");
  if (!Number.isFinite(input.planned_amount) || input.planned_amount < 0) throw new Error("planned_amount must be non-negative");

  if (input.scope === "template") {
    return updateCommitment(userId, {
      ...commitment,
      name: input.name?.trim() || commitment.name,
      amount: input.planned_amount,
      due_date: input.due_date,
    });
  }

  const id = await ensureInstance(userId, input.commitment_id, input.original_due_date, commitment.amount);
  const existingSnap = await collection(userId, COLLECTIONS.commitmentInstances).doc(id).get();
  const existing = existingSnap.exists ? normalizeInstance(existingSnap.id, existingSnap.data()!) : null;
  const allocated = existing?.allocated_amount ?? 0;
  await collection(userId, COLLECTIONS.commitmentInstances).doc(id).set(
    {
      ...stampUpdate(),
      due_date: input.due_date,
      dueDate: input.due_date,
      override_due_date: input.due_date === input.original_due_date ? null : input.due_date,
      overrideDueDate: input.due_date === input.original_due_date ? null : input.due_date,
      original_due_date: input.original_due_date,
      originalDueDate: input.original_due_date,
      planned_amount: input.planned_amount,
      plannedAmount: input.planned_amount,
      actual_amount: input.status === "paid" ? input.planned_amount : null,
      actualAmount: input.status === "paid" ? input.planned_amount : null,
      remaining_amount: input.planned_amount - allocated,
      remainingAmount: input.planned_amount - allocated,
      status: input.status,
      edited_from_template:
        input.due_date !== input.original_due_date ||
        Math.abs(input.planned_amount - commitment.amount) > 0.005 ||
        Boolean(input.name?.trim() && input.name.trim() !== commitment.name),
      editedFromTemplate:
        input.due_date !== input.original_due_date ||
        Math.abs(input.planned_amount - commitment.amount) > 0.005 ||
        Boolean(input.name?.trim() && input.name.trim() !== commitment.name),
      name_override: input.name?.trim() && input.name.trim() !== commitment.name ? input.name.trim() : null,
      nameOverride: input.name?.trim() && input.name.trim() !== commitment.name ? input.name.trim() : null,
      paid_date: input.status === "paid" ? format(new Date(), "yyyy-MM-dd") : null,
      paidDate: input.status === "paid" ? format(new Date(), "yyyy-MM-dd") : null,
    },
    { merge: true }
  );

  if (input.scope === "future") {
    await updateCommitment(userId, {
      ...commitment,
      name: input.name?.trim() || commitment.name,
      amount: input.planned_amount,
      due_date: input.due_date,
    });
  }

  return getInstance(userId, input.commitment_id, input.original_due_date);
}

async function adjustAccountBalance(userId: string, accountId: string, delta: number) {
  const account = await getAccount(userId, accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);
  await syncAccountBalance(userId, accountId, account.current_balance + delta);
}

async function applyAllocations(userId: string, ledgerId: string, allocs: AllocationInput[]) {
  for (const alloc of allocs) {
    const commitment = await getCommitment(userId, alloc.commitment_id);
    if (!commitment) throw new Error(`Commitment ${alloc.commitment_id} not found`);
    const id = await ensureInstance(userId, alloc.commitment_id, alloc.instance_due_date, commitment.amount);
    const inst = (await getInstance(userId, alloc.commitment_id, alloc.instance_due_date))!;
    const remaining = inst.planned_amount - inst.allocated_amount;
    if (alloc.amount > remaining + 0.005) {
      throw new Error(`Allocation of $${alloc.amount.toFixed(2)} exceeds remaining $${remaining.toFixed(2)} for commitment`);
    }
    const allocationId = randomUUID();
    await collection(userId, COLLECTIONS.commitmentAllocations).doc(allocationId).set({
      ...stampCreate(userId),
      ledger_id: ledgerId,
      ledgerId,
      instance_id: id,
      instanceId: id,
      commitment_id: alloc.commitment_id,
      commitmentId: alloc.commitment_id,
      amount: alloc.amount,
      note: alloc.note || null,
    });
    await setInstanceAmounts(userId, id, inst.planned_amount, inst.allocated_amount + alloc.amount);
  }
}

async function reverseAllocations(userId: string, ledgerId: string) {
  const snap = await collection(userId, COLLECTIONS.commitmentAllocations).where("ledger_id", "==", ledgerId).get();
  for (const doc of snap.docs) {
    const alloc = row<CommitmentAllocation>(doc.id, doc.data());
    const instRef = collection(userId, COLLECTIONS.commitmentInstances).doc(alloc.instance_id);
    const instSnap = await instRef.get();
    if (instSnap.exists) {
      const inst = normalizeInstance(instSnap.id, instSnap.data()!);
      await setInstanceAmounts(userId, inst.id, inst.planned_amount, Math.max(0, inst.allocated_amount - alloc.amount), "planned");
    }
    await doc.ref.delete();
  }
}

export async function listLedger(userId: string): Promise<LedgerEntry[]> {
  const [ledgerSnap, allocSnap, itemSnap, commitments] = await Promise.all([
    collection(userId, COLLECTIONS.ledger).get(),
    collection(userId, COLLECTIONS.commitmentAllocations).get(),
    collection(userId, COLLECTIONS.ledgerItems).get(),
    listCommitments(userId, false),
  ]);
  const names = new Map(commitments.map((c) => [c.id, c.name]));
  const allocsByLedger = new Map<string, CommitmentAllocation[]>();
  allocSnap.docs.forEach((d) => {
    const a = row<CommitmentAllocation>(d.id, d.data());
    const arr = allocsByLedger.get(a.ledger_id) ?? [];
    arr.push({ ...a, commitment_name: names.get(a.commitment_id) } as CommitmentAllocation & { commitment_name?: string });
    allocsByLedger.set(a.ledger_id, arr);
  });
  const itemsByLedger = new Map<string, LedgerItem[]>();
  itemSnap.docs.forEach((d) => {
    const item = row<LedgerItem>(d.id, d.data());
    const arr = itemsByLedger.get(item.ledger_id) ?? [];
    arr.push({ ...item, commitment_name: item.commitment_id ? names.get(item.commitment_id) : undefined });
    itemsByLedger.set(item.ledger_id, arr);
  });
  return ledgerSnap.docs
    .map((d) => normalizeLedger(d.id, d.data()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
    .map((entry) => ({ ...entry, allocations: allocsByLedger.get(entry.id) ?? [], items: itemsByLedger.get(entry.id) ?? [] }));
}

export async function createLedger(userId: string, input: {
  description: string;
  amount: number;
  type: LedgerEntry["type"];
  account_id: string;
  allocations?: AllocationInput[];
  items?: LedgerItemInput[];
}) {
  const id = randomUUID();
  const date = format(new Date(), "yyyy-MM-dd");
  await collection(userId, COLLECTIONS.ledger).doc(id).set({
    ...stampCreate(userId),
    date,
    description: input.description,
    amount: input.amount,
    type: input.type,
    account_id: input.account_id,
    accountId: input.account_id,
    commitment_id: null,
    commitmentId: null,
  });
  await adjustAccountBalance(userId, input.account_id, input.type === "income" ? input.amount : -input.amount);
  for (const item of input.items ?? []) {
    const itemId = randomUUID();
    await collection(userId, COLLECTIONS.ledgerItems).doc(itemId).set({
      ...stampCreate(userId),
      ledger_id: id,
      ledgerId: id,
      description: item.description,
      amount: item.amount,
      commitment_id: item.commitment_id || null,
      commitmentId: item.commitment_id || null,
      instance_due_date: item.instance_due_date || null,
      instanceDueDate: item.instance_due_date || null,
    });
  }
  await applyAllocations(userId, id, input.allocations ?? []);
  return id;
}

export async function updateLedger(userId: string, id: string, input: Partial<LedgerEntry> & { allocations?: AllocationInput[] }) {
  const existingSnap = await collection(userId, COLLECTIONS.ledger).doc(id).get();
  if (!existingSnap.exists) return false;
  const existing = normalizeLedger(existingSnap.id, existingSnap.data()!);
  const amount = input.amount ?? existing.amount;
  const type = input.type ?? existing.type;
  const accountId = input.account_id ?? existing.account_id;
  if (input.allocations) await reverseAllocations(userId, id);
  await adjustAccountBalance(userId, existing.account_id, -(existing.type === "income" ? existing.amount : -existing.amount));
  await collection(userId, COLLECTIONS.ledger).doc(id).set(
    {
      ...stampUpdate(),
      description: input.description ?? existing.description,
      amount,
      type,
      account_id: accountId,
      accountId,
    },
    { merge: true }
  );
  await adjustAccountBalance(userId, accountId, type === "income" ? amount : -amount);
  if (input.allocations) await applyAllocations(userId, id, input.allocations);
  return true;
}

export async function deleteLedger(userId: string, id: string) {
  const existingSnap = await collection(userId, COLLECTIONS.ledger).doc(id).get();
  if (!existingSnap.exists) return false;
  const existing = normalizeLedger(existingSnap.id, existingSnap.data()!);
  await reverseAllocations(userId, id);
  const items = await collection(userId, COLLECTIONS.ledgerItems).where("ledger_id", "==", id).get();
  await Promise.all(items.docs.map((d) => d.ref.delete()));
  await adjustAccountBalance(userId, existing.account_id, -(existing.type === "income" ? existing.amount : -existing.amount));
  await existingSnap.ref.delete();
  return true;
}

export async function getPlaidStatus(userId: string): Promise<PlaidStatus> {
  const [itemsSnap, accountsSnap] = await Promise.all([
    collection(userId, COLLECTIONS.plaidItems).orderBy("created_at").get(),
    collection(userId, COLLECTIONS.plaidAccounts).orderBy("name").get(),
  ]);

  return {
    items: itemsSnap.docs.map((d) => normalizePlaidItem(d.id, d.data())),
    accounts: accountsSnap.docs.map((d) => normalizePlaidAccount(d.id, d.data())),
  };
}

export async function savePlaidItem(
  userId: string,
  input: {
    itemId: string;
    encryptedAccessToken: string;
    institutionId?: string | null;
    institutionName?: string | null;
    availableProducts?: string[];
    billedProducts?: string[];
  }
) {
  await collection(userId, COLLECTIONS.plaidItems).doc(input.itemId).set(
    {
      ...stampCreate(userId),
      item_id: input.itemId,
      encrypted_access_token: input.encryptedAccessToken,
      institution_id: input.institutionId ?? null,
      institution_name: input.institutionName ?? null,
      available_products: input.availableProducts ?? [],
      billed_products: input.billedProducts ?? [],
      status: "connected",
      error_code: null,
      error_message: null,
      last_synced_at: null,
    },
    { merge: true }
  );
}

export async function listPlaidItemsWithTokens(userId: string) {
  const snap = await collection(userId, COLLECTIONS.plaidItems).get();
  return snap.docs.map((d) => ({
    ...normalizePlaidItem(d.id, d.data()),
    encrypted_access_token: String(d.data().encrypted_access_token ?? ""),
  }));
}

export async function getPlaidCursor(userId: string, itemId: string) {
  const snap = await collection(userId, COLLECTIONS.plaidSync).doc(itemId).get();
  return snap.exists ? ((snap.data()?.cursor ?? null) as string | null) : null;
}

export async function savePlaidSyncState(userId: string, itemId: string, cursor: string | null) {
  await collection(userId, COLLECTIONS.plaidSync).doc(itemId).set(
    {
      ...stampUpdate(),
      item_id: itemId,
      cursor,
      last_synced_at: new Date().toISOString(),
    },
    { merge: true }
  );
  await collection(userId, COLLECTIONS.plaidItems).doc(itemId).set(
    { ...stampUpdate(), last_synced_at: new Date().toISOString(), status: "connected", error_code: null, error_message: null },
    { merge: true }
  );
}

export async function markPlaidItemError(userId: string, itemId: string, code: string, message: string) {
  await collection(userId, COLLECTIONS.plaidItems).doc(itemId).set(
    { ...stampUpdate(), status: "error", error_code: code, error_message: message },
    { merge: true }
  );
}

function mapPlaidAccountType(type?: string | null, subtype?: string | null): Account["type"] {
  if (type === "credit") return "credit";
  if (subtype === "savings") return "savings";
  return "checking";
}

export async function upsertPlaidAccount(
  userId: string,
  input: {
    plaidAccountId: string;
    plaidItemId: string;
    name: string;
    officialName?: string | null;
    mask?: string | null;
    type?: string | null;
    subtype?: string | null;
    currentBalance: number;
    availableBalance?: number | null;
    isoCurrencyCode?: string | null;
  }
) {
  const plaidRef = collection(userId, COLLECTIONS.plaidAccounts).doc(input.plaidAccountId);
  const existingPlaid = await plaidRef.get();
  let appAccountId = existingPlaid.exists ? String(existingPlaid.data()?.app_account_id ?? "") : "";

  if (!appAccountId) {
    const existingMapped = await collection(userId, COLLECTIONS.accounts)
      .where("plaid_account_id", "==", input.plaidAccountId)
      .limit(1)
      .get();
    appAccountId = existingMapped.docs[0]?.id ?? "";
  }

  if (!appAccountId) {
    const byName = await collection(userId, COLLECTIONS.accounts)
      .where("name", "==", input.name)
      .limit(1)
      .get();
    appAccountId = byName.docs[0]?.id ?? randomUUID();
  }

  const appAccountExists = (await collection(userId, COLLECTIONS.accounts).doc(appAccountId).get()).exists;
  await collection(userId, COLLECTIONS.accounts).doc(appAccountId).set(
    {
      ...(appAccountExists ? stampUpdate() : { ...stampCreate(userId), is_reserve: 0, isReserve: false }),
      name: input.name,
      type: mapPlaidAccountType(input.type, input.subtype),
      current_balance: input.currentBalance,
      currentBalance: input.currentBalance,
      plaid_account_id: input.plaidAccountId,
      plaidAccountId: input.plaidAccountId,
      plaid_item_id: input.plaidItemId,
      plaidItemId: input.plaidItemId,
    },
    { merge: true }
  );

  await plaidRef.set(
    {
      ...stampUpdate(),
      ownerId: userId,
      plaid_account_id: input.plaidAccountId,
      plaid_item_id: input.plaidItemId,
      app_account_id: appAccountId,
      name: input.name,
      official_name: input.officialName ?? null,
      mask: input.mask ?? null,
      type: input.type ?? null,
      subtype: input.subtype ?? null,
      current_balance: input.currentBalance,
      available_balance: input.availableBalance ?? null,
      iso_currency_code: input.isoCurrencyCode ?? null,
    },
    { merge: true }
  );

  return appAccountId;
}

export async function upsertPlaidLedgerTransaction(
  userId: string,
  input: {
    plaidTransactionId: string;
    plaidAccountId: string;
    appAccountId: string;
    date: string;
    name: string;
    amount: number;
    pending: boolean;
  }
) {
  const existing = await collection(userId, COLLECTIONS.ledger)
    .where("plaid_transaction_id", "==", input.plaidTransactionId)
    .limit(1)
    .get();
  const id = existing.docs[0]?.id ?? randomUUID();
  const existingData = existing.docs[0]?.data();
  const signedAmount = Math.abs(input.amount);
  const type: LedgerEntry["type"] = input.amount < 0 ? "income" : "expense";

  await collection(userId, COLLECTIONS.ledger).doc(id).set(
    {
      ...(existingData ? stampUpdate() : stampCreate(userId)),
      date: input.date,
      description: input.name,
      amount: signedAmount,
      type,
      account_id: input.appAccountId,
      accountId: input.appAccountId,
      commitment_id: existingData?.commitment_id ?? null,
      commitmentId: existingData?.commitmentId ?? null,
      plaid_transaction_id: input.plaidTransactionId,
      plaidTransactionId: input.plaidTransactionId,
      plaid_account_id: input.plaidAccountId,
      pending: input.pending,
      removed: false,
      source: "plaid",
    },
    { merge: true }
  );

  return existing.empty ? "added" : "modified";
}

export async function markPlaidLedgerTransactionRemoved(userId: string, plaidTransactionId: string) {
  const snap = await collection(userId, COLLECTIONS.ledger)
    .where("plaid_transaction_id", "==", plaidTransactionId)
    .get();
  await Promise.all(
    snap.docs.map((d) =>
      d.ref.set({ ...stampUpdate(), removed: true, removed_at: new Date().toISOString() }, { merge: true })
    )
  );
  return snap.size;
}

export async function resetUserData(userId: string) {
  for (const name of Object.values(COLLECTIONS)) {
    const snap = await collection(userId, name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

export async function listRecurringCommitmentsForTrends(userId: string, commitmentId?: string) {
  const commitments = commitmentId
    ? (await getCommitment(userId, commitmentId))
      ? [(await getCommitment(userId, commitmentId))!]
      : []
    : (await listCommitments(userId)).filter((c) => c.recurrence_rule);
  return commitments.map((c) => ({ id: c.id, name: c.name, type: c.type, recurrence_rule: c.recurrence_rule }));
}

export async function listInstancesForTrendPeriod(userId: string, commitmentId: string, start: string, end: string) {
  const snap = await collection(userId, COLLECTIONS.commitmentInstances)
    .where("commitment_id", "==", commitmentId)
    .get();
  return snap.docs
    .map((d) => normalizeInstance(d.id, d.data()))
    .filter((i) => i.due_date >= start && i.due_date <= end);
}

export async function markCommitmentPaid(userId: string, id: string, actualAmount: number, instanceDueDate?: string, note?: string, accountIdOverride?: string) {
  const commitment = await getCommitment(userId, id);
  if (!commitment) throw new Error("not found");
  const accountId = accountIdOverride || commitment.account_id;
  if (!accountId) throw new Error("No account linked. Please select an account for this payment.");
  const paidDate = format(new Date(), "yyyy-MM-dd");
  const dueDate = instanceDueDate || commitment.due_date;
  if (commitment.type === "income") {
    await updateInstancePlan(userId, commitment.id, dueDate, actualAmount);
  }
  const ledgerId = await createLedger(userId, {
    description: note ? `${commitment.name}: ${note}` : commitment.name,
    amount: actualAmount,
    type: commitment.type === "income" ? "income" : "expense",
    account_id: accountId,
    items: [{ description: note || commitment.name, amount: actualAmount, commitment_id: commitment.id, instance_due_date: dueDate }],
  });
  await applyAllocations(userId, ledgerId, [{ commitment_id: commitment.id, instance_due_date: dueDate, amount: actualAmount, note }]);
  const inst = await getInstance(userId, commitment.id, dueDate);
  if (inst?.status === "paid" || inst?.status === "funded") {
    const { advanceByRule } = await import("@/lib/instances");
    const { parseISO } = await import("date-fns");
    if (commitment.recurrence_rule) {
      const next = format(advanceByRule(parseISO(commitment.due_date), commitment.recurrence_rule), "yyyy-MM-dd");
      await collection(userId, COLLECTIONS.commitments).doc(id).set(
        { ...stampUpdate(), due_date: next, dueDate: next, paid: 0, actual_amount: null, actualAmount: null, paid_date: null, paidDate: null },
        { merge: true }
      );
    } else {
      await collection(userId, COLLECTIONS.commitments).doc(id).set(
        { ...stampUpdate(), paid: 1, actual_amount: actualAmount, actualAmount: actualAmount, paid_date: paidDate, paidDate },
        { merge: true }
      );
    }
  }
}

export async function advanceCommitment(userId: string, id: string, instanceDueDate?: string, rolloverLeftover = false) {
  const commitment = await getCommitment(userId, id);
  if (!commitment) throw new Error("not found");
  const dueDate = instanceDueDate || commitment.due_date;
  const instId = await ensureInstance(userId, commitment.id, dueDate, commitment.amount);
  const inst = (await getInstance(userId, commitment.id, dueDate))!;
  await setInstanceAmounts(userId, instId, inst.planned_amount, inst.allocated_amount, "paid");
  if (commitment.recurrence_rule) {
    const { advanceByRule } = await import("@/lib/instances");
    const { parseISO } = await import("date-fns");
    const nextDate = format(advanceByRule(parseISO(commitment.due_date), commitment.recurrence_rule), "yyyy-MM-dd");
    if (rolloverLeftover) {
      const leftover = inst.planned_amount - inst.allocated_amount;
      if (leftover > 0.005) {
        const nextId = await ensureInstance(userId, commitment.id, nextDate, commitment.amount);
        const next = (await getInstance(userId, commitment.id, nextDate))!;
        await setInstanceAmounts(userId, nextId, next.planned_amount + leftover, next.allocated_amount);
      }
    }
    await collection(userId, COLLECTIONS.commitments).doc(id).set(
      { ...stampUpdate(), due_date: nextDate, dueDate: nextDate, paid: 0, actual_amount: null, actualAmount: null, paid_date: null, paidDate: null },
      { merge: true }
    );
  } else {
    await collection(userId, COLLECTIONS.commitments).doc(id).set(
      { ...stampUpdate(), paid: 1, paid_date: format(new Date(), "yyyy-MM-dd") },
      { merge: true }
    );
  }
}
