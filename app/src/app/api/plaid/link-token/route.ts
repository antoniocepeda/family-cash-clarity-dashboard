import { NextRequest, NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { withAuth } from "@/lib/auth";
import { ensureUser } from "@/lib/repositories/firestore";
import { getPlaidClient } from "@/lib/plaid";
import { PlaidConfigurationError } from "@/lib/server-config";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePOST(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);

  try {
    const plaid = getPlaidClient();
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: user.uid },
      client_name: "Family Cash Clarity Dashboard",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({ link_token: response.data.link_token, expiration: response.data.expiration });
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

    if (typeof err === "object" && err !== null && "response" in err) {
      const plaidError = err as {
        response?: { status?: number; data?: { error_code?: string; error_message?: string } };
      };
      const errorCode = plaidError.response?.data?.error_code;
      const errorMessage = plaidError.response?.data?.error_message;

      console.error("Plaid link token error:", {
        status: plaidError.response?.status,
        errorCode,
        errorMessage,
      });

      return NextResponse.json(
        {
          error:
            errorMessage ||
            "Plaid rejected the Link token request. Check that PLAID_ENV matches the configured Plaid secret.",
          code: errorCode,
        },
        { status: plaidError.response?.status === 400 ? 400 : 502 },
      );
    }

    throw err;
  }
}

export const POST = withAuth(handlePOST);
