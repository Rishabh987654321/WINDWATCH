import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import MethodologyPage from "../pages/MethodologyPage";
import * as contentModule from "../content/methodology";

const mockMeta = {
  app_version: "v0.1.0",
  data: {
    snapshot_id: "snap-2026-01-test",
    ingested_at: "2026-02-01T04:00:00Z",
    sources: ["BMRS FUELHH", "BMRS WINDFOR"],
    coverage: {
      actuals: { from: "2025-12-01T00:00:00Z", to: "2026-01-31T23:00:00Z" },
      forecasts: { from: "2025-12-01T00:00:00Z", to: "2026-01-31T23:00:00Z" },
    },
    evaluation_window: { from: "2026-01-01T00:00:00Z", to: "2026-01-31T23:00:00Z" },
    max_horizon_hours: 66,
    reliable_horizon_hours: 44,
    resolution_minutes: 60,
    actual_resolution_minutes: 30,
    quality: {
      raw_rows: 150000,
      retrocast_rows_dropped: 48,
      missing_forecast_rows: 0,
    },
  },
  defaults: {
    policy: "day_ahead",
    cutoff_local: "09:00",
    risk_quantile: 0.9,
    window_days: 28,
  },
};

const server = setupServer(
  http.get("*/api/v1/meta", () => {
    return HttpResponse.json(mockMeta);
  }),
  http.get("*/api/v1/day-ahead/calibration", ({ request }) => {
    const url = new URL(request.url);
    const q = parseFloat(url.searchParams.get("risk_quantile") || "0.9");
    const w = parseInt(url.searchParams.get("window_days") || "28", 10);

    const basePct = q === 0.8 ? 79.2 : q === 0.95 ? 94.1 : 88.6;
    return HttpResponse.json({
      risk_quantile: q,
      realised_coverage_pct: basePct,
      days: Array.from({ length: 31 }, (_, i) => ({
        delivery_date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        coverage_pct: basePct,
        n: 24,
        mean_firm_wind_mw: 3200,
      })),
    });
  })
);

describe("MethodologyPage Integration & Content Integrity", () => {
  let queryClient: QueryClient;

  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => server.close());

  function renderPage() {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/methodology"]}>
          <MethodologyPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("contains all required DOM anchor IDs for cross-linking", async () => {
    const { container } = renderPage();

    const requiredAnchors = [
      "mae",
      "rmse",
      "bias",
      "nmae",
      "p90",
      "over-forecast-rate",
      "why-not-mape",
      "policies",
      "cutoff",
      "horizon",
      "hourly-grid",
      "risk",
      "firm-wind",
      "expected-wind",
      "calibration",
      "assumptions",
      "caveats",
      "lineage",
      "ai-use",
    ];

    for (const id of requiredAnchors) {
      const el = container.querySelector(`#${id}`);
      expect(el, `Expected element with id="#${id}" to exist`).not.toBeNull();
    }
  });

  it("renders live calibration sensitivity tables from API responses", async () => {
    renderPage();

    // Verify window length rows
    expect(await screen.findByText("7 days")).toBeInTheDocument();
    expect(screen.getByText("14 days")).toBeInTheDocument();
    expect(screen.getByText("21 days")).toBeInTheDocument();
    expect(screen.getByText("28 days")).toBeInTheDocument();

    // Verify quantile sensitivity rows
    expect(screen.getByText("0.80")).toBeInTheDocument();
    expect(screen.getByText("0.95")).toBeInTheDocument();

    // Verify realised coverage percentages populated
    await waitFor(() => {
      expect(screen.getAllByText("88.6%").length).toBeGreaterThan(0);
      expect(screen.getByText("79.2%")).toBeInTheDocument();
      expect(screen.getByText("94.1%")).toBeInTheDocument();
    });
  });

  it("displays data lineage and provenance dynamically from /meta", async () => {
    renderPage();

    expect(await screen.findByText("snap-2026-01-test")).toBeInTheDocument();
    expect(screen.getByText("2026-02-01T04:00:00Z")).toBeInTheDocument();
    expect(screen.getByText(/Retrocast rows dropped: 48/)).toBeInTheDocument();
  });

  it("verifies static content module contains no hardcoded MW numeric figures", () => {
    const jsonStr = JSON.stringify(contentModule);
    // Regex matches digits immediately followed by MW (e.g. "1854 MW", "3200MW")
    const hardcodedMwPattern = /\b\d+\s*MW\b/i;
    expect(hardcodedMwPattern.test(jsonStr)).toBe(false);
  });
});
