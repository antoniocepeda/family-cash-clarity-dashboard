import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { encryptPlaidAccessToken, getPlaidClient } from "@/lib/plaid";
import { ensureUser, savePlaidItem } from "@/lib/repositories/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

type LinkMetadata = {
  institution?: {
    institution_id?: string;
    name?: string;
  } | null;
};

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);
  const { public_token, metadata } = (await req.json()) as {
    public_token?: string;
    metadata?: LinkMetadata;
  };

  if (!public_token) {
    return NextResponse.json({ error: "public_token required" }, { status: 400 });
  }

  const plaid = getPlaidClient();
  const exchange = await plaid.itemPublicTokenExchange({ public_token });
  const item = await plaid.itemGet({ access_token: exchange.data.access_token });

  await savePlaidItem(user.uid, {
    itemId: exchange.data.item_id,
    encryptedAccessToken: encryptPlaidAccessToken(exchange.data.access_token),
    institutionId: metadata?.institution?.institution_id ?? item.data.item.institution_id ?? null,
    institutionName: metadata?.institution?.name ?? null,
    availableProducts: item.data.item.available_products ?? [],
    billedProducts: item.data.item.billed_products ?? [],
  });

  return NextResponse.json({ item_id: exchange.data.item_id, status: "connected" }, { status: 201 });
}

export const POST = withAuth(handlePOST);
