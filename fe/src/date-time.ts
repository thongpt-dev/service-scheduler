export function formatInTimezone(
  value: string,
  timezone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleString([], {
    ...options,
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

export function hasNotStarted(value: string): boolean {
  return Date.parse(value) > Date.now();
}

export function localDayBounds(date: string, timezone: string): [Date, Date] {
  const start = localWallTimeToUtc(date, "00:00", timezone);
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const nextLocalDate = [
    nextDate.getUTCFullYear(),
    String(nextDate.getUTCMonth() + 1).padStart(2, "0"),
    String(nextDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return [start, localWallTimeToUtc(nextLocalDate, "00:00", timezone)];
}

export function dateTimeLocalToIso(value: string, timezone: string): string {
  const [date, time] = value.split("T");
  if (!date || !time) throw new Error("Choose a valid local date and time.");
  return localWallTimeToUtc(date, time, timezone).toISOString();
}

export function instantToDateTimeLocal(value: string, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function localWallTimeToUtc(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetWallClock = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let guess = targetWallClock;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map(({ type, value }) => [type, value]),
    );
    const representedWallClock = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess = targetWallClock - (representedWallClock - guess);
  }
  const resolved = Object.fromEntries(
    formatter.formatToParts(new Date(guess)).map(({ type, value }) => [type, value]),
  );
  if (
    Number(resolved.year) !== year ||
    Number(resolved.month) !== month ||
    Number(resolved.day) !== day ||
    Number(resolved.hour) !== hour ||
    Number(resolved.minute) !== minute
  ) {
    throw new Error("That local time does not exist in the dealership timezone.");
  }
  return new Date(guess);
}
