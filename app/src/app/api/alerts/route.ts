import { NextResponse } from "next/server";
import { generateAlerts } from "@/lib/projection";

export async function GET() {
  const alerts = generateAlerts();
  return NextResponse.json(alerts);
}
