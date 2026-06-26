import { describe, it, expect } from "vitest";
import {
  stateToTimeZone,
  localHourInZone,
  evaluateQuietHours,
} from "@/lib/compliance/timezone";

describe("stateToTimeZone", () => {
  it("maps known states", () => {
    expect(stateToTimeZone("FL")).toBe("America/New_York");
    expect(stateToTimeZone("ca")).toBe("America/Los_Angeles");
    expect(stateToTimeZone("TX")).toBe("America/Chicago");
  });
  it("returns null for unknown/blank (fail closed upstream)", () => {
    expect(stateToTimeZone("ZZ")).toBeNull();
    expect(stateToTimeZone("")).toBeNull();
    expect(stateToTimeZone(null)).toBeNull();
  });
});

describe("localHourInZone", () => {
  it("computes the recipient-local hour", () => {
    // 2026-06-26T16:00:00Z -> 12:00 EDT (UTC-4) in summer.
    const now = new Date("2026-06-26T16:00:00Z");
    expect(localHourInZone("America/New_York", now)).toBe(12);
    // ...and 09:00 PDT (UTC-7).
    expect(localHourInZone("America/Los_Angeles", now)).toBe(9);
  });
});

describe("evaluateQuietHours", () => {
  it("allows a send inside the local window", () => {
    const now = new Date("2026-06-26T16:00:00Z"); // 12:00 ET
    const r = evaluateQuietHours({ state: "FL", now, startHour: 8, endHour: 20 });
    expect(r.allowed).toBe(true);
    expect(r.timeZone).toBe("America/New_York");
    expect(r.localHour).toBe(12);
  });

  it("blocks a send before 8am local", () => {
    // 11:00Z -> 04:00 PDT in CA.
    const now = new Date("2026-06-26T11:00:00Z");
    const r = evaluateQuietHours({ state: "CA", now, startHour: 8, endHour: 20 });
    expect(r.allowed).toBe(false);
    expect(r.localHour).toBe(4);
  });

  it("blocks a send at/after the end hour local", () => {
    // 02:00Z next day -> 21:00 ET previous evening? Use a clear evening instant.
    const now = new Date("2026-06-27T01:00:00Z"); // 21:00 ET on 06-26
    const r = evaluateQuietHours({ state: "NY", now, startHour: 8, endHour: 20 });
    expect(r.localHour).toBe(21);
    expect(r.allowed).toBe(false);
  });

  it("fails closed when the state cannot be resolved", () => {
    const now = new Date("2026-06-26T16:00:00Z");
    const r = evaluateQuietHours({ state: "ZZ", now, startHour: 8, endHour: 20 });
    expect(r.allowed).toBe(false);
    expect(r.timeZone).toBeNull();
  });
});
