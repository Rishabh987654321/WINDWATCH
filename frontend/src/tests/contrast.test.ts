import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance } from "../lib/contrast";

describe("WCAG 2.1 Contrast Calculations", () => {
  it("matches hand-computed reference pairs within ±0.01", () => {
    // Reference pairs requested in Phase 5b Step 0.1
    const testCases: Array<{ fg: string; bg: string; expected: number }> = [
      { fg: "#111111", bg: "#FFFFFF", expected: 18.88 },
      { fg: "#111111", bg: "#FFF8E1", expected: 17.77 },
      { fg: "#111111", bg: "#FFE94A", expected: 15.29 },
      { fg: "#4D7CFE", bg: "#FFFFFF", expected: 3.73 },
      { fg: "#00C48C", bg: "#FFFFFF", expected: 2.26 },
      { fg: "#FF6B9E", bg: "#FFFFFF", expected: 2.68 },
      { fg: "#000000", bg: "#FFFFFF", expected: 21.00 },
    ];

    for (const tc of testCases) {
      const ratio = contrastRatio(tc.fg, tc.bg);
      expect(ratio).toBeCloseTo(tc.expected, 1);
      expect(Math.abs(ratio - tc.expected)).toBeLessThanOrEqual(0.015);
    }
  });

  it("computes contrast against both white and paper surfaces accurately", () => {
    const white = "#FFFFFF";
    const paper = "#FFF8E1";

    expect(relativeLuminance(white)).toBeCloseTo(1.0, 4);
    expect(relativeLuminance("#000000")).toBeCloseTo(0.0, 4);

    // Paper luminance is slightly lower than white (0.938 vs 1.0)
    expect(relativeLuminance(paper)).toBeLessThan(relativeLuminance(white));
    expect(relativeLuminance(paper)).toBeGreaterThan(0.9);

    // Contrast with paper
    expect(contrastRatio("#4D7CFE", paper)).toBeCloseTo(3.51, 1);
    expect(contrastRatio("#00C48C", paper)).toBeCloseTo(2.13, 1);
    expect(contrastRatio("#FF6B9E", paper)).toBeCloseTo(2.52, 1);
  });
});
