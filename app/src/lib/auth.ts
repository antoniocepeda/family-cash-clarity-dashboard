import { DecodedIdToken } from "firebase-admin/auth";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedEmail } from "@/lib/authorized-users";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

export type AuthedRequestContext = {
  user: DecodedIdToken;
  params?: Promise<Record<string, string | string[] | undefined>>;
};

type AuthedHandler<Context extends object> = (
  req: NextRequest,
  context: Context & { user: DecodedIdToken }
) => Promise<Response> | Response;

export async function verifyAuthToken(req: NextRequest): Promise<DecodedIdToken | null> {
  const header = req.headers.get("authorization");
  const match = header?.match(/^Bearer (.+)$/i);
  if (!match) return null;

  try {
    return await getFirebaseAdminAuth().verifyIdToken(match[1]);
  } catch (err) {
    console.error("Firebase token verification failed:", err);
    return null;
  }
}

export function withAuth<Context extends object = object>(handler: AuthedHandler<Context>) {
  return async function authedRoute(req: NextRequest, context?: Context) {
    try {
      const user = await verifyAuthToken(req);
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!isAuthorizedEmail(user.email)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return await handler(req, { ...(context ?? ({} as Context)), user });
    } catch (err) {
      console.error("Authenticated API route failed:", {
        method: req.method,
        path: new URL(req.url).pathname,
        error: err instanceof Error ? err.message : String(err),
      });

      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
