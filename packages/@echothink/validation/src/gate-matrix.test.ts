import { describe, expect, it } from "vitest";
import {
  applicableGates,
  GATE_IDS,
  GATE_MATRIX,
  requiresGate,
} from "./gate-matrix.js";

describe("GATE_MATRIX", () => {
  it("encodes the spec surface-type distinctions", () => {
    expect(GATE_MATRIX.standard.typescript).toBe("conditional");
    expect(GATE_MATRIX.composed.typescript).toBe("required");
    expect(GATE_MATRIX.custom.typescript).toBe("required");

    expect(GATE_MATRIX.standard["security-imports"]).toBe("conditional");
    expect(GATE_MATRIX.composed["security-imports"]).toBe("required");
    expect(GATE_MATRIX.custom["security-imports"]).toBe("required");

    expect(GATE_MATRIX.standard.visual).toBe("required");
    expect(GATE_MATRIX.composed.visual).toBe("required");
    expect(GATE_MATRIX.custom["effect-simulation"]).toBe("required");
  });

  it("returns applicable and strictly required gates", () => {
    expect(applicableGates("standard")).toContain("typescript");
    expect(requiresGate("standard", "typescript")).toBe(false);
    expect(requiresGate("standard", "visual")).toBe(true);
    expect(GATE_IDS).not.toContain("threat-model");
  });
});
