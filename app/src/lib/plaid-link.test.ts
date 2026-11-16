import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLinkTokenCreateRequest,
  parseLinkTokenBody,
  parsePlaidSyncQuery,
  PlaidRequestError,
} from "./plaid-link";

const TOKEN = "access-sandbox-unit-test";

test("a new link token requests transactions and does not carry an access token", () => {
  const request = buildLinkTokenCreateRequest("user-1");
  assert.equal(request.client_name, "Family Cash Clarity Dashboard");
  assert.deepEqual(request.country_codes, ["US"]);
  assert.deepEqual(request.products, ["transactions"]);
  assert.equal("access_token" in request, false);
  assert.equal(request.update, undefined);
});

test("update mode reuses the access token and does not create a new item", () => {
  const request = buildLinkTokenCreateRequest("user-1", TOKEN);
  assert.equal(request.access_token, TOKEN);
  assert.equal(request.products, undefined);
  assert.equal("products" in request, false);
  assert.deepEqual(request.update, { account_selection_enabled: false });
  assert.equal(request.user?.client_user_id, "user-1");
});

test("link token body parsing accepts a reconnect item and an empty create body", () => {
  assert.deepEqual(parseLinkTokenBody(""), { itemId: null });
  assert.deepEqual(parseLinkTokenBody("   "), { itemId: null });
  assert.deepEqual(parseLinkTokenBody("{}"), { itemId: null });
  assert.deepEqual(parseLinkTokenBody(JSON.stringify({ item_id: "item-sandbox-x-money" })), {
    itemId: "item-sandbox-x-money",
  });
});

test("link token body parsing rejects malformed item ids and does not read secrets", () => {
  assert.throws(() => parseLinkTokenBody("{"), PlaidRequestError);
  assert.throws(() => parseLinkTokenBody(JSON.stringify({ item_id: "bad item" })), PlaidRequestError);
  assert.throws(() => parseLinkTokenBody(JSON.stringify({ item_id: 12 })), PlaidRequestError);

  const parsed = parseLinkTokenBody(JSON.stringify({ item_id: "item_1", access_token: TOKEN }));
  assert.deepEqual(parsed, { itemId: "item_1" });
  assert.equal(JSON.stringify(parsed).includes(TOKEN), false);
});

test("sync query keeps a full refresh unless refresh=0, and scopes reconnect to one item", () => {
  assert.deepEqual(parsePlaidSyncQuery(new URLSearchParams()), {
    refresh: true,
    reconnected: false,
  });
  assert.deepEqual(parsePlaidSyncQuery(new URLSearchParams("refresh=0")), {
    refresh: false,
    reconnected: false,
  });
  assert.deepEqual(parsePlaidSyncQuery(new URLSearchParams("item_id=item-1&reconnected=1")), {
    refresh: true,
    itemId: "item-1",
    reconnected: true,
  });
  assert.throws(() => parsePlaidSyncQuery(new URLSearchParams("reconnected=1")), PlaidRequestError);
  assert.throws(() => parsePlaidSyncQuery(new URLSearchParams("item_id=../other")), PlaidRequestError);
});
