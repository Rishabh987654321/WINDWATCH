/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import DayAheadPage from "../pages/DayAheadPage";
import { useFilters } from "../store/filters";

// Mock Chart component to capture options passed to it
let lastChartOptions: any[] = [];
vi.mock("../components/charts/Chart", () => ({
  Chart: ({ option, ariaLabel, onChartReady }: any) => {
    lastChartOptions.push({ option, ariaLabel });
    return (
      <div data-testid="mock-chart" aria-label={ariaLabel}>
        <button
          data-testid="trigger-chart-ready"
          onClick={() => {
            if (onChartReady) {
              onChartReady({
                on: (eventName: string, handler: any) => {
                  if (eventName === "click") {
                    (window as any).__chartClickHandler = handler;
                  }
                },
              });
            }
          }}
        >
          Mock Chart Ready
        </button>
      </div>
    );
  },
}));

const mockDayAheadResponse = {
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
  })),
  summary: {
    mean_forecast_mw: 5000.0,
    mean_firm_wind_mw: 3800.0,
    mean_expected_wind_mw: 4500.0,
    total_forecast_mwh: 120000.0,
    total_firm_mwh: 91200.0,
    forecast_age_h: {
      min: 16.5,
      max: 39.5,
    },
  },
  day_accuracy: {
    mae_mw: 800.0,
    bias_mw: 800.0,
    rmse_mw: 850.0,
    n: 24,
  },
  coverage: {
    n_expected: 24,
    n_actual: 24,
    coverage_pct: 100.0,
  },
};

const mockCalibrationResponse = {
  risk_quantile: 0.9,
  realised_coverage_pct: 88.58,
  days: [
    { delivery_date: "2026-01-01", coverage_pct: 62.5, n: 24, mean_firm_wind_mw: 3500 },
    { delivery_date: "2026-01-15", coverage_pct: 100.0, n: 24, mean_firm_wind_mw: 3800 },
    { delivery_date: "2026-01-28", coverage_pct: 0.0, n: 24, mean_firm_wind_mw: 4000 },
  ],
};

const mockHeatmapResponse = {
  days: ["2026-01-11", "2026-01-15", "2026-01-28"],
  hours: [0, 1],
  values: [
    [500.0, 600.0], // mean = 550 (close call)
    [1000.0, 1200.0], // mean = 1100
    [3000.0, 3500.0], // mean = 3250 (biggest miss)
  ],
};

let lastDayAheadQuery: any = null;

