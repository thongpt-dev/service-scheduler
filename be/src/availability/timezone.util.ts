export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

export interface LocalDateTimeParts extends LocalDateParts {
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "iso8601",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function getLocalDateTimeParts(
  instant: Date,
  timeZone: string,
): LocalDateTimeParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

export function parseLocalDate(value: string): LocalDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, day] = match.slice(1).map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() + 1 !== month ||
    normalized.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function formatLocalDate(parts: LocalDateParts): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function addCalendarDays(value: string, days: number): string {
  const parts = parseLocalDate(value);
  if (!parts) {
    throw new RangeError("Invalid local calendar date");
  }
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return formatLocalDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

export function formatLocalTime(parts: LocalDateTimeParts): string {
  return `${parts.hour.toString().padStart(2, "0")}:${parts.minute
    .toString()
    .padStart(2, "0")}`;
}

export function formatUtcOffset(instant: Date, timeZone: string): string {
  const parts = getLocalDateTimeParts(instant, timeZone);
  const localEpoch = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const minutes = Math.round((localEpoch - instant.getTime()) / 60_000);
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)
    .toString()
    .padStart(2, "0")}:${(absolute % 60).toString().padStart(2, "0")}`;
}

export function resolveLocalDateTime(
  date: string,
  localTime: string,
  timeZone: string,
): Date[] {
  const dateParts = parseLocalDate(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localTime);
  if (!dateParts || !timeMatch) {
    return [];
  }
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) {
    return [];
  }

  const localEpoch = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    second,
  );
  const offsets = new Set<number>();
  for (const hoursFromLocalDate of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = new Date(localEpoch + hoursFromLocalDate * 60 * 60 * 1000);
    const sampleParts = getLocalDateTimeParts(sample, timeZone);
    offsets.add(
      Date.UTC(
        sampleParts.year,
        sampleParts.month - 1,
        sampleParts.day,
        sampleParts.hour,
        sampleParts.minute,
        sampleParts.second,
      ) - sample.getTime(),
    );
  }

  const matchingInstants = new Map<number, Date>();
  for (const offset of offsets) {
    const candidate = new Date(localEpoch - offset);
    const candidateParts = getLocalDateTimeParts(candidate, timeZone);
    if (
      candidateParts.year === dateParts.year &&
      candidateParts.month === dateParts.month &&
      candidateParts.day === dateParts.day &&
      candidateParts.hour === hour &&
      candidateParts.minute === minute &&
      candidateParts.second === second
    ) {
      matchingInstants.set(candidate.getTime(), candidate);
    }
  }
  return [...matchingInstants.values()].sort(
    (left, right) => left.getTime() - right.getTime(),
  );
}
