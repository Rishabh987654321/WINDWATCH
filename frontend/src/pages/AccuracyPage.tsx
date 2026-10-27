import React, { useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useByHorizon,
  useDistribution,
  useByHour,
  useByLevel,
  useHeatmap,
  useVintages,
  useSeries,
  useSummary,
} from "../api/hooks";
import { useFilters } from "../store/filters";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Sticker } from "../components/ui/Sticker";
import { Callout } from "../components/ui/Callout";
import { Skeleton } from "../components/ui/Skeleton";
import { Chart, type ChartTableData } from "../components/charts/Chart";
import {
  buildHorizonOption,
  buildDistributionOption,
  buildByHourOption,
  buildByLevelOption,
  buildHeatmapOption,
  buildVintagesOption,
  type HorizonPointInput,
  type DistributionBinInput,
  type ByHourPointInput,
  type ByLevelPointInput,
  type VintageForecastPoint,
} from "../charts/builders";
import {
  getHorizonInsight,
  getDistributionInsight,
  getByHourInsight,
  getByLevelInsight,
  getHeatmapInsight,
  getVintagesInsight,
} from "../lib/captions";
import type { EChartsType } from "echarts/core";

function getRunForCutoff(cutoff: string): string {
  const parts = cutoff.split(":").map(Number);
  const h = parts[0] ?? 9;
  const m = parts[1] ?? 0;
  const totalMins = h * 60 + m;
  if (totalMins >= 450 && totalMins < 570) return "07:30";
  if (totalMins >= 570 && totalMins < 690) return "09:30";
  if (totalMins >= 690 && totalMins < 930) return "11:30";
  if (totalMins >= 930) return "15:30";
  return "07:30";
}

const AccuracyPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    from,
    to,
    policy,
    horizonHours,
    cutoff,
    targetTime,
    meta,
    setFilters,
  } = useFilters();

  // Summary query for active selection callout, overForecastRate & extreme error points
  const summaryParams = useMemo(() => ({
    from,
    to,
    policy,
    horizon_hours: policy === "lead_time" ? horizonHours : undefined,
    cutoff: policy === "day_ahead" ? cutoff : undefined,
  }), [from, to, policy, horizonHours, cutoff]);

  const summaryQuery = useSummary(summaryParams);
  const summary = summaryQuery.data;

  // 1. Error vs Horizon (inherently lead-time, across from..to)
  const byHorizonQuery = useByHorizon({ from, to });
  const horizonPoints = useMemo<HorizonPointInput[]>(() => byHorizonQuery.data?.points || [], [byHorizonQuery.data]);
  const horizonOption = useMemo(() => {
    return buildHorizonOption(horizonPoints, {
      reliableHorizonHours: meta.reliableHorizonHours,
      maxHorizonHours: meta.maxHorizonHours,
      selectedH: policy === "lead_time" ? horizonHours : undefined,
    });
  }, [horizonPoints, meta.reliableHorizonHours, meta.maxHorizonHours, policy, horizonHours]);

  const handleHorizonChartReady = useCallback((chart: EChartsType) => {
    if (typeof chart?.getDom === "function") {
      (chart.getDom() as any).__chart = chart;
    }
    chart.on("click", (params: unknown) => {
      const p = params as { name?: string; dataIndex?: number };
      if (p.name) {
        const hMatch = p.name.match(/^(\d+)h?$/);
        if (hMatch && hMatch[1]) {
          const clickedH = parseInt(hMatch[1], 10);
          setFilters({ policy: "lead_time", horizonHours: clickedH });
          return;
        }
      }
      const pt = p.dataIndex != null ? horizonPoints[p.dataIndex] : undefined;
      if (pt) {
        const clickedH = pt.horizon_hours;
        setFilters({ policy: "lead_time", horizonHours: clickedH });
      }
    });
  }, [horizonPoints, setFilters]);

  const horizonTableData = useMemo<ChartTableData<HorizonPointInput>>(() => ({
    columns: [
      { key: "horizon_hours", header: "Horizon (h)" },
      { key: "mae_mw", header: "MAE (MW)", render: (row) => row.mae_mw != null ? row.mae_mw.toFixed(1) : "-" },
      { key: "rmse_mw", header: "RMSE (MW)", render: (row) => row.rmse_mw != null ? row.rmse_mw.toFixed(1) : "-" },
      { key: "bias_mw", header: "Bias (MW)", render: (row) => row.bias_mw != null ? (row.bias_mw > 0 ? `+${row.bias_mw.toFixed(1)}` : row.bias_mw.toFixed(1)) : "-" },
      { key: "coverage_pct", header: "Coverage (%)", render: (row) => row.coverage_pct != null ? `${row.coverage_pct.toFixed(1)}%` : "-" },
      { key: "n", header: "Sample Count (n)" },
      {
        key: "action",
        header: "Action",
        render: (row) => (
          <button
            type="button"
            className="px-2 py-0.5 bg-[#FFE500] text-[#111] font-mono text-xs font-bold border-2 border-[#111] hover:bg-[#FF6B9E] transition-colors"
            onClick={() => setFilters({ policy: "lead_time", horizonHours: row.horizon_hours })}
            aria-label={`Set horizon to ${row.horizon_hours} hours`}
          >
            SET HORIZON
          </button>
        ),
      },
    ],
    data: horizonPoints,
  }), [horizonPoints, setFilters]);

  const horizonInsight = useMemo(() => {
    const h0 = horizonPoints.find((p) => p.horizon_hours === 0);
    const hRel = horizonPoints.find((p) => p.horizon_hours === meta.reliableHorizonHours);
    return getHorizonInsight({
      h0Mae: h0?.mae_mw ?? null,
      hReliableMae: hRel?.mae_mw ?? null,
      reliableH: meta.reliableHorizonHours,
    });
  }, [horizonPoints, meta.reliableHorizonHours]);

  // 2. Error Distribution
  const distParams = useMemo(() => ({
    from,
    to,
    policy,
    horizon_hours: policy === "lead_time" ? horizonHours : undefined,
    cutoff: policy === "day_ahead" ? cutoff : undefined,
    bin_width_mw: 250,
  }), [from, to, policy, horizonHours, cutoff]);

  const distQuery = useDistribution(distParams);
  const distData = distQuery.data;
  const distBins = useMemo<DistributionBinInput[]>(() => distData?.bins || [], [distData]);
  const distOption = useMemo(() => {
    return buildDistributionOption(distBins, {
      p5: distData?.quantiles?.p05,
      p50: distData?.quantiles?.p50,
      p95: distData?.quantiles?.p95,
    });
  }, [distBins, distData]);

  const distTableData = useMemo<ChartTableData<DistributionBinInput>>(() => {
    const total = distBins.reduce((acc, b) => acc + b.count, 0);
    return {
      columns: [
        {
          key: "range",
          header: "Bin Range (MW)",
          render: (row) => `${row.from_mw} to ${row.to_mw}`,
        },
        { key: "count", header: "Count (hours)" },
        {
          key: "pct",
          header: "Percentage (%)",
          render: (row) => total > 0 ? `${((row.count / total) * 100).toFixed(1)}%` : "0.0%",
        },
      ],
      data: distBins,
    };
  }, [distBins]);

  const distInsight = useMemo(() => {
    return getDistributionInsight({
      overForecastRate: summary?.over_forecast_rate,
    });
  }, [summary]);

  // 3. By Hour of Day
  const byHourParams = useMemo(() => ({
    from,
    to,
    policy,
    horizon_hours: policy === "lead_time" ? horizonHours : undefined,
    cutoff: policy === "day_ahead" ? cutoff : undefined,
  }), [from, to, policy, horizonHours, cutoff]);

  const byHourQuery = useByHour(byHourParams);
  const hourPoints = useMemo<ByHourPointInput[]>(() => (byHourQuery.data?.points || []) as ByHourPointInput[], [byHourQuery.data]);
  const byHourOption = useMemo(() => buildByHourOption(hourPoints), [hourPoints]);

  const byHourTableData = useMemo<ChartTableData<ByHourPointInput>>(() => ({
    columns: [
      { key: "hour_local", header: "Hour (Europe/London)", render: (row) => `${String(row.hour_local).padStart(2, "0")}:00` },
      { key: "mae_mw", header: "MAE (MW)", render: (row) => row.mae_mw != null ? row.mae_mw.toFixed(1) : "-" },
      { key: "bias_mw", header: "Bias (MW)", render: (row) => row.bias_mw != null ? (row.bias_mw > 0 ? `+${row.bias_mw.toFixed(1)}` : row.bias_mw.toFixed(1)) : "-" },
      { key: "n", header: "Count (n)" },
    ],
    data: hourPoints,
  }), [hourPoints]);

  const byHourInsight = useMemo(() => {
    if (!hourPoints || hourPoints.length === 0) {
      return getByHourInsight({ highestHour: null, highestMae: null, lowestHour: null, lowestMae: null });
    }
    const valid = hourPoints.filter((h) => h.mae_mw != null) as Array<{ hour_local: number; mae_mw: number }>;
    if (valid.length === 0) {
      return getByHourInsight({ highestHour: null, highestMae: null, lowestHour: null, lowestMae: null });
    }
    const sorted = [...valid].sort((a, b) => b.mae_mw - a.mae_mw);
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    return getByHourInsight({
      highestHour: highest?.hour_local ?? null,
      highestMae: highest?.mae_mw ?? null,
      lowestHour: lowest?.hour_local ?? null,
      lowestMae: lowest?.mae_mw ?? null,
    });
  }, [hourPoints]);

  // 4. By Generation Level
  const byLevelParams = useMemo(() => ({
    from,
    to,
    policy,
    horizon_hours: policy === "lead_time" ? horizonHours : undefined,
    cutoff: policy === "day_ahead" ? cutoff : undefined,
    n_bins: 5,
  }), [from, to, policy, horizonHours, cutoff]);

  const byLevelQuery = useByLevel(byLevelParams);
  const levelBins = useMemo<ByLevelPointInput[]>(() => (byLevelQuery.data?.points || []) as ByLevelPointInput[], [byLevelQuery.data]);
  const byLevelOption = useMemo(() => buildByLevelOption(levelBins), [levelBins]);

  const byLevelTableData = useMemo<ChartTableData<ByLevelPointInput>>(() => ({
    columns: [
      { key: "bin", header: "Bin #" },
      {
        key: "range",
        header: "Forecast Range (MW)",
        render: (row) => `${row.level_from_mw.toFixed(0)} to ${row.level_to_mw.toFixed(0)}`,
      },
      { key: "mae_mw", header: "MAE (MW)", render: (row) => row.mae_mw != null ? row.mae_mw.toFixed(1) : "-" },
      { key: "bias_mw", header: "Bias (MW)", render: (row) => row.bias_mw != null ? (row.bias_mw > 0 ? `+${row.bias_mw.toFixed(1)}` : row.bias_mw.toFixed(1)) : "-" },
      { key: "n", header: "Count (n)" },
    ],
    data: levelBins,
  }), [levelBins]);

  const byLevelInsight = useMemo(() => {
    if (!levelBins || levelBins.length === 0) {
      return getByLevelInsight({ topBinBias: null, topBinLabel: null, bottomBinBias: null, bottomBinLabel: null });
    }
    const bottom = levelBins[0];
    const top = levelBins[levelBins.length - 1];
    return getByLevelInsight({
      topBinBias: top?.bias_mw ?? null,
      topBinLabel: top ? `${top.level_from_mw.toFixed(0)}..${top.level_to_mw.toFixed(0)} MW` : null,
      bottomBinBias: bottom?.bias_mw ?? null,
      bottomBinLabel: bottom ? `${bottom.level_from_mw.toFixed(0)}..${bottom.level_to_mw.toFixed(0)} MW` : null,
    });
  }, [levelBins]);

  // 5. Day x Hour Heatmap
  const heatmapParams = useMemo(() => ({
    from,
    to,
    policy,
    horizon_hours: policy === "lead_time" ? horizonHours : undefined,
    cutoff: policy === "day_ahead" ? cutoff : undefined,
  }), [from, to, policy, horizonHours, cutoff]);

  const heatmapQuery = useHeatmap(heatmapParams);
  const heatmapData = heatmapQuery.data;
  const heatmapOption = useMemo(() => {
    if (!heatmapData) return { series: [] };
    return buildHeatmapOption(heatmapData);
  }, [heatmapData]);

  const handleHeatmapChartReady = useCallback((chart: EChartsType) => {
    if (typeof chart?.getDom === "function") {
      (chart.getDom() as any).__chart = chart;
    }
    chart.on("click", (params: unknown) => {
      const p = params as { data?: [number, number, number | null] };
      if (!heatmapData || !p.data) return;
      const yIdx = p.data[1];
      // In buildHeatmapOption, yDays = [...days].reverse(), so yIdx 0 is days[days.length - 1]
      const originalIdx = heatmapData.days.length - 1 - yIdx;
      const clickedDate = heatmapData.days[originalIdx];
      if (clickedDate) {
        navigate(`/day-ahead?d=${clickedDate}`);
      }
    });
  }, [heatmapData, navigate]);

  interface HeatmapTableRow {
    date: string;
    hour: string;
    error_mw: number | null;
  }

  const heatmapTableData = useMemo<ChartTableData<HeatmapTableRow>>(() => {
    if (!heatmapData) return { columns: [], data: [] };
    const rows: HeatmapTableRow[] = [];
    heatmapData.days.forEach((d, dayIdx) => {
      const vals = heatmapData.values[dayIdx] || [];
      heatmapData.hours.forEach((h, hIdx) => {
        rows.push({
          date: d,
          hour: `${String(h).padStart(2, "0")}:00`,
          error_mw: vals[hIdx] != null ? vals[hIdx] : null,
        });
      });
    });
    return {
      columns: [
        {
          key: "date",
          header: "Date",
          render: (row) => (
            <Link
              to={`/day-ahead?d=${row.date}`}
              className="font-bold underline text-[#111] hover:text-[#4D7CFE]"
            >
              {row.date}
            </Link>
          ),
        },
        { key: "hour", header: "Hour" },
        {
          key: "error_mw",
          header: "Error (MW)",
          render: (row) => row.error_mw != null ? (row.error_mw > 0 ? `+${row.error_mw.toFixed(1)}` : row.error_mw.toFixed(1)) : "null",
        },
      ],
      data: rows,
    };
  }, [heatmapData]);

  const heatmapInsight = useMemo(() => {
    if (!heatmapData) {
      return getHeatmapInsight({ highestMissDate: null, highestMissHour: null, highestMissMae: null });
    }
    let maxAbs = -1;
    let maxDate: string | null = null;
    let maxHour: number | null = null;

    heatmapData.days.forEach((d, dayIdx) => {
      const row = heatmapData.values[dayIdx] || [];
      heatmapData.hours.forEach((h, hIdx) => {
        const val = row[hIdx];
        if (val != null) {
          const abs = Math.abs(val);
          if (abs > maxAbs) {
            maxAbs = abs;
            maxDate = d;
            maxHour = h;
          }
        }
      });
    });

    return getHeatmapInsight({
      highestMissDate: maxDate,
      highestMissHour: maxHour,
      highestMissMae: maxAbs >= 0 ? maxAbs : null,
    });
  }, [heatmapData]);

  // 6. Forecast Evolution (Vintages)
  const activeTargetUtc = useMemo(() => {
    if (targetTime) return targetTime;
    if (summary?.max_over_forecast?.ts) return summary.max_over_forecast.ts;
    return "2026-01-15T12:00:00Z";
  }, [targetTime, summary]);

  const vintagesQuery = useVintages({ target: activeTargetUtc });
  const vintagesData = vintagesQuery.data;

  // Single hour series query to identify active policy's chosen forecast run without re-implementing selection logic
  const targetDatePart = activeTargetUtc.slice(0, 10);
  const singleHourSeriesQuery = useSeries({
    from: targetDatePart,
    to: targetDatePart,
    policy,
    horizon_hours: policy === "lead_time" ? horizonHours : undefined,
    cutoff: policy === "day_ahead" ? cutoff : undefined,
  });

  const activeRunPublishedAt = useMemo(() => {
    const points = singleHourSeriesQuery.data?.points || [];
    const matched = points.find((p) => p.ts === activeTargetUtc);
    return matched?.forecast_published_at || undefined;
  }, [singleHourSeriesQuery.data, activeTargetUtc]);

  // Compute cutoff UTC for the day-ahead cutoff marker (09:00 D-1)
  const cutoffTimeUtc = useMemo(() => {
    try {
      const targetDate = new Date(activeTargetUtc);
      targetDate.setUTCDate(targetDate.getUTCDate() - 1);
      const prevDateStr = targetDate.toISOString().slice(0, 10);
      return `${prevDateStr}T09:00:00Z`;
    } catch {
      return undefined;
    }
  }, [activeTargetUtc]);

  const vintagesOption = useMemo(() => {
    if (!vintagesData) return { series: [] };
    return buildVintagesOption(vintagesData.forecasts, {
      actualMw: vintagesData.actual_mw ?? null,
      targetTimeUtc: activeTargetUtc,
      cutoffTimeUtc,
      selectedRunTimeUtc: activeRunPublishedAt,
    });
  }, [vintagesData, activeTargetUtc, cutoffTimeUtc, activeRunPublishedAt]);

  const vintagesTableData = useMemo<ChartTableData<VintageForecastPoint>>(() => {
    const list = vintagesData?.forecasts || [];
    return {
      columns: [
        { key: "published_at", header: "Published At (UTC)" },
        { key: "horizon_h", header: "Horizon (h)" },
        { key: "forecast_mw", header: "Forecast (MW)", render: (row) => row.forecast_mw.toFixed(0) },
      ],
      data: list,
    };
  }, [vintagesData]);

  const vintagesInsight = useMemo(() => {
    const forecasts = vintagesData?.forecasts || [];
    if (forecasts.length === 0) {
      return getVintagesInsight({
        n: 0,
        localTime: activeTargetUtc,
        minMw: null,
        maxMw: null,
        actualMw: null,
      });
    }
    const mwValues = forecasts.map((f) => f.forecast_mw);
    const min = Math.min(...mwValues);
    const max = Math.max(...mwValues);
    return getVintagesInsight({
      n: forecasts.length,
      localTime: activeTargetUtc,
      minMw: min,
      maxMw: max,
      actualMw: vintagesData?.actual_mw ?? null,
    });
  }, [vintagesData, activeTargetUtc]);

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-150">
      {/* Page Title & Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Archivo_Black'] text-2xl sm:text-3xl text-[#111] uppercase tracking-tight">
            Accuracy Lab
          </h1>
          <p className="text-xs sm:text-sm font-['Space_Mono'] text-[#111]/70 mt-1">
            Six systematic decompositions of wind forecast error.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sticker color="blue" rotate={-1}>
            DECOMPOSITIONS
          </Sticker>
          {policy === "lead_time" && (
            <Sticker color="yellow" rotate={1}>
              H = {horizonHours}H ACTIVE
            </Sticker>
          )}
        </div>
      </div>

      {/* Active Selection Callout */}
      <div className="border-[3px] border-[#111] bg-[#FFF8E1] p-3 text-xs sm:text-sm font-['Space_Mono'] shadow-[4px_4px_0_#111]">
        {policy === "day_ahead" ? (
          <p>
            Evaluation window <strong>{from}</strong> to <strong>{to}</strong>
            {summary?.n != null && ` (n = ${summary.n} hours)`}. Day-ahead selection: forecasts published before <strong>{cutoff}</strong> D-1 (uses <strong>{getRunForCutoff(cutoff)}</strong> run).
          </p>
        ) : (
          <p>
            Evaluation window <strong>{from}</strong> to <strong>{to}</strong>
            {summary?.n != null && ` (n = ${summary.n} hours)`}. Fixed lead-time selection: forecasts made ≥ <strong>{horizonHours}</strong> h before each target hour.
          </p>
        )}
      </div>

      {/* 6 Analytical Cards in Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Error vs Forecast Horizon */}
        <Card
          headerTitle="1. Error vs Forecast Horizon"
          headerColor="blue"
          headerAction={<Sticker size="sm" color="blue">LEAD-TIME</Sticker>}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-['Space_Mono'] text-[#111]/80">
                Click a point to set active lead horizon across the app.
              </p>
              {policy === "lead_time" && (
                <Link to={`/?policy=lead_time&h=${horizonHours}`}>
                  <Sticker size="sm" color="yellow" rotate={-1}>
                    H SET TO {horizonHours}H · VIEW ON OVERVIEW →
                  </Sticker>
                </Link>
              )}
            </div>

            {byHorizonQuery.isLoading ? (
              <Skeleton height={320} />
            ) : byHorizonQuery.isError ? (
              <Callout variant="pink" title="Failed to load horizon curve">
                {byHorizonQuery.error.message}
                <div className="mt-2 flex items-center gap-3">
                  <Button size="sm" onClick={() => byHorizonQuery.refetch()}>RETRY</Button>
                  {byHorizonQuery.error.requestId && (
                    <span className="text-xs font-['Space_Mono']">ID: {byHorizonQuery.error.requestId}</span>
                  )}
                </div>
              </Callout>
            ) : horizonPoints.length === 0 ? (
              <div className="py-12 text-center font-['Space_Mono'] text-sm text-[#111]/70">
                No horizon data available for this range.
              </div>
            ) : (
              <Chart
                option={horizonOption}
                height={320}
                ariaLabel="Error vs Forecast Horizon Chart"
                tableData={horizonTableData}
                onChartReady={handleHorizonChartReady}
              />
            )}

            {/* Note on thin data beyond reliable horizon */}
            <div className="bg-[#FFF8E1] border-2 border-[#111] p-2 text-[11px] font-['Space_Mono'] text-[#111]">
              <strong>THIN DATA:</strong> Beyond {meta.reliableHorizonHours}h lead-time, data coverage represents a non-random subset of target hours due to forecast publication cadence (DOMAIN §4.6).
            </div>

            {/* One-line insight caption */}
            <div className="border-t-2 border-[#111] pt-2 text-xs font-['Space_Mono'] text-[#111] font-bold">
              INSIGHT: {horizonInsight}
            </div>
          </div>
        </Card>

        {/* Card 2: Error Distribution */}
        <Card
          headerTitle="2. Forecast Error Distribution"
          headerColor="yellow"
          headerAction={<Sticker size="sm" color="yellow">HISTOGRAM</Sticker>}
        >
          <div className="space-y-3">
            <p className="text-xs font-['Space_Mono'] text-[#111]/80">
              Error = forecast − actual (MW). 250 MW bins. Pink = over-forecast, Green = under-forecast.
            </p>

            {distQuery.isLoading ? (
              <Skeleton height={320} />
            ) : distQuery.isError ? (
              <Callout variant="pink" title="Failed to load error distribution">
                {distQuery.error.message}
                <div className="mt-2 flex items-center gap-3">
                  <Button size="sm" onClick={() => distQuery.refetch()}>RETRY</Button>
                  {distQuery.error.requestId && (
                    <span className="text-xs font-['Space_Mono']">ID: {distQuery.error.requestId}</span>
                  )}
                </div>
              </Callout>
            ) : distBins.length === 0 ? (
              <div className="py-12 text-center font-['Space_Mono'] text-sm text-[#111]/70">
                No distribution data available for this range.
              </div>
            ) : (
              <Chart
                option={distOption}
                height={320}
                ariaLabel="Forecast Error Distribution Histogram"
                tableData={distTableData}
              />
            )}

            <div className="border-t-2 border-[#111] pt-2 text-xs font-['Space_Mono'] text-[#111] font-bold">
              INSIGHT: {distInsight}
            </div>
          </div>
        </Card>

        {/* Card 3: Error by Hour of Day */}
        <Card
          headerTitle="3. Error by Hour of Day"
          headerColor="pink"
          headerAction={<Sticker size="sm" color="pink">DIURNAL</Sticker>}
        >
          <div className="space-y-3">
            <p className="text-xs font-['Space_Mono'] text-[#111]/80">
              Diurnal breakdown across 24 local hours (Europe/London). MAE (bars) and mean signed bias (line).
            </p>

            {byHourQuery.isLoading ? (
              <Skeleton height={320} />
            ) : byHourQuery.isError ? (
              <Callout variant="pink" title="Failed to load hourly breakdown">
                {byHourQuery.error.message}
                <div className="mt-2 flex items-center gap-3">
                  <Button size="sm" onClick={() => byHourQuery.refetch()}>RETRY</Button>
                  {byHourQuery.error.requestId && (
                    <span className="text-xs font-['Space_Mono']">ID: {byHourQuery.error.requestId}</span>
                  )}
                </div>
              </Callout>
            ) : hourPoints.length === 0 ? (
              <div className="py-12 text-center font-['Space_Mono'] text-sm text-[#111]/70">
                No diurnal data available for this range.
              </div>
            ) : (
              <Chart
                option={byHourOption}
                height={320}
                ariaLabel="Error by Hour of Day Chart"
                tableData={byHourTableData}
              />
            )}

            <div className="border-t-2 border-[#111] pt-2 text-xs font-['Space_Mono'] text-[#111] font-bold">
              INSIGHT: {byHourInsight}
            </div>
          </div>
        </Card>

        {/* Card 4: Error by Generation Level */}
        <Card
          headerTitle="4. Error by Generation Level"
          headerColor="none"
          headerAction={<Sticker size="sm" color="ink">CAPACITY</Sticker>}
        >
          <div className="space-y-3">
            <p className="text-xs font-['Space_Mono'] text-[#111]/80">
              5 generation level bins based on forecast generation. Basis = forecast generation level.
            </p>

            {byLevelQuery.isLoading ? (
              <Skeleton height={320} />
            ) : byLevelQuery.isError ? (
              <Callout variant="pink" title="Failed to load level breakdown">
                {byLevelQuery.error.message}
                <div className="mt-2 flex items-center gap-3">
                  <Button size="sm" onClick={() => byLevelQuery.refetch()}>RETRY</Button>
                  {byLevelQuery.error.requestId && (
                    <span className="text-xs font-['Space_Mono']">ID: {byLevelQuery.error.requestId}</span>
                  )}
                </div>
              </Callout>
            ) : levelBins.length === 0 ? (
              <div className="py-12 text-center font-['Space_Mono'] text-sm text-[#111]/70">
                No generation level data available for this range.
              </div>
            ) : (
              <Chart
                option={byLevelOption}
                height={320}
                ariaLabel="Error by Generation Level Chart"
                tableData={byLevelTableData}
              />
            )}

            <div className="border-t-2 border-[#111] pt-2 text-xs font-['Space_Mono'] text-[#111] font-bold">
              INSIGHT: {byLevelInsight}
            </div>
          </div>
        </Card>

        {/* Card 5: Day x Hour Error Heatmap */}
        <Card
          headerTitle="5. Day × Hour Error Heatmap"
          headerColor="yellow"
          headerAction={<Sticker size="sm" color="yellow">HEATMAP</Sticker>}
        >
          <div className="space-y-3">
            <p className="text-xs font-['Space_Mono'] text-[#111]/80">
              Day × hour matrix of absolute error. Click any cell to inspect on the Day-Ahead view.
            </p>

            {heatmapQuery.isLoading ? (
              <Skeleton height={320} />
            ) : heatmapQuery.isError ? (
              <Callout variant="pink" title="Failed to load error heatmap">
                {heatmapQuery.error.message}
                <div className="mt-2 flex items-center gap-3">
                  <Button size="sm" onClick={() => heatmapQuery.refetch()}>RETRY</Button>
                  {heatmapQuery.error.requestId && (
                    <span className="text-xs font-['Space_Mono']">ID: {heatmapQuery.error.requestId}</span>
                  )}
                </div>
              </Callout>
            ) : !heatmapData || heatmapData.days.length === 0 ? (
              <div className="py-12 text-center font-['Space_Mono'] text-sm text-[#111]/70">
                No heatmap data available for this range.
              </div>
            ) : (
              <Chart
                option={heatmapOption}
                height={320}
                ariaLabel="Day by Hour Error Heatmap"
                tableData={heatmapTableData}
                onChartReady={handleHeatmapChartReady}
              />
            )}

            <div className="border-t-2 border-[#111] pt-2 text-xs font-['Space_Mono'] text-[#111] font-bold">
              INSIGHT: {heatmapInsight}
            </div>
          </div>
        </Card>

        {/* Card 6: Forecast Evolution (Vintages) */}
        <Card
          headerTitle="6. Forecast Evolution (Vintages)"
          headerColor="blue"
          headerAction={<Sticker size="sm" color="blue">VINTAGES</Sticker>}
        >
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-xs font-['Space_Mono'] text-[#111]/80">
                Forecast revisions leading up to target delivery hour:
              </p>
              {/* Quick-pick chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                {summary?.max_over_forecast?.ts && (
                  <button
                    type="button"
                    onClick={() => setFilters({ targetTime: summary.max_over_forecast?.ts })}
                    className="text-[10px] font-['Space_Mono'] font-bold bg-[#FF6B9E] text-[#111] border border-[#111] px-1.5 py-0.5 hover:bg-[#FFE94A] transition-colors"
                    title={`Jump to biggest over-forecast: ${summary.max_over_forecast.ts}`}
                  >
                    BIGGEST OVER-FORECAST · {summary.max_over_forecast.ts.slice(5, 16).replace("T", " ")}
                  </button>
                )}
                {summary?.max_under_forecast?.ts && (
                  <button
                    type="button"
                    onClick={() => setFilters({ targetTime: summary.max_under_forecast?.ts })}
                    className="text-[10px] font-['Space_Mono'] font-bold bg-[#00C48C] text-[#111] border border-[#111] px-1.5 py-0.5 hover:bg-[#FFE94A] transition-colors"
                    title={`Jump to biggest under-forecast: ${summary.max_under_forecast.ts}`}
                  >
                    BIGGEST UNDER-FORECAST · {summary.max_under_forecast.ts.slice(5, 16).replace("T", " ")}
                  </button>
                )}
              </div>
            </div>

            {/* Target hour input */}
            <div className="flex items-center gap-2 bg-[#FFF8E1] border-2 border-[#111] p-2">
              <label htmlFor="target-hour-input" className="text-xs font-['Space_Mono'] font-bold text-[#111]">
                Target Hour (UTC):
              </label>
              <input
                id="target-hour-input"
                type="text"
                value={activeTargetUtc}
                onChange={(e) => setFilters({ targetTime: e.target.value })}
                className="text-xs font-['Space_Mono'] border-2 border-[#111] px-2 py-1 bg-white flex-1"
                placeholder="2026-01-15T12:00:00Z"
              />
            </div>

            {vintagesQuery.isLoading ? (
              <Skeleton height={320} />
            ) : vintagesQuery.isError ? (
              <Callout variant="pink" title="Failed to load forecast evolution">
                {vintagesQuery.error.message}
                <div className="mt-2 flex items-center gap-3">
                  <Button size="sm" onClick={() => vintagesQuery.refetch()}>RETRY</Button>
                  {vintagesQuery.error.requestId && (
                    <span className="text-xs font-['Space_Mono']">ID: {vintagesQuery.error.requestId}</span>
                  )}
                </div>
              </Callout>
            ) : !vintagesData || vintagesData.forecasts.length === 0 ? (
              <div className="py-12 text-center font-['Space_Mono'] text-sm text-[#111]/70">
                No vintage forecast runs found for target hour {activeTargetUtc}.
              </div>
            ) : (
              <Chart
                option={vintagesOption}
                height={320}
                ariaLabel="Forecast Evolution Vintages Chart"
                tableData={vintagesTableData}
              />
            )}

            <div className="border-t-2 border-[#111] pt-2 text-xs font-['Space_Mono'] text-[#111] font-bold">
              INSIGHT: {vintagesInsight}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AccuracyPage;
