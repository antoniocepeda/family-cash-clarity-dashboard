"use client";

import { useState, useEffect, useMemo } from "react";
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

interface EventTrend {
  event_id: string;
  event_name: string;
  event_type: string;
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
  const [trends, setTrends] = useState<EventTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodType>("weeks");
  const [range, setRange] = useState<RangeType>("8");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ period, range });
    if (selectedEventId !== "all") params.set("event_id", selectedEventId);

    fetch(`/api/trends?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setTrends(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedEventId, period, range]);

  const selectedTrend = useMemo(() => {
    if (selectedEventId === "all") return null;
    return trends.find((t) => t.event_id === selectedEventId) || null;
  }, [trends, selectedEventId]);

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
    const count = trends.length || 1;
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400">
        Loading trends...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Spending Trends</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:ring-2 focus:ring-sky-500 outline-none"
            >
              <option value="all">All Envelopes</option>
              {trends.map((t) => (
                <option key={t.event_id} value={t.event_id}>
                  {t.event_name}
                </option>
              ))}
            </select>

            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(["weeks", "months"] as PeriodType[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`text-xs font-medium px-3 py-1.5 transition-colors ${
                    period === p ? "bg-sky-100 text-sky-700" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {p === "weeks" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>

            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(["4", "8", "12"] as RangeType[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`text-xs font-medium px-3 py-1.5 transition-colors ${
                    range === r ? "bg-sky-100 text-sky-700" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {r} {period === "weeks" ? "wk" : "mo"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Avg Planned</p>
            <p className="text-sm font-bold text-slate-700 mt-1">{fmt(summaryStats.avgPlanned)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Avg Actual</p>
            <p className="text-sm font-bold text-slate-700 mt-1">{fmt(summaryStats.avgActual)}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3">
            <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">Under Budget</p>
            <p className="text-sm font-bold text-emerald-700 mt-1">{fmt(summaryStats.totalUnder)}</p>
          </div>
          <div className="rounded-lg bg-rose-50 p-3">
            <p className="text-[10px] font-semibold text-rose-500 uppercase tracking-wider">Over Budget</p>
            <p className="text-sm font-bold text-rose-700 mt-1">{fmt(summaryStats.totalOver)}</p>
          </div>
        </div>
      </div>

      {chartData.length === 0 || chartData.every((d) => d.planned === 0 && d.actual === 0) ? (
        <div className="p-6 text-center text-sm text-slate-400">
          No trend data available yet. Spending history will appear here as you log transactions.
        </div>
      ) : (
        <div className="px-5 pb-5">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
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
                    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-sm">
                      <p className="font-semibold text-slate-700 text-xs">{label}</p>
                      <p className="text-xs mt-1">
                        <span className="text-sky-600">Planned:</span> {fmt(planned)}
                      </p>
                      <p className="text-xs">
                        <span className="text-violet-600">Actual:</span> {fmt(actual)}
                      </p>
                      {planned > 0 && (
                        <p className={`text-xs font-semibold mt-1 ${diff > 0 ? "text-rose-600" : "text-emerald-600"}`}>
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
                  <span className="text-xs text-slate-500 capitalize">{value}</span>
                )}
              />
              <Bar dataKey="planned" fill="#7dd3fc" radius={[4, 4, 0, 0]} name="Planned" />
              <Bar dataKey="actual" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Actual" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
