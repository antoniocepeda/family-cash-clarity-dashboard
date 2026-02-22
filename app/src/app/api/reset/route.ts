import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST() {
  const db = getDb();

  // Drop legacy tables from pre-rename schema
  db.exec("DROP TABLE IF EXISTS event_allocations");
  db.exec("DROP TABLE IF EXISTS event_instances");
  db.exec("DROP TABLE IF EXISTS event_history");
  db.exec("DROP TABLE IF EXISTS events");

  // Clear current tables in FK-safe order
  db.prepare("DELETE FROM commitment_allocations").run();
  db.prepare("DELETE FROM commitment_instances").run();
  db.prepare("DELETE FROM ledger").run();
  db.prepare("DELETE FROM commitment_history").run();
  db.prepare("DELETE FROM commitments").run();
  db.prepare("DELETE FROM accounts").run();
  db.prepare("DELETE FROM alerts").run();
  db.prepare("DELETE FROM projection_snapshots").run();
  return NextResponse.json({ success: true, message: "All data cleared" });
}
