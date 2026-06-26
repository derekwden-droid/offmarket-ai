import { describe, it, expect } from "vitest";
import {
  composeDecision,
  type DecisionFacts,
  type GateConfig,
} from "@/lib/compliance/decision";

const CONFIG: GateConfig = {
  sendingEnabled: true,
  smsFromNumber: "+13055550000",
  supportEmail: "help@offmarket.ai",
  physicalAddress: "1 Main St, Tampa, FL",
  quietHoursStart: 8,
  quietHoursEnd: 20,
  dailyCapPerRecipient: 3,
};

/** A fully-passing SMS fact set; override one field per test. */
function smsFacts(overrides: Partial<DecisionFacts> = {}): DecisionFacts {
  return {
    channel: "SMS",
    recipient: "+13055551234",
    config: CONFIG,
    hasConsent: true,
    suppressionReason: null,
    dnc: { configured: true, onDnc: false, source: "dnc-provider" },
    dncError: null,
    quietHours: { allowed: true, timeZone: "America/New_York", localHour: 12 },
    recentOutbound: 0,
    ...overrides,
  };
}

describe("composeDecision — happy paths", () => {
  it("allows a fully-compliant SMS", () => {
    const d = composeDecision(smsFacts());
    expect(d.allowed).toBe(true);
    expect(d.reason).toBeNull();
  });

  it("allows email without DNC/quiet-hours facts (CAN-SPAM, not telemarketing)", () => {
    const d = composeDecision({
      channel: "EMAIL",
      recipient: "owner@email.com",
      config: CONFIG,
      hasConsent: true,
      suppressionReason: null,
      dnc: null,
      dncError: null,
      quietHours: null,
      recentOutbound: 0,
    });
    expect(d.allowed).toBe(true);
  });
});

describe("composeDecision — fail-closed blocks", () => {
  it("CONFIG_MISSING when no config", () => {
    expect(composeDecision(smsFacts({ config: null })).reason).toBe("CONFIG_MISSING");
  });

  it("SENDING_DISABLED when the kill switch is off", () => {
    const cfg = { ...CONFIG, sendingEnabled: false };
    expect(composeDecision(smsFacts({ config: cfg })).reason).toBe("SENDING_DISABLED");
  });

  it("SENDER_NOT_CONFIGURED when SMS number missing", () => {
    const cfg = { ...CONFIG, smsFromNumber: null };
    expect(composeDecision(smsFacts({ config: cfg })).reason).toBe("SENDER_NOT_CONFIGURED");
  });

  it("INVALID_RECIPIENT when recipient is unkeyable", () => {
    expect(composeDecision(smsFacts({ recipient: null })).reason).toBe("INVALID_RECIPIENT");
  });

  it("NO_CONSENT when consent missing", () => {
    expect(composeDecision(smsFacts({ hasConsent: false })).reason).toBe("NO_CONSENT");
  });

  it("SUPPRESSED when on the ledger", () => {
    expect(composeDecision(smsFacts({ suppressionReason: "STOP" })).reason).toBe("SUPPRESSED");
  });

  it("DNC_NOT_CONFIGURED when the provider is absent (fail closed)", () => {
    expect(composeDecision(smsFacts({ dnc: { configured: false, onDnc: false, source: "unconfigured" } })).reason).toBe("DNC_NOT_CONFIGURED");
    expect(composeDecision(smsFacts({ dnc: null })).reason).toBe("DNC_NOT_CONFIGURED");
  });

  it("DNC_ERROR when the scrub call failed", () => {
    expect(composeDecision(smsFacts({ dncError: "timeout" })).reason).toBe("DNC_ERROR");
  });

  it("ON_DNC when the number is registered", () => {
    expect(composeDecision(smsFacts({ dnc: { configured: true, onDnc: true, source: "x" } })).reason).toBe("ON_DNC");
  });

  it("QUIET_HOURS when outside the local window", () => {
    expect(composeDecision(smsFacts({ quietHours: { allowed: false, timeZone: "America/New_York", localHour: 6 } })).reason).toBe("QUIET_HOURS");
  });

  it("FREQUENCY_CAP at/over the cap", () => {
    expect(composeDecision(smsFacts({ recentOutbound: 3 })).reason).toBe("FREQUENCY_CAP");
    expect(composeDecision(smsFacts({ recentOutbound: 2 })).allowed).toBe(true);
  });
});

describe("composeDecision — ordering (cheaper/decisive checks win)", () => {
  it("reports NO_CONSENT even when also suppressed and on DNC", () => {
    const d = composeDecision(
      smsFacts({
        hasConsent: false,
        suppressionReason: "STOP",
        dnc: { configured: true, onDnc: true, source: "x" },
      }),
    );
    expect(d.reason).toBe("NO_CONSENT");
  });

  it("reports SUPPRESSED before DNC", () => {
    const d = composeDecision(
      smsFacts({
        suppressionReason: "DNC",
        dnc: { configured: false, onDnc: false, source: "unconfigured" },
      }),
    );
    expect(d.reason).toBe("SUPPRESSED");
  });
});
