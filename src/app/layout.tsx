import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ThemeApplier } from "@/components/ThemeApplier";

export const metadata: Metadata = {
  title: "Speak. Release. Gone.",
  description: "Say what's on your mind. No post. No audience. No permanent voice recording.",
  robots: { index: true, follow: true },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#14120f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeApplier />
        <a href="#main" className="sr-only">Skip to content</a>
        {children}
        <Nav />
      </body>
    </html>
  );
}
