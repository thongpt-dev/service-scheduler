import { describe, expect, it } from "@jest/globals";
import {
  formatLocalDate,
  formatLocalTime,
  formatUtcOffset,
  getLocalDateTimeParts,
  resolveLocalDateTime,
} from "./timezone.util";

describe("availability timezone utilities", () => {
  it("resolves both occurrences of a repeated local time at fall DST transition", () => {
    const instants = resolveLocalDateTime(
      "2026-11-01",
      "01:30:00",
      "America/Los_Angeles",
    );

    expect(instants).toHaveLength(2);
    expect(instants[1].getTime() - instants[0].getTime()).toBe(60 * 60 * 1000);
    expect(formatUtcOffset(instants[0], "America/Los_Angeles")).toBe("-07:00");
    expect(formatUtcOffset(instants[1], "America/Los_Angeles")).toBe("-08:00");
  });

  it("returns no instant for a local time skipped at spring DST transition", () => {
    expect(
      resolveLocalDateTime("2026-03-08", "02:30:00", "America/Los_Angeles"),
    ).toHaveLength(0);
  });

  it("formats actual instants using dealership-local date and time", () => {
    const parts = getLocalDateTimeParts(
      new Date("2026-11-01T09:30:00.000Z"),
      "America/Los_Angeles",
    );

    expect(formatLocalDate(parts)).toBe("2026-11-01");
    expect(formatLocalTime(parts)).toBe("01:30");
  });
});
