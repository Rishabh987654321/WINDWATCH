import { test, expect, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MarqueeTicker } from "../components/shell/MarqueeTicker";

const server = setupServer(
  http.get("*/api/v1/metrics/summary", () => {
    return HttpResponse.json({
      n: 744,
      mae_mw: 2050.2,
      bias_mw: 1854.2,
      rmse_mw: 2518.0,
      median_abs_error_mw: 1650.0,
      p90_abs_error_mw: 3750.0,
      p95_abs_error_mw: 4500.0,
      nmae_pct: 17.7,
      over_forecast_rate: 0.85,
      max_over_forecast: null,
      max_under_forecast: null,
      corr: 0.94,
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderWithClient(ui: React.ReactElement) {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>
  );
}

test("MarqueeTicker displays loading fallback, then derived metrics from mocked response", async () => {
  renderWithClient(<MarqueeTicker />);

  // Initial loading fallback
  expect(
    screen.getAllByText("CALCULATING JANUARY 2026 BENCHMARK METRICS...")[0]
  ).toBeDefined();

  // Wait for derived text from mocked response
  await waitFor(() => {
    expect(screen.getAllByText("MAE: 2,050.2 MW").length).toBeGreaterThan(0);
  });

  expect(
    screen.getAllByText("BIAS: +1,854.2 MW (OVER-FORECAST)").length
  ).toBeGreaterThan(0);
  expect(
    screen.getAllByText("nMAE: 17.7% OF MEAN ACTUAL").length
  ).toBeGreaterThan(0);
});

test("MarqueeTicker renders error fallback when API fails", async () => {
  server.use(
    http.get("*/api/v1/metrics/summary", () => {
      return new HttpResponse(
        JSON.stringify({ title: "Bad Request", detail: "Invalid query" }),
        {
          status: 400,
          headers: { "Content-Type": "application/problem+json" },
        }
      );
    })
  );

  renderWithClient(<MarqueeTicker />);

  await waitFor(
    () => {
      expect(
        screen.getAllByText("NOTICE: RECONNECTING TO SNAPSHOT STORE").length
      ).toBeGreaterThan(0);
    },
    { timeout: 3000 }
  );
});


