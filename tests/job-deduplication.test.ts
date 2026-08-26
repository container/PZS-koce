import { describe, expect, it } from "vitest";
import { snapshotKey } from "@/lib/availability-store";

describe("refresh job deduplication key", () => {
  const base = { arrivalDate: "2026-08-10", departureDate: "2026-08-12", adults: 2, children: [{ age: 7 }] };
  it("is stable and distinguishes guest composition", () => {
    expect(snapshotKey("koca", base)).toBe(snapshotKey("koca", { ...base }));
    expect(snapshotKey("koca", { ...base, adults: 3 })).not.toBe(snapshotKey("koca", base));
    expect(snapshotKey("koca", { ...base, children: [{ age: 8 }] })).not.toBe(snapshotKey("koca", base));
  });
});
