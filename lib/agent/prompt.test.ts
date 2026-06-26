import { describe, it, expect } from "vitest";
import { renderTemplate, buildAgentPrompt } from "@/lib/agent/prompt";

const property = {
  ownerName: "Maria Garcia",
  address: "123 Palm Dr",
  city: "Tampa",
  state: "FL",
};

describe("renderTemplate", () => {
  it("replaces all tokens", () => {
    const out = renderTemplate(
      "Hi {{ownerName}} at {{address}}, {{city}} {{state}}",
      property,
    );
    expect(out).toBe("Hi Maria Garcia at 123 Palm Dr, Tampa FL");
  });

  it("falls back to 'there' when ownerName is missing", () => {
    const out = renderTemplate("Hi {{ownerName}}", { ...property, ownerName: null });
    expect(out).toBe("Hi there");
  });
});

describe("buildAgentPrompt", () => {
  const base = {
    businessName: "OffMarket Acquisitions",
    tone: "Friendly",
    objectives: ["Qualify budget", "Book a call"],
    channel: "SMS" as const,
    property,
    scriptTemplate: "Hi {{ownerName}}, about {{address}}…",
    transcript: [
      { direction: "OUT" as const, body: "Hi Maria, about 123 Palm Dr…" },
      { direction: "IN" as const, body: "How much are you offering?" },
    ],
  };

  it("includes business, tone, objectives, and the SMS length rule", () => {
    const { system } = buildAgentPrompt(base);
    expect(system).toContain("OffMarket Acquisitions");
    expect(system).toContain("Friendly");
    expect(system).toContain("Qualify budget");
    expect(system).toContain("SMS");
  });

  it("renders the transcript with owner/us labels and the latest inbound", () => {
    const { user } = buildAgentPrompt(base);
    expect(user).toContain("Maria Garcia: How much are you offering?");
    expect(user).toContain("Us: Hi Maria");
  });

  it("uses an email length rule for the EMAIL channel", () => {
    const { system } = buildAgentPrompt({ ...base, channel: "EMAIL" });
    expect(system).toContain("email");
  });

  it("provides a default objective when none are set", () => {
    const { system } = buildAgentPrompt({ ...base, objectives: [] });
    expect(system.toLowerCase()).toContain("open to selling");
  });
});
