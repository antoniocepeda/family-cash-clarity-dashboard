"use client";

import type { PlaidItem } from "@/lib/types";

export default function LinkedBankCard({
  item,
  busy,
  reconnecting,
  onReconnect,
}: {
  item: PlaidItem;
  busy: boolean;
  reconnecting: boolean;
  onReconnect: (itemId: string) => void;
}) {
  const name = item.institution_name || "Linked institution";
  const broken = item.status === "error";

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[var(--text)]">{name}</span>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            broken
              ? "bg-[var(--negative-soft)] text-[var(--negative)]"
              : "bg-[var(--positive-soft)] text-[var(--positive)]"
          }`}
        >
          {item.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {item.last_synced_at ? `Last synced ${new Date(item.last_synced_at).toLocaleString()}` : "Not synced yet"}
      </p>
      {broken && (item.error_code || item.error_message) && (
        <div className="mt-2 space-y-1">
          {item.error_code && (
            <p className="font-mono text-[11px] font-semibold tracking-wide text-[var(--negative)]">{item.error_code}</p>
          )}
          {item.error_message && <p className="text-xs text-[var(--negative)]">{item.error_message}</p>}
        </div>
      )}
      {broken && (
        <button
          type="button"
          onClick={() => onReconnect(item.item_id)}
          disabled={busy}
          aria-label={`Reconnect ${name}`}
          className="btn btn-ghost mt-3 w-full"
        >
          {reconnecting ? "Opening..." : "Reconnect"}
        </button>
      )}
    </div>
  );
}
