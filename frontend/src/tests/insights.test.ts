import { describe, it, expect } from "vitest";
import {
  getHorizonInsight,
  getDistributionInsight,
  getByHourInsight,
  getByLevelInsight,
  getHeatmapInsight,
  getVintagesInsight,
} from "../lib/insights";

describe("Accuracy Lab Insight Templates (Pure)", () => {
  describe("getHorizonInsight", () => {
    it("renders increasing MAE pattern when condition is met", () => {
      const res = getHorizonInsight({
        h0Mae: 1000.0,
        hReliableMae: 2500.0,
        reliableH: 44,
      });
      expect(res).toBe("MAE 1000.0 MW at H=0 → 2500.0 MW at H=44 (+150.0%).");
    });

    it("renders plain statement if MAE is not increasing", () => {
      const res = getHorizonInsight({
        h0Mae: 2000.0,
        hReliableMae: 1800.0,
        reliableH: 44,
      });
      expect(res).toBe(
        "MAE is not increasing monotonically: 2000.0 MW at H=0 vs 1800.0 MW at H=44 (-10.0%)."
      );
    });

    it("falls back to neutral statement when data is missing", () => {
      expect(getHorizonInsight({ h0Mae: null, hReliableMae: null, reliableH: 44 })).toBe(
        "Forecast error evaluated across lead horizons."
      );
    });
  });

  describe("getDistributionInsight", () => {
    it("renders over-forecast rate percentage when available", () => {
      const res = getDistributionInsight({ overForecastRate: 0.8481 });
      expect(res).toBe("Forecast was above actual in 84.8% of hours.");
    });

    it("falls back to neutral statement when rate is null", () => {
      expect(getDistributionInsight({ overForecastRate: null })).toBe(
        "Forecast error distribution across all evaluated hours."
      );
    });
  });

  describe("getByHourInsight", () => {
    it("names highest and lowest MAE hours when data is present", () => {
      const res = getByHourInsight({
        highestHour: 18,
        highestMae: 2450.5,
        lowestHour: 4,
        lowestMae: 1210.0,
      });
      expect(res).toBe(
        "Highest MAE occurred at hour 18:00 (2450.5 MW); lowest at hour 04:00 (1210.0 MW)."
      );
    });

    it("falls back to neutral statement when data is missing", () => {
      expect(
        getByHourInsight({
          highestHour: null,
          highestMae: null,
          lowestHour: null,
          lowestMae: null,
        })
      ).toBe("Forecast accuracy and signed bias broken down by hour of day (Europe/London).");
    });
  });

  describe("getByLevelInsight", () => {
    it("states signed bias in top bin vs bottom bin without causal claims", () => {
      const res = getByLevelInsight({
        topBinBias: 3200.4,
        topBinLabel: "> 16,000 MW",
        bottomBinBias: 250.0,
        bottomBinLabel: "< 4,000 MW",
      });
      expect(res).toBe(
        "Signed bias was +3200.4 MW in the top bin (> 16,000 MW) and +250.0 MW in the bottom bin (< 4,000 MW)."
      );
    });

    it("falls back to neutral statement when bins are missing", () => {
      expect(
        getByLevelInsight({
          topBinBias: null,
          topBinLabel: null,
          bottomBinBias: null,
          bottomBinLabel: null,
        })
      ).toBe("Forecast error broken down across 5 generation levels.");
    });
  });

  describe("getHeatmapInsight", () => {
    it("identifies peak error date, hour, and magnitude", () => {
      const res = getHeatmapInsight({
        highestMissDate: "2026-01-28",
        highestMissHour: 14,
        highestMissMae: 5329.0,
      });
      expect(res).toBe(
        "Peak error occurred on 2026-01-28 at 14:00 (5329.0 MW absolute error)."
      );
    });

    it("falls back to neutral statement when missing", () => {
      expect(
        getHeatmapInsight({
          highestMissDate: null,
          highestMissHour: null,
          highestMissMae: null,
        })
      ).toBe("Hourly forecast absolute error distribution across the evaluation window.");
    });
  });

  describe("getVintagesInsight", () => {
    it("summarizes publication runs, range, and actual value", () => {
      const res = getVintagesInsight({
        n: 14,
        localTime: "2026-01-12 01:00",
        minMw: 12000.0,
        maxMw: 18894.0,
        actualMw: 12000.0,
      });
      expect(res).toBe(
        "14 forecasts for 2026-01-12 01:00: from 12000 to 18894 MW; actual 12000 MW."
      );
    });

    it("falls back to neutral statement when forecasts are empty", () => {
      expect(
        getVintagesInsight({
          n: 0,
          localTime: "2026-01-12 01:00",
          minMw: null,
          maxMw: null,
          actualMw: null,
        })
      ).toBe("Forecast evolution across publication runs for 2026-01-12 01:00.");
    });
  });

  describe("Forbidden Causal Language Check", () => {
    const FORBIDDEN_WORDS = ["because", "due to", "caused", "reason", "confidence"];

    it("verifies no caption contains forbidden causal words across diverse synthetic inputs", () => {
      const captions: string[] = [
        getHorizonInsight({ h0Mae: 1000, hReliableMae: 2500, reliableH: 44 }),
        getHorizonInsight({ h0Mae: 2500, hReliableMae: 1000, reliableH: 44 }),
        getHorizonInsight({ h0Mae: null, hReliableMae: null, reliableH: 44 }),
        getDistributionInsight({ overForecastRate: 0.84 }),
        getDistributionInsight({ overForecastRate: null }),
        getByHourInsight({ highestHour: 18, highestMae: 2500, lowestHour: 4, lowestMae: 1200 }),
        getByHourInsight({ highestHour: null, highestMae: null, lowestHour: null, lowestMae: null }),
        getByLevelInsight({ topBinBias: 3000, topBinLabel: "> 16 GW", bottomBinBias: -500, bottomBinLabel: "< 4 GW" }),
        getByLevelInsight({ topBinBias: null, topBinLabel: null, bottomBinBias: null, bottomBinLabel: null }),
        getHeatmapInsight({ highestMissDate: "2026-01-28", highestMissHour: 14, highestMissMae: 5000 }),
        getHeatmapInsight({ highestMissDate: null, highestMissHour: null, highestMissMae: null }),
        getVintagesInsight({ n: 14, localTime: "2026-01-12 01:00", minMw: 10000, maxMw: 18000, actualMw: 12000 }),
        getVintagesInsight({ n: 0, localTime: "2026-01-12 01:00", minMw: null, maxMw: null, actualMw: null }),
      ];

      for (const caption of captions) {
        const lower = caption.toLowerCase();
        for (const word of FORBIDDEN_WORDS) {
          expect(lower).not.toContain(word);
        }
      }
    });
  });
});
