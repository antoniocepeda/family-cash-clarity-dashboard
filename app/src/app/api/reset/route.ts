import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { resetUserData } from "@/lib/repositories/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePOST(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  await resetUserData(user.uid);
  return NextResponse.json({ success: true, message: "All data cleared" });
}

export const POST = withAuth(handlePOST);
