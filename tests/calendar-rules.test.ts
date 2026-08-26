import { describe, expect, it } from "vitest";
import { isUnitAvailableForStay } from "@/lib/bentral";

describe("Bentral unavailDates boundary rules", () => {
  it("blocks an ordinary unavailable day", () => {
    expect(isUnitAvailableForStay({ "2026-08-11": "unavail" }, "2026-08-10", "2026-08-12")).toBe(false);
  });
  it("allows unavail_start only when it is the departure day", () => {
    expect(isUnitAvailableForStay({ "2026-08-12": "unavail_start" }, "2026-08-10", "2026-08-12")).toBe(true);
    expect(isUnitAvailableForStay({ "2026-08-11": "unavail_start" }, "2026-08-10", "2026-08-12")).toBe(false);
  });
  it("allows an unavail_end date", () => {
    expect(isUnitAvailableForStay({ "2026-08-11": "unavail_end" }, "2026-08-10", "2026-08-12")).toBe(true);
  });
});
