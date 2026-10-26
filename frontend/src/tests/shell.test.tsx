import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import App from "../App";
import type { MetaResponse } from "../api/types";

const mockMeta: MetaResponse = {
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

const mockSummary = {
  policy: "day_ahead",
  n: 744,
  mae_mw: 2127.5,
  bias_mw: 1851.5,
  rmse_mw: 2050.2,
  nmae_pct: 16.0,
  p90_abs_error_mw: 3200.5,
  p95_abs_error_mw: 4100.8,
};

const server = setupServer(
  http.get("*/api/v1/meta", () => {
    return HttpResponse.json(mockMeta);
  }),
  http.get("*/api/v1/metrics/summary", () => {
    return HttpResponse.json(mockSummary);
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  window.history.pushState(null, "", "/");
});
afterAll(() => server.close());

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

describe("App Shell Integration", () => {
  it("renders loading skeleton initially and transitions to shell with loaded data", async () => {
    renderApp();

    // Check skeleton
    expect(screen.getByTestId("app-skeleton")).toBeInTheDocument();

    // Wait for transition to loaded shell
    await waitFor(() => {
      expect(screen.getByText("WINDWATCH")).toBeInTheDocument();
    });

    // Check nav links (present in both desktop and mobile bars)
    expect(screen.getAllByRole("link", { name: "OVERVIEW" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "DAY-AHEAD" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "ACCURACY LAB" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "METHODOLOGY" }).length).toBeGreaterThanOrEqual(1);

    // Check data badge
    expect(screen.getByText(/DATA: JAN 2026/)).toBeInTheDocument();
  });

  it("renders pink error Callout with RETRY when /meta fails", async () => {
    server.use(
      http.get("*/api/v1/meta", () => {
        return new HttpResponse(
          JSON.stringify({
            title: "Internal Error",
            detail: "Snapshot unavailable",
          }),
          { status: 500 }
        );
      })
    );

    renderApp();

    await waitFor(
      () => {
        expect(
          screen.getByText("Bootstrap Failed — /meta")
        ).toBeInTheDocument();
      },
      { timeout: 4000 }
    );

    expect(screen.getByRole("button", { name: "RETRY" })).toBeInTheDocument();
  });

  it("opens QualityPopover on clicking data badge and shows quality audit info", async () => {
    renderApp();

    await waitFor(
      () => {
        expect(screen.getByText(/DATA: JAN 2026/)).toBeInTheDocument();
      },
      { timeout: 4000 }
    );

    const dataBadge = screen.getByLabelText(/View data snapshot quality details/i);
    fireEvent.click(dataBadge);

    expect(
      screen.getByText("Snapshot Quality & Lineage")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Retrocast Rows Dropped:")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Informational: BMRS publication artifact")
    ).toBeInTheDocument();
  });
});
