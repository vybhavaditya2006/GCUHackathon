const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** '2026-10-05' -> '5 Oct 2026'. Date-only strings are read as UTC so the day never shifts. */
export function formatDate(date: string | null): string {
  if (!date) return "not set";
  return dateFormat.format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}
