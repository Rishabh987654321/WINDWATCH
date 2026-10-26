/**
 * Pure ECharts Option Builder for Day-Ahead Decision View
 * docs/DESIGN.md §6 & Phase 5a Step 1
 */

import type { EChartsOption, LineSeriesOption } from "../../components/charts/echarts-setup";
import { THEME_COLORS } from "../theme";
import { createNeoTooltipHtml } from "../../components/charts/tooltip";

export interface DayAheadPeriodInput {
  target_time_utc: string;
  target_time_local?: string;
  hour_local?: number;
  forecast_mw: number;
  expected_wind_mw?: number | null;
  firm_wind_mw?: number | null;
  band_high_mw?: number | null;
  actual_mw?: number | null;
  error_mw?: number | null;
}

export interface BuildDayAheadOptionOptions {
  revealActuals?: boolean;
}

function extractHourLabel(p: DayAheadPeriodInput, index: number): string {
  if (p.target_time_local) {
    const parts = p.target_time_local.split(" ");
    if (parts.length > 1 && parts[1]) {
      return parts[1]; // e.g. "00:00"
    }
  }
  if (p.hour_local !== undefined && p.hour_local !== null) {
    return `${String(p.hour_local).padStart(2, "0")}:00`;
  }
  try {
    const d = new Date(p.target_time_utc);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return `${String(index).padStart(2, "0")}:00`;
  }
}

