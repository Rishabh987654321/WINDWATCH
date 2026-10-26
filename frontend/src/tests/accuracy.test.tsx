/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import AccuracyPage from "../pages/AccuracyPage";
import { useFilters } from "../store/filters";

// Track mock charts and click handlers
let chartReadyHandlers: Record<string, any> = {};
vi.mock("../components/charts/Chart", () => ({
  Chart: ({ ariaLabel, onChartReady }: any) => {
    return (
      <div data-testid="mock-chart" aria-label={ariaLabel}>
        <button
          data-testid={`trigger-ready-${ariaLabel}`}
          onClick={() => {
            if (onChartReady) {
              const mockChartInstance = {
                on: (eventName: string, handler: any) => {
                  chartReadyHandlers[`${ariaLabel}_${eventName}`] = handler;
                },
              };
              onChartReady(mockChartInstance);
            }
          }}
        >
          Mock Chart {ariaLabel}
        </button>
      </div>
    );
  },
}));

let requestCount = 0;
const recordedUrls: string[] = [];

const mockSummary = {
  n: 744,
  mae_mw: 1102.5,
  rmse_mw: 1540.2,
  bias_mw: 420.1,
  over_forecast_rate: 0.72,
  max_over_forecast: {
    ts: "2026-01-28T14:00:00Z",
    mw: 5329.0,
  },
  max_under_forecast: {
    ts: "2026-01-09T03:00:00Z",
    mw: -3120.0,
  },
};

const mockByHorizon = {
  points: [
    { horizon_hours: 0, mae_mw: 350.0, rmse_mw: 480.0, bias_mw: 50.0, coverage_pct: 100.0, n: 744, n_expected: 744 },
    { horizon_hours: 12, mae_mw: 700.0, rmse_mw: 920.0, bias_mw: 180.0, coverage_pct: 100.0, n: 744, n_expected: 744 },
    { horizon_hours: 24, mae_mw: 1100.0, rmse_mw: 1450.0, bias_mw: 350.0, coverage_pct: 100.0, n: 744, n_expected: 744 },
    { horizon_hours: 44, mae_mw: 1600.0, rmse_mw: 2100.0, bias_mw: 480.0, coverage_pct: 96.0, n: 714, n_expected: 744 },
    { horizon_hours: 60, mae_mw: 2000.0, rmse_mw: 2600.0, bias_mw: 550.0, coverage_pct: 75.0, n: 558, n_expected: 744 },
  ],
};

const mockDistribution = {
  bin_width_mw: 250,
  bins: [
    { from_mw: -1000, to_mw: -500, count: 50 },
    { from_mw: -500, to_mw: 0, count: 150 },
    { from_mw: 0, to_mw: 500, count: 320 },
    { from_mw: 500, to_mw: 1000, count: 180 },
    { from_mw: 1000, to_mw: 1500, count: 44 },
  ],
  quantiles: {
    p05: -600.0,
    p25: -100.0,
    p50: 220.0,
    p75: 680.0,
    p95: 1250.0,
  },
};

const mockByHour = {
  points: Array.from({ length: 24 }, (_, i) => ({
    hour_local: i,
    mae_mw: 900.0 + i * 20.0,
    bias_mw: 100.0 + i * 15.0,
    n: 31,
  })),
};

const mockByLevel = {
  basis: "forecast",
  points: [
    { bin: 0, level_from_mw: 0, level_to_mw: 3000, mae_mw: 420.0, bias_mw: 60.0, n: 148 },
    { bin: 1, level_from_mw: 3000, level_to_mw: 6000, mae_mw: 750.0, bias_mw: 180.0, n: 150 },
    { bin: 2, level_from_mw: 6000, level_to_mw: 9000, mae_mw: 1050.0, bias_mw: 290.0, n: 149 },
    { bin: 3, level_from_mw: 9000, level_to_mw: 12000, mae_mw: 1350.0, bias_mw: 410.0, n: 150 },
    { bin: 4, level_from_mw: 12000, level_to_mw: 16000, mae_mw: 1850.0, bias_mw: 620.0, n: 147 },
  ],
};

const mockHeatmap = {
  days: ["2026-01-01", "2026-01-02", "2026-01-28"],
  hours: [0, 6, 12, 18],
  values: [
    [-400, 200, 600, 1200],
    [100, 300, 800, 1500],
    [500, 1200, 5329, 3200],
  ],
};

const mockVintages = {
  target: "2026-01-28T14:00:00Z",
  actual_mw: 8200.0,
  forecasts: [
    { published_at: "2026-01-27T07:30:00Z", horizon_h: 30.5, forecast_mw: 13529.0 },
    { published_at: "2026-01-27T09:30:00Z", horizon_h: 28.5, forecast_mw: 13400.0 },
    { published_at: "2026-01-28T07:30:00Z", horizon_h: 6.5, forecast_mw: 12900.0 },
  ],
};

const mockSeriesSingleHour = {
  points: [
    {
      ts: "2026-01-28T14:00:00Z",
      actual_mw: 8200.0,
      forecast_mw: 13529.0,
      forecast_published_at: "2026-01-27T07:30:00Z",
      horizon_h: 30.5,
      error_mw: 5329.0,
    },
  ],
};

