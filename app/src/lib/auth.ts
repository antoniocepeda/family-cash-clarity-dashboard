import "server-only";

import { DecodedIdToken } from "firebase-admin/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  buildRequestAuditSummary,
  configuredAgentKey,
  decideAgentCredential,
  isPublicReadEnabled,
} from "@/lib/agent-auth";
import { getAuthorizedEmails, isAuthorizedEmail } from "@/lib/authorized-users";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { recordAgentAudit } from "@/lib/repositories/firestore";

export type AuthedRequestContext = {
  user: DecodedIdToken;
  params?: Promise<Record<string, string | string[] | undefined>>;
};

type AuthedHandler<Context extends object> = (
  req: NextRequest,
  context: Context & { user: DecodedIdToken }
) => Promise<Response> | Response;

type NextRouteHandler = (req: NextRequest, context?: unknown) => Promise<Response>;

type RouteAuthOptions = {
  /** When true, a valid AGENT_API_KEY acts as the household owner. Default false. */
  allowAgent?: boolean;
  /** When true, anonymous reads are allowed only if ALLOW_PUBLIC_READ=true. */
  allowPublicRead?: boolean;
};

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UNCONFIGURED_OWNER_UID = "SET_TO_HOUSEHOLD_OWNER_FIREBASE_UID";

export async function verifyAuthToken(req: NextRequest): Promise<DecodedIdToken | null> {
  const header = req.headers.get("authorization");
  const match = header?.match(/^Bearer (.+)$/i);
  if (!match) return getLocalDevelopmentUser();

  try {
    return await getFirebaseAdminAuth().verifyIdToken(match[1]);
  } catch (err) {
    console.error("Firebase token verification failed:", err instanceof Error ? err.message : "unknown error");
    return decodeLocalDevelopmentToken(match[1]) ?? getLocalDevelopmentUser();
  }
}

async function getHouseholdOwnerUser(provider: "public-read" | "agent-api-key"): Promise<DecodedIdToken | null> {
  let uid = process.env.PUBLIC_DATA_OWNER_UID?.trim();
  let email: string | undefined;

  if (!uid || uid === UNCONFIGURED_OWNER_UID) {
    email = getAuthorizedEmails()[0];
    if (!email) return null;
    try {
      uid = (await getFirebaseAdminAuth().getUserByEmail(email)).uid;
    } catch (err) {
      console.error("Could not resolve household owner from authorized email:", err instanceof Error ? err.message : "unknown error");
      return null;
    }
  }

  const now = Math.floor(Date.now() / 1000);
  return {
    uid,
    email,
    email_verified: true,
    aud: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? provider,
    auth_time: now,
    exp: now + 3600,
    firebase: { sign_in_provider: provider },
    iat: now,
    iss: provider,
    sub: uid,
  } as DecodedIdToken;
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
    console.error("Development token decode failed:", err instanceof Error ? err.message : "unknown error");
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

function readAgentCredential(req: NextRequest) {
  return decideAgentCredential({
    agentKeyHeaderPresent: req.headers.has("x-agent-key"),
    agentKeyHeader: req.headers.get("x-agent-key"),
    authorizationHeader: req.headers.get("authorization"),
    configuredKey: configuredAgentKey(process.env.AGENT_API_KEY),
  });
}

async function safeRecordAgentAudit(userId: string, req: NextRequest, summary: string, status: number) {
  try {
    await recordAgentAudit(userId, {
      method: req.method,
      route: new URL(req.url).pathname,
      summary,
      status,
    });
  } catch (err) {
    console.error("Agent audit write failed:", {
      method: req.method,
      path: new URL(req.url).pathname,
      error: err instanceof Error ? err.message : "unknown error",
    });
  }
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function executeAuthed<Context extends object>(
  req: NextRequest,
  context: Context | undefined,
  handler: AuthedHandler<Context>,
  options: RouteAuthOptions
): Promise<Response> {
  try {
    const credential = readAgentCredential(req);
    let user: DecodedIdToken | null = null;
    let via: "agent" | "firebase" | "public" | null = null;

    if (credential === "reject") return unauthorized();

    if (credential === "match") {
      if (!options.allowAgent) return unauthorized();
      user = await getHouseholdOwnerUser("agent-api-key");
      if (!user) {
        return NextResponse.json({ error: "Household owner is not configured" }, { status: 503 });
      }
      via = "agent";
    } else {
      const firebaseUser = await verifyAuthToken(req);
      if (firebaseUser) {
        if (!isAuthorizedEmail(firebaseUser.email)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        user = firebaseUser;
        via = "firebase";
      } else if (options.allowPublicRead && isPublicReadEnabled(process.env.ALLOW_PUBLIC_READ)) {
        user = await getHouseholdOwnerUser("public-read");
        if (!user) {
          return NextResponse.json({ error: "Public data is not configured" }, { status: 503 });
        }
        via = "public";
      }
    }

    if (!user || !via) return unauthorized();

    const shouldAudit = via === "agent" && WRITE_METHODS.has(req.method);
    const summary = shouldAudit ? await buildRequestAuditSummary(req) : "";

    let response: Response;
    try {
      response = await handler(req, { ...(context ?? ({} as Context)), user });
    } catch (err) {
      if (shouldAudit) await safeRecordAgentAudit(user.uid, req, summary, 500);
      throw err;
    }

    if (shouldAudit) await safeRecordAgentAudit(user.uid, req, summary, response.status);
    return response;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Authenticated API route failed:", {
      method: req.method,
      path: new URL(req.url).pathname,
      error: errorMessage,
    });

    return NextResponse.json(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV === "development" ? { detail: errorMessage } : {}),
      },
      { status: 500 }
    );
  }
}

export function withAuth<Context extends object = object>(
  handler: AuthedHandler<Context>,
  options?: RouteAuthOptions
) {
  return (async function authedRoute(req: NextRequest, context?: Context) {
    return executeAuthed(req, context, handler, { allowAgent: options?.allowAgent === true });
  }) as unknown as NextRouteHandler;
}

/**
 * Household read route. Firebase users and, when configured, the agent key can read.
 * Anonymous visitors can read only when ALLOW_PUBLIC_READ=true.
 */
export function withPublicRead<Context extends object = object>(handler: AuthedHandler<Context>) {
  return (async function publicReadRoute(req: NextRequest, context?: Context) {
    return executeAuthed(req, context, handler, { allowAgent: true, allowPublicRead: true });
  }) as unknown as NextRouteHandler;
}
