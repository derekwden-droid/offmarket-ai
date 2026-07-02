import { describe, expect, it } from "vitest";
import { toSignals } from "@/lib/scoring/from-property";

describe("toSignals", () => {
  it("derives absentee from ZIP mismatch", () => {
    const r = toSignals({ zip: "33136", ownerMailingZip: "90210" });
    expect(r.absenteeOwner).toBe(true);
  });

  it("derives non-absentee from matching ZIP", () => {
    const r = toSignals({ zip: "33136", ownerMailingZip: "33136" });
    expect(r.absenteeOwner).toBe(false);
  });

  it("normalizes ZIP+4 to 5 digits for comparison", () => {
    const r = toSignals({ zip: "33136", ownerMailingZip: "33136-1234" });
    expect(r.absenteeOwner).toBe(false);
  });

  it("returns null when ZIPs are missing", () => {
    const r = toSignals({ zip: "33136" });
    expect(r.absenteeOwner).toBeNull();
  });

  it("preserves explicit absenteeOwner over derived", () => {
    const r = toSignals({ zip: "33136", ownerMailingZip: "33136", absenteeOwner: true });
    expect(r.absenteeOwner).toBe(true);
  });
});
