import { NextRequest, NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { withAuth } from "@/lib/auth";
import { ensureUser } from "@/lib/repositories/firestore";
import { getPlaidClient } from "@/lib/plaid";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePOST(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);

  const plaid = getPlaidClient();
  const response = await plaid.linkTokenCreate({
    user: { client_user_id: user.uid },
    client_name: "Family Cash Clarity Dashboard",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
  });

  return NextResponse.json({ link_token: response.data.link_token, expiration: response.data.expiration });
}

export const POST = withAuth(handlePOST);