export function buildDayAheadOption(
  periods: DayAheadPeriodInput[],
  options: BuildDayAheadOptionOptions = {}
): EChartsOption {
  const { revealActuals = false } = options;

  const xCategories = periods.map((p, i) => extractHourLabel(p, i));

  // Determine if risk fields are present
  const hasRisk = periods.some(
    (p) => p.firm_wind_mw !== null && p.firm_wind_mw !== undefined
  );
  const hasExpected = periods.some(
    (p) => p.expected_wind_mw !== null && p.expected_wind_mw !== undefined
  );

  const series: LineSeriesOption[] = [];

  // 1. Risk Band: Stacked Area between firm_wind_mw and band_high_mw (or forecast_mw)
  if (hasRisk) {
    // 1a. Base transparent series (stacks up to firm_wind_mw)
    series.push({
      name: "Risk Base",
      type: "line",
      stack: "risk_stack",
      data: periods.map((p) =>
        p.firm_wind_mw !== null && p.firm_wind_mw !== undefined
          ? p.firm_wind_mw
          : null
      ),
      showSymbol: false,
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
      silent: true,
      tooltip: { show: false },
      z: 1,
    });

    // 1b. Delta area band (height = max(0, band_high - firm_wind))
    series.push({
      name: "Wind at Risk",
      type: "line",
      stack: "risk_stack",
      data: periods.map((p) => {
        if (p.firm_wind_mw === null || p.firm_wind_mw === undefined) return null;
        const upper =
          p.band_high_mw !== null && p.band_high_mw !== undefined
            ? p.band_high_mw
            : p.forecast_mw;
        return Math.max(0, upper - p.firm_wind_mw);
      }),
      showSymbol: false,
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 1.5,
      },
      areaStyle: {
        color: "rgba(255, 107, 158, 0.4)",
        ...({
          decal: {
            symbol: "rect",
            symbolSize: 1,
            dashArrayX: [1, 3],
            dashArrayY: [2, 2],
            rotation: Math.PI / 4,
            color: THEME_COLORS.ink,
          },
        } as any),
      },
      endLabel: {
        show: true,
        formatter: "Risk Band",
        color: THEME_COLORS.ink,
        fontFamily: "Space Mono",
        fontSize: 11,
      },
      z: 2,
    });

    // 2. Firm Wind series (green #00C48C step line, with ink casing)
    series.push({
      name: "Firm Wind (casing)",
      type: "line",
      step: "end",
      data: periods.map((p) => p.firm_wind_mw ?? null),
      showSymbol: false,
      silent: true,
      tooltip: { show: false },
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 5.5,
      },
      z: 3,
    });

    series.push({
      name: "Firm Wind",
      type: "line",
      step: "end",
      data: periods.map((p) => p.firm_wind_mw ?? null),
      showSymbol: false,
      lineStyle: {
        color: THEME_COLORS.firmWind,
        width: 2.5,
      },
      endLabel: {
        show: true,
        formatter: "Firm Wind",
        color: THEME_COLORS.ink,
        fontFamily: "Space Mono",
        fontSize: 11,
        fontWeight: "bold",
      },
      z: 4,
    });
  }

  // 3. Expected (Bias-adjusted) series (ink dashed, 2px)
  if (hasExpected) {
    series.push({
      name: "Expected",
      type: "line",
      data: periods.map((p) => p.expected_wind_mw ?? null),
      showSymbol: false,
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 2.0,
        type: "dashed",
      },
      endLabel: {
        show: true,
        formatter: "Expected",
        color: THEME_COLORS.ink,
        fontFamily: "Space Mono",
        fontSize: 11,
      },
      z: 5,
    });
  }

  // 4. Day-Ahead Forecast series (blue solid, 2.5px, with ink casing underlay)
  series.push({
    name: "Forecast (casing)",
    type: "line",
    data: periods.map((p) => p.forecast_mw),
    showSymbol: false,
    silent: true,
    tooltip: { show: false },
    lineStyle: {
      color: THEME_COLORS.ink,
      width: 5.5,
    },
    z: 6,
  });

  series.push({
    name: "Forecast",
    type: "line",
    data: periods.map((p) => p.forecast_mw),
    showSymbol: false,
    lineStyle: {
      color: THEME_COLORS.forecast,
      width: 2.5,
    },
    endLabel: {
      show: true,
      formatter: "Forecast",
      color: THEME_COLORS.ink,
      fontFamily: "Space Mono",
      fontSize: 11,
      fontWeight: "bold",
    },
    z: 7,
  });

  // 5. Actuals series (3px solid ink + circles) - ONLY when revealActuals is true
  if (revealActuals) {
    series.push({
      name: "Actual",
      type: "line",
      data: periods.map((p) => p.actual_mw ?? null),
      showSymbol: true,
      symbol: "circle",
      symbolSize: 6,
      itemStyle: {
        color: THEME_COLORS.ink,
        borderColor: THEME_COLORS.ink,
      },
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 3.0,
      },
      endLabel: {
        show: true,
        formatter: "Actual",
        color: THEME_COLORS.ink,
        fontFamily: "Space Mono",
        fontSize: 11,
        fontWeight: "bold",
      },
      z: 8,
    });
  }

  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "line",
        lineStyle: {
          color: THEME_COLORS.ink,
          type: "dashed",
          width: 1.5,
        },
      },
      formatter: (params: unknown) => {
        const pList = params as Array<{ dataIndex: number }>;
        if (!Array.isArray(pList) || pList.length === 0 || !pList[0]) return "";
        const dataIndex = pList[0].dataIndex;
        const p = periods[dataIndex];
        if (!p) return "";

        const label = xCategories[dataIndex] || `${dataIndex}:00`;
        const title = `Hour ${label} London Time`;

        const rows: Array<{
          seriesName: string;
          value: number | string | null;
          color: string;
          dashed?: boolean;
          subtext?: string;
        }> = [];

        rows.push({
          seriesName: "Forecast",
          value: p.forecast_mw,
          color: THEME_COLORS.forecast,
        });

        if (p.expected_wind_mw !== null && p.expected_wind_mw !== undefined) {
          rows.push({
            seriesName: "Expected (Bias-adjusted)",
            value: p.expected_wind_mw,
            color: THEME_COLORS.ink,
            dashed: true,
          });
        }

        if (p.firm_wind_mw !== null && p.firm_wind_mw !== undefined) {
          rows.push({
            seriesName: "Firm Wind",
            value: p.firm_wind_mw,
            color: THEME_COLORS.firmWind,
          });
          const upper = p.band_high_mw ?? p.forecast_mw;
          const atRisk = Math.max(0, upper - p.firm_wind_mw);
          rows.push({
            seriesName: "Wind at Risk",
            value: atRisk,
            color: THEME_COLORS.riskBand,
          });
        }

        if (revealActuals && p.actual_mw !== null && p.actual_mw !== undefined) {
          rows.push({
            seriesName: "Actual",
            value: p.actual_mw,
            color: THEME_COLORS.ink,
          });
          if (p.error_mw !== null && p.error_mw !== undefined) {
            const isOver = p.error_mw >= 0;
            rows.push({
              seriesName: isOver ? "Error (Over)" : "Error (Under)",
              value: (p.error_mw > 0 ? "+" : "") + p.error_mw.toFixed(1),
              color: isOver ? THEME_COLORS.riskBand : THEME_COLORS.firmWind,
            });
          }
        }

        return createNeoTooltipHtml(title, rows);
      },
    },
    grid: {
      left: 64,
      right: 96, // extra margin for direct end-labels
      top: 24,
      bottom: 36,
    },
    xAxis: {
      type: "category",
      data: xCategories,
      boundaryGap: false,
      axisLine: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      axisLabel: {
        fontFamily: "Space Mono",
        fontSize: 11,
        color: THEME_COLORS.ink,
      },
    },
    yAxis: {
      type: "value",
      name: "MW",
      nameTextStyle: {
        fontFamily: "Space Grotesk",
        fontWeight: "bold",
        color: THEME_COLORS.ink,
      },
      axisLine: { show: true, lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      splitLine: {
        show: true,
        lineStyle: { color: THEME_COLORS.ink, opacity: 0.15, type: "dashed" },
      },
      axisLabel: {
        fontFamily: "Space Mono",
        fontSize: 11,
        color: THEME_COLORS.ink,
        formatter: (v: number) => v.toLocaleString("en-GB"),
      },
    },
    series,
  };
}
