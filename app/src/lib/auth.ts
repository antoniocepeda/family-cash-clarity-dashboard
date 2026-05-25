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
  if (!match) return getLocalDevelopmentUser();

  try {
    return await getFirebaseAdminAuth().verifyIdToken(match[1]);
  } catch (err) {
    console.error("Firebase token verification failed:", err);
    return decodeLocalDevelopmentToken(match[1]) ?? getLocalDevelopmentUser();
  }
}

function decodeLocalDevelopmentToken(token: string): DecodedIdToken | null {
  if (process.env.NODE_ENV !== "development") return null;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);

    if (payload.aud !== projectId || payload.exp < now || payload.iss !== `https://securetoken.google.com/${projectId}`) {
      return null;
    }

    console.warn("Using development-only Firebase token decode. Configure Firebase Admin credentials before deploying.");

    return {
      ...payload,
      uid: payload.sub,
      email: payload.email,
      email_verified: Boolean(payload.email_verified),
      auth_time: Number(payload.auth_time ?? payload.iat ?? now),
      iat: Number(payload.iat ?? now),
      exp: Number(payload.exp),
      firebase: payload.firebase ?? { sign_in_provider: "unknown" },
    } as DecodedIdToken;
  } catch (err) {
    console.error("Development token decode failed:", err);
    return null;
  }
}

function getLocalDevelopmentUser(): DecodedIdToken | null {
  if (process.env.NODE_ENV !== "development") return null;

  const email = process.env.NEXT_PUBLIC_AUTHORIZED_EMAILS?.split(",")[0]?.trim() || "antonio@htxwebworks.com";

  console.warn("Using development-only local auth fallback. Configure Firebase Admin credentials before deploying.");

  return {
    uid: `local-dev:${email}`,
    email,
    email_verified: true,
    aud: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "local-dev",
    auth_time: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: { sign_in_provider: "local-dev" },
    iat: Math.floor(Date.now() / 1000),
    iss: "local-dev",
    sub: `local-dev:${email}`,
  } as DecodedIdToken;
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
