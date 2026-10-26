import React, { useMemo, useEffect, useCallback } from "react";
import { useDayAhead, useCalibration, useHeatmap } from "../api/hooks";
import { useFilters } from "../store/filters";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Stat } from "../components/ui/Stat";
import { Sticker } from "../components/ui/Sticker";
import { Callout } from "../components/ui/Callout";
import { Skeleton } from "../components/ui/Skeleton";
import { Switch } from "../components/ui/Switch";
import { Segmented } from "../components/ui/Segmented";
import { Popover } from "../components/ui/Popover";
import { Chart, type ChartTableData } from "../components/charts/Chart";
import {
  buildDayAheadOption,
  buildCalibrationOption,
  type DayAheadPeriodInput,
  type CalibrationDayInput,
} from "../charts/builders";
import type { EChartsType } from "echarts/core";

function stepDate(
  currentDateStr: string,
  deltaDays: number,
  minDate = "2026-01-01",
  maxDate = "2026-01-31"
): string {
  try {
    const parts = currentDateStr.split("-");
    const y = parseInt(parts[0] || "2026", 10);
    const m = parseInt(parts[1] || "1", 10);
    const d = parseInt(parts[2] || "1", 10);
    const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
    const newStr = dt.toISOString().slice(0, 10);
    if (newStr < minDate) return minDate;
    if (newStr > maxDate) return maxDate;
    return newStr;
  } catch {
    return currentDateStr;
  }
}

