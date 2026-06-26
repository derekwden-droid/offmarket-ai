import { describe, it, expect } from "vitest";
import {
  agentConfigSchema,
  agentThresholdsSchema,
  skipTraceRequestSchema,
} from "@/lib/validations";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

describe("agentConfigSchema", () => {
  const base = {
    tone: "Professional",
    objectives: ["Qualify budget"],
    channels: ["SMS", "EMAIL"],
    scriptTemplate: "Hi {{ownerName}}",
    thresholds: { temperature: 0.6, persistence: 3, dailyCap: 40 },
  };

  it("accepts a valid configuration", () => {
    const parsed = agentConfigSchema.parse(base);
    expect(parsed.channels).toEqual(["SMS", "EMAIL"]);
  });

  it("defaults objectives to an empty array", () => {
    const parsed = agentConfigSchema.parse({ ...base, objectives: undefined });
    expect(parsed.objectives).toEqual([]);
  });

  it("rejects an unknown channel", () => {
    expect(() => agentConfigSchema.parse({ ...base, channels: ["FAX"] })).toThrow();
  });

  it("requires at least one channel", () => {
    expect(() => agentConfigSchema.parse({ ...base, channels: [] })).toThrow();
  });

  it("rejects an empty tone and an empty script", () => {
    expect(() => agentConfigSchema.parse({ ...base, tone: "" })).toThrow();
    expect(() => agentConfigSchema.parse({ ...base, scriptTemplate: "" })).toThrow();
  });
});

describe("agentThresholdsSchema", () => {
  it("rejects out-of-range values", () => {
    expect(() => agentThresholdsSchema.parse({ temperature: 2, persistence: 3, dailyCap: 40 })).toThrow();
    expect(() => agentThresholdsSchema.parse({ temperature: 0.5, persistence: 9, dailyCap: 40 })).toThrow();
    expect(() => agentThresholdsSchema.parse({ temperature: 0.5, persistence: 3, dailyCap: 0 })).toThrow();
  });

  it("requires integer persistence and dailyCap", () => {
    expect(() => agentThresholdsSchema.parse({ temperature: 0.5, persistence: 2.5, dailyCap: 40 })).toThrow();
  });
});

describe("skipTraceRequestSchema", () => {
  it("accepts valid uuids and optional concurrency", () => {
    const parsed = skipTraceRequestSchema.parse({ propertyIds: [VALID_UUID], concurrency: 8 });
    expect(parsed.concurrency).toBe(8);
  });

  it("rejects non-uuid ids", () => {
    expect(() => skipTraceRequestSchema.parse({ propertyIds: ["nope"] })).toThrow();
  });

  it("rejects an empty id list and concurrency over the cap", () => {
    expect(() => skipTraceRequestSchema.parse({ propertyIds: [] })).toThrow();
    expect(() => skipTraceRequestSchema.parse({ propertyIds: [VALID_UUID], concurrency: 99 })).toThrow();
  });
});
