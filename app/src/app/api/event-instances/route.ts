import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEligibleInstances } from "@/lib/instances";

export async function GET() {
  const db = getDb();
  const instances = getEligibleInstances(db);
  return NextResponse.json(instances);
}
