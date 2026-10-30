import { addDays, format, parseISO } from "date-fns";

/** Small cushion held back from safe-to-spend. */
export const SPEND_BUFFER = 100;

export type SpendBill = {
  name: string;
  amount: number;
  dueDate: string;
  commitmentId?: string;
};

export type SpendProjectionDay = {
  date: string;
  balance: number;
  commitments: {
    name: string;
    amount: number;
    type: string;
    commitment_id?: string;
    due_date?: string;
    original_due_date?: string;
    status?: string;
  }[];
};

export type SafeToSpend = {
  cashOnHand: number;
  buffer: number;
  paycheckDate: string | null;
  paycheckName: string | null;
  bills: SpendBill[];
  billsTotal: number;
  safeToSpend: number;
  canSpend: boolean;
};

export type PaycheckPoint = {
  date: string;
  name: string;
  amount: number;
  balance: number;
};

export type CashOutlook = {
  paychecks: PaycheckPoint[];
  minBalance: number;
  endingBalance: number;
  covered: boolean;
  trend: "up" | "down" | "flat";
  onTrack: boolean;
  shortfallDate: string | null;
};

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

export function nextPaycheck(
  days: SpendProjectionDay[],
  recurringIncomeIds: string[]
): { date: string; name: string; amount: number } | null {
  for (const day of days) {
    for (const item of day.commitments) {
      if (item.type !== "income" || !item.commitment_id) continue;
      if (recurringIncomeIds.length > 0 && !recurringIncomeIds.includes(item.commitment_id)) continue;
      return { date: day.date, name: item.name, amount: item.amount };
    }
  }
  return null;
}

export function computeSafeToSpend(input: {
  cashOnHand: number;
  days: SpendProjectionDay[];
  recurringIncomeIds: string[];
  today: string;
  buffer?: number;
}): SafeToSpend {
  const buffer = input.buffer ?? SPEND_BUFFER;
  const paycheck = nextPaycheck(input.days, input.recurringIncomeIds);
  const fallbackEnd = format(addDays(parseISO(input.today), 14), "yyyy-MM-dd");
  const bills: SpendBill[] = [];

  for (const day of input.days) {
    const beforePay = paycheck ? day.date < paycheck.date : day.date <= fallbackEnd;
    if (!beforePay) continue;
    for (const item of day.commitments) {
      if (item.type !== "bill") continue;
      bills.push({
        name: item.name.replace(/ \(simulated\)$/, ""),
        amount: item.amount,
        dueDate: item.original_due_date ?? item.due_date ?? day.date,
        commitmentId: item.commitment_id,
      });
    }
  }

  const billsTotal = cents(bills.reduce((sum, bill) => sum + bill.amount, 0));
  const safeToSpend = cents(input.cashOnHand - billsTotal - buffer);
  return {
    cashOnHand: cents(input.cashOnHand),
    buffer,
    paycheckDate: paycheck?.date ?? null,
    paycheckName: paycheck?.name ?? null,
    bills,
    billsTotal,
    safeToSpend,
    canSpend: safeToSpend >= 0,
  };
}

export function buildOutlook(input: {
  startingCash: number;
  days: SpendProjectionDay[];
  recurringIncomeIds: string[];
  limit?: number;
}): CashOutlook {
  const limit = input.limit ?? 3;
  const paychecks: PaycheckPoint[] = [];
  for (const day of input.days) {
    for (const item of day.commitments) {
      if (paychecks.length >= limit) break;
      if (item.type !== "income" || !item.commitment_id) continue;
      if (input.recurringIncomeIds.length > 0 && !input.recurringIncomeIds.includes(item.commitment_id)) continue;
      paychecks.push({
        date: day.date,
        name: item.name.replace(/ \(simulated\)$/, ""),
        amount: item.amount,
        balance: day.balance,
      });
    }
  }

  const lastDate = paychecks.length > 0 ? paychecks[paychecks.length - 1].date : input.days[0]?.date;
  const window = lastDate ? input.days.filter((day) => day.date <= lastDate) : input.days;
  const balances = window.map((day) => day.balance);
  const minBalance = cents(balances.length > 0 ? Math.min(...balances) : input.startingCash);
  const endingBalance = cents(paychecks.length > 0 ? paychecks[paychecks.length - 1].balance : input.startingCash);
  const baseline = paychecks.length > 1 ? paychecks[0].balance : input.startingCash;
  const trend = endingBalance > baseline + 1 ? "up" : endingBalance < baseline - 1 ? "down" : "flat";
  const shortfallDate = window.find((day) => day.balance < 0)?.date ?? null;
  const covered = minBalance >= 0 && shortfallDate === null;

  return {
    paychecks,
    minBalance,
    endingBalance,
    covered,
    trend,
    onTrack: covered && trend === "up",
    shortfallDate,
  };
}
