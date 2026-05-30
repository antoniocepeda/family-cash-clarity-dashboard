import { NextRequest, NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { withAuth } from "@/lib/auth";
import { getAuthorizedEmails } from "@/lib/authorized-users";
import { getPlaidStatus } from "@/lib/repositories/firestore";

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  const plaidStatus = await getPlaidStatus(user.uid);
  const firebaseProjectId =
    process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null;

  const debug = {
    user: {
      uid: user.uid,
      email: user.email ?? null,
      issuer: user.iss ?? null,
      audience: user.aud ?? null,
    },
    auth: {
      authorizedEmails: getAuthorizedEmails(),
    },
    firebase: {
      projectId: firebaseProjectId,
      adminCredentialMode:
        process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
          ? "service-account-env"
          : "application-default",
    },
    plaid: {
      env: process.env.PLAID_ENV ?? null,
      configured: Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
      linkedItemCount: plaidStatus.items.length,
      linkedAccountCount: plaidStatus.accounts.length,
      itemStatuses: plaidStatus.items.map((item) => ({
        item_id: item.item_id,
        institution_name: item.institution_name,
        status: item.status,
        error_code: item.error_code,
        has_error_message: Boolean(item.error_message),
        last_synced_at: item.last_synced_at,
      })),
    },
  };

  return NextResponse.json(debug);
}

export const GET = withAuth(handleGET);

