"use client";

import { useState, useEffect, useMemo } from "react";
import { readJsonArray } from "@/lib/api-client";
import { authFetch } from "@/lib/auth-fetch";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface TrendPeriod {
  label: string;
  planned: number;
  actual: number;
}

interface CommitmentTrend {
  commitment_id: string;
  commitment_name: string;
  commitment_type: string;
  recurrence_rule: string | null;
  periods: TrendPeriod[];
  avg_planned: number;
  avg_actual: number;
  total_over: number;
  total_under: number;
}

type PeriodType = "weeks" | "months";
type RangeType = "4" | "8" | "12";

export default function SpendingTrends() {
  const [trends, setTrends] = useState<CommitmentTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommitmentId, setSelectedCommitmentId] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodType>("weeks");
  const [range, setRange] = useState<RangeType>("8");

  useEffect(() => {
    const params = new URLSearchParams({ period, range });
    if (selectedCommitmentId !== "all") params.set("commitment_id", selectedCommitmentId);

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });

    authFetch(`/api/trends?${params.toString()}`)
      .then((r) => readJsonArray<CommitmentTrend>(r, "Trends fetch"))
      .then((data) => {
        if (cancelled) return;
        setTrends(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch trends:", err);
        if (!cancelled) {
          setTrends([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCommitmentId, period, range]);

  const selectedTrend = useMemo(() => {
    if (selectedCommitmentId === "all") return null;
    return trends.find((t) => t.commitment_id === selectedCommitmentId) || null;
  }, [trends, selectedCommitmentId]);

  const chartData = useMemo(() => {
    if (selectedTrend) {
      return selectedTrend.periods;
    }
    if (trends.length === 0) return [];

    const periodCount = trends[0]?.periods.length || 0;
    const combined: TrendPeriod[] = [];
    for (let i = 0; i < periodCount; i++) {
      let planned = 0;
      let actual = 0;
      let label = "";
      for (const t of trends) {
        if (t.periods[i]) {
          planned += t.periods[i].planned;
          actual += t.periods[i].actual;
          label = t.periods[i].label;
        }
      }
      combined.push({ label, planned, actual });
    }
    return combined;
  }, [selectedTrend, trends]);

  const summaryStats = useMemo(() => {
    if (selectedTrend) {
      return {
        avgPlanned: selectedTrend.avg_planned,
        avgActual: selectedTrend.avg_actual,
        totalOver: selectedTrend.total_over,
        totalUnder: selectedTrend.total_under,
      };
    }
    return {
      avgPlanned: trends.reduce((s, t) => s + t.avg_planned, 0),
      avgActual: trends.reduce((s, t) => s + t.avg_actual, 0),
      totalOver: trends.reduce((s, t) => s + t.total_over, 0),
      totalUnder: trends.reduce((s, t) => s + t.total_under, 0),
    };
  }, [selectedTrend, trends]);

  const fmt = (n: number) =>
    "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-[var(--muted)]">
        Loading trends...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="eyebrow">History</p>
            <h2 className="mt-1 text-3xl font-medium text-[var(--text)]">Trends</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedCommitmentId}
              onChange={(e) => setSelectedCommitmentId(e.target.value)}
              className="text-xs rounded-lg border border-[var(--line-strong)] px-2.5 py-1.5 focus:ring-2 focus:ring-[var(--accent)] outline-none"
            >
              <option value="all">All Envelopes</option>
              {trends.map((t) => (
                <option key={t.commitment_id} value={t.commitment_id}>
                  {t.commitment_name}
                </option>
              ))}
            </select>

            <div className="segment">
              {(["weeks", "months"] as PeriodType[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={`text-sm ${period === p ? "is-active" : ""}`}
                >
                  {p === "weeks" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>

            <div className="segment">
              {(["4", "8", "12"] as RangeType[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                  className={`text-sm ${range === r ? "is-active" : ""}`}
                >
                  {r} {period === "weeks" ? "wk" : "mo"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="rounded-lg bg-[var(--surface-2)] p-3">
            <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Avg Planned</p>
            <p className="text-sm font-bold text-[var(--text-secondary)] mt-1">{fmt(summaryStats.avgPlanned)}</p>
          </div>
          <div className="rounded-lg bg-[var(--surface-2)] p-3">
            <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Avg Actual</p>
            <p className="text-sm font-bold text-[var(--text-secondary)] mt-1">{fmt(summaryStats.avgActual)}</p>
          </div>
          <div className="rounded-lg bg-[var(--surface-2)] p-3">
            <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Under budget</p>
            <p className="mt-1 text-sm font-medium tabular-nums text-[var(--text)]">{fmt(summaryStats.totalUnder)}</p>
          </div>
          <div className="rounded-lg bg-[var(--surface-2)] p-3">
            <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Over budget</p>
            <p className="mt-1 text-sm font-medium tabular-nums text-[var(--text)]">{fmt(summaryStats.totalOver)}</p>
          </div>
        </div>
      </div>

      {chartData.length === 0 || chartData.every((d) => d.planned === 0 && d.actual === 0) ? (
        <div className="p-6 text-center text-sm text-[var(--muted)]">
          No trend data available yet. Spending history will appear here as you log transactions.
        </div>
      ) : (
        <div className="px-5 pb-5">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--chart-muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--chart-grid)" }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
                width={55}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const planned = payload.find((p) => p.dataKey === "planned")?.value as number ?? 0;
                  const actual = payload.find((p) => p.dataKey === "actual")?.value as number ?? 0;
                  const diff = actual - planned;
                  return (
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 shadow-lg text-sm">
                      <p className="font-semibold text-[var(--text-secondary)] text-xs">{label}</p>
                      <p className="text-xs mt-1">
                        <span className="text-[var(--accent)]">Planned:</span> {fmt(planned)}
                      </p>
                      <p className="text-xs">
                        <span className="text-[var(--accent)]">Actual:</span> {fmt(actual)}
                      </p>
                      {planned > 0 && (
                        <p className="mt-1 text-xs font-medium text-[var(--text)]">
                          {diff > 0 ? "Over" : "Under"} by {fmt(Math.abs(diff))}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => (
                  <span className="text-xs text-[var(--muted)] capitalize">{value}</span>
                )}
              />
              <Bar dataKey="planned" fill="var(--chart-planned)" radius={[3, 3, 0, 0]} name="Planned" />
              <Bar dataKey="actual" fill="var(--chart-actual)" radius={[3, 3, 0, 0]} name="Actual" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
