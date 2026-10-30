import assert from "node:assert/strict";
import test from "node:test";
import {
  agentKeysMatch,
  buildRequestAuditSummary,
  decideAgentCredential,
  decideSchedulerAccess,
  isPublicReadEnabled,
  summarizeForAudit,
} from "./agent-auth";

const KEY = "test-agent-key-value";

test("agent key comparison is exact and rejects empty values", () => {
  assert.equal(agentKeysMatch(KEY, KEY), true);
  assert.equal(agentKeysMatch(`${KEY} `, KEY), false);
  assert.equal(agentKeysMatch("other-secret-value", KEY), false);
  assert.equal(agentKeysMatch("", ""), false);
  assert.equal(agentKeysMatch("", KEY), false);
  assert.equal(agentKeysMatch(KEY, ""), false);
});

test("public read is enabled only for the string true", () => {
  assert.equal(isPublicReadEnabled("true"), true);
  assert.equal(isPublicReadEnabled(" TRUE "), true);
  assert.equal(isPublicReadEnabled("false"), false);
  assert.equal(isPublicReadEnabled("1"), false);
  assert.equal(isPublicReadEnabled(undefined), false);
  assert.equal(isPublicReadEnabled(""), false);
});

test("explicit agent header fails closed when the key is unset", () => {
  assert.equal(
    decideAgentCredential({
      agentKeyHeaderPresent: true,
      agentKeyHeader: KEY,
      authorizationHeader: null,
      configuredKey: null,
    }),
    "reject"
  );
});

test("matching X-Agent-Key and Bearer token are accepted", () => {
  assert.equal(
    decideAgentCredential({
      agentKeyHeaderPresent: true,
      agentKeyHeader: `  ${KEY}  `,
      authorizationHeader: null,
      configuredKey: KEY,
    }),
    "match"
  );
  assert.equal(
    decideAgentCredential({
      agentKeyHeaderPresent: false,
      agentKeyHeader: null,
      authorizationHeader: `Bearer ${KEY}`,
      configuredKey: KEY,
    }),
    "match"
  );
});

test("a wrong non-JWT bearer is rejected and a JWT falls through to Firebase", () => {
  assert.equal(
    decideAgentCredential({
      agentKeyHeaderPresent: false,
      agentKeyHeader: null,
      authorizationHeader: "Bearer not-the-agent-key",
      configuredKey: KEY,
    }),
    "reject"
  );
  assert.equal(
    decideAgentCredential({
      agentKeyHeaderPresent: false,
      agentKeyHeader: null,
      authorizationHeader: "Bearer aaa.bbb.ccc",
      configuredKey: KEY,
    }),
    "absent"
  );
});

test("scheduler access accepts the cron secret or the agent key", () => {
  assert.equal(
    decideSchedulerAccess({
      cronKeyHeader: "cron-secret",
      authorizationHeader: null,
      configuredCronSecret: "cron-secret",
      agentDecision: "absent",
    }),
    true
  );
  assert.equal(
    decideSchedulerAccess({
      cronKeyHeader: null,
      authorizationHeader: "Bearer cron-secret",
      configuredCronSecret: "cron-secret",
      agentDecision: "reject",
    }),
    true
  );
  assert.equal(
    decideSchedulerAccess({
      cronKeyHeader: "wrong",
      authorizationHeader: null,
      configuredCronSecret: "cron-secret",
      agentDecision: "match",
    }),
    true
  );
  assert.equal(
    decideSchedulerAccess({
      cronKeyHeader: "wrong",
      authorizationHeader: null,
      configuredCronSecret: "cron-secret",
      agentDecision: "absent",
    }),
    false
  );
  assert.equal(
    decideSchedulerAccess({
      cronKeyHeader: null,
      authorizationHeader: null,
      configuredCronSecret: null,
      agentDecision: "match",
    }),
    true
  );
});

test("audit summary redacts secret-like fields and keeps the change", async () => {
  const summary = await buildRequestAuditSummary({
    url: "https://example.test/api/ledger?id=abc&api_key=super-secret",
    headers: { get: () => "application/json" },
    clone: () => ({
      text: async () =>
        JSON.stringify({
          description: "Groceries",
          amount: 85.4,
          access_token: "should-not-appear",
          nested: { password: "hunter2", note: "week 1" },
        }),
    }),
  });

  assert.match(summary, /Groceries/);
  assert.match(summary, /85\.4/);
  assert.equal(summary.includes("should-not-appear"), false);
  assert.equal(summary.includes("hunter2"), false);
  assert.equal(summary.includes("super-secret"), false);
  assert.match(summary, /\[redacted\]/);
  assert.deepEqual(summarizeForAudit({ token: "abc", name: "Rent" }), {
    token: "[redacted]",
    name: "Rent",
  });
});
