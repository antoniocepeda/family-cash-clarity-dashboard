const dollarsOf = (value: number) => Math.trunc(Math.abs(value)).toLocaleString("en-US");
const centsOf = (value: number) => Math.abs(value).toFixed(2).slice(-2);

export default function HeroAmount({ value }: { value: number }) {
  const negative = value < 0;
  return (
    <p className="hero-amount">
      {negative ? "−$" : "$"}
      {dollarsOf(value)}
      <span className="hero-affix">{centsOf(value)}</span>
    </p>
  );
}
