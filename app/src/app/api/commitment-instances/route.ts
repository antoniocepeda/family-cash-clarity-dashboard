import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getEligibleInstances } from "@/lib/instances";
import { updateCommitmentInstance, updateInstancePlan } from "@/lib/repositories/firestore";
import { CommitmentInstance } from "@/lib/types";
import type { DecodedIdToken } from "firebase-admin/auth";

const statuses = new Set(["planned", "paid", "partially_funded", "deferred", "skipped", "overdue", "open", "funded"]);
const scopes = new Set(["instance", "future", "template"]);

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  return NextResponse.json(await getEligibleInstances(user.uid));
}

async function handlePATCH(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { commitment_id, due_date, original_due_date, planned_amount, status, scope, name } = await req.json();
  if (!commitment_id || !due_date || planned_amount === undefined) {
    return NextResponse.json({ error: "commitment_id, due_date, and planned_amount required" }, { status: 400 });
  }
  if (typeof planned_amount !== "number" || planned_amount < 0) {
    return NextResponse.json({ error: "planned_amount must be a non-negative number" }, { status: 400 });
  }
  try {
    if (original_due_date || status || scope) {
      const editStatus = (status ?? "planned") as CommitmentInstance["status"];
      const editScope = (scope ?? "instance") as "instance" | "future" | "template";
      if (!statuses.has(editStatus)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      if (!scopes.has(editScope)) return NextResponse.json({ error: "Invalid edit scope" }, { status: 400 });
      const result = await updateCommitmentInstance(user.uid, {
        commitment_id,
        original_due_date: original_due_date || due_date,
        due_date,
        planned_amount,
        status: editStatus,
        scope: editScope,
        name,
      });
      return NextResponse.json(result ?? { success: true });
    }
    await updateInstancePlan(user.uid, commitment_id, due_date, planned_amount);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: message === "Commitment not found" ? 404 : 400 });
  }
}

async function handleDELETE(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { commitment_id, due_date, original_due_date, planned_amount, name } = await req.json();
  if (!commitment_id || !due_date) {
    return NextResponse.json({ error: "commitment_id and due_date required" }, { status: 400 });
  }

  try {
    const result = await updateCommitmentInstance(user.uid, {
      commitment_id,
      original_due_date: original_due_date || due_date,
      due_date,
      planned_amount: typeof planned_amount === "number" && planned_amount >= 0 ? planned_amount : 0,
      status: "skipped",
      scope: "instance",
      name,
    });
    return NextResponse.json(result ?? { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: message === "Commitment not found" ? 404 : 400 });
  }
}

export const GET = withAuth(handleGET);
export const PATCH = withAuth(handlePATCH);
export const DELETE = withAuth(handleDELETE);
