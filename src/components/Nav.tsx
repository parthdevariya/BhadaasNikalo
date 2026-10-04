"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const I = {
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
    </>
  ),
};

const items = [
  { href: "/speak", label: "Speak", icon: I.mic, speak: true },
  { href: "/insights", label: "Insights", icon: I.chart },
  { href: "/privacy", label: "Privacy", icon: I.lock },
  { href: "/settings", label: "Settings", icon: I.gear },
];

export function Nav() {
  const path = usePathname();
  if (path === "/") return null;
  return (
    <nav className="nav" aria-label="Main">
      <ul>
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} aria-current={path === it.href ? "page" : undefined} className={it.speak ? "speak-tab" : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {it.icon}
              </svg>
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {I.mic}
    </svg>
  );
}
