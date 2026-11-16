"use client";

import { Alert } from "@/lib/types";

interface Props {
  alerts: Alert[];
}

const severityConfig = {
  critical: {
    bg: "bg-[var(--surface)] border-[var(--line)]",
    text: "text-[var(--text)]",
    action: "text-[var(--muted)]",
    dot: "negative" as const,
    label: "Critical",
  },
  warning: {
    bg: "bg-[var(--surface)] border-[var(--line)]",
    text: "text-[var(--text)]",
    action: "text-[var(--muted)]",
    dot: "warning" as const,
    label: "Warning",
  },
  info: {
    bg: "bg-[var(--surface)] border-[var(--line)]",
    text: "text-[var(--text)]",
    action: "text-[var(--muted)]",
    dot: "neutral" as const,
    label: "Info",
  },
};

export default function RiskBanner({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="surface flex items-center gap-3 p-4">
        <span className="status-dot" data-tone="positive" aria-hidden="true" />
        <p className="text-sm font-medium text-[var(--text)]">
          All clear — no risks detected in the next 14 days.
        </p>
      </div>
    );
  }

  const critical = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");
  const infos = alerts.filter((a) => a.severity === "info");
  const sorted = [...critical, ...warnings, ...infos];

  return (
    <div className="space-y-2">
      {sorted.map((alert, i) => {
        const config = severityConfig[alert.severity];
        return (
          <div
            key={i}
            className={`rounded-xl border ${config.bg} p-4 flex items-start gap-3 transition-all`}
          >
            <span className="status-dot mt-1.5" data-tone={config.dot} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--muted)]">
                  {config.label}
                </span>
              </div>
              <p className={`text-sm font-medium ${config.text} mt-0.5`}>{alert.message}</p>
              <p className={`text-xs mt-1 ${config.action} font-medium`}>
                → {alert.action_text}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
