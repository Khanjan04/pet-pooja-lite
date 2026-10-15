// Business date and fiscal year. Mirrors app.business_date() and app.fiscal_year() in schema.sql.

function localParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}

/** Local date the sale belongs to: before `dayStartsAt` (e.g. "05:00") still counts as yesterday. */
export function businessDate(at: Date, timeZone: string, dayStartsAt = "05:00"): string {
  const { y, m, d, hh, mm } = localParts(at, timeZone);
  const [sh, sm] = dayStartsAt.split(":").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (hh * 60 + mm < sh * 60 + sm) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Indian fiscal year label: 2026-04-01..2027-03-31 -> "2026-27". */
export function fiscalYear(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function minutesSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
}
