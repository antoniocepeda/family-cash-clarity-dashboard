import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { generateAlerts } from "@/lib/projection";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  return NextResponse.json(await generateAlerts(user.uid));
}

export const GET = withAuth(handleGET);
