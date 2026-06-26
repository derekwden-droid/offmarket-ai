import { describe, it, expect } from "vitest";
import { classifyInbound } from "@/lib/compliance/keywords";

describe("classifyInbound", () => {
  it("detects STOP-family keywords (case/punctuation-insensitive)", () => {
    for (const word of ["STOP", "stop", "Stop.", "UNSUBSCRIBE", "cancel", "QUIT", "end", "optout"]) {
      expect(classifyInbound(word)).toBe("STOP");
    }
  });

  it("detects HELP-family keywords", () => {
    expect(classifyInbound("HELP")).toBe("HELP");
    expect(classifyInbound("info please")).toBe("HELP");
  });

  it("detects START-family keywords", () => {
    expect(classifyInbound("START")).toBe("START");
    expect(classifyInbound("unstop")).toBe("START");
    expect(classifyInbound("YES")).toBe("START");
  });

  it("treats everything else as a normal reply", () => {
    expect(classifyInbound("How much are you offering?")).toBe("REPLY");
    expect(classifyInbound("")).toBe("REPLY");
    expect(classifyInbound("stopwatch")).toBe("REPLY"); // only exact first-word match
  });

  it("keys on the first word only", () => {
    expect(classifyInbound("STOP texting me")).toBe("STOP");
    expect(classifyInbound("please STOP")).toBe("REPLY");
  });
});
