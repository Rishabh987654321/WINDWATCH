import { describe, it, expect } from "vitest";
import {
  clampDate,
  clampFilterState,
  parseUrlParams,
  serializeUrlParams,
  type FilterState,
  type MetaContext,
} from "../lib/url-state";

describe("url-state lib", () => {
  const customMeta: MetaContext = {
    evalWindowFrom: "2026-01-01",
    evalWindowTo: "2026-01-31",
    coverageFrom: "2025-12-01",
    coverageTo: "2026-01-31",
    maxHorizonHours: 66,
    reliableHorizonHours: 44,
    defaultPolicy: "day_ahead",
    defaultCutoff: "09:00",
    defaultRiskQuantile: 0.9,
    defaultWindowDays: 14,
  };

  it("clamps dates within coverage window", () => {
    // Before coverage
    expect(clampDate("2025-11-01", "2025-12-01", "2026-01-31", "2026-01-01")).toBe("2025-12-01");
    // After coverage
    expect(clampDate("2026-02-15", "2025-12-01", "2026-01-31", "2026-01-31")).toBe("2026-01-31");
    // Invalid date string
    expect(clampDate("invalid-date", "2025-12-01", "2026-01-31", "2026-01-01")).toBe("2026-01-01");
    // Valid date within range
    expect(clampDate("2026-01-15", "2025-12-01", "2026-01-31", "2026-01-01")).toBe("2026-01-15");
  });

  it("clamps filter state against coverage and max horizon", () => {
    const unclamped: FilterState = {
      from: "2025-10-01", // outside coverage
      to: "2026-05-01", // outside coverage
      policy: "lead_time",
      horizonHours: 999, // exceeds maxHorizonHours (66)
      cutoff: "99:99", // invalid
      riskQuantile: 0.5, // invalid quantile
      windowDays: 99, // invalid window
      deliveryDate: "2026-03-01", // outside coverage
      revealActuals: true,
    };

    const clamped = clampFilterState(unclamped, customMeta);
    expect(clamped.from).toBe("2025-12-01");
    expect(clamped.to).toBe("2026-01-31");
    expect(clamped.horizonHours).toBe(66);
    expect(clamped.cutoff).toBe("09:00");
    expect(clamped.riskQuantile).toBe(0.9);
    expect(clamped.windowDays).toBe(14);
    expect(clamped.deliveryDate).toBe("2026-01-31");
    expect(clamped.revealActuals).toBe(true);
  });

  it("corrects inverted from > to dates by falling back to eval window", () => {
    const inverted: FilterState = {
      from: "2026-01-20",
      to: "2026-01-10",
      policy: "day_ahead",
      horizonHours: 24,
      cutoff: "09:00",
      riskQuantile: 0.9,
      windowDays: 14,
      deliveryDate: "2026-01-15",
      revealActuals: false,
    };

    const clamped = clampFilterState(inverted, customMeta);
    expect(clamped.from).toBe("2026-01-01");
    expect(clamped.to).toBe("2026-01-31");
  });

  it("parses empty or invalid URL params to meta defaults", () => {
    const parsedEmpty = parseUrlParams("", customMeta);
    expect(parsedEmpty.from).toBe("2026-01-01");
    expect(parsedEmpty.to).toBe("2026-01-31");
    expect(parsedEmpty.policy).toBe("day_ahead");
    expect(parsedEmpty.cutoff).toBe("09:00");
    expect(parsedEmpty.riskQuantile).toBe(0.9);

    const parsedGarbage = parseUrlParams("?from=bogus&to=none&policy=magic&h=xyz&q=100", customMeta);
    expect(parsedGarbage.from).toBe("2026-01-01");
    expect(parsedGarbage.to).toBe("2026-01-31");
    expect(parsedGarbage.policy).toBe("day_ahead");
    expect(parsedGarbage.horizonHours).toBe(0);
    expect(parsedGarbage.riskQuantile).toBe(0.9);
  });

  it("performs round-trip serialization and deserialization cleanly", () => {
    const initial: FilterState = {
      from: "2026-01-05",
      to: "2026-01-25",
      policy: "lead_time",
      horizonHours: 36,
      cutoff: "09:00",
      riskQuantile: 0.95,
      windowDays: 21,
      deliveryDate: "2026-01-18",
      revealActuals: true,
    };

    const serialized = serializeUrlParams(initial, customMeta);
    const parsed = parseUrlParams(`?${serialized}`, customMeta);

    expect(parsed.from).toBe(initial.from);
    expect(parsed.to).toBe(initial.to);
    expect(parsed.policy).toBe(initial.policy);
    expect(parsed.horizonHours).toBe(initial.horizonHours);
    expect(parsed.riskQuantile).toBe(initial.riskQuantile);
    expect(parsed.windowDays).toBe(initial.windowDays);
    expect(parsed.deliveryDate).toBe(initial.deliveryDate);
    expect(parsed.revealActuals).toBe(initial.revealActuals);
  });
});

describe("Zustand useFilters store", () => {
  it("updates individual filters and syncs state", async () => {
    const { useFilters } = await import("../store/filters");
    const store = useFilters.getState();

    store.setFilter("policy", "lead_time");
    expect(useFilters.getState().policy).toBe("lead_time");

    store.setFilter("horizonHours", 30);
    expect(useFilters.getState().horizonHours).toBe(30);

    store.setFilters({ from: "2026-01-10", to: "2026-01-20" });
    expect(useFilters.getState().from).toBe("2026-01-10");
    expect(useFilters.getState().to).toBe("2026-01-20");
  });
});
