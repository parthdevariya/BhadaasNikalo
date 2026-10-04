import Link from "next/link";

export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="brand" aria-label="Speak. Release. Gone. — home">
          Speak. Release. <b>Gone.</b>
        </Link>
        <Link href="/safety" className="faint">Need support?</Link>
      </div>
      <main id="main" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {title && <h1 style={{ fontSize: 36, margin: "20px 0 24px" }}>{title}</h1>}
        {children}
      </main>
    </div>
  );
}
