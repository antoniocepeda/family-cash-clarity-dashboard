import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createAccount, deleteAccount, ensureUser, listAccounts, updateAccount } from "@/lib/repositories/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);
  return NextResponse.json(await listAccounts(user.uid));
}

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);
  const account = await createAccount(user.uid, await req.json());
  return NextResponse.json(account, { status: 201 });
}

async function handlePUT(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const account = await updateAccount(user.uid, await req.json());
  return NextResponse.json(account);
}

async function handleDELETE(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteAccount(user.uid, id);
  return NextResponse.json({ success: true });
}

export const GET = withAuth(handleGET);
export const POST = withAuth(handlePOST);
export const PUT = withAuth(handlePUT);
export const DELETE = withAuth(handleDELETE);
