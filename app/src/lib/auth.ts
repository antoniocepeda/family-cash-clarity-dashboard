import { DecodedIdToken } from "firebase-admin/auth";
import { NextRequest, NextResponse } from "next/server";
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
  return async function authedRoute(req: NextRequest, context = {} as Context) {
    const user = await verifyAuthToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return handler(req, { ...context, user });
  };
}
