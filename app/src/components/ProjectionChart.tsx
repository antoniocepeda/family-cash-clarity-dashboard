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
  ReferenceArea,
} from "recharts";
import { format, parseISO } from "date-fns";

type TimeRange = 14 | 30 | 60 | 90 | 120 | 150 | 180;

interface Props {
  projection: ProjectionDay[];
  projectionDays?: TimeRange;
  onDaysChange?: (days: TimeRange) => void;
  includePending?: boolean;
  onIncludePendingChange?: (include: boolean) => void;
}

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: 30, label: "1 Month" },
  { value: 60, label: "2 Months" },
  { value: 90, label: "3 Months" },
  { value: 120, label: "4 Months" },
  { value: 150, label: "5 Months" },
  { value: 180, label: "6 Months" },
];

export default function ProjectionChart({
  projection,
  projectionDays = 30,
  onDaysChange,
  includePending = true,
  onIncludePendingChange,
}: Props) {
  if (projection.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-[var(--muted)]">
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
  const lowDay = projection.reduce((lowest, day) => day.balance < lowest.balance ? day : lowest);

  const data = projection.map((d) => ({
    ...d,
    dateLabel: format(parseISO(d.date), "MMM d"),
    shortDate: format(parseISO(d.date), "M/d"),
  }));

  const monthBands: { startIdx: number; endIdx: number; fill: string }[] = [];
  let currentMonth = -1;
  let bandStart = 0;
  data.forEach((d, i) => {
    const dt = parseISO(d.date);
    const monthKey = dt.getFullYear() * 12 + dt.getMonth();
    if (currentMonth >= 0 && monthKey !== currentMonth) {
      monthBands.push({
        startIdx: bandStart,
        endIdx: i - 1,
        fill: monthBands.length % 2 === 0 ? "rgba(255,255,255,0.025)" : "rgba(213,226,251,0.04)",
      });
      bandStart = i;
    }
    currentMonth = monthKey;
  });
  if (data.length > 0) {
    monthBands.push({
      startIdx: bandStart,
      endIdx: data.length - 1,
      fill: monthBands.length % 2 === 0 ? "rgba(255,255,255,0.025)" : "rgba(213,226,251,0.04)",
    });
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <p className="eyebrow">Projection</p>
            <h2 className="text-xl font-medium text-[var(--text)]">Balance</h2>
          </div>
          {onIncludePendingChange && (
            <label className="ml-1 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={includePending}
                onChange={(e) => onIncludePendingChange(e.target.checked)}
                className="rounded border-[var(--line-strong)]"
              />
              Include pending
            </label>
          )}
          {hasNegative && dangerDay && (
            <span className="text-xs font-semibold text-[var(--negative)] bg-[var(--negative-soft)] px-2.5 py-1 rounded-full">
              Goes negative {format(parseISO(dangerDay.date), "MMM d")}
            </span>
          )}
          {hasNegative && (
            <span className="text-xs font-semibold text-[var(--negative)] bg-[var(--negative-soft)] px-2.5 py-1 rounded-full">
              Needs {fmt(Math.abs(lowDay.balance))} by {format(parseISO(lowDay.date), "MMM d")}
            </span>
          )}
        </div>
        {onDaysChange && (
          <div className="scroll-row">
            {timeRangeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onDaysChange(opt.value)}
                className={`min-h-11 rounded-full px-3 text-xs font-medium transition-colors ${
                  projectionDays === opt.value
                    ? "bg-[var(--text)] text-[var(--ink)]"
                    : "border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                <span className="sm:hidden">{opt.value / 30}M</span>
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="h-[280px] w-full lg:h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#d5e2fb" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#d5e2fb" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="dangerGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f0b4b4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f0b4b4" stopOpacity={0} />
            </linearGradient>
          </defs>
          {monthBands.map((band, i) => (
            <ReferenceArea
              key={i}
              x1={data[band.startIdx]?.shortDate}
              x2={data[band.endIdx]?.shortDate}
              y1={yMin}
              y2={yMax}
              fill={band.fill}
              fillOpacity={0.65}
            />
          ))}
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="shortDate"
            tick={{ fontSize: 11, fill: "#9aa1ab" }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9aa1ab" }}
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
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 shadow-lg text-sm">
                  <p className="font-semibold text-[var(--text-secondary)]">{d.dateLabel}</p>
                  <p className={`text-lg font-bold ${d.balance < 0 ? "text-[var(--negative)]" : "text-[var(--positive)]"}`}>
                    {fmt(d.balance)}
                  </p>
                  {d.commitments.length > 0 && (
                    <div className="mt-1.5 border-t border-[var(--line)] pt-1.5 space-y-0.5">
                      {d.commitments.map((c: { type: string; name: string; amount: number }, i: number) => (
                        <p key={i} className="text-xs text-[var(--muted)]">
                          {c.type === "income" ? "+" : "−"}${c.amount} {c.name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
          />
          <ReferenceLine y={0} stroke="#f0b4b4" strokeDasharray="4 4" strokeWidth={1} />
          <ReferenceLine y={500} stroke="#e6c98a" strokeDasharray="3 3" strokeWidth={1} label="" />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#d5e2fb"
            strokeWidth={1.75}
            fill="url(#balanceGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#d5e2fb", stroke: "#090a0c", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-4 bg-[var(--negative)]" /> $0 line
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-4 bg-[var(--warning)]" /> $500 buffer
        </span>
      </div>
    </div>
  );
}
