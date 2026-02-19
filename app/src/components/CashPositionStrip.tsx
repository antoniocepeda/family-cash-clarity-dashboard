"use client";

import { Account } from "@/lib/types";

interface Props {
  accounts: Account[];
  lastUpdated: string;
}

export default function CashPositionStrip({ accounts, lastUpdated }: Props) {
  const onHand = accounts
    .filter((a) => !a.is_reserve)
    .reduce((sum, a) => sum + a.current_balance, 0);

  const reserved = accounts
    .filter((a) => a.is_reserve)
    .reduce((sum, a) => sum + a.current_balance, 0);

  const trueAvailable = onHand;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-5 text-white shadow-lg">
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <p className="text-sm font-medium text-emerald-100 tracking-wide uppercase">Cash On-Hand</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">{fmt(onHand)}</p>
        <p className="mt-2 text-xs text-emerald-200">
          Across {accounts.filter((a) => !a.is_reserve).length} account{accounts.filter((a) => !a.is_reserve).length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 p-5 text-white shadow-lg">
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <p className="text-sm font-medium text-amber-100 tracking-wide uppercase">Reserved</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">{fmt(reserved)}</p>
        <p className="mt-2 text-xs text-amber-200">Emergency &amp; savings</p>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 p-5 text-white shadow-lg">
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <p className="text-sm font-medium text-sky-100 tracking-wide uppercase">True Available</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">{fmt(trueAvailable)}</p>
        <p className="mt-2 text-xs text-sky-200">
          Updated {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : "—"}
        </p>
      </div>
    </div>
  );
}
