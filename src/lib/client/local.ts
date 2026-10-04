"use client";
/**
 * On-device storage. The ONLY things kept are preferences and, if the user
 * opts in, tiny derived records (date, seconds, mood numbers). Never audio,
 * never words. Everything can be wiped from Settings in one tap.
 */

export interface Prefs {
  seconds: 30 | 120 | 300;
  aiDefault: "listen" | "perspective" | "think" | "calm";
  langHint: "" | "en" | "hi" | "gu";
  keepInsights: boolean;
  askMood: boolean;
  theme: "system" | "light" | "dark";
}

export interface Release {
  day: string; // YYYY-MM-DD, local
  seconds: number;
  before?: number;
  after?: number;
  ai: boolean;
}

const PREFS_KEY = "srg.prefs.v1";
const HIST_KEY = "srg.releases.v1";
const MAX_HISTORY = 120;

export const DEFAULT_PREFS: Prefs = {
  seconds: 120,
  aiDefault: "listen",
  langHint: "",
  keepInsights: false,
  askMood: true,
  theme: "system",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function loadPrefs(): Prefs {
  return read(PREFS_KEY, DEFAULT_PREFS);
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

export function loadReleases(): Release[] {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    const arr = raw ? (JSON.parse(raw) as Release[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function addRelease(r: Release) {
  if (!loadPrefs().keepInsights) return;
  try {
    const all = [...loadReleases(), r].slice(-MAX_HISTORY);
    localStorage.setItem(HIST_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function wipeLocal() {
  try {
    localStorage.removeItem(HIST_KEY);
    localStorage.removeItem(PREFS_KEY);
  } catch {
    /* ignore */
  }
}

export function today(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface Summary {
  thisWeek: number;
  minutesThisWeek: number;
  pairs: number;
  improved: number;
  avgDelta: number | null;
  last7: { day: string; count: number }[];
}

export function summarize(releases: Release[], now = new Date()): Summary {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(today(d));
  }
  const inWeek = releases.filter((r) => days.includes(r.day));
  const pairs = inWeek.filter((r) => r.before != null && r.after != null);
  const deltas = pairs.map((r) => (r.after as number) - (r.before as number));
  return {
    thisWeek: inWeek.length,
    minutesThisWeek: Math.round(inWeek.reduce((a, r) => a + r.seconds, 0) / 60),
    pairs: pairs.length,
    improved: deltas.filter((d) => d > 0).length,
    avgDelta: deltas.length ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10 : null,
    last7: days.map((day) => ({ day, count: inWeek.filter((r) => r.day === day).length })),
  };
}
