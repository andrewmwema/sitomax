function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

/** Converts a site-local datetime input into UTC, rejecting invalid or skipped DST times. */
export function siteLocalTimeToUtc(value: string, timeZone: string): string | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!matched) return null;
  const [, y, mo, d, h, mi] = matched;
  const wanted = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  const input = new Date(wanted);
  if (input.getUTCFullYear() !== Number(y) || input.getUTCMonth() !== Number(mo) - 1 ||
    input.getUTCDate() !== Number(d) || Number(h) > 23 || Number(mi) > 59) return null;
  try {
    let candidate = wanted;
    for (let attempt = 0; attempt < 4; attempt++) {
      const local = partsInZone(new Date(candidate), timeZone);
      const observed = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day),
        Number(local.hour), Number(local.minute), Number(local.second));
      candidate += wanted - observed;
    }
    const result = new Date(candidate);
    const local = partsInZone(result, timeZone);
    if (`${local.year}-${local.month}-${local.day}T${local.hour}:${local.minute}` !== value) return null;
    return result.toISOString();
  } catch {
    return null;
  }
}

export function siteDateTimeInput(now: Date, timeZone: string): string {
  const parts = partsInZone(now, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
