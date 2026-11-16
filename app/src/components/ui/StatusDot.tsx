export type StatusTone = "positive" | "negative" | "warning" | "neutral";

export default function StatusDot({
  tone = "neutral",
  label,
}: {
  tone?: StatusTone;
  label: string;
}) {
  return (
    <span className="status">
      <span className="status-dot" data-tone={tone} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
