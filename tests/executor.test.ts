import { describe, it, expect } from "vitest";
import { parseBullpenOutput, parseBullpenError } from "../src/executor";

describe("parseBullpenOutput", () => {
  it("extracts JSON array from mixed output", () => {
    const raw = `Update available\n[{"slug":"test"}]`;
    expect(parseBullpenOutput(raw)).toEqual([{ slug: "test" }]);
  });
  it("extracts JSON object from mixed output", () => {
    const raw = `Notice\n{"status":"ok"}`;
    expect(parseBullpenOutput(raw)).toEqual({ status: "ok" });
  });
  it("returns null for non-JSON", () => {
    expect(parseBullpenOutput("no json")).toBeNull();
  });
});

describe("parseBullpenError", () => {
  it("extracts error message", () => {
    expect(parseBullpenError("Error: insufficient balance")).toBe("insufficient balance");
  });
  it("returns raw string if no Error: prefix", () => {
    expect(parseBullpenError("something went wrong")).toBe("something went wrong");
  });
});
