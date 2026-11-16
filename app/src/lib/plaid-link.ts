import type { CountryCode, LinkTokenCreateRequest, Products } from "plaid";

export const PLAID_LINK_CLIENT_NAME = "Family Cash Clarity Dashboard";

const ITEM_ID = /^[A-Za-z0-9_-]{1,128}$/;

export class PlaidRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PlaidRequestError";
    this.status = status;
  }
}

/**
 * New connections ask for transactions. Update mode passes the existing item's
 * access token and must omit products so Plaid re-authenticates that item
 * instead of creating another one. Account selection stays off so reconnect
 * does not add accounts on institutions that honor the flag.
 */
export function buildLinkTokenCreateRequest(userId: string, accessToken?: string): LinkTokenCreateRequest {
  const base = {
    user: { client_user_id: userId },
    client_name: PLAID_LINK_CLIENT_NAME,
    country_codes: ["US" as CountryCode],
    language: "en",
  };

  if (accessToken) {
    return {
      ...base,
      access_token: accessToken,
      update: { account_selection_enabled: false },
    };
  }

  return {
    ...base,
    products: ["transactions" as Products],
  };
}

export function parseLinkTokenBody(raw: string): { itemId: string | null } {
  if (!raw.trim()) return { itemId: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PlaidRequestError("Invalid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PlaidRequestError("Invalid request body");
  }

  const itemId = (parsed as { item_id?: unknown }).item_id;
  if (itemId == null || itemId === "") return { itemId: null };
  if (typeof itemId !== "string" || !ITEM_ID.test(itemId.trim())) {
    throw new PlaidRequestError("Invalid item_id");
  }

  return { itemId: itemId.trim() };
}

export function parsePlaidSyncQuery(params: URLSearchParams): {
  refresh: boolean;
  itemId?: string;
  reconnected: boolean;
} {
  const refresh = params.get("refresh") !== "0";
  const rawItem = params.get("item_id");
  if (rawItem == null || rawItem.trim() === "") {
    if (params.get("reconnected") === "1") {
      throw new PlaidRequestError("item_id is required to reconnect");
    }
    return { refresh, reconnected: false };
  }

  const itemId = rawItem.trim();
  if (!ITEM_ID.test(itemId)) throw new PlaidRequestError("Invalid item_id");
  return { refresh, itemId, reconnected: params.get("reconnected") === "1" };
}
