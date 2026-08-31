import { describe, expect, it } from "vitest";
import { calendarJobKey } from "@/lib/calendar-store";

describe("refresh job deduplication key", () => {
  it("uses one calendar refresh job for every date searched at a hut", () => {
    expect(calendarJobKey("koca")).toBe("calendar:koca");
    expect(calendarJobKey("druga-koca")).not.toBe(calendarJobKey("koca"));
  });
});
