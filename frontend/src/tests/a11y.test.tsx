import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import UiKitPage from "../pages/UiKitPage";
import DayAheadPage from "../pages/DayAheadPage";
import AccuracyPage from "../pages/AccuracyPage";
import MethodologyPage from "../pages/MethodologyPage";


const mockMeta = {
  app_version: "0.1.0",
  timezone: "Europe/London",
  data: {
    snapshot_id: "snapshot-2026-01-31-hash12345",
    ingested_at: "2026-02-01T04:00:00Z",
    coverage: {
      forecasts: { from: "2025-12-01T00:00:00Z", to: "2026-01-31T23:00:00Z" },
      actuals: { from: "2025-12-01T00:00:00Z", to: "2026-01-31T23:00:00Z" },
    },
    evaluation_window: {
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-31T23:00:00Z",
    },
    max_horizon_hours: 66,
    reliable_horizon_hours: 44,
    resolution_minutes: 60,
    actual_resolution_minutes: 30,
    sources: ["BMRS FUELHH", "BMRS WINDFOR"],
    quality: {
      missing_actual_periods: 0,
      missing_forecast_periods: 0,
      duplicates_removed: 0,
      dropped_negative: 0,
      retrocast_rows_dropped: 360,
    },
  },
  defaults: {
    policy: "day_ahead",
    cutoff_local: "09:00",
    window_days: 28,
    risk_quantile: 0.9,
  },
};

const mockDayAhead = {
  delivery_date: "2026-01-15",
  decision_cutoff_utc: "2026-01-14T09:00:00Z",
  cutoff_local: "09:00",
  risk: {
    quantile: 0.9,
    window_days: 28,
    error_sample_size: 28,
    error_sample_range: {
      from: "2025-12-16T00:00:00Z",
      to: "2026-01-13T23:00:00Z",
    },
    over_forecast_at_q_mw: 1200.0,
  },
  periods: Array.from({ length: 24 }, (_, i) => ({
    ts: `2026-01-15T${String(i).padStart(2, "0")}:00:00Z`,
    forecast_mw: 5000.0,
    forecast_published_at: "2026-01-14T07:30:00Z",
    firm_wind_mw: 3800.0,
    expected_wind_mw: 4500.0,
    band_high_mw: 5000.0,
    actual_mw: 4200.0,
    error_mw: 800.0,
  })),
};

const mockCalibration = {
  risk_quantile: 0.9,
  window_days: 28,
  realised_coverage_pct: 88.5,
  days: [
    {
      delivery_date: "2026-01-15",
      decision_cutoff_utc: "2026-01-14T09:00:00Z",
      hours_evaluated: 24,
      hours_actual_covered: 22,
      coverage_pct: 91.7,
      over_forecast_at_q_mw: 1200.0,
    },
  ],
};

const server = setupServer(
  http.get("*/api/v1/meta", () => HttpResponse.json(mockMeta)),
  http.get("*/api/v1/metrics/summary", () =>
    HttpResponse.json({
      policy: "day_ahead",
      n: 744,
      mae_mw: 2127.5,
      bias_mw: 1851.5,
      rmse_mw: 2050.2,
      nmae_pct: 16.0,
      max_over_forecast: { ts: "2026-01-15T12:00:00Z", error_mw: 3000 },
      max_under_forecast: { ts: "2026-01-20T18:00:00Z", error_mw: -1500 },
    })
  ),
  http.get("*/api/v1/series/day-ahead", () => HttpResponse.json(mockDayAhead)),
  http.get("*/api/v1/calibration/daily", () => HttpResponse.json(mockCalibration)),
  http.get("*/api/v1/metrics/by-horizon", () =>
    HttpResponse.json({
      policy: "lead_time",
      reliable_horizon_hours: 44,
      points: [{ horizon_hours: 24, n: 744, coverage_pct: 100, mae_mw: 2127.5, rmse_mw: 2500, p90_error_mw: 3500 }],
    })
  ),
  http.get("*/api/v1/metrics/distribution", () =>
    HttpResponse.json({
      policy: "day_ahead",
      n: 744,
      bin_width_mw: 250,
      bins: [{ from_mw: 0, to_mw: 250, count: 50, pct: 10 }],
      quantiles: { p5_mw: -500, p50_mw: 1800, p95_mw: 3200 },
    })
  ),
  http.get("*/api/v1/metrics/by-hour", () =>
    HttpResponse.json({
      policy: "day_ahead",
      points: [{ hour_utc: 0, hour_local: 0, n: 31, mae_mw: 2000, bias_mw: 1800 }],
    })
  ),
  http.get("*/api/v1/metrics/by-level", () =>
    HttpResponse.json({
      basis: "forecast",
      points: [
        { bin: 0, level_from_mw: 0, level_to_mw: 3000, mae_mw: 420.0, bias_mw: 60.0, n: 148 },
        { bin: 1, level_from_mw: 3000, level_to_mw: 6000, mae_mw: 750.0, bias_mw: 180.0, n: 150 },
      ],
    })
  ),
  http.get("*/api/v1/metrics/heatmap", () =>
    HttpResponse.json({
      policy: "day_ahead",
      days: ["2026-01-01"],
      hours: [0],
      values: [[2100]],
    })
  ),
  http.get("*/api/v1/vintages", () =>
    HttpResponse.json({
      target: "2026-01-28T14:00:00Z",
      actual_mw: 8200.0,
      forecasts: [
        { published_at: "2026-01-27T07:30:00Z", horizon_h: 30.5, forecast_mw: 13529.0 },
        { published_at: "2026-01-27T09:30:00Z", horizon_h: 28.5, forecast_mw: 13400.0 },
      ],
    })
  ),
  http.get("*/api/v1/day-ahead/calibration", () => HttpResponse.json(mockCalibration)),
  http.get("*/api/v1/series", () =>
    HttpResponse.json({
      policy: "day_ahead",
      points: [{ ts: "2026-01-15T12:00:00Z", forecast_mw: 5000.0, forecast_published_at: "2026-01-14T07:30:00Z", actual_mw: 4200.0, error_mw: 800.0 }],
    })
  )
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Accessibility Audit (vitest-axe)", () => {
  it("verifies loaded App shell has no serious or critical a11y violations", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(container.querySelector("header")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("verifies UiKitPage primitives have no serious or critical a11y violations", async () => {
    const { container } = render(<UiKitPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("verifies DayAheadPage has no serious or critical a11y violations", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/day-ahead?d=2026-01-15"]}>
          <DayAheadPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(container.querySelector(".space-y-6")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("verifies AccuracyPage has no serious or critical a11y violations", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/accuracy"]}>
          <AccuracyPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("verifies MethodologyPage has no serious or critical a11y violations", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/methodology"]}>
          <MethodologyPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
