import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST() {
  const db = getDb();
  db.prepare("DELETE FROM events").run();
  db.prepare("DELETE FROM accounts").run();
  db.prepare("DELETE FROM alerts").run();
  db.prepare("DELETE FROM projection_snapshots").run();
  return NextResponse.json({ success: true, message: "All data cleared" });
}
