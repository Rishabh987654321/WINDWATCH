/**
 * Pure ECharts Option Builder for Error by Hour of Day
 * docs/DESIGN.md §6 & Phase 5b Step 1
 */

import type { EChartsOption } from "../../components/charts/echarts-setup";
import { THEME_COLORS } from "../theme";
import { createNeoTooltipHtml } from "../../components/charts/tooltip";

export interface ByHourPointInput {
  hour_local: number;
  mae_mw: number | null;
  bias_mw: number | null;
  n: number;
}

export function buildByHourOption(points: ByHourPointInput[]): EChartsOption {
  // Sort by hour 0..23
  const sorted = [...points].sort((a, b) => a.hour_local - b.hour_local);
  const xCategories = sorted.map((p) => `${String(p.hour_local).padStart(2, "0")}:00`);

  return {
    animation: false,
    grid: {
      top: 40,
      right: 30,
      bottom: 45,
      left: 70,
    },
    legend: {
      show: true,
      top: 4,
      right: 20,
      data: ["MAE (Bar)", "Bias (Line)"],
      textStyle: {
        fontFamily: "Space Mono",
        fontSize: 11,
        color: THEME_COLORS.ink,
        fontWeight: "bold",
      },
      itemGap: 16,
    },
    xAxis: {
      type: "category",
      data: xCategories,
      name: "Hour of Day (Europe/London)",
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: {
        fontFamily: "Space Grotesk",
        fontWeight: "bold",
        fontSize: 12,
        color: THEME_COLORS.ink,
      },
      axisLine: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      axisTick: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      axisLabel: {
        fontFamily: "Space Mono",
        fontSize: 10,
        color: THEME_COLORS.ink,
      },
    },
    yAxis: {
      type: "value",
      name: "MW",
      nameTextStyle: {
        fontFamily: "Space Mono",
        fontSize: 11,
        fontWeight: "bold",
        color: THEME_COLORS.ink,
        align: "right",
      },
      axisLine: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      axisTick: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      axisLabel: {
        fontFamily: "Space Mono",
        fontSize: 11,
        color: THEME_COLORS.ink,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: THEME_COLORS.ink,
          opacity: 0.12,
          type: "dashed",
        },
      },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
      },
      formatter: (params: unknown) => {
        const pList = params as Array<{ dataIndex: number }>;
        if (!Array.isArray(pList) || pList.length === 0 || !pList[0]) return "";
        const idx = pList[0].dataIndex;
        const pt = sorted[idx];
        if (!pt) return "";

        const title = `Hour ${String(pt.hour_local).padStart(2, "0")}:00 (London)`;
        const rows = [
          {
            seriesName: "MAE",
            value: pt.mae_mw != null ? `${pt.mae_mw.toFixed(1)} MW` : "No data",
            color: THEME_COLORS.highlight,
          },
          {
            seriesName: "Signed Bias",
            value:
              pt.bias_mw != null
                ? `${pt.bias_mw > 0 ? "+" : ""}${pt.bias_mw.toFixed(1)} MW`
                : "No data",
            color: THEME_COLORS.riskBand,
          },
          {
            seriesName: "Observations",
            value: `${pt.n} days`,
            color: THEME_COLORS.ink,
          },
        ];

        return createNeoTooltipHtml(title, rows);
      },
    },
    series: [
      {
        name: "MAE (Bar)",
        type: "bar",
        data: sorted.map((p) => p.mae_mw),
        itemStyle: {
          color: THEME_COLORS.highlight,
          borderColor: THEME_COLORS.ink,
          borderWidth: 2,
        },
      },
      // Ink Casing Underlay for Bias Line
      {
        name: "Bias (casing)",
        type: "line",
        data: sorted.map((p) => p.bias_mw),
        silent: true,
        showSymbol: false,
        lineStyle: {
          color: THEME_COLORS.ink,
          width: 5.5,
        },
        tooltip: { show: false },
      },
      {
        name: "Bias (Line)",
        type: "line",
        data: sorted.map((p) => p.bias_mw),
        showSymbol: true,
        symbol: "circle",
        symbolSize: 6,
        itemStyle: {
          color: THEME_COLORS.riskBand,
          borderColor: THEME_COLORS.ink,
          borderWidth: 2,
        },
        lineStyle: {
          color: THEME_COLORS.riskBand,
          width: 2.5,
        },
      },
    ],
  };
}
