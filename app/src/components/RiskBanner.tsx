"use client";

import { Alert } from "@/lib/types";

interface Props {
  alerts: Alert[];
}

const severityConfig = {
  critical: {
    bg: "bg-red-50 border-red-200",
    icon: "bg-red-500",
    text: "text-red-800",
    action: "text-red-600 hover:text-red-800",
    dot: "bg-red-500",
    label: "Critical",
  },
  warning: {
    bg: "bg-amber-50 border-amber-200",
    icon: "bg-amber-500",
    text: "text-amber-800",
    action: "text-amber-600 hover:text-amber-800",
    dot: "bg-amber-500",
    label: "Warning",
  },
  info: {
    bg: "bg-slate-50 border-slate-200",
    icon: "bg-slate-400",
    text: "text-slate-700",
    action: "text-slate-500 hover:text-slate-700",
    dot: "bg-slate-400",
    label: "Info",
  },
};

export default function RiskBanner({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white text-sm font-bold">
          ✓
        </div>
        <p className="text-sm font-medium text-emerald-800">
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
            <div className={`mt-0.5 h-2.5 w-2.5 rounded-full ${config.dot} shrink-0`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${config.text}`}>
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
