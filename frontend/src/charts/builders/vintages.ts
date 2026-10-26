/**
 * Pure ECharts Option Builder for Forecast Evolution (Vintages)
 * docs/DESIGN.md §6 & Phase 5b Step 1
 */

import type { EChartsOption, LineSeriesOption } from "../../components/charts/echarts-setup";
import { THEME_COLORS } from "../theme";
import { createNeoTooltipHtml, type TooltipRow } from "../../components/charts/tooltip";

export interface VintageForecastPoint {
  published_at: string;
  horizon_h: number;
  forecast_mw: number;
}

export interface BuildVintagesOptionOptions {
  actualMw: number | null;
  targetTimeUtc: string;
  cutoffTimeUtc?: string; // 09:00 D-1 in UTC
  selectedRunTimeUtc?: string; // e.g. 07:30 run
}

function formatPublishTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildVintagesOption(
  forecasts: VintageForecastPoint[],
  options: BuildVintagesOptionOptions
): EChartsOption {
  const { actualMw, targetTimeUtc, cutoffTimeUtc, selectedRunTimeUtc } = options;
  void targetTimeUtc;

  const sorted = [...forecasts].sort(
    (a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
  );
  const xCategories = sorted.map((f) => formatPublishTime(f.published_at));

  const series: LineSeriesOption[] = [];

  // 1. Forecast Ink Casing Underlay
  series.push({
    name: "Forecast Evolution (casing)",
    type: "line",
    step: "end",
    data: sorted.map((f) => f.forecast_mw),
    silent: true,
    showSymbol: false,
    lineStyle: {
      color: THEME_COLORS.ink,
      width: 5.5,
    },
    tooltip: { show: false },
  });

  // 2. Forecast Line (Blue 2.5px stepped with points)
  const markLineData: any[] = [];

  // Actual Line (Horizontal)
  if (actualMw !== null) {
    markLineData.push({
      yAxis: actualMw,
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 3,
        type: "solid",
      },
      label: {
        show: true,
        position: "end",
        formatter: `ACTUAL ${actualMw.toLocaleString()} MW`,
        color: THEME_COLORS.ink,
        backgroundColor: THEME_COLORS.card,
        borderColor: THEME_COLORS.ink,
        borderWidth: 2,
        padding: [3, 6],
        fontFamily: "Space Mono",
        fontSize: 10,
        fontWeight: "bold",
      },
    });
  }

  // Day-Ahead Cutoff Line (Vertical)
  if (cutoffTimeUtc) {
    const cutoffTimeMs = new Date(cutoffTimeUtc).getTime();
    // Find closest index
    let cutoffIdx = -1;
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      if (item && new Date(item.published_at).getTime() <= cutoffTimeMs) {
        cutoffIdx = i;
      }
    }
    if (cutoffIdx >= 0 && cutoffIdx < xCategories.length) {
      markLineData.push({
        xAxis: xCategories[cutoffIdx],
        lineStyle: {
          color: THEME_COLORS.riskBand,
          width: 2,
          type: "dashed",
        },
        label: {
          show: true,
          position: "end",
          formatter: "DAY-AHEAD CUTOFF (09:00 D-1)",
          color: THEME_COLORS.ink,
          backgroundColor: THEME_COLORS.highlight,
          borderColor: THEME_COLORS.ink,
          borderWidth: 1.5,
          padding: [2, 6],
          fontFamily: "Space Mono",
          fontSize: 10,
          fontWeight: "bold",
        },
      });
    }
  }

  series.push({
    name: "Forecast Evolution",
    type: "line",
    step: "end",
    data: sorted.map((f) => {
      const isSelected = selectedRunTimeUtc && f.published_at === selectedRunTimeUtc;
      return {
        value: f.forecast_mw,
        symbol: isSelected ? "rect" : "circle",
        symbolSize: isSelected ? 12 : 7,
        itemStyle: {
          color: isSelected ? THEME_COLORS.highlight : THEME_COLORS.forecast,
          borderColor: THEME_COLORS.ink,
          borderWidth: 2,
        },
        label: isSelected
          ? {
              show: true,
              position: "top",
              formatter: "ACTIVE RUN",
              color: THEME_COLORS.ink,
              backgroundColor: THEME_COLORS.highlight,
              borderColor: THEME_COLORS.ink,
              borderWidth: 1.5,
              padding: [2, 6],
              fontFamily: "Space Mono",
              fontSize: 10,
              fontWeight: "bold",
            }
          : undefined,
      };
    }),
    showSymbol: true,
    lineStyle: {
      color: THEME_COLORS.forecast,
      width: 2.5,
    },
    markLine:
      markLineData.length > 0
        ? {
            symbol: ["none", "none"],
            silent: true,
            data: markLineData,
          }
        : undefined,
  });

  return {
    animation: false,
    grid: {
      top: 40,
      right: 40,
      bottom: 50,
      left: 70,
    },
    legend: {
      show: true,
      top: 4,
      right: 20,
      data: ["Forecast Evolution"],
      textStyle: {
        fontFamily: "Space Mono",
        fontSize: 11,
        color: THEME_COLORS.ink,
        fontWeight: "bold",
      },
    },
    xAxis: {
      type: "category",
      data: xCategories,
      name: "Forecast Publication Run Time (London)",
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: {
        fontFamily: "Space Grotesk",
        fontWeight: "bold",
        fontSize: 11,
        color: THEME_COLORS.ink,
      },
      axisLine: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      axisTick: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      axisLabel: {
        fontFamily: "Space Mono",
        fontSize: 10,
        color: THEME_COLORS.ink,
        interval: Math.max(1, Math.floor(xCategories.length / 8)),
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
        formatter: (val: number) => val.toLocaleString(),
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
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as { dataIndex: number };
        const f = sorted[p.dataIndex];
        if (!f) return "";

        const pubFormatted = formatPublishTime(f.published_at);
        const title = `Run published: ${pubFormatted} (${f.published_at.slice(11, 16)} UTC)`;
        const rows: TooltipRow[] = [
          {
            seriesName: "Forecast",
            value: `${f.forecast_mw.toLocaleString()} MW`,
            color: THEME_COLORS.forecast,
          },
          {
            seriesName: "Horizon",
            value: `${f.horizon_h.toFixed(1)} h ahead of delivery`,
            color: THEME_COLORS.ink,
          },
        ];

        if (actualMw !== null) {
          const err = f.forecast_mw - actualMw;
          rows.push({
            seriesName: "Actual Realised",
            value: `${actualMw.toLocaleString()} MW`,
            color: THEME_COLORS.ink,
          });
          rows.push({
            seriesName: "Forecast Miss",
            value: `${err > 0 ? "+" : ""}${err.toLocaleString()} MW`,
            color: err > 0 ? THEME_COLORS.riskBand : THEME_COLORS.firmWind,
          });
        }

        return createNeoTooltipHtml(title, rows);
      },
    },
    series: series as any,
  };
}
