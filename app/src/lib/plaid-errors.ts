/**
 * Turn a Plaid/axios failure into the code and sentence stored on a linked bank.
 * The axios error object can carry the access token in its request config, so
 * this module reads only the Plaid error fields and never returns that config.
 */

const PLAID_CODE = /^[A-Z0-9_]{1,64}$/;
const AXIOS_STATUS = /^Request failed with status code \d+$/;
const ACCESS_TOKEN = /access-(?:sandbox|development|production)-[A-Za-z0-9-]+/g;
const BEARER = /Bearer\s+\S+/gi;
const SECRET_ASSIGNMENT = /\b(?:secret|password|encrypted_access_token|access_token)\b\s*[:=]\s*\S+/gi;
const MAX_MESSAGE = 280;

export type PlaidErrorFields = {
  status: number | null;
  error_code: string | null;
  error_type: string | null;
  error_message: string | null;
  display_message: string | null;
};

export type StoredPlaidItemError = {
  error_code: string;
  error_message: string;
};

type MessageBuilder = (bank: string) => string;

const LOGIN_AGAIN: MessageBuilder = (bank) => `${bank} needs you to log in again`;

const MESSAGES: Record<string, MessageBuilder> = {
  ITEM_LOGIN_REQUIRED: LOGIN_AGAIN,
  PENDING_EXPIRATION: (bank) => `${bank} needs you to log in again before the connection expires`,
  PENDING_DISCONNECT: (bank) => `${bank} will disconnect soon. Reconnect to keep syncing`,
  USER_PERMISSION_REVOKED: (bank) => `Access to ${bank} was revoked. Reconnect to grant it again`,
  INVALID_CREDENTIALS: (bank) => `${bank} rejected the login. Reconnect and try again`,
  INVALID_MFA: (bank) => `${bank} needs you to verify again`,
  INSUFFICIENT_CREDENTIALS: (bank) => `${bank} needs more login information. Reconnect to finish`,
  ITEM_LOCKED: (bank) => `${bank} locked the login. Unlock it at the bank, then reconnect`,
  USER_SETUP_REQUIRED: (bank) => `${bank} needs you to finish setup on the bank site, then reconnect`,
  USER_INPUT_TIMEOUT: (bank) => `${bank} login timed out. Reconnect and try again`,
  MFA_NOT_SUPPORTED: (bank) => `${bank} uses a verification step Plaid cannot complete`,
  NO_ACCOUNTS: (bank) => `${bank} did not share any accounts. Reconnect and choose an account`,
  ACCESS_NOT_GRANTED: (bank) => `${bank} did not grant access. Reconnect and allow the accounts`,
  ITEM_NOT_FOUND: lostConnection,
  INVALID_ACCESS_TOKEN: lostConnection,
  ITEM_CONCURRENTLY_DELETED: lostConnection,
  INSTITUTION_DOWN: unavailable,
  INSTITUTION_NOT_RESPONDING: unavailable,
  INSTITUTION_NOT_AVAILABLE: unavailable,
  INSTITUTION_NO_LONGER_SUPPORTED: (bank) => `Plaid no longer supports ${bank}`,
  PRODUCT_NOT_READY: (bank) => `${bank} is still preparing transactions. Try syncing again shortly`,
  PRODUCT_NOT_ENABLED: (bank) => `${bank} is not enabled for transaction sync`,
  PRODUCTS_NOT_SUPPORTED: (bank) => `${bank} does not support transaction sync`,
  ITEM_NOT_SUPPORTED: (bank) => `${bank} does not support transaction sync`,
};

function lostConnection(bank: string) {
  return bank === "This bank"
    ? "This bank connection is no longer valid. Connect the bank again"
    : `The ${bank} connection is no longer valid. Connect the bank again`;
}

function unavailable(bank: string) {
  return `${bank} is temporarily unavailable. Try again later`;
}

export function institutionLabel(name?: string | null) {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "This bank";
}

export function redactSecrets(value: string) {
  return value.replace(ACCESS_TOKEN, "[redacted]").replace(BEARER, "Bearer [redacted]").replace(SECRET_ASSIGNMENT, "[redacted]");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseData(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") || trimmed.length > 4000) return null;
    try {
      return asRecord(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function plaidBody(data: Record<string, unknown> | null) {
  if (!data) return null;
  const nested = parseData(data.error);
  if (nested && (stringField(nested, "error_code") || stringField(nested, "error_message") || stringField(nested, "display_message"))) {
    return nested;
  }
  if (stringField(data, "error_code") || stringField(data, "error_message") || stringField(data, "display_message")) {
    return data;
  }
  return null;
}

export function readPlaidErrorFields(err: unknown): PlaidErrorFields | null {
  const root = asRecord(err);
  const response = asRecord(root?.response);
  const status = typeof response?.status === "number" ? response.status : null;
  const fromResponse = plaidBody(parseData(response?.data) ?? parseData(root?.data));
  const fromMessage =
    !fromResponse && err instanceof Error ? plaidBody(parseData(err.message)) : null;
  const source = fromResponse ?? fromMessage;
  if (!source && status == null) return null;

  return {
    status,
    error_code: stringField(source, "error_code"),
    error_type: stringField(source, "error_type"),
    error_message: stringField(source, "error_message"),
    display_message: stringField(source, "display_message"),
  };
}

function sanitizeCode(code: string | null) {
  return code && PLAID_CODE.test(code) ? code : null;
}

function cleanUserText(value: string | null | undefined) {
  if (!value) return null;
  const redacted = redactSecrets(value).replace(/\s+/g, " ").trim();
  if (!redacted || redacted === "[redacted]" || redacted === "Bearer [redacted]") return null;
  if (AXIOS_STATUS.test(redacted)) return null;
  return redacted.length > MAX_MESSAGE ? `${redacted.slice(0, MAX_MESSAGE - 1).trimEnd()}…` : redacted;
}

function clip(value: string) {
  const cleaned = cleanUserText(value);
  return cleaned ?? "This bank could not be synced. Reconnect if this keeps happening";
}

function messageFor(code: string, bank: string, fields: PlaidErrorFields | null) {
  const mapped = MESSAGES[code]?.(bank);
  if (mapped) return clip(mapped);
  return (
    cleanUserText(fields?.display_message) ??
    cleanUserText(fields?.error_message) ??
    clip(`${bank} could not be synced (${code})`)
  );
}

function fallbackMessage(err: unknown, bank: string, fields: PlaidErrorFields | null) {
  return (
    cleanUserText(fields?.display_message) ??
    cleanUserText(fields?.error_message) ??
    (err instanceof Error ? cleanUserText(err.message) : null) ??
    `${bank} could not be synced. Reconnect if this keeps happening`
  );
}

export function describePlaidSyncError(err: unknown, institutionName?: string | null): StoredPlaidItemError {
  const bank = institutionLabel(institutionName);
  const fields = readPlaidErrorFields(err);
  const code = sanitizeCode(fields?.error_code ?? null);
  if (code) {
    return { error_code: code, error_message: messageFor(code, bank, fields) };
  }
  return { error_code: "SYNC_ERROR", error_message: fallbackMessage(err, bank, fields) };
}
