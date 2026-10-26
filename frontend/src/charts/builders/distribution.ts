/**
 * Pure ECharts Option Builder for Error Distribution Histogram
 * docs/DESIGN.md §6 & Phase 5b Step 1
 */

import type { EChartsOption } from "../../components/charts/echarts-setup";
import { THEME_COLORS } from "../theme";
import { createNeoTooltipHtml } from "../../components/charts/tooltip";

export interface DistributionBinInput {
  from_mw: number;
  to_mw: number;
  count: number;
}

export interface BuildDistributionOptionOptions {
  p5?: number | null;
  p50?: number | null;
  p95?: number | null;
}

export function buildDistributionOption(
  bins: DistributionBinInput[],
  options: BuildDistributionOptionOptions = {}
): EChartsOption {
  const { p5, p50, p95 } = options;

  const totalCount = bins.reduce((acc, b) => acc + b.count, 0);

  const xCategories = bins.map((b) => {
    const fromStr = b.from_mw > 0 ? `+${b.from_mw}` : `${b.from_mw}`;
    const toStr = b.to_mw > 0 ? `+${b.to_mw}` : `${b.to_mw}`;
    return `${fromStr}..${toStr}`;
  });

  const markLineData: any[] = [];
  if (p50 != null) {
    // Find closest bin for p50
    const p50Idx = bins.findIndex((b) => p50 >= b.from_mw && p50 < b.to_mw);
    if (p50Idx !== -1) {
      markLineData.push({
        xAxis: xCategories[p50Idx],
        lineStyle: { color: THEME_COLORS.ink, width: 2, type: "solid" },
        label: {
          show: true,
          position: "end",
          formatter: `P50 (Median) ${p50.toFixed(0)} MW`,
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

  if (p95 != null) {
    const p95Idx = bins.findIndex((b) => p95 >= b.from_mw && p95 < b.to_mw);
    if (p95Idx !== -1) {
      markLineData.push({
        xAxis: xCategories[p95Idx],
        lineStyle: { color: THEME_COLORS.ink, width: 2, type: "dashed" },
        label: {
          show: true,
          position: "end",
          formatter: `P95 ${p95.toFixed(0)} MW`,
          color: THEME_COLORS.ink,
          backgroundColor: THEME_COLORS.card,
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

  if (p5 != null) {
    const p5Idx = bins.findIndex((b) => p5 >= b.from_mw && p5 < b.to_mw);
    if (p5Idx !== -1) {
      markLineData.push({
        xAxis: xCategories[p5Idx],
        lineStyle: { color: THEME_COLORS.ink, width: 2, type: "dashed" },
        label: {
          show: true,
          position: "end",
          formatter: `P5 ${p5.toFixed(0)} MW`,
          color: THEME_COLORS.ink,
          backgroundColor: THEME_COLORS.card,
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

  return {
    animation: false,
    grid: {
      top: 45,
      right: 30,
      bottom: 50,
      left: 60,
    },
    xAxis: {
      type: "category",
      data: xCategories,
      name: "Forecast Error (MW) — Negative = Under-forecast, Positive = Over-forecast",
      nameLocation: "middle",
      nameGap: 32,
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
        rotate: 35,
      },
    },
    yAxis: {
      type: "value",
      name: "Hours (Count)",
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
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as { dataIndex: number };
        const b = bins[p.dataIndex];
        if (!b) return "";

        const pct = totalCount > 0 ? ((b.count / totalCount) * 100).toFixed(1) : "0.0";
        const title = `Bin ${b.from_mw} to ${b.to_mw} MW`;
        const isOver = b.from_mw >= 0;
        const color = isOver ? THEME_COLORS.riskBand : THEME_COLORS.firmWind;

        return createNeoTooltipHtml(title, [
          {
            seriesName: "Frequency",
            value: `${b.count} hours (${pct}%)`,
            color,
          },
          {
            seriesName: "Classification",
            value: isOver ? "Over-forecast (Generation < Forecast)" : "Under-forecast (Generation > Forecast)",
            color: THEME_COLORS.ink,
          },
        ]);
      },
    },
    series: [
      {
        name: "Error Distribution",
        type: "bar",
        data: bins.map((b) => {
          // Over-forecast (positive error) -> Pink; Under-forecast (negative error) -> Green
          const color =
            b.from_mw >= 0
              ? THEME_COLORS.riskBand
              : b.to_mw <= 0
              ? THEME_COLORS.firmWind
              : THEME_COLORS.highlight;
          return {
            value: b.count,
            itemStyle: {
              color,
              borderColor: THEME_COLORS.ink,
              borderWidth: 2,
            },
          };
        }),
        markLine:
          markLineData.length > 0
            ? {
                symbol: ["none", "none"],
                silent: true,
                data: markLineData,
              }
            : undefined,
      },
    ],
  };
}
