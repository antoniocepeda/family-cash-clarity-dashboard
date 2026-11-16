import assert from "node:assert/strict";
import test from "node:test";
import { describePlaidSyncError, readPlaidErrorFields, redactSecrets } from "./plaid-errors";

const SECRET = "access-sandbox-00000000-0000-0000-0000-000000000000";

function axiosPlaidError(body: Record<string, unknown>, status = 400) {
  const error = new Error(`Request failed with status code ${status}`);
  return Object.assign(error, {
    response: { status, data: body },
    config: {
      data: JSON.stringify({ access_token: SECRET, client_id: "id", secret: "super-secret" }),
    },
  });
}

test("ITEM_LOGIN_REQUIRED becomes a login message and keeps the Plaid code", () => {
  const described = describePlaidSyncError(
    axiosPlaidError({
      error_type: "ITEM_ERROR",
      error_code: "ITEM_LOGIN_REQUIRED",
      error_message: "the login details of this item have changed and a user login is required to update this information",
      display_message: null,
      request_id: "req-1",
    }),
    "X Money"
  );

  assert.equal(described.error_code, "ITEM_LOGIN_REQUIRED");
  assert.equal(described.error_message, "X Money needs you to log in again");
  assert.equal(described.error_message.includes("status code"), false);
  assert.equal(described.error_message.includes(SECRET), false);
  assert.equal(JSON.stringify(described).includes(SECRET), false);
  assert.equal(JSON.stringify(described).includes("super-secret"), false);
});

test("a missing institution name still tells the user to log in again", () => {
  const described = describePlaidSyncError(
    axiosPlaidError({ error_code: "ITEM_LOGIN_REQUIRED", error_message: "login required" }),
    "  "
  );
  assert.equal(described.error_message, "This bank needs you to log in again");
});

test("institution outages stay distinct from a login problem", () => {
  const described = describePlaidSyncError(
    axiosPlaidError({ error_code: "INSTITUTION_NOT_RESPONDING", error_message: "institution not responding" }, 500),
    "Charles Schwab"
  );
  assert.equal(described.error_code, "INSTITUTION_NOT_RESPONDING");
  assert.equal(described.error_message, "Charles Schwab is temporarily unavailable. Try again later");
});

test("unknown Plaid codes prefer the user-safe display message", () => {
  const described = describePlaidSyncError(
    axiosPlaidError({
      error_code: "NEW_PLAID_CODE",
      error_message: "internal diagnostic that should not lead",
      display_message: "Please try again in a few minutes.",
    }),
    "X Money"
  );
  assert.equal(described.error_code, "NEW_PLAID_CODE");
  assert.equal(described.error_message, "Please try again in a few minutes.");
});

test("a Plaid message that contains an access token is redacted", () => {
  const described = describePlaidSyncError(
    axiosPlaidError({
      error_code: "NEW_PLAID_CODE",
      error_message: `token leaked ${SECRET}`,
    }),
    "X Money"
  );
  assert.equal(described.error_message.includes(SECRET), false);
  assert.match(described.error_message, /\[redacted\]/);
});

test("an axios status with no Plaid body is not stored as the card message", () => {
  const described = describePlaidSyncError(new Error("Request failed with status code 400"), "X Money");
  assert.equal(described.error_code, "SYNC_ERROR");
  assert.equal(described.error_message, "X Money could not be synced. Reconnect if this keeps happening");
});

test("local failures keep their own message", () => {
  const described = describePlaidSyncError(new Error("Plaid item is missing its server token reference"), null);
  assert.equal(described.error_code, "SYNC_ERROR");
  assert.equal(described.error_message, "Plaid item is missing its server token reference");
});

test("a lost item names the institution", () => {
  const described = describePlaidSyncError(
    axiosPlaidError({ error_code: "INVALID_ACCESS_TOKEN", error_message: "invalid access token" }),
    "X Money"
  );
  assert.equal(described.error_message, "The X Money connection is no longer valid. Connect the bank again");
});

test("nested and stringified Plaid bodies are read without the request config", () => {
  const nested = readPlaidErrorFields({
    message: "Request failed with status code 400",
    response: { status: 400, data: { error: { error_code: "ITEM_LOCKED", error_message: "locked" } } },
    config: { data: JSON.stringify({ access_token: SECRET }) },
  });
  assert.equal(nested?.error_code, "ITEM_LOCKED");
  assert.equal(JSON.stringify(nested).includes(SECRET), false);

  const stringified = describePlaidSyncError(
    new Error(JSON.stringify({ error_code: "PENDING_DISCONNECT", error_message: "pending disconnect" })),
    "X Money"
  );
  assert.equal(stringified.error_code, "PENDING_DISCONNECT");
  assert.equal(stringified.error_message, "X Money will disconnect soon. Reconnect to keep syncing");
});

test("codes that are not Plaid identifiers are not shown on the card", () => {
  const described = describePlaidSyncError(
    axiosPlaidError({ error_code: "not a code <script>", error_message: "Request failed with status code 400" }),
    "X Money"
  );
  assert.equal(described.error_code, "SYNC_ERROR");
  assert.equal(described.error_message.includes("script"), false);
  assert.equal(described.error_message.includes("status code"), false);
});

test("redactSecrets covers token, bearer, and assigned secrets", () => {
  const redacted = redactSecrets(`see ${SECRET} and Bearer abc.def and access_token=${SECRET}`);
  assert.equal(redacted.includes(SECRET), false);
  assert.equal(redacted.includes("abc.def"), false);
});
