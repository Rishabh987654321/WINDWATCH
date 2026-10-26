import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSeries, useSummary } from "../api/hooks";
import { useFilters } from "../store/filters";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Stat } from "../components/ui/Stat";
import { Sticker } from "../components/ui/Sticker";
import { Callout } from "../components/ui/Callout";
import { Skeleton } from "../components/ui/Skeleton";
import { Chart, type ChartTableData } from "../components/charts/Chart";
import { buildSeriesOption, type SeriesPointInput } from "../charts/builders";
import type { EChartsType } from "echarts/core";

function getRunForCutoff(cutoff: string): string {
  // Elexon WINDFOR runs publish at :30 past the hour
  const parts = cutoff.split(":").map(Number);
  const h = parts[0] ?? 9;
  const m = parts[1] ?? 0;
  const totalMins = h * 60 + m;
  // If cutoff is between 07:30 and 09:30, it uses 07:30 run
  if (totalMins >= 450 && totalMins < 570) return "07:30";
  if (totalMins >= 570 && totalMins < 690) return "09:30";
  if (totalMins >= 690 && totalMins < 930) return "11:30";
  if (totalMins >= 930) return "15:30";
  return "07:30";
}

const OverviewPage: React.FC = () => {
  const {
    from,
    to,
    policy,
    horizonHours,
    cutoff,
    meta,
  } = useFilters();

  // 1. Headline Day-Ahead summary for the Hero card (always day_ahead 09:00 Jan 2026)
  const heroSummaryQuery = useSummary({
    policy: "day_ahead",
    cutoff: "09:00",
    from: "2026-01-01",
    to: "2026-01-31",
  });

  // 2. Active filter series query
  const seriesParams = useMemo(() => {
    return {
      from,
      to,
      policy,
      horizon_hours: policy === "lead_time" ? horizonHours : undefined,
      cutoff: policy === "day_ahead" ? cutoff : undefined,
    };
  }, [from, to, policy, horizonHours, cutoff]);

  const seriesQuery = useSeries(seriesParams);

  // 3. Brushed range for dataZoom -> debounced 250ms -> updates KPI strip
  const [brushedRange, setBrushedRange] = useState<{ from: string; to: string } | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 4. Active summary metrics (brushed range overrides global window)
  const activeSummaryParams = useMemo(() => {
    return {
      from: brushedRange?.from || from,
      to: brushedRange?.to || to,
      policy,
      horizon_hours: policy === "lead_time" ? horizonHours : undefined,
      cutoff: policy === "day_ahead" ? cutoff : undefined,
    };
  }, [brushedRange, from, to, policy, horizonHours, cutoff]);

  const summaryQuery = useSummary(activeSummaryParams);

  // Memoize pure chart option based on points identity
  const points = useMemo(() => seriesQuery.data?.points || [], [seriesQuery.data]);
  const chartOption = useMemo(() => {
    return buildSeriesOption(points, {
      showActual: true,
      showForecast: true,
      showErrorBars: true,
    });
  }, [points]);

  // Hook up echarts dataZoom brush handler
  const handleChartReady = useCallback(
    (chart: EChartsType) => {
      chart.on("dataZoom", (evt: unknown) => {
        if (!points || points.length === 0) return;

        let startIdx = 0;
        let endIdx = points.length - 1;

        const e = evt as {
          batch?: Array<{ startValue?: number; endValue?: number; start?: number; end?: number }>;
          start?: number;
          end?: number;
        };

        if (e.batch && e.batch.length > 0) {
          const b = e.batch[0];
          if (b && b.startValue !== undefined && b.endValue !== undefined) {
            startIdx = Math.max(0, Math.min(b.startValue, points.length - 1));
            endIdx = Math.max(0, Math.min(b.endValue, points.length - 1));
          } else if (b && b.start !== undefined && b.end !== undefined) {
            startIdx = Math.floor((b.start / 100) * (points.length - 1));
            endIdx = Math.ceil((b.end / 100) * (points.length - 1));
          }
        } else if (e.start !== undefined && e.end !== undefined) {
          startIdx = Math.floor((e.start / 100) * (points.length - 1));
          endIdx = Math.ceil((e.end / 100) * (points.length - 1));
        }

        const brushedFrom = points[startIdx]?.ts?.slice(0, 10);
        const brushedTo = points[endIdx]?.ts?.slice(0, 10);

        if (brushedFrom && brushedTo) {
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(() => {
            setBrushedRange({ from: brushedFrom, to: brushedTo });
          }, 250);
        }
      });
    },
    [points]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Table Data for VIEW AS TABLE toggle
  const tableData: ChartTableData<SeriesPointInput> = useMemo(() => {
    return {
      columns: [
        {
          key: "time_local",
          header: "Target (London)",
          render: (row) => (
            <span className="font-mono text-xs">
              {new Date(row.ts || "").toLocaleString("en-GB", {
                timeZone: "Europe/London",
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ),
        },
        {
          key: "actual_mw",
          header: "Actual (MW)",
          align: "right",
          render: (row) =>
            row.actual_mw !== null ? (
              <span className="font-mono text-xs font-bold text-[#111]">
                {row.actual_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
              </span>
            ) : (
              <span className="text-gray-400 font-mono text-xs">-</span>
            ),
        },
        {
          key: "forecast_mw",
          header: "Forecast (MW)",
          align: "right",
          render: (row) =>
            row.forecast_mw !== null ? (
              <span className="font-mono text-xs font-bold text-[#4D7CFE]">
                {row.forecast_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
              </span>
            ) : (
              <span className="text-gray-400 font-mono text-xs">-</span>
            ),
        },
        {
          key: "error_mw",
          header: "Error (MW)",
          align: "right",
          render: (row) =>
            row.error_mw !== null ? (
              <span className="font-mono text-xs font-bold text-[#111]">
                {row.error_mw > 0 ? `+${row.error_mw.toFixed(1)}` : row.error_mw.toFixed(1)}
              </span>
            ) : (
              <span className="text-gray-400 font-mono text-xs">-</span>
            ),
        },
      ],
      data: points,
    };
  }, [points]);

  const heroSummary = heroSummaryQuery.data;
  const activeSummary = summaryQuery.data;

  // Active-selection callout text
  const activeSelectionText = useMemo(() => {
    if (policy === "day_ahead") {
      const run = getRunForCutoff(cutoff);
      return `Showing the forecast available at ${cutoff} on the day before (D-1), from the ${run} publication run.`;
    }
    return `Showing the latest forecast made ≥ ${horizonHours} h before each target hour.`;
  }, [policy, cutoff, horizonHours]);

  const isThinData = policy === "lead_time" && horizonHours > meta.reliableHorizonHours;

  return (
    <div className="space-y-6">
      {/* 1. HERO CARD (Yellow frame with headline value prop and Day-Ahead CTA) */}
      <div className="bg-[#FFE94A] border-[3px] border-[#111] rounded-lg p-5 sm:p-6 shadow-[6px_6px_0_#111]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <Sticker color="ink" rotate={-1}>
                DECISION-TIME FORECAST INTELLIGENCE
              </Sticker>
            </div>
            <h1 className="font-['Archivo_Black'] text-3xl sm:text-4xl text-[#111] uppercase tracking-tight leading-none">
              Know your wind before you buy.
            </h1>
            <p className="font-['Space_Grotesk'] text-base sm:text-lg text-[#111] font-medium leading-snug">
              Day-ahead wind forecasts consistently overestimate generation. WindWatch gives UK energy buyers
              decision-time forecast visibility and empirical downside risk quantification.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <Link to="/day-ahead" className="inline-block">
              <Button variant="ink" size="lg" className="w-full sm:w-auto">
                OPEN DECISION VIEW →
              </Button>
            </Link>
          </div>
        </div>

        {/* 3 Headline KPIs from Jan 2026 Day-Ahead */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t-[3px] border-[#111]">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#5A5A5A] font-bold">
              Mean Absolute Error (Day-Ahead)
            </div>
            <div className="font-mono text-3xl sm:text-4xl font-bold text-[#111] tabular-nums mt-1">
              {heroSummary?.mae_mw !== undefined && heroSummary?.mae_mw !== null
                ? `${heroSummary.mae_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })} MW`
                : "..."}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#5A5A5A] font-bold">
              Observed Bias (Over-Forecast)
            </div>
            <div className="font-mono text-3xl sm:text-4xl font-bold text-[#111] tabular-nums mt-1">
              {heroSummary?.bias_mw !== undefined && heroSummary?.bias_mw !== null
                ? `+${heroSummary.bias_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })} MW`
                : "..."}
            </div>
            <div className="text-[11px] font-mono text-[#5A5A5A] mt-0.5">
              Over-forecast = forecast above actual
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#5A5A5A] font-bold">
              P90 Absolute Error Tail
            </div>
            <div className="font-mono text-3xl sm:text-4xl font-bold text-[#111] tabular-nums mt-1">
              {heroSummary?.p90_abs_error_mw !== undefined && heroSummary?.p90_abs_error_mw !== null
                ? `${heroSummary.p90_abs_error_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })} MW`
                : "..."}
            </div>
          </div>
        </div>
      </div>

      {/* 2. ACTIVE-SELECTION CALLOUT */}
      <div className="space-y-3">
        <Callout variant="yellow" icon="ℹ" title="Active Selection">
          {activeSelectionText}
        </Callout>

        {/* 5. THIN DATA STICKER (when lead_time policy and horizon > reliableHorizonHours) */}
        {isThinData && (
          <Callout variant="pink" icon="⚠" title="THIN DATA SAMPLING WARNING">
            Forecast lead horizon is <strong>{horizonHours} h</strong>, which exceeds the reliable horizon of{" "}
            <strong>{meta.reliableHorizonHours} h</strong>. Beyond {meta.reliableHorizonHours} h, forecasts are only available
            for a non-random subset of hours of the day due to Elexon&apos;s publication schedule, introducing diurnal
            sampling bias (DOMAIN §4.6).
          </Callout>
        )}
      </div>

      {/* 3. ACTUAL VS FORECAST CHART */}
      <Card
        headerColor="none"
        headerTitle="Actual Generation vs Selected Forecast"
        headerAction={
          brushedRange && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setBrushedRange(null)}
              className="text-xs font-mono py-1 px-2.5"
            >
              RESET BRUSH ({brushedRange.from} → {brushedRange.to})
            </Button>
          )
        }
      >
        {seriesQuery.isLoading ? (
          <div className="space-y-4 py-8">
            <Skeleton height={280} />
            <Skeleton height={60} />
          </div>
        ) : seriesQuery.isError ? (
          <Callout variant="pink" icon="✕" title="Failed to Load Series Data">
            <div className="space-y-2">
              <p>An error occurred while fetching time series data.</p>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="danger" onClick={() => seriesQuery.refetch()}>
                  RETRY
                </Button>
                {seriesQuery.error?.requestId && (
                  <span className="font-mono text-xs text-[#5A5A5A]">
                    Request ID: {seriesQuery.error.requestId}
                  </span>
                )}
              </div>
            </div>
          </Callout>
        ) : points.length === 0 ? (
          <Callout variant="yellow" icon="ℹ" title="No Forecast Points Found">
            No forecast or actual data points matched the current selection filter criteria.
          </Callout>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-[#5A5A5A] px-1">
              <span>Upper: Actual (Ink 3px) vs Forecast (Blue 2.5px) · Lower: Error Bars (Pink: Over, Green: Under)</span>
              <span>Drag slider or brush window to filter</span>
            </div>
            <Chart
              option={chartOption}
              height={440}
              ariaLabel="Actual vs Forecast wind power time series and error bars"
              tableData={tableData}
              onChartReady={handleChartReady}
            />
          </div>
        )}
      </Card>

      {/* 4. KPI STRIP (MAE · RMSE · Bias · nMAE · P90 |error| · Over-forecast rate) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-['Archivo_Black'] text-lg text-[#111] uppercase tracking-wide">
              Evaluation Metrics Strip
            </h2>
            {brushedRange && (
              <Sticker size="sm" color="yellow" rotate={-1}>
                BRUSHED: {brushedRange.from} → {brushedRange.to}
              </Sticker>
            )}
          </div>
          {activeSummary && (
            <div className="flex items-center gap-2 text-xs font-mono text-[#5A5A5A]">
              <span>n = {activeSummary.n} hours</span>
              {activeSummary.n < 744 && (
                <Sticker size="sm" color="pink" rotate={1}>
                  PARTIAL ({activeSummary.n}/744)
                </Sticker>
              )}
            </div>
          )}
        </div>

        {summaryQuery.isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={100} />
            ))}
          </div>
        ) : activeSummary ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* MAE */}
            <Stat
              label="MAE"
              value={activeSummary.mae_mw != null ? activeSummary.mae_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 }) : "null"}
              unit="MW"
              edgeColor="yellow"
              sticker={{ text: "ACCURACY", color: "yellow" }}
              helpText="Average magnitude of forecast error regardless of direction."
            />

            {/* RMSE */}
            <Stat
              label="RMSE"
              value={activeSummary.rmse_mw != null ? activeSummary.rmse_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 }) : "null"}
              unit="MW"
              edgeColor="blue"
              helpText="Penalizes extreme misses quadratically."
            />

            {/* Bias */}
            <Stat
              label="Bias"
              value={
                activeSummary.bias_mw != null
                  ? (activeSummary.bias_mw > 0 ? "+" : "") + activeSummary.bias_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })
                  : "null"
              }
              unit="MW"
              edgeColor="pink"
              sticker={
                activeSummary.bias_mw != null && activeSummary.bias_mw > 0
                  ? { text: "OVER-FORECAST", color: "pink" }
                  : undefined
              }
              helpText="Mean signed error (forecast - actual). Positive = over-forecast."
            />

            {/* nMAE */}
            <Stat
              label="nMAE"
              value={activeSummary.nmae_pct != null ? `${activeSummary.nmae_pct.toFixed(1)}%` : "null"}
              edgeColor="yellow"
              helpText="MAE normalized by mean actual generation."
            />

            {/* P90 |error| */}
            <Stat
              label="P90 |error|"
              value={
                activeSummary.p90_abs_error_mw != null
                  ? activeSummary.p90_abs_error_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })
                  : "null"
              }
              unit="MW"
              edgeColor="ink"
              helpText="90th percentile of absolute error magnitude."
            />

            {/* Over-forecast rate */}
            <Stat
              label="Over-Rate"
              value={
                activeSummary.over_forecast_rate != null
                  ? `${(activeSummary.over_forecast_rate * 100).toFixed(1)}%`
                  : "null"
              }
              edgeColor="pink"
              helpText="Percentage of hours where forecast exceeded actual."
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default OverviewPage;
