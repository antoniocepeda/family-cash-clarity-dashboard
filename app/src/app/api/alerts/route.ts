import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { generateAlerts } from "@/lib/projection";

async function handleGET() {
  const alerts = generateAlerts();
  return NextResponse.json(alerts);
}

export const GET = withAuth(handleGET);