function getPrevDay(dateStr: string): string {
  try {
    const parts = dateStr.split("-");
    const y = parseInt(parts[0] || "2026", 10);
    const m = parseInt(parts[1] || "1", 10);
    const d = parseInt(parts[2] || "1", 10);
    const dt = new Date(Date.UTC(y, m - 1, d - 1));
    return dt.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

const DayAheadPage: React.FC = () => {
  const {
    deliveryDate = "2026-01-15",
    cutoff = "09:00",
    riskQuantile = 0.9,
    windowDays = 28,
    revealActuals = false,
    meta,
    setFilter,
  } = useFilters();

  // 1. Fetch Day-Ahead data for the selected delivery date
  const dayAheadQuery = useDayAhead(deliveryDate, {
    cutoff,
    risk_quantile: riskQuantile,
    window_days: windowDays,
  });

  // 2. Fetch Calibration backtest across January
  const calibrationQuery = useCalibration({
    cutoff,
    risk_quantile: riskQuantile,
    window_days: windowDays,
    from: "2026-01-01",
    to: "2026-01-31",
  });

  // 3. Fetch Heatmap to calculate quick-pick chips (BIGGEST MISS & CLOSE CALL)
  const heatmapQuery = useHeatmap({
    policy: "day_ahead",
    cutoff,
    from: "2026-01-01",
    to: "2026-01-31",
  });

  // Client-side computation of quick-pick chips from heatmap cells
  const { biggestMiss, closeCall } = useMemo(() => {
    const h = heatmapQuery.data;
    if (!h || !h.days || !h.values) return { biggestMiss: null, closeCall: null };

    const dayScores: { date: string; meanMae: number }[] = [];
    h.days.forEach((day, idx) => {
      const row = h.values[idx] || [];
      const valid = row.filter((v): v is number => v !== null && v !== undefined);
      if (valid.length > 0) {
        const avg = valid.reduce((acc, v) => acc + v, 0) / valid.length;
        dayScores.push({ date: day, meanMae: avg });
      }
    });

    if (dayScores.length === 0) return { biggestMiss: null, closeCall: null };

    dayScores.sort((a, b) => b.meanMae - a.meanMae);
    return {
      biggestMiss: dayScores[0],
      closeCall: dayScores[dayScores.length - 1],
    };
  }, [heatmapQuery.data]);

  // Keyboard navigation for date picker (← / → when not inside an input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFilter(
          "deliveryDate",
          stepDate(deliveryDate, -1, meta.evalWindowFrom, meta.evalWindowTo)
        );
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFilter(
          "deliveryDate",
          stepDate(deliveryDate, 1, meta.evalWindowFrom, meta.evalWindowTo)
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deliveryDate, meta.evalWindowFrom, meta.evalWindowTo, setFilter]);

  const dayAheadData = dayAheadQuery.data;
  const periods = useMemo(() => dayAheadData?.periods || [], [dayAheadData]);

  // Map periods to DayAheadPeriodInput for pure chart builder
  const chartPeriods: DayAheadPeriodInput[] = useMemo(() => {
    return periods.map((p, i) => {
      const error =
        p.actual_mw !== null && p.actual_mw !== undefined
          ? p.forecast_mw - p.actual_mw
          : null;
      return {
        target_time_utc: p.ts,
        target_time_local: p.ts.slice(0, 10) + " " + p.ts.slice(11, 16),
        hour_local: i,
        forecast_mw: p.forecast_mw,
        expected_wind_mw: p.expected_wind_mw,
        firm_wind_mw: p.firm_wind_mw,
        band_high_mw: p.band_high_mw,
        actual_mw: p.actual_mw,
        error_mw: error,
      };
    });
  }, [periods]);

  // Main decision chart option memoized on period and reveal state
  const decisionChartOption = useMemo(() => {
    return buildDayAheadOption(chartPeriods, { revealActuals });
  }, [chartPeriods, revealActuals]);

  // Calibration chart options and click handler
  const calibrationDays: CalibrationDayInput[] = useMemo(() => {
    const days = calibrationQuery.data?.days || [];
    return days.map((d) => ({
      date: d.delivery_date,
      total_periods: d.n,
      covered_periods: Math.round((d.coverage_pct / 100) * d.n),
      coverage_pct: d.coverage_pct,
    }));
  }, [calibrationQuery.data]);

  const targetPct = Math.round(riskQuantile * 100);
  const calibrationOption = useMemo(() => {
    return buildCalibrationOption(calibrationDays, {
      target: targetPct,
      selectedDate: deliveryDate,
    });
  }, [calibrationDays, targetPct, deliveryDate]);

  const handleCalibrationChartReady = useCallback(
    (chart: EChartsType) => {
      chart.on("click", (params: unknown) => {
        const p = params as { dataIndex: number };
        const clickedDay = calibrationDays[p.dataIndex];
        if (clickedDay && clickedDay.date) {
          setFilter("deliveryDate", clickedDay.date);
        }
      });
    },
    [calibrationDays, setFilter]
  );

  // Outcome statistics when actuals are revealed
  const outcomeStats = useMemo(() => {
    if (!periods || periods.length === 0) return null;
    let covered = 0;
    let validCount = 0;
    for (const p of periods) {
      if (
        p.actual_mw !== null &&
        p.actual_mw !== undefined &&
        p.firm_wind_mw !== null &&
        p.firm_wind_mw !== undefined
      ) {
        validCount++;
        if (p.actual_mw >= p.firm_wind_mw) {
          covered++;
        }
      }
    }
    return { covered, total: validCount };
  }, [periods]);

  // Table Data for Day Ahead Chart
  const tableData: ChartTableData<DayAheadPeriodInput> = useMemo(() => {
    return {
      columns: [
        {
          key: "hour",
          header: "Target Hour (London)",
          render: (_row, i) => (
            <span className="font-mono text-xs font-bold text-[#111]">
              {String(i).padStart(2, "0")}:00
            </span>
          ),
        },
        {
          key: "forecast_mw",
          header: "Forecast (MW)",
          align: "right",
          render: (row) => (
            <span className="font-mono text-xs font-bold text-[#4D7CFE]">
              {row.forecast_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
            </span>
          ),
        },
        {
          key: "expected_wind_mw",
          header: "Expected (MW)",
          align: "right",
          render: (row) =>
            row.expected_wind_mw !== null && row.expected_wind_mw !== undefined ? (
              <span className="font-mono text-xs text-[#111]">
                {row.expected_wind_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
              </span>
            ) : (
              <span className="text-gray-400 font-mono text-xs">—</span>
            ),
        },
        {
          key: "firm_wind_mw",
          header: `Firm Wind (${targetPct}% target)`,
          align: "right",
          render: (row) =>
            row.firm_wind_mw !== null && row.firm_wind_mw !== undefined ? (
              <span className="font-mono text-xs font-bold text-[#00C48C]">
                {row.firm_wind_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
              </span>
            ) : (
              <span className="text-gray-400 font-mono text-xs">—</span>
            ),
        },
        {
          key: "wind_at_risk_mw",
          header: "Wind at Risk (MW)",
          align: "right",
          render: (row) => {
            if (row.firm_wind_mw === null || row.firm_wind_mw === undefined) {
              return <span className="text-gray-400 font-mono text-xs">—</span>;
            }
            const atRisk = Math.max(0, row.forecast_mw - row.firm_wind_mw);
            return (
              <span className="font-mono text-xs font-bold text-[#111]">
                {atRisk.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
              </span>
            );
          },
        },
        ...(revealActuals
          ? [
              {
                key: "actual_mw",
                header: "Actual (MW)",
                align: "right" as const,
                render: (row: DayAheadPeriodInput) =>
                  row.actual_mw !== null && row.actual_mw !== undefined ? (
                    <span className="font-mono text-xs font-bold text-[#111]">
                      {row.actual_mw.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
                    </span>
                  ) : (
                    <span className="text-gray-400 font-mono text-xs">—</span>
                  ),
              },
            ]
          : []),
      ],
      data: chartPeriods,
    };
  }, [chartPeriods, revealActuals, targetPct]);

  // Format header strip values
  const prevDayStr = getPrevDay(deliveryDate);
  const latestPublished = periods[0]?.forecast_published_at
    ? new Date(periods[0].forecast_published_at).toLocaleTimeString("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "07:30";

  const minAge = dayAheadData?.summary?.forecast_age_h?.min?.toFixed(1) ?? "16.5";
  const maxAge = dayAheadData?.summary?.forecast_age_h?.max?.toFixed(1) ?? "39.5";

  // Plain-English summary line from data
  const meanFirm = dayAheadData?.summary?.mean_firm_wind_mw !== null && dayAheadData?.summary?.mean_firm_wind_mw !== undefined
    ? dayAheadData.summary.mean_firm_wind_mw.toLocaleString("en-GB", { maximumFractionDigits: 0 })
    : null;
  const meanForecast = dayAheadData?.summary?.mean_forecast_mw !== null && dayAheadData?.summary?.mean_forecast_mw !== undefined
    ? dayAheadData.summary.mean_forecast_mw.toLocaleString("en-GB", { maximumFractionDigits: 0 })
    : null;
  const meanRisk = meanFirm !== null && meanForecast !== null && dayAheadData?.summary?.mean_firm_wind_mw !== null && dayAheadData?.summary?.mean_firm_wind_mw !== undefined
    ? (dayAheadData.summary.mean_forecast_mw - dayAheadData.summary.mean_firm_wind_mw).toLocaleString("en-GB", { maximumFractionDigits: 0 })
    : null;

  // Zero coverage days in calibration
  const zeroCoverageDays = calibrationDays
    .filter((d) => d.coverage_pct === 0)
    .map((d) => d.date);

  const realisedCoverage = calibrationQuery.data?.realised_coverage_pct ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Day-Ahead Wind Forecast & Risk Analysis</h1>
      {/* 1. TOP BAR: DELIVERY-DAY PICKER & QUICK-PICK CHIPS */}
      <div className="bg-white border-[3px] border-[#111] rounded-lg p-4 shadow-[6px_6px_0_#111] flex flex-wrap items-center justify-between gap-4">
        {/* Date Stepper */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setFilter(
                  "deliveryDate",
                  stepDate(deliveryDate, -1, meta.evalWindowFrom, meta.evalWindowTo)
                )
              }
              aria-label="← PREV: Previous Delivery Day"
            >
              ← PREV
            </Button>
            <input
              type="date"
              aria-label="Delivery Date"
              value={deliveryDate}
              min={meta.evalWindowFrom}
              max={meta.evalWindowTo}
              onChange={(e) => setFilter("deliveryDate", e.target.value)}
              className="bg-[#FFF8E1] border-[3px] border-[#111] rounded px-3 py-1.5 font-mono text-sm font-bold text-[#111] shadow-[2px_2px_0_#111] focus:outline-none"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setFilter(
                  "deliveryDate",
                  stepDate(deliveryDate, 1, meta.evalWindowFrom, meta.evalWindowTo)
                )
              }
              aria-label="NEXT →: Next Delivery Day"
            >
              NEXT →
            </Button>
          </div>
          <span className="hidden sm:inline text-xs font-mono text-[#5A5A5A]">
            Use ←/→ keys to change day
          </span>
        </div>

        {/* Quick-Pick Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {biggestMiss && (
            <button
              type="button"
              onClick={() => setFilter("deliveryDate", biggestMiss.date)}
              className="inline-flex items-center gap-1.5 bg-[#FF6B9E] text-[#111] border-[2px] border-[#111] rounded px-2.5 py-1 text-xs font-['Archivo_Black'] uppercase shadow-[2px_2px_0_#111] hover:translate-x-0.5 hover:translate-y-0.5 transition-transform"
            >
              <span>🔥 BIGGEST MISS · {biggestMiss.date}</span>
              <span className="font-mono text-[10px]">
                ({biggestMiss.meanMae.toFixed(0)} MW)
              </span>
            </button>
          )}

          {closeCall && (
            <button
              type="button"
              onClick={() => setFilter("deliveryDate", closeCall.date)}
              className="inline-flex items-center gap-1.5 bg-[#00C48C] text-[#111] border-[2px] border-[#111] rounded px-2.5 py-1 text-xs font-['Archivo_Black'] uppercase shadow-[2px_2px_0_#111] hover:translate-x-0.5 hover:translate-y-0.5 transition-transform"
            >
              <span>🎯 CLOSE CALL · {closeCall.date}</span>
              <span className="font-mono text-[10px]">
                ({closeCall.meanMae.toFixed(0)} MW)
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 2. HEADER STRIP WITH ASSUMPTION BADGE */}
      <div className="bg-[#FFF8E1] border-[3px] border-[#111] rounded-lg px-4 py-3 shadow-[4px_4px_0_#111] flex flex-wrap items-center justify-between gap-3 text-xs font-mono font-bold text-[#111]">
        <div className="flex items-center gap-2">
          <span>
            Forecast as of <strong>{cutoff} {prevDayStr}</strong> · latest run published{" "}
            <strong>{latestPublished}</strong> · age{" "}
            <strong>{minAge === maxAge ? `${minAge} h` : `${minAge}–${maxAge} h`}</strong>
          </span>
        </div>

        <Popover
          trigger={
            <div className="cursor-pointer">
              <Sticker color="yellow" size="sm" rotate={1}>
                ASSUMPTION ℹ
              </Sticker>
            </div>
          }
          align="right"
        >
          <div className="p-3 max-w-xs space-y-1.5 text-left">
            <div className="font-['Archivo_Black'] text-xs uppercase text-[#111]">
              Gate-Closure Cutoff Policy (DOMAIN §7 A1)
            </div>
            <p className="text-xs font-['Space_Grotesk'] text-[#111] leading-relaxed">
              Elexon WINDFOR forecast runs publish at :30 past the hour. Any cutoff in [07:30, 09:30)
              uses the 07:30 run. Day-ahead purchase decisions use the forecast published strictly at or before decision time.
            </p>
          </div>
        </Popover>
      </div>

      {/* 3. RISK CONTROLS & REVEAL ACTUALS SWITCH */}
      <div className="bg-white border-[3px] border-[#111] rounded-lg p-4 shadow-[6px_6px_0_#111] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          {/* Target Quantile */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5A5A5A]">
              Target Quantile
            </span>
            <Segmented
              value={riskQuantile}
              onChange={(val) => setFilter("riskQuantile", val)}
              options={[
                { value: 0.8, label: "80%" },
                { value: 0.9, label: "90%" },
                { value: 0.95, label: "95%" },
                { value: 0.99, label: "99%" },
              ]}
            />
          </div>

          {/* Historical Window */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5A5A5A]">
              Historical Window (days)
            </span>
            <Segmented
              value={windowDays}
              onChange={(val) => setFilter("windowDays", val)}
              options={[
                { value: 7, label: "7 d" },
                { value: 14, label: "14 d" },
                { value: 21, label: "21 d" },
                { value: 28, label: "28 d (default)" },
              ]}
            />
          </div>
        </div>

        {/* REVEAL ACTUALS SWITCH */}
        <div className="flex items-center gap-3">
          <Switch
            id="reveal-actuals-toggle"
            checked={revealActuals}
            onChange={(checked) => setFilter("revealActuals", checked)}
            label="REVEAL ACTUALS"
            description="Show realised generation & accuracy"
          />
        </div>
      </div>

      {/* 4. MAIN DECISION CHART & SIDE CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Chart Column (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          <Card
            headerColor="none"
            headerTitle={`Day-Ahead Forecast & Firm Wind — ${deliveryDate}`}
            headerAction={
              revealActuals && outcomeStats && (
                <Sticker
                  size="sm"
                  color={outcomeStats.covered >= outcomeStats.total ? "green" : "pink"}
                  rotate={1}
                >
                  Actual wind stayed above firm wind in {outcomeStats.covered}/{outcomeStats.total} hours
                </Sticker>
              )
            }
          >
            {dayAheadQuery.isLoading ? (
              <div className="space-y-4 py-8">
                <Skeleton height={320} />
              </div>
            ) : dayAheadQuery.isError ? (
              <Callout variant="pink" icon="✕" title="Failed to Load Day-Ahead Data">
                <div className="space-y-2">
                  <p>Could not fetch forecast data for {deliveryDate}.</p>
                  <Button size="sm" variant="danger" onClick={() => dayAheadQuery.refetch()}>
                    RETRY
                  </Button>
                </div>
              </Callout>
            ) : periods.length === 0 ? (
              <Callout variant="yellow" icon="ℹ" title="No Data for Delivery Day">
                No published day-ahead forecast found for {deliveryDate}.
              </Callout>
            ) : (
              <div className="space-y-2">
                {dayAheadData?.risk === null && (
                  <Callout variant="yellow" icon="ℹ" title="Short Sample Notice">
                    Historical error sample was too short for risk quantification (requires ≥ 7 days).
                    Forecast curve is displayed without firm wind risk band.
                  </Callout>
                )}

                <Chart
                  option={decisionChartOption}
                  height={420}
                  ariaLabel={`Day-ahead forecast, expected, firm wind, and risk band for ${deliveryDate}`}
                  tableData={tableData}
                />
              </div>
            )}
          </Card>

          {/* 5. PLAIN-ENGLISH DECISION SUMMARY */}
          {meanFirm !== null && meanForecast !== null && meanRisk !== null && (
            <div className="bg-[#FFF8E1] border-[3px] border-[#111] rounded-lg p-4 shadow-[4px_4px_0_#111]">
              <p className="font-['Space_Grotesk'] text-base font-bold text-[#111] leading-relaxed">
                On the {cutoff} forecast, plan for at least <strong>{meanFirm} MW</strong> of average wind (
                {targetPct}% target); <strong>{meanRisk} MW</strong> of forecast wind is at risk.
              </p>
            </div>
          )}
        </div>

        {/* Side Cards Column (1 col) */}
        <div className="space-y-4">
          <Stat
            label="Total Forecast"
            value={
              dayAheadData?.summary?.total_forecast_mwh !== undefined
                ? dayAheadData.summary.total_forecast_mwh.toLocaleString("en-GB", { maximumFractionDigits: 0 })
                : "..."
            }
            unit="MWh"
            edgeColor="blue"
            helpText="Total day-ahead forecast generation volume across 24h."
          />

          <Stat
            label="Expected"
            value={
              dayAheadData?.summary?.mean_expected_wind_mw !== null && dayAheadData?.summary?.mean_expected_wind_mw !== undefined
                ? (dayAheadData.summary.mean_expected_wind_mw * 24).toLocaleString("en-GB", { maximumFractionDigits: 0 })
                : "..."
            }
            unit="MWh"
            edgeColor="ink"
            helpText="Bias-adjusted expected generation across 24h."
          />

          <Stat
            label={`Firm Wind (${targetPct}% target)`}
            value={
              dayAheadData?.summary?.total_firm_mwh !== null && dayAheadData?.summary?.total_firm_mwh !== undefined
                ? dayAheadData.summary.total_firm_mwh.toLocaleString("en-GB", { maximumFractionDigits: 0 })
                : "..."
            }
            unit="MWh"
            edgeColor="green"
            helpText={`Downside delivery floor at the ${targetPct}% nominal coverage target.`}
          />

          <Stat
            label="Wind at Risk"
            value={
              dayAheadData?.summary?.total_forecast_mwh !== undefined &&
              dayAheadData?.summary?.total_firm_mwh !== null &&
              dayAheadData?.summary?.total_firm_mwh !== undefined
                ? Math.max(
                    0,
                    dayAheadData.summary.total_forecast_mwh - dayAheadData.summary.total_firm_mwh
                  ).toLocaleString("en-GB", { maximumFractionDigits: 0 })
                : "..."
            }
            unit="MWh"
            edgeColor="pink"
            sticker={{ text: "RISK EXPOSURE", color: "pink" }}
            helpText="Forecast generation volume exceeding the firm wind delivery floor."
          />

          {/* DAY ACCURACY CARD (Hidden or Revealed) */}
          <div className="bg-white border-[3px] border-[#111] rounded-lg p-4 shadow-[4px_4px_0_#111]">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#5A5A5A] mb-2">
              Realised Day Accuracy
            </div>
            {!revealActuals ? (
              <div className="py-4 text-center bg-[#F4F4F0] border-2 border-dashed border-[#888] rounded p-3">
                <div className="text-2xl mb-1">🔒</div>
                <div className="text-xs font-mono font-bold text-[#111]">
                  Hidden — you didn&apos;t know this at the cutoff.
                </div>
                <div className="text-[11px] font-mono text-[#5A5A5A] mt-1">
                  Flip &quot;REVEAL ACTUALS&quot; above to inspect.
                </div>
              </div>
            ) : dayAheadData?.day_accuracy ? (
              <div className="space-y-2">
                <div className="flex justify-between items-baseline border-b border-[#ddd] pb-1">
                  <span className="font-mono text-xs text-[#5A5A5A]">Day MAE:</span>
                  <span className="font-mono text-sm font-bold text-[#111]">
                    {dayAheadData.day_accuracy.mae_mw != null
                      ? `${dayAheadData.day_accuracy.mae_mw.toFixed(1)} MW`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline border-b border-[#ddd] pb-1">
                  <span className="font-mono text-xs text-[#5A5A5A]">Day Bias:</span>
                  <span
                    className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded border border-[#111] text-[#111] ${
                      (dayAheadData.day_accuracy.bias_mw ?? 0) > 0 ? "bg-[#FF6B9E]" : "bg-[#00C48C]"
                    }`}
                  >
                    {dayAheadData.day_accuracy.bias_mw != null
                      ? `${dayAheadData.day_accuracy.bias_mw > 0 ? "+" : ""}${dayAheadData.day_accuracy.bias_mw.toFixed(1)} MW`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="font-mono text-xs text-[#5A5A5A]">Day RMSE:</span>
                  <span className="font-mono text-sm font-bold text-[#111]">
                    {dayAheadData.day_accuracy.rmse_mw != null
                      ? `${dayAheadData.day_accuracy.rmse_mw.toFixed(1)} MW`
                      : "—"}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 6. CALIBRATION CARD (Backtested empirical coverage across January) */}
      <Card
        headerColor="none"
        headerTitle="Historical Calibration (January 2026 Delivery Days)"
        headerAction={
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-[#5A5A5A]">
              Click a bar to inspect that day
            </span>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-2">
              <span className="font-['Archivo_Black'] text-xl text-[#111]">
                Realised {realisedCoverage.toFixed(1)}% vs target {targetPct}% (
                {realisedCoverage - targetPct >= 0
                  ? `+${(realisedCoverage - targetPct).toFixed(1)}`
                  : (realisedCoverage - targetPct).toFixed(1)}{" "}
                pts)
              </span>
            </div>

            <div className="text-xs font-mono text-[#5A5A5A]">
              Window: <strong>{windowDays} days</strong> trailing · Cutoff: <strong>{cutoff}</strong>
            </div>
          </div>

          <Chart
            option={calibrationOption}
            height={220}
            ariaLabel={`January calibration coverage across delivery days for ${targetPct}% target`}
            onChartReady={handleCalibrationChartReady}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-[#5A5A5A] pt-2 border-t border-[#ddd]">
            <div>
              {zeroCoverageDays.length > 0 ? (
                <span className="bg-[#FF6B9E] text-[#111] px-2 py-0.5 border-2 border-[#111] rounded font-bold shadow-[1px_1px_0_#111]">
                  Firm wind failed all day on {zeroCoverageDays.join(", ")} (0% coverage).
                </span>
              ) : (
                <span>All January days achieved non-zero firm wind coverage.</span>
              )}
            </div>
            <div className="italic">
              Window length was chosen after seeing January 2026 results on one month of data.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default DayAheadPage;
