/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  buildSeriesOption,
  buildDayAheadOption,
  buildCalibrationOption,
  buildHorizonOption,
  buildDistributionOption,
  buildByHourOption,
  buildByLevelOption,
  buildHeatmapOption,
  buildVintagesOption,
  type SeriesPointInput,
  type DayAheadPeriodInput,
  type CalibrationDayInput,
  type HorizonPointInput,
  type DistributionBinInput,
  type ByHourPointInput,
  type ByLevelPointInput,
  type HeatmapInput,
  type VintageForecastPoint,
} from "../charts/builders";
import { THEME_COLORS } from "../charts/theme";

describe("Chart Option Builders (Pure)", () => {
  describe("buildSeriesOption", () => {
    const mockPoints: SeriesPointInput[] = [
      {
        target_time_utc: "2026-01-15T00:00:00Z",
        actual_mw: 1000,
        forecast_mw: 1200,
        error_mw: 200, // over-forecast
        horizon_h: 24,
      },
      {
        target_time_utc: "2026-01-15T01:00:00Z",
        actual_mw: 1500,
        forecast_mw: null, // null forecast -> gap
        error_mw: null,
        horizon_h: 23,
      },
      {
        target_time_utc: "2026-01-15T02:00:00Z",
        actual_mw: 1800,
        forecast_mw: 1600,
        error_mw: -200, // under-forecast
        horizon_h: 22,
      },
    ];

    it("includes forecast casing underlay, forecast line, actual line, and error bar series", () => {
      const option = buildSeriesOption(mockPoints, {
        showActual: true,
        showForecast: true,
        showErrorBars: true,
      });

      const series = option.series as any[];
      expect(series).toBeDefined();

      const names = series.map((s) => s.name);
      expect(names).toContain("Forecast (casing)");
      expect(names).toContain("Forecast");
      expect(names).toContain("Actual");
      expect(names).toContain("Forecast Error");

      // Verify casing underlay has ink color and width >= 4.5
      const casing = series.find((s) => s.name === "Forecast (casing)");
      expect(casing.lineStyle.color).toBe(THEME_COLORS.ink);
      expect(casing.lineStyle.width).toBeGreaterThanOrEqual(4.5);
      expect(casing.silent).toBe(true);

      // Verify forecast line has blue color
      const forecast = series.find((s) => s.name === "Forecast");
      expect(forecast.lineStyle.color).toBe(THEME_COLORS.forecast);
      expect(forecast.connectNulls).toBe(false);

      // Verify actual line has ink color
      const actual = series.find((s) => s.name === "Actual");
      expect(actual.lineStyle.color).toBe(THEME_COLORS.ink);

      // Verify error bars have ink border, pink for over, green for under
      const errors = series.find((s) => s.name === "Forecast Error");
      expect(errors.data[0].itemStyle.color).toBe(THEME_COLORS.riskBand);
      expect(errors.data[0].itemStyle.borderColor).toBe(THEME_COLORS.ink);
      expect(errors.data[1]).toBeNull();
      expect(errors.data[2].itemStyle.color).toBe(THEME_COLORS.firmWind);
    });

    it("respects toggle flags: showActual=false, showForecast=false, showErrorBars=false", () => {
      const option = buildSeriesOption(mockPoints, {
        showActual: false,
        showForecast: false,
        showErrorBars: false,
      });
      const series = option.series as any[];
      expect(series.length).toBe(0);
    });

    it("preserves nulls as gaps without converting them to zero", () => {
      const option = buildSeriesOption(mockPoints);
      const series = option.series as any[];
      const forecast = series.find((s) => s.name === "Forecast");
      expect(forecast.data[1]).toBeNull();
    });
  });

  describe("buildDayAheadOption", () => {
    const mock24Periods: DayAheadPeriodInput[] = Array.from({ length: 24 }, (_, i) => ({
      target_time_utc: `2026-01-15T${String(i).padStart(2, "0")}:00:00Z`,
      target_time_local: `2026-01-15 ${String(i).padStart(2, "0")}:00`,
      hour_local: i,
      forecast_mw: 5000 + i * 50,
      expected_wind_mw: 4600 + i * 50,
      firm_wind_mw: 3800 + i * 50,
      band_high_mw: 5000 + i * 50,
      actual_mw: 4200 + i * 50,
      error_mw: 800,
    }));

    it("builds forecast, expected, firm wind with casing, and risk band", () => {
      const option = buildDayAheadOption(mock24Periods, { revealActuals: false });
      const series = option.series as any[];

      const names = series.map((s) => s.name);
      expect(names).toContain("Forecast");
      expect(names).toContain("Forecast (casing)");
      expect(names).toContain("Expected");
      expect(names).toContain("Firm Wind");
      expect(names).toContain("Firm Wind (casing)");
      expect(names).toContain("Wind at Risk");

      // revealActuals = false => no Actual series
      expect(names).not.toContain("Actual");

      // Verify firm wind is a step line
      const firm = series.find((s) => s.name === "Firm Wind");
      expect(firm.step).toBe("end");
      expect(firm.lineStyle.color).toBe(THEME_COLORS.firmWind);

      // Verify expected is dashed
      const expected = series.find((s) => s.name === "Expected");
      expect(expected.lineStyle.type).toBe("dashed");

      // Verify direct end-labels
      expect(firm.endLabel.show).toBe(true);
      expect(firm.endLabel.formatter).toBe("Firm Wind");
    });

    it("revealActuals=true includes the 3px solid ink actuals series with circle markers", () => {
      const option = buildDayAheadOption(mock24Periods, { revealActuals: true });
      const series = option.series as any[];
      const actual = series.find((s) => s.name === "Actual");
      expect(actual).toBeDefined();
      expect(actual.lineStyle.color).toBe(THEME_COLORS.ink);
      expect(actual.lineStyle.width).toBe(3.0);
      expect(actual.symbol).toBe("circle");
      expect(actual.showSymbol).toBe(true);
    });

    it("omits risk series when risk fields are null", () => {
      const periodsWithoutRisk: DayAheadPeriodInput[] = mock24Periods.map((p) => ({
        ...p,
        firm_wind_mw: null,
        band_high_mw: null,
        expected_wind_mw: null,
      }));

      const option = buildDayAheadOption(periodsWithoutRisk, { revealActuals: false });
      const series = option.series as any[];
      const names = series.map((s) => s.name);

      expect(names).not.toContain("Firm Wind");
      expect(names).not.toContain("Wind at Risk");
      expect(names).not.toContain("Expected");
      expect(names).toContain("Forecast");
    });

    it("handles DST safe periods (23, 24, 25 periods)", () => {
      // 23 hours (spring DST transition)
      const periods23 = mock24Periods.slice(0, 23);
      const option23 = buildDayAheadOption(periods23);
      expect((option23.xAxis as any).data.length).toBe(23);

      // 25 hours (autumn DST transition)
      const periods25 = [
        ...mock24Periods,
        {
          target_time_utc: "2026-01-15T23:59:00Z",
          target_time_local: "2026-01-15 24:00",
          hour_local: 24,
          forecast_mw: 6000,
        },
      ];
      const option25 = buildDayAheadOption(periods25);
      expect((option25.xAxis as any).data.length).toBe(25);
    });

    it("preserves band ordering (firm_wind <= band_high)", () => {
      const option = buildDayAheadOption(mock24Periods);
      const series = option.series as any[];
      const riskDelta = series.find((s) => s.name === "Wind at Risk");

      // Verify each non-null value is >= 0
      for (const val of riskDelta.data) {
        expect(val).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("buildCalibrationOption", () => {
    const mockDays: CalibrationDayInput[] = [
      { date: "2026-01-01", total_periods: 24, covered_periods: 15, coverage_pct: 62.5 },
      { date: "2026-01-02", total_periods: 24, covered_periods: 23, coverage_pct: 95.8 },
      { date: "2026-01-03", total_periods: 24, covered_periods: 24, coverage_pct: 100.0 },
    ];

    it("colors bars green when >= target and pink when < target", () => {
      const option = buildCalibrationOption(mockDays, { target: 90, selectedDate: "2026-01-02" });
      const series = (option.series as any[])[0];

      expect(series.type).toBe("bar");
      expect(series.data.length).toBe(3);

      // 62.5% < 90% -> pink
      expect(series.data[0].itemStyle.color).toBe(THEME_COLORS.riskBand);
      // 95.8% >= 90% -> green
      expect(series.data[1].itemStyle.color).toBe(THEME_COLORS.firmWind);
      // 100.0% >= 90% -> green
      expect(series.data[2].itemStyle.color).toBe(THEME_COLORS.firmWind);

      // Selected day outlined thicker
      expect(series.data[1].itemStyle.borderWidth).toBe(3.5);
      expect(series.data[0].itemStyle.borderWidth).toBe(1.5);
    });

    it("places a markLine at target percentage", () => {
      const option = buildCalibrationOption(mockDays, { target: 90 });
      const series = (option.series as any[])[0];
      const markLine = series.markLine;

      expect(markLine).toBeDefined();
      expect(markLine.data[0].yAxis).toBe(90);
      expect(markLine.data[0].label.formatter).toBe("Target 90%");
      expect(markLine.data[0].lineStyle.color).toBe(THEME_COLORS.ink);
      expect(markLine.data[0].lineStyle.type).toBe("dashed");
    });
  });

  describe("buildHorizonOption", () => {
    const mockHorizon: HorizonPointInput[] = [
      { horizon_hours: 12, mae_mw: 450, rmse_mw: 600, bias_mw: 120, p90_abs_error_mw: 900, coverage_pct: 100 },
      { horizon_hours: 24, mae_mw: 750, rmse_mw: 980, bias_mw: 210, p90_abs_error_mw: 1400, coverage_pct: 100 },
      { horizon_hours: 48, mae_mw: 1100, rmse_mw: 1450, bias_mw: 350, p90_abs_error_mw: 2100, coverage_pct: 95 },
      { horizon_hours: 60, mae_mw: 1300, rmse_mw: 1700, bias_mw: 400, p90_abs_error_mw: 2500, coverage_pct: 80 },
    ];

    it("creates casing underlays for lines and renders MAE, RMSE, Bias, and P90", () => {
      const option = buildHorizonOption(mockHorizon, { reliableHorizonHours: 48, maxHorizonHours: 72 });
      const series = option.series as any[];
      const names = series.map((s) => s.name);

      expect(names).toContain("MAE (casing)");
      expect(names).toContain("MAE");
      expect(names).toContain("RMSE");
      expect(names).toContain("Bias");
      expect(names).toContain("P90 |error|");

      // Verify ink casing
      const maeCasing = series.find((s) => s.name === "MAE (casing)");
      expect(maeCasing.lineStyle.color).toBe(THEME_COLORS.ink);
      expect(maeCasing.silent).toBe(true);

      // Verify markArea exists for uncalibrated horizon (>48h) on Bias series
      const biasSeries = series.find((s) => s.name === "Bias");
      expect(biasSeries.markArea).toBeDefined();
    });
  });

  describe("buildDistributionOption", () => {
    const mockBins: DistributionBinInput[] = [
      { from_mw: -1500, to_mw: -1000, count: 12 },
      { from_mw: -1000, to_mw: -500, count: 48 },
      { from_mw: -500, to_mw: 0, count: 210 },
      { from_mw: 0, to_mw: 500, count: 320 },
      { from_mw: 500, to_mw: 1000, count: 120 },
      { from_mw: 1000, to_mw: 1500, count: 34 },
    ];

    it("colors negative bins green (under-forecast) and positive bins pink (over-forecast)", () => {
      const option = buildDistributionOption(mockBins, { p5: -800, p50: 150, p95: 950 });
      const series = (option.series as any[])[0];

      expect(series.type).toBe("bar");
      expect(series.data.length).toBe(6);

      // Negative bins (under-forecast) -> green firmWind
      expect(series.data[0].itemStyle.color).toBe(THEME_COLORS.firmWind);
      expect(series.data[1].itemStyle.color).toBe(THEME_COLORS.firmWind);
      expect(series.data[2].itemStyle.color).toBe(THEME_COLORS.firmWind);

      // Positive bins (over-forecast) -> pink riskBand
      expect(series.data[3].itemStyle.color).toBe(THEME_COLORS.riskBand);
      expect(series.data[4].itemStyle.color).toBe(THEME_COLORS.riskBand);
      expect(series.data[5].itemStyle.color).toBe(THEME_COLORS.riskBand);

      // Has markLine for P5, P50, P95
      expect(series.markLine).toBeDefined();
      expect(series.markLine.data.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("buildByHourOption", () => {
    const mockHours: ByHourPointInput[] = Array.from({ length: 24 }, (_, i) => ({
      hour_local: i,
      mae_mw: 600 + i * 15,
      bias_mw: 100 + (i % 5) * 20,
      n: 31,
    }));

    it("renders MAE bars and Bias line with casing across 24 hours", () => {
      const option = buildByHourOption(mockHours);
      const series = option.series as any[];
      const names = series.map((s) => s.name);

      expect(names).toContain("MAE (Bar)");
      expect(names).toContain("Bias (casing)");
      expect(names).toContain("Bias (Line)");

      const xAxis = option.xAxis as any;
      expect(xAxis.data.length).toBe(24);
      expect(xAxis.data[0]).toBe("00:00");
      expect(xAxis.data[23]).toBe("23:00");
    });
  });

  describe("buildByLevelOption", () => {
    const mockBins: ByLevelPointInput[] = [
      { bin: 0, level_from_mw: 0, level_to_mw: 3000, mae_mw: 400, bias_mw: 80, n: 120 },
      { bin: 1, level_from_mw: 3000, level_to_mw: 6000, mae_mw: 650, bias_mw: 160, n: 240 },
      { bin: 2, level_from_mw: 6000, level_to_mw: 9000, mae_mw: 900, bias_mw: 240, n: 180 },
      { bin: 3, level_from_mw: 9000, level_to_mw: 12000, mae_mw: 1150, bias_mw: 310, n: 130 },
      { bin: 4, level_from_mw: 12000, level_to_mw: 16000, mae_mw: 1400, bias_mw: 420, n: 74 },
    ];

    it("renders 5 generation level bins with MAE and Bias series", () => {
      const option = buildByLevelOption(mockBins);
      const series = option.series as any[];
      const names = series.map((s) => s.name);

      expect(names).toContain("MAE (Bar)");
      expect(names).toContain("Bias (casing)");
      expect(names).toContain("Bias (Line)");

      const xAxis = option.xAxis as any;
      expect(xAxis.data.length).toBe(5);
      expect(xAxis.data[0]).toBe("0..3000");
      expect(xAxis.data[4]).toBe("12000..16000");
    });
  });

  describe("buildHeatmapOption", () => {
    const mockHeatmap: HeatmapInput = {
      days: ["2026-01-01", "2026-01-02"],
      hours: [0, 1, 2, 3],
      values: [
        [-1200, -400, 50, 600],
        [300, 700, 1200, 1800],
      ],
    };

    it("configures a piecewise visualMap with 5 discrete color stops and ink borders", () => {
      const option = buildHeatmapOption(mockHeatmap);
      const visualMap = option.visualMap as any;

      expect(visualMap.type).toBe("piecewise");
      expect(visualMap.pieces.length).toBe(5);

      const series = (option.series as any[])[0];
      expect(series.type).toBe("heatmap");
      expect(series.itemStyle.borderColor).toBe(THEME_COLORS.ink);
      expect(series.itemStyle.borderWidth).toBeGreaterThanOrEqual(1);
    });
  });

  describe("buildVintagesOption", () => {
    const mockForecasts: VintageForecastPoint[] = [
      {
        published_at: "2026-01-14T07:30:00Z",
        horizon_h: 24,
        forecast_mw: 5200,
      },
      {
        published_at: "2026-01-14T09:30:00Z",
        horizon_h: 22,
        forecast_mw: 5000,
      },
    ];

    it("renders forecast vintages with casings and actual markLine with cutoff line", () => {
      const option = buildVintagesOption(mockForecasts, {
        actualMw: 4800,
        targetTimeUtc: "2026-01-15T00:00:00Z",
        cutoffTimeUtc: "2026-01-14T09:00:00Z",
      });
      const series = option.series as any[];
      const names = series.map((s) => s.name);

      expect(names).toContain("Forecast Evolution (casing)");
      expect(names).toContain("Forecast Evolution");

      // Verify casing exists on vintage lines
      const casing = series.find((s) => s.name === "Forecast Evolution (casing)");
      expect(casing.lineStyle.color).toBe(THEME_COLORS.ink);

      // Verify actual markLine is defined on the forecast series
      const forecastSeries = series.find((s) => s.name === "Forecast Evolution");
      expect(forecastSeries.markLine).toBeDefined();
    });
  });
});