const server = setupServer(
  http.get("*/api/v1/metrics/summary", ({ request }) => {
    requestCount++;
    recordedUrls.push(request.url);
    return HttpResponse.json(mockSummary);
  }),
  http.get("*/api/v1/metrics/by-horizon", ({ request }) => {
    requestCount++;
    recordedUrls.push(request.url);
    return HttpResponse.json(mockByHorizon);
  }),
  http.get("*/api/v1/metrics/distribution", ({ request }) => {
    requestCount++;
    recordedUrls.push(request.url);
    return HttpResponse.json(mockDistribution);
  }),
  http.get("*/api/v1/metrics/by-hour", ({ request }) => {
    requestCount++;
    recordedUrls.push(request.url);
    return HttpResponse.json(mockByHour);
  }),
  http.get("*/api/v1/metrics/by-level", ({ request }) => {
    requestCount++;
    recordedUrls.push(request.url);
    return HttpResponse.json(mockByLevel);
  }),
  http.get("*/api/v1/metrics/heatmap", ({ request }) => {
    requestCount++;
    recordedUrls.push(request.url);
    return HttpResponse.json(mockHeatmap);
  }),
  http.get("*/api/v1/vintages", ({ request }) => {
    requestCount++;
    recordedUrls.push(request.url);
    return HttpResponse.json(mockVintages);
  }),
  http.get("*/api/v1/series", ({ request }) => {
    requestCount++;
    recordedUrls.push(request.url);
    return HttpResponse.json(mockSeriesSingleHour);
  })
);

describe("AccuracyPage Integration & Interactivity", () => {
  let queryClient: QueryClient;

  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    chartReadyHandlers = {};
    requestCount = 0;
    recordedUrls.length = 0;
    useFilters.setState({
      policy: "day_ahead",
      horizonHours: 0,
      targetTime: undefined,
    });
  });
  afterAll(() => server.close());

  function renderPage() {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, staleTime: 0 },
      },
    });
    queryClient.clear();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/accuracy"]}>
          <AccuracyPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("renders all 6 analytical deep-dive cards and insight captions", async () => {
    renderPage();

    // 1. Horizon Card
    expect(await screen.findByText("1. Error vs Forecast Horizon")).toBeInTheDocument();
    // 2. Distribution Card
    expect(await screen.findByText("2. Forecast Error Distribution")).toBeInTheDocument();
    // 3. By Hour Card
    expect(await screen.findByText("3. Error by Hour of Day")).toBeInTheDocument();
    // 4. By Level Card
    expect(await screen.findByText("4. Error by Generation Level")).toBeInTheDocument();
    // 5. Heatmap Card
    expect(await screen.findByText("5. Day × Hour Error Heatmap")).toBeInTheDocument();
    // 6. Vintages Card
    expect(await screen.findByText("6. Forecast Evolution (Vintages)")).toBeInTheDocument();

    // Verify presence of data-driven captions
    await waitFor(() => {
      expect(screen.getByText(/MAE 350.0 MW at H=0 → 1600.0 MW at H=44/)).toBeInTheDocument();
      expect(screen.getByText(/Forecast was above actual in 72.0% of hours/)).toBeInTheDocument();
      expect(screen.getByText(/Peak error occurred on 2026-01-28 at 12:00/)).toBeInTheDocument();
    });
  });

  it("loads /accuracy within performance budget of <= 8 API requests", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("1. Error vs Forecast Horizon")).toBeInTheDocument();
      expect(screen.getByText("6. Forecast Evolution (Vintages)")).toBeInTheDocument();
    });

    // Verify request count <= 8 requests (summary, by-horizon, distribution, by-hour, by-level, heatmap, vintages, single-hour series)
    expect(requestCount).toBeLessThanOrEqual(8);
  });

  it("sets policy=lead_time and h in store when horizon chart point is clicked", async () => {
    renderPage();

    const triggerBtn = await screen.findByTestId("trigger-ready-Error vs Forecast Horizon Chart");
    fireEvent.click(triggerBtn);

    const clickHandler = chartReadyHandlers["Error vs Forecast Horizon Chart_click"];
    expect(clickHandler).toBeDefined();

    // Simulate clicking 24h point
    clickHandler({ name: "24h" });

    // Store should update
    const state = useFilters.getState();
    expect(state.policy).toBe("lead_time");
    expect(state.horizonHours).toBe(24);
  });

  it("updates targetTime when BIGGEST OVER-FORECAST chip is clicked", async () => {
    renderPage();

    const overChip = await screen.findByText(/BIGGEST OVER-FORECAST/);
    expect(overChip).toBeInTheDocument();

    fireEvent.click(overChip);

    const state = useFilters.getState();
    expect(state.targetTime).toBe("2026-01-28T14:00:00Z");
  });

  it("renders Callout error with RETRY button when an endpoint fails", async () => {
    server.use(
      http.get("*/api/v1/metrics/by-horizon", () => {
        return new HttpResponse(null, { status: 400, statusText: "Bad Request" });
      })
    );

    renderPage();

    expect(await screen.findByText("Failed to load horizon curve")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RETRY" })).toBeInTheDocument();
  });
});
