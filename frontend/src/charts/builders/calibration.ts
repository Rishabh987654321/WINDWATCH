/**
 * Pure ECharts Option Builder for Calibration View
 * docs/DESIGN.md §6 & Phase 5a Step 1
 */

import type { EChartsOption } from "../../components/charts/echarts-setup";
import { THEME_COLORS } from "../theme";
import { createNeoTooltipHtml } from "../../components/charts/tooltip";

export interface CalibrationDayInput {
  date: string;
  total_periods: number;
  covered_periods: number;
  coverage_pct: number;
}

export interface BuildCalibrationOptionOptions {
  target?: number;
  selectedDate?: string;
}

function formatDayLabel(dateStr: string): string {
  const parts = dateStr.split("-");
  return parts[2] ?? dateStr;
}

export function buildCalibrationOption(
  days: CalibrationDayInput[],
  options: BuildCalibrationOptionOptions = {}
): EChartsOption {
  const { target = 90, selectedDate } = options;

  const xDisplayLabels = days.map((d) => formatDayLabel(d.date));

  return {
    animation: false,
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as { dataIndex: number };
        const dataIndex = p.dataIndex;
        const d = days[dataIndex];
        if (!d) return "";

        const title = `Delivery Day ${d.date}`;
        const isCovered = d.coverage_pct >= target;
        const rows = [
          {
            seriesName: "Realised Coverage",
            value: `${d.coverage_pct.toFixed(1)}%`,
            color: isCovered ? THEME_COLORS.firmWind : THEME_COLORS.riskBand,
          },
          {
            seriesName: "Covered Hours",
            value: `${d.covered_periods} / ${d.total_periods} h`,
            color: THEME_COLORS.ink,
          },
          {
            seriesName: "Nominal Target",
            value: `${target}%`,
            color: THEME_COLORS.ink,
            dashed: true,
          },
        ];

        const extra =
          d.coverage_pct < target
            ? `Under-coverage by ${(target - d.coverage_pct).toFixed(1)}%`
            : undefined;

        return createNeoTooltipHtml(title, rows, extra);
      },
    },
    grid: {
      left: 54,
      right: 28,
      top: 24,
      bottom: 34,
    },
    xAxis: {
      type: "category",
      data: xDisplayLabels,
      axisLine: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      axisTick: { alignWithLabel: true },
      axisLabel: {
        fontFamily: "Space Mono",
        fontSize: 10,
        color: THEME_COLORS.ink,
        interval: 1, // show every second day for clarity on mobile/tablet
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      interval: 25,
      name: "%",
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
        formatter: "{value}%",
      },
    },
    series: [
      {
        name: "Realised Coverage",
        type: "bar",
        data: days.map((d) => {
          const isTargetMet = d.coverage_pct >= target;
          const isSelected = d.date === selectedDate;

          return {
            value: d.coverage_pct,
            itemStyle: {
              color: isTargetMet ? THEME_COLORS.firmWind : THEME_COLORS.riskBand,
              borderColor: THEME_COLORS.ink,
              borderWidth: isSelected ? 3.5 : 1.5,
              shadowColor: isSelected ? THEME_COLORS.ink : "transparent",
              shadowOffsetX: isSelected ? 3 : 0,
              shadowOffsetY: isSelected ? 3 : 0,
            },
          };
        }),
        barMaxWidth: 20,
        markLine: {
          symbol: "none",
          data: [
            {
              yAxis: target,
              label: {
                show: true,
                position: "insideEndTop",
                formatter: `Target ${target}%`,
                fontFamily: "Space Mono",
                fontSize: 10,
                color: THEME_COLORS.ink,
                backgroundColor: THEME_COLORS.highlight,
                borderColor: THEME_COLORS.ink,
                borderWidth: 1.5,
                padding: [2, 4],
              },
              lineStyle: {
                color: THEME_COLORS.ink,
                width: 2,
                type: "dashed",
              },
            },
          ],
        },
      },
    ],
  };
}
