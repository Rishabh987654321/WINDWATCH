import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import OverviewPage from "../pages/OverviewPage";
import { FilterBar } from "../components/shell/FilterBar";
import { useFilters } from "../store/filters";

const mockMeta = {
  app_version: "0.1.0",
  timezone: "Europe/London",
  data: {
    snapshot_id: "snap-test-123",
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

const mockSummary = {
  policy: "day_ahead",
  n: 744,
  mae_mw: 2127.5,
  bias_mw: 1851.5,
  rmse_mw: 2050.2,
  nmae_pct: 16.0,
  p90_abs_error_mw: 3200.5,
  p95_abs_error_mw: 4100.8,
  over_forecast_rate: 0.88,
};

const mockSeries = {
  policy: "day_ahead",
  n: 3,
  points: [
    {
      ts: "2026-01-15T00:00:00Z",
      actual_mw: 4000.0,
      forecast_mw: 4500.0,
      error_mw: 500.0,
      forecast_published_at: "2026-01-14T07:30:00Z",
      horizon_h: 16.5,
    },
    {
      ts: "2026-01-15T01:00:00Z",
      actual_mw: 4200.0,
      forecast_mw: 4800.0,
      error_mw: 600.0,
      forecast_published_at: "2026-01-14T07:30:00Z",
      horizon_h: 17.5,
    },
  ],
};

let seriesCallCount = 0;

const server = setupServer(
  http.get("*/api/v1/meta", () => HttpResponse.json(mockMeta)),
  http.get("*/api/v1/metrics/summary", () => HttpResponse.json(mockSummary)),
  http.get("*/api/v1/series", () => {
    seriesCallCount++;
    return HttpResponse.json(mockSeries);
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  seriesCallCount = 0;
});
afterAll(() => server.close());

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OverviewPage & FilterBar Interactivity", () => {
  it("renders Hero card, headline KPIs, and active-selection callout", async () => {
    renderWithClient(
      <>
        <FilterBar />
        <OverviewPage />
      </>
    );

    // Hero title
    expect(await screen.findByText(/Know your wind before you buy/i)).toBeInTheDocument();

    // Active selection callout
    expect(
      screen.getByText(/Showing the forecast available at 09:00 on the day before/i)
    ).toBeInTheDocument();

    // Headline KPIs in Hero card
    await waitFor(() => {
      expect(screen.getAllByText(/2,127.5 MW/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/\+1,851.5 MW/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/3,200.5 MW/i)).toBeInTheDocument();
    });

    // CTA button to Day-Ahead view
    const cta = screen.getByText(/OPEN DECISION VIEW →/i);
    expect(cta).toBeInTheDocument();
  });

  it("switching policy from day_ahead to lead_time reveals the lead horizon slider", async () => {
    renderWithClient(
      <>
        <FilterBar />
        <OverviewPage />
      </>
    );

    // Click policy option
    const leadTimeOption = await screen.findByText(/Latest forecast ≥ N h ahead/i);
    fireEvent.click(leadTimeOption);

    // Lead horizon slider should appear
    expect(await screen.findByText(/Lead Horizon/i)).toBeInTheDocument();
  });

  it("shows THIN DATA sticker when horizon > reliable_horizon_hours (44h)", async () => {
    // Set store state to lead_time with h = 48
    useFilters.getState().setFilters({
      policy: "lead_time",
      horizonHours: 48,
    });

    renderWithClient(
      <>
        <FilterBar />
        <OverviewPage />
      </>
    );

    expect(await screen.findByText(/THIN DATA BEYOND 44H/i)).toBeInTheDocument();
    expect(
      screen.getByText(/THIN DATA SAMPLING WARNING/i)
    ).toBeInTheDocument();
  });

  it("renders error state with RETRY button when series fails", async () => {
    server.use(
      http.get("*/api/v1/series", () => {
        return HttpResponse.json(
          { detail: "Invalid series query", request_id: "req-fail-999" },
          { status: 400, headers: { "X-Request-ID": "req-fail-999" } }
        );
      })
    );

    renderWithClient(<OverviewPage />);

    expect(await screen.findByText(/Failed to Load Series Data/i)).toBeInTheDocument();
    expect(screen.getByText(/Request ID: req-fail-999/i)).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /RETRY/i });
    expect(retryBtn).toBeInTheDocument();
  });

  it("simulates a 20-step slider drag resulting in <= 3 network calls", async () => {
    useFilters.getState().setFilters({
      policy: "lead_time",
      horizonHours: 0,
    });

    renderWithClient(
      <>
        <FilterBar />
        <OverviewPage />
      </>
    );

    await screen.findByText(/Lead Horizon/i);
    const initialSeriesCalls = seriesCallCount;

    // Simulate 20 rapid changes within 100ms
    for (let step = 1; step <= 20; step++) {
      useFilters.getState().setFilter("horizonHours", step, { replace: true });
    }

    // Wait 300ms for debouncing to settle
    await new Promise((r) => setTimeout(r, 300));

    const totalSeriesCallsMade = seriesCallCount - initialSeriesCalls;
    expect(totalSeriesCallsMade).toBeLessThanOrEqual(3);
  });
});
