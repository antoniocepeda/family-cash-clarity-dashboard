import { createHash, timingSafeEqual } from "crypto";

const SECRET_KEY = /(token|secret|password|passwd|authorization|api[_-]?key|credential|private[_-]?key|cookie|session)/i;
const MAX_SUMMARY_CHARS = 500;
const MAX_BODY_CHARS = 16_000;

export type AgentCredentialDecision = "absent" | "match" | "reject";

export function configuredAgentKey(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isPublicReadEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Compare two secrets without leaking the expected value through an early return.
 * Empty values never match, including empty-to-empty, so an unset key cannot authenticate.
 */
export function agentKeysMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const equal = timingSafeEqual(providedDigest, expectedDigest);
  return provided.length > 0 && expected.length > 0 && equal;
}

function isJwtShape(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

/**
 * Decide whether this request is presenting the agent key.
 * X-Agent-Key is always an agent attempt. A Bearer token is an agent attempt when
 * it matches the configured key, or when a key is configured and the token is not
 * a Firebase JWT. An unset key rejects an explicit X-Agent-Key and otherwise
 * leaves Bearer tokens to Firebase auth.
 */
export function decideAgentCredential(input: {
  agentKeyHeaderPresent: boolean;
  agentKeyHeader: string | null;
  authorizationHeader: string | null;
  configuredKey: string | null;
}): AgentCredentialDecision {
  if (input.agentKeyHeaderPresent) {
    if (!input.configuredKey) return "reject";
    const provided = input.agentKeyHeader?.trim() ?? "";
    return agentKeysMatch(provided, input.configuredKey) ? "match" : "reject";
  }

  const match = input.authorizationHeader?.match(/^Bearer\s+(\S+)\s*$/i);
  if (!match || !input.configuredKey) return "absent";

  const token = match[1];
  if (agentKeysMatch(token, input.configuredKey)) return "match";
  if (isJwtShape(token)) return "absent";
  return "reject";
}

function redactString(value: string): string {
  if (value.includes("BEGIN PRIVATE KEY") || value.includes("BEGIN RSA PRIVATE KEY")) return "[redacted]";
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

export function summarizeForAudit(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return value.toString();
  if (depth >= 4) return "[truncated]";

  if (Array.isArray(value)) {
    const items = value.slice(0, 8).map((item) => summarizeForAudit(item, depth + 1));
    if (value.length > 8) items.push(`…${value.length - 8} more`);
    return items;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const summarized: Record<string, unknown> = {};
    for (const [key, child] of entries.slice(0, 20)) {
      summarized[key] = SECRET_KEY.test(key) ? "[redacted]" : summarizeForAudit(child, depth + 1);
    }
    if (entries.length > 20) summarized._truncated = true;
    return summarized;
  }

  return "[unsupported]";
}

export function summarizeSearchParams(params: URLSearchParams): string | null {
  const entries = [...params.entries()];
  if (entries.length === 0) return null;
  return entries
    .slice(0, 12)
    .map(([key, value]) => `${key}=${SECRET_KEY.test(key) ? "[redacted]" : redactString(value)}`)
    .join("&");
}

type AuditRequest = {
  url: string;
  headers: { get(name: string): string | null };
  clone(): { text(): Promise<string> };
};

export async function buildRequestAuditSummary(req: AuditRequest): Promise<string> {
  const parts: string[] = [];

  try {
    const params = summarizeSearchParams(new URL(req.url).searchParams);
    if (params) parts.push(`query ${params}`);
  } catch {
    parts.push("query (unavailable)");
  }

  const contentType = req.headers.get("content-type") ?? "";
  const expectsJson = contentType.length === 0 || contentType.includes("json");
  if (!expectsJson) {
    parts.push("(non-json body)");
  } else {
    try {
      const text = await req.clone().text();
      if (text.trim()) {
        if (text.length > MAX_BODY_CHARS) {
          parts.push("(body omitted, too large)");
        } else {
          parts.push(JSON.stringify(summarizeForAudit(JSON.parse(text))));
        }
      }
    } catch {
      parts.push("(non-json body)");
    }
  }

  const summary = parts.join(" ").trim() || "(no body)";
  return summary.length > MAX_SUMMARY_CHARS ? `${summary.slice(0, MAX_SUMMARY_CHARS - 3)}...` : summary;
}
