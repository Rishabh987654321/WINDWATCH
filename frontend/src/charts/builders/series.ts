/**
 * Pure ECharts Option Builder for Series View (Actual vs Forecast + Error Bars)
 * docs/DESIGN.md §6 & Phase 5a Step 1
 */

import type {
  EChartsOption,
  LineSeriesOption,
  BarSeriesOption,
} from "../../components/charts/echarts-setup";
import { THEME_COLORS } from "../theme";
import { createNeoTooltipHtml } from "../../components/charts/tooltip";

export interface SeriesPointInput {
  target_time_utc?: string;
  ts?: string;
  actual_mw: number | null;
  forecast_mw: number | null;
  error_mw: number | null;
  publish_time_utc?: string | null;
  forecast_published_at?: string | null;
  horizon_h?: number | null;
}

export interface BuildSeriesOptionOptions {
  showActual?: boolean;
  showForecast?: boolean;
  showErrorBars?: boolean;
}

function formatLondonLocal(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return isoUtc;
  }
}

function formatUtc(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " UTC";
  } catch {
    return isoUtc;
  }
}

export function buildSeriesOption(
  points: SeriesPointInput[],
  options: BuildSeriesOptionOptions = {}
): EChartsOption {
  const {
    showActual = true,
    showForecast = true,
    showErrorBars = true,
  } = options;

  const xDisplayLabels = points.map((p) =>
    formatLondonLocal(p.target_time_utc || p.ts || "")
  );

  // Top panel series
  const series: Array<LineSeriesOption | BarSeriesOption> = [];

  if (showForecast) {
    // 1. Forecast Ink Casing Underlay (5.5px ink underlay line)
    series.push({
      name: "Forecast (casing)",
      type: "line",
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: points.map((p) => (p.forecast_mw !== null ? p.forecast_mw : null)),
      connectNulls: false,
      showSymbol: false,
      silent: true,
      tooltip: { show: false },
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 5.5,
      },
      z: 2,
    });

    // 2. Forecast colored line (2.5px blue solid)
    series.push({
      name: "Forecast",
      type: "line",
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: points.map((p) => (p.forecast_mw !== null ? p.forecast_mw : null)),
      connectNulls: false,
      showSymbol: false,
      lineStyle: {
        color: THEME_COLORS.forecast,
        width: 2.5,
      },
      itemStyle: {
        color: THEME_COLORS.forecast,
        borderColor: THEME_COLORS.ink,
        borderWidth: 1.5,
      },
      z: 3,
    });
  }

  if (showActual) {
    // Actuals line (3px solid ink)
    series.push({
      name: "Actual",
      type: "line",
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: points.map((p) => (p.actual_mw !== null ? p.actual_mw : null)),
      connectNulls: false,
      showSymbol: false,
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 3.0,
      },
      itemStyle: {
        color: THEME_COLORS.ink,
      },
      z: 4,
    });
  }

  // Bottom panel: Error bars (error_mw = forecast - actual)
  if (showErrorBars) {
    series.push({
      name: "Forecast Error",
      type: "bar",
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: points.map((p) => {
        if (p.error_mw === null || p.error_mw === undefined) return null;
        const isOver = p.error_mw >= 0;
        return {
          value: p.error_mw,
          itemStyle: {
            color: isOver ? THEME_COLORS.riskBand : THEME_COLORS.firmWind,
            borderColor: THEME_COLORS.ink,
            borderWidth: 1.5,
          },
        };
      }),
      barMaxWidth: 16,
      z: 3,
    });
  }

  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross",
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
        const pt = points[dataIndex];
        if (!pt) return "";

        const timeStr = pt.target_time_utc || pt.ts || "";
        const londonTime = formatLondonLocal(timeStr);
        const utcTime = formatUtc(timeStr);
        const title = `${londonTime} (${utcTime})`;

        const rows: Array<{
          seriesName: string;
          value: number | string | null;
          color: string;
          subtext?: string;
        }> = [];
        if (pt.actual_mw !== null && pt.actual_mw !== undefined) {
          rows.push({
            seriesName: "Actual",
            value: pt.actual_mw,
            color: THEME_COLORS.ink,
          });
        }
        if (pt.forecast_mw !== null && pt.forecast_mw !== undefined) {
          rows.push({
            seriesName: "Forecast",
            value: pt.forecast_mw,
            color: THEME_COLORS.forecast,
          });
        }
        if (pt.error_mw !== null && pt.error_mw !== undefined) {
          const isOver = pt.error_mw >= 0;
          rows.push({
            seriesName: isOver ? "Error (Over)" : "Error (Under)",
            value: (pt.error_mw > 0 ? "+" : "") + pt.error_mw.toFixed(1),
            color: isOver ? THEME_COLORS.riskBand : THEME_COLORS.firmWind,
          });
        }

        let extra: string | undefined;
        if (pt.horizon_h !== null && pt.horizon_h !== undefined) {
          extra = `Forecast Lead Time: ${pt.horizon_h.toFixed(1)} h ahead`;
        } else if (pt.publish_time_utc) {
          extra = `Published: ${formatLondonLocal(pt.publish_time_utc)}`;
        }

        return createNeoTooltipHtml(title, rows, extra);
      },
    },
    axisPointer: {
      link: [{ xAxisIndex: "all" }],
    },
    grid: [
      {
        left: 64,
        right: 28,
        top: 24,
        height: showErrorBars ? "54%" : "78%",
      },
      {
        left: 64,
        right: 28,
        top: "70%",
        height: showErrorBars ? "20%" : "0%",
        show: showErrorBars,
      },
    ],
    xAxis: [
      {
        type: "category",
        gridIndex: 0,
        data: xDisplayLabels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
        axisLabel: {
          show: !showErrorBars,
          fontFamily: "Space Mono",
          fontSize: 11,
          color: THEME_COLORS.ink,
        },
      },
      {
        type: "category",
        gridIndex: 1,
        data: xDisplayLabels,
        boundaryGap: true,
        show: showErrorBars,
        axisLine: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
        axisLabel: {
          fontFamily: "Space Mono",
          fontSize: 11,
          color: THEME_COLORS.ink,
        },
      },
    ],
    yAxis: [
      {
        type: "value",
        gridIndex: 0,
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
      {
        type: "value",
        gridIndex: 1,
        name: "Error (MW)",
        nameTextStyle: {
          fontFamily: "Space Grotesk",
          fontSize: 10,
          fontWeight: "bold",
          color: THEME_COLORS.ink,
        },
        show: showErrorBars,
        axisLine: { show: true, lineStyle: { color: THEME_COLORS.ink, width: 2 } },
        splitLine: {
          show: true,
          lineStyle: { color: THEME_COLORS.ink, opacity: 0.15, type: "dashed" },
        },
        axisLabel: {
          fontFamily: "Space Mono",
          fontSize: 10,
          color: THEME_COLORS.ink,
          formatter: (v: number) => (v > 0 ? `+${v}` : `${v}`),
        },
      },
    ],
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: [0, 1],
        filterMode: "filter",
      },
      {
        type: "slider",
        xAxisIndex: [0, 1],
        bottom: 4,
        height: 22,
        borderColor: THEME_COLORS.ink,
        fillerColor: "rgba(255, 233, 74, 0.35)",
        handleStyle: {
          color: THEME_COLORS.highlight,
          borderColor: THEME_COLORS.ink,
          borderWidth: 2,
        },
        textStyle: {
          fontFamily: "Space Mono",
          fontSize: 10,
          color: THEME_COLORS.ink,
        },
      },
    ],
    series,
  };
}
