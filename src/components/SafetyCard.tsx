import { resourcesFor } from "@/lib/safety/resources";

/** Calm support card. Shown in-place, never as a blocking modal. */
export function SafetyCard({ country = "IN", compact = false }: { country?: string; compact?: boolean }) {
  const r = resourcesFor(country);
  return (
    <section className="card warn fade" aria-labelledby="safety-h" role="region">
      <h2 id="safety-h" style={{ fontSize: compact ? 20 : 24, marginBottom: 8 }}>
        You don&rsquo;t have to carry this alone.
      </h2>
      {!compact && (
        <p className="muted" style={{ marginBottom: 14 }}>
          It sounds like things might be really hard right now. Talking to someone — a person you trust, or a trained
          counsellor — can help. It&rsquo;s free and confidential.
        </p>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 8 }}>
        {r.helplines.slice(0, compact ? 1 : 2).map((h) => (
          <li key={h.tel}>
            <a className="btn block" href={`tel:${h.tel}`} style={{ justifyContent: "space-between" }}>
              <span>{h.name}</span>
              <strong>{h.display}</strong>
            </a>
          </li>
        ))}
        <li>
          <a className="btn block primary" href={`tel:${r.emergency.tel}`} style={{ justifyContent: "space-between" }}>
            <span>If you&rsquo;re in danger now</span>
            <strong>{r.emergency.display}</strong>
          </a>
        </li>
      </ul>
      <p className="faint">This app isn&rsquo;t emergency care and can&rsquo;t contact anyone for you.</p>
    </section>
  );
}
