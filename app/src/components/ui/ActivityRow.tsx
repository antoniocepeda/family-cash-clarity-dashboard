import { ReactNode } from "react";

export function activityInitial(label: string) {
  const letter = label.trim().charAt(0).toUpperCase();
  return letter || "•";
}

export function ActivityMark({ label }: { label: string }) {
  return (
    <span className="activity-mark" aria-hidden="true">
      {activityInitial(label)}
    </span>
  );
}

export default function ActivityRow({
  title,
  subtitle,
  amount,
  tone = "neutral",
  mark,
  trailing,
  onClick,
}: {
  title: string;
  subtitle?: ReactNode;
  amount?: ReactNode;
  tone?: "in" | "overdue" | "neutral";
  mark?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className="activity-row">
      {mark ?? <ActivityMark label={title} />}
      {onClick ? (
        <button type="button" className="activity-open" onClick={onClick}>
          <span className="activity-title">{title}</span>
          {subtitle ? <span className="activity-sub">{subtitle}</span> : null}
        </button>
      ) : (
        <div className="activity-main">
          <p className="activity-title">{title}</p>
          {subtitle ? <div className="activity-sub">{subtitle}</div> : null}
        </div>
      )}
      {amount != null && (
        <p className={`activity-amount${tone === "in" ? " is-in" : tone === "overdue" ? " is-overdue" : ""}`}>{amount}</p>
      )}
      {trailing}
    </div>
  );
}
