"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { authFetch } from "@/lib/auth-fetch";
import { AgentAuditEntry } from "@/lib/types";

function formatWhen(timestamp: string) {
  try {
    return format(parseISO(timestamp), "MMM d, h:mm a");
  } catch {
    return timestamp;
  }
}

export default function AgentActivity() {
  const [entries, setEntries] = useState<AgentAuditEntry[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/agent-audit?limit=8")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(body)) throw new Error("Agent activity unavailable");
        return body as AgentAuditEntry[];
      })
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="border-t border-[var(--line)] pt-6">
      <h2 className="eyebrow mb-1">Agent</h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Writes made with the assistant API key. Browser edits are not listed here.
      </p>
      {unavailable && <p className="text-sm text-[var(--muted)]">Agent activity is unavailable.</p>}
      {!unavailable && entries === null && <p className="text-sm text-[var(--muted)]">Loading agent activity...</p>}
      {entries && entries.length === 0 && <p className="text-sm text-[var(--muted)]">No agent changes yet.</p>}
      {entries && entries.length > 0 && (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          {entries.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text)]">
                  {entry.method} {entry.route}
                  <span className="ml-2 text-xs font-normal text-[var(--faint)]">{entry.status}</span>
                </p>
                <time className="text-xs text-[var(--faint)]" dateTime={entry.timestamp}>
                  {formatWhen(entry.timestamp)}
                </time>
              </div>
              <p className="mt-1 break-words text-xs text-[var(--muted)] line-clamp-2">{entry.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
