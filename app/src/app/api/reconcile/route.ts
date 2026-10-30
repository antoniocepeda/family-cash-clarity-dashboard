import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { listReconcilePromptDocs } from "@/lib/repositories/firestore";
import { reconcileOpenBills, resolveReconcileChoice } from "@/lib/upkeep";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  const prompts = (await listReconcilePromptDocs(user.uid)).filter((prompt) => prompt.status === "open");
  return NextResponse.json({ prompts });
}

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "run";
  try {
    if (action === "resolve") {
      if (!body.promptId || !body.choiceId) {
        return NextResponse.json({ error: "promptId and choiceId required" }, { status: 400 });
      }
      return NextResponse.json(await resolveReconcileChoice(user.uid, body.promptId, body.choiceId));
    }
    if (action !== "run") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    return NextResponse.json(await reconcileOpenBills(user.uid));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reconcile failed";
    const status = message === "Prompt not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export const GET = withAuth(handleGET, { allowAgent: true });
export const POST = withAuth(handlePOST, { allowAgent: true });
