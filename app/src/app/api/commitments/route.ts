import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createCommitment, deleteCommitment, listCommitments, updateCommitment } from "@/lib/repositories/firestore";
import { getAllInstancesForCommitments } from "@/lib/instances";
import { CommitmentInstance } from "@/lib/types";
import { addDays, startOfDay } from "date-fns";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  const includeInactive = new URL(_req.url).searchParams.get("include_inactive") === "1";
  const commitments = await listCommitments(user.uid, !includeInactive);
  const allInstances = await getAllInstancesForCommitments(user.uid, addDays(startOfDay(new Date()), 28));
  const instanceMap = new Map<string, CommitmentInstance[]>();
  for (const inst of allInstances) {
    const arr = instanceMap.get(inst.commitment_id) || [];
    arr.push(inst);
    instanceMap.set(inst.commitment_id, arr);
  }
  return NextResponse.json(commitments.map((c) => ({ ...c, instances: instanceMap.get(c.id) || [] })));
}

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const commitment = await createCommitment(user.uid, await req.json());
  return NextResponse.json(commitment, { status: 201 });
}

async function handlePUT(req: NextRequest, { user }: { user: DecodedIdToken }) {
  return NextResponse.json(await updateCommitment(user.uid, await req.json()));
}

async function handleDELETE(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteCommitment(user.uid, id);
  return NextResponse.json({ success: true });
}

export const GET = withAuth(handleGET);
export const POST = withAuth(handlePOST);
export const PUT = withAuth(handlePUT);
export const DELETE = withAuth(handleDELETE);