const server = setupServer(
  http.get("*/api/v1/day-ahead/:date", ({ params, request }) => {
    const url = new URL(request.url);
    lastDayAheadQuery = {
      date: params.date,
      q: url.searchParams.get("risk_quantile"),
      w: url.searchParams.get("window_days"),
      cutoff: url.searchParams.get("cutoff"),
    };
    return HttpResponse.json({
      ...mockDayAheadResponse,
      delivery_date: params.date,
    });
  }),
  http.get("*/api/v1/day-ahead/calibration", () => {
    return HttpResponse.json(mockCalibrationResponse);
  }),
  http.get("*/api/v1/metrics/heatmap", () => {
    return HttpResponse.json(mockHeatmapResponse);
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  lastChartOptions = [];
  lastDayAheadQuery = null;
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

describe("DayAheadPage Interactivity & Risk View", () => {
  it("loads delivery date 2026-01-15 and renders forecast header strip", async () => {
    useFilters.getState().setFilters({ deliveryDate: "2026-01-15" });

    renderWithClient(<DayAheadPage />);

    expect(
      await screen.findByText(/Forecast as of/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/latest run published/i)).toBeInTheDocument();
    expect(screen.getByText(/ASSUMPTION/i)).toBeInTheDocument();
  });

  it("arrow keys and prev/next buttons change deliveryDate", async () => {
    useFilters.getState().setFilters({ deliveryDate: "2026-01-15" });

    renderWithClient(<DayAheadPage />);

    await screen.findByText(/Forecast as of/i);

    // Click NEXT button
    const nextBtn = screen.getByRole("button", { name: /Next Delivery Day/i });
    fireEvent.click(nextBtn);

    expect(useFilters.getState().deliveryDate).toBe("2026-01-16");

    // Keyboard ArrowLeft
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useFilters.getState().deliveryDate).toBe("2026-01-15");
  });

  it("picks BIGGEST MISS chip and CLOSE CALL chip from heatmap data", async () => {
    renderWithClient(<DayAheadPage />);

    const biggestMissChip = await screen.findByText(/BIGGEST MISS · 2026-01-28/i);
    expect(biggestMissChip).toBeInTheDocument();

    const closeCallChip = await screen.findByText(/CLOSE CALL · 2026-01-11/i);
    expect(closeCallChip).toBeInTheDocument();

    fireEvent.click(biggestMissChip);
    expect(useFilters.getState().deliveryDate).toBe("2026-01-28");
  });

  it("REVEAL toggle adds/removes actual series from the decision chart", async () => {
    useFilters.getState().setFilters({
      deliveryDate: "2026-01-15",
      revealActuals: false,
    });

    renderWithClient(<DayAheadPage />);

    const switchBtn = await screen.findByRole("switch", { name: /REVEAL ACTUALS/i });
    expect(switchBtn).toBeInTheDocument();

    // Initial state: revealActuals is false -> locked placeholder visible
    expect(
      screen.getByText(/Hidden — you didn't know this at the cutoff/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      const chart = lastChartOptions.find((c) =>
        c.ariaLabel.includes("Day-ahead forecast")
      );
      expect(chart).toBeDefined();
    });

    // Verify option passed to Chart has no "Actual" series
    const unrevealedChart = lastChartOptions.find((c) =>
      c.ariaLabel.includes("Day-ahead forecast")
    );
    const unrevealedSeriesNames = unrevealedChart.option.series.map((s: any) => s.name);
    expect(unrevealedSeriesNames).not.toContain("Actual");

    // Toggle REVEAL ACTUALS
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(useFilters.getState().revealActuals).toBe(true);
    });

    // After reveal: day accuracy card shows numbers
    expect(await screen.findByText(/Day MAE:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/800\.0 MW/i).length).toBeGreaterThanOrEqual(1);

    // Verify option passed to Chart now includes "Actual" series
    const revealedChart = [...lastChartOptions]
      .reverse()
      .find((c) => c.ariaLabel.includes("Day-ahead forecast"));
    expect(revealedChart).toBeDefined();
    const revealedSeriesNames = revealedChart.option.series.map((s: any) => s.name);
    expect(revealedSeriesNames).toContain("Actual");
  });

  it("changing quantile q updates risk control and issues request with new q", async () => {
    renderWithClient(<DayAheadPage />);

    const q80Option = await screen.findByText("80%");
    fireEvent.click(q80Option);

    await waitFor(() => {
      expect(useFilters.getState().riskQuantile).toBe(0.8);
      expect(lastDayAheadQuery?.q).toBe("0.8");
      expect(screen.getByText(/Firm Wind \(80% target\)/i)).toBeInTheDocument();
    });
  });

  it("renders Callout notice when risk is null due to short sample", async () => {
    server.use(
      http.get("*/api/v1/day-ahead/:date", () => {
        return HttpResponse.json({
          ...mockDayAheadResponse,
          risk: null,
          summary: {
            ...mockDayAheadResponse.summary,
            mean_firm_wind_mw: null,
            total_firm_mwh: null,
          },
        });
      })
    );

    renderWithClient(<DayAheadPage />);

    expect(await screen.findByText(/Short Sample Notice/i)).toBeInTheDocument();
  });

  it("honesty copy rule: NEVER renders the word 'confidence' anywhere on the page", async () => {
    renderWithClient(<DayAheadPage />);

    await screen.findByText(/Day-Ahead Forecast & Firm Wind/i);

    // Whole body text check
    const bodyText = document.body.textContent || "";
    expect(bodyText.toLowerCase()).not.toContain("confidence");
  });
});
