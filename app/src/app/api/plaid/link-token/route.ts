import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { readPlaidErrorFields, redactSecrets } from "@/lib/plaid-errors";
import { buildLinkTokenCreateRequest, parseLinkTokenBody, PlaidRequestError } from "@/lib/plaid-link";
import { decryptPlaidAccessToken, getPlaidClient } from "@/lib/plaid";
import { ensureUser, getPlaidItemWithToken } from "@/lib/repositories/firestore";
import { PlaidConfigurationError } from "@/lib/server-config";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);

  let itemId: string | null = null;
  try {
    itemId = parseLinkTokenBody(await req.text()).itemId;
  } catch (err) {
    if (err instanceof PlaidRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  try {
    const plaid = getPlaidClient();
    let accessToken: string | undefined;
    if (itemId) {
      const item = await getPlaidItemWithToken(user.uid, itemId);
      if (!item) {
        return NextResponse.json({ error: "Linked bank not found" }, { status: 404 });
      }
      if (!item.encrypted_access_token) {
        return NextResponse.json({ error: "This bank connection needs to be created again." }, { status: 409 });
      }
      try {
        accessToken = decryptPlaidAccessToken(item.encrypted_access_token);
      } catch {
        console.error("Plaid token decrypt failed", { item_id: itemId });
        return NextResponse.json({ error: "This bank connection needs to be created again." }, { status: 409 });
      }
    }

    const response = await plaid.linkTokenCreate(buildLinkTokenCreateRequest(user.uid, accessToken));

    return NextResponse.json({
      link_token: response.data.link_token,
      expiration: response.data.expiration,
      mode: accessToken ? "update" : "create",
    });
  } catch (err) {
    if (err instanceof PlaidConfigurationError) {
      console.error("Plaid configuration error:", err.message);
      return NextResponse.json(
        {
          error:
            "Plaid is not configured on the server. Check the deployed Plaid secrets and redeploy.",
        },
        { status: 503 },
      );
    }

    const plaidError = readPlaidErrorFields(err);
    if (plaidError) {
      const errorMessage = plaidError.error_message ? redactSecrets(plaidError.error_message) : null;
      console.error("Plaid link token error:", {
        status: plaidError.status,
        errorCode: plaidError.error_code,
        errorMessage,
      });

      return NextResponse.json(
        {
          error:
            errorMessage ||
            "Plaid rejected the Link token request. Check that PLAID_ENV matches the configured Plaid secret.",
          code: plaidError.error_code,
        },
        { status: plaidError.status === 400 ? 400 : 502 },
      );
    }

    throw err;
  }
}

export const POST = withAuth(handlePOST);
