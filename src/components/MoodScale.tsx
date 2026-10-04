"use client";

export function MoodScale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number) => void;
}) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div>
      <p id={id} className="muted" style={{ marginBottom: 10 }}>
        {label}
      </p>
      <div className="scale" role="radiogroup" aria-labelledby={id}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}${n === 1 ? " — very low" : n === 5 ? " — neutral" : n === 10 ? " — great" : ""}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="scale-legend" aria-hidden="true">
        <span>Very low</span>
        <span>Neutral</span>
        <span>Great</span>
      </div>
    </div>
  );
}
