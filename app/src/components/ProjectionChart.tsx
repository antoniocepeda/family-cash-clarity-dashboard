"use client";

import { ProjectionDay } from "@/lib/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";

type TimeRange = 28 | 60 | 90;

interface Props {
  projection: ProjectionDay[];
  projectionDays?: TimeRange;
  onDaysChange?: (days: TimeRange) => void;
}

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: 28, label: "1 Month" },
  { value: 60, label: "2 Months" },
  { value: 90, label: "3 Months" },
];

export default function ProjectionChart({ projection, projectionDays = 28, onDaysChange }: Props) {
  if (projection.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400">
        No projection data available. Add accounts and commitments to get started.
      </div>
    );
  }

  const minBalance = Math.min(...projection.map((d) => d.balance));
  const maxBalance = Math.max(...projection.map((d) => d.balance));
  const yMin = Math.min(0, minBalance - 200);
  const yMax = maxBalance + 500;

  const hasNegative = minBalance < 0;
  const dangerDay = projection.find((d) => d.balance < 0);

  const data = projection.map((d) => ({
    ...d,
    dateLabel: format(parseISO(d.date), "MMM d"),
    shortDate: format(parseISO(d.date), "M/d"),
  }));

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Cash Projection</h2>
          {hasNegative && dangerDay && (
            <span className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
              Goes negative {format(parseISO(dangerDay.date), "MMM d")}
            </span>
          )}
        </div>
        {onDaysChange && (
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {timeRangeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onDaysChange(opt.value)}
                className={`text-xs font-medium px-3 py-1.5 transition-colors ${
                  projectionDays === opt.value
                    ? "bg-sky-100 text-sky-700"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" className="flex-1" height="100%" minHeight={280}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="dangerGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="shortDate"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
            domain={[yMin, yMax]}
            width={55}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-sm">
                  <p className="font-semibold text-slate-700">{d.dateLabel}</p>
                  <p className={`text-lg font-bold ${d.balance < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {fmt(d.balance)}
                  </p>
                  {d.commitments.length > 0 && (
                    <div className="mt-1.5 border-t border-slate-100 pt-1.5 space-y-0.5">
                      {d.commitments.map((c: { type: string; name: string; amount: number }, i: number) => (
                        <p key={i} className="text-xs text-slate-500">
                          {c.type === "income" ? "+" : "−"}${c.amount} {c.name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
          />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} />
          <ReferenceLine y={500} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} label="" />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#0ea5e9"
            strokeWidth={2.5}
            fill="url(#balanceGradient)"
            dot={false}
            activeDot={{ r: 5, fill: "#0ea5e9", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-red-400 inline-block" style={{ borderTop: "2px dashed #ef4444" }} /> $0 line
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-amber-400 inline-block" style={{ borderTop: "2px dashed #f59e0b" }} /> $500 buffer
        </span>
      </div>
    </div>
  );
}
