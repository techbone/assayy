import type { MarketSession } from "./types";

// NYSE full-day closures. Outside the listed years the session is reported unknown.
const HOLIDAYS: Record<number, readonly string[]> = {
  2026: [
    "2026-01-01",
    "2026-01-19",
    "2026-02-16",
    "2026-04-03",
    "2026-05-25",
    "2026-06-19",
    "2026-07-03",
    "2026-09-07",
    "2026-11-26",
    "2026-12-25",
  ],
};
const EARLY_CLOSE = new Set(["2026-11-27", "2026-12-24"]);
const newYork = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

/** Regular US equity session. Tokenized wrappers trade around the clock; this labels the underlying. */
export function usEquitySession(now: number): MarketSession {
  const parts = Object.fromEntries(
    newYork.formatToParts(new Date(now * 1000)).map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const holidays = HOLIDAYS[year];
  if (!holidays) return "unknown";
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return "closed";
  if (holidays.includes(date)) return "closed";
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const close = EARLY_CLOSE.has(date) ? 13 * 60 : 16 * 60;
  return minutes >= 9 * 60 + 30 && minutes < close ? "open" : "closed";
}
