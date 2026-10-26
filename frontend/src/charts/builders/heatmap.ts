/**
 * Pure ECharts Option Builder for Day x Hour Error Heatmap
 * docs/DESIGN.md §6 & Phase 5b Step 1
 */

import type { EChartsOption } from "../../components/charts/echarts-setup";
import { THEME_COLORS } from "../theme";
import { createNeoTooltipHtml } from "../../components/charts/tooltip";

export interface HeatmapInput {
  days: string[];
  hours: number[];
  values: Array<Array<number | null>>;
}

export function buildHeatmapOption(data: HeatmapInput): EChartsOption {
  const { days, hours, values } = data;

  const yDays = [...days].reverse(); // latest day at top
  const xHours = hours.map((h) => `${String(h).padStart(2, "0")}:00`);

  // Heatmap points: [xIndex, yIndex, value]
  const seriesData: Array<[number, number, number | null]> = [];
  days.forEach((_day, dayIdx) => {
    // Map to reversed Y-index
    const yIdx = days.length - 1 - dayIdx;
    const row = values[dayIdx] || [];
    hours.forEach((_h, hIdx) => {
      const val = row[hIdx] !== undefined ? row[hIdx] : null;
      seriesData.push([hIdx, yIdx, val]);
    });
  });

  return {
    animation: false,
    grid: {
      top: 30,
      right: 20,
      bottom: 75,
      left: 90,
    },
    xAxis: {
      type: "category",
      data: xHours,
      name: "Hour of Day (London)",
      nameLocation: "middle",
      nameGap: 28,
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
        interval: 1,
      },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: yDays,
      axisLine: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      axisTick: { lineStyle: { color: THEME_COLORS.ink, width: 2 } },
      axisLabel: {
        fontFamily: "Space Mono",
        fontSize: 10,
        color: THEME_COLORS.ink,
      },
      splitArea: { show: false },
    },
    visualMap: {
      type: "piecewise",
      orient: "horizontal",
      bottom: 0,
      left: "center",
      textStyle: {
        fontFamily: "Space Mono",
        fontSize: 10,
        color: THEME_COLORS.ink,
        fontWeight: "bold",
      },
      pieces: [
        { min: 0, max: 1000, label: "< 1,000 MW", color: THEME_COLORS.paper },
        { min: 1000, max: 2500, label: "1,000–2,500 MW", color: THEME_COLORS.highlight },
        { min: 2500, max: 4000, label: "2,500–4,000 MW", color: THEME_COLORS.riskBand },
        { min: 4000, max: 6000, label: "4,000–6,000 MW", color: "#E05385" },
        { min: 6000, label: "≥ 6,000 MW", color: THEME_COLORS.ink },
      ],
      itemWidth: 16,
      itemHeight: 12,
      itemGap: 10,
      borderColor: THEME_COLORS.ink,
      borderWidth: 1.5,
    },
    tooltip: {
      position: "top",
      formatter: (params: unknown) => {
        const p = params as { data: [number, number, number | null] };
        if (!p || !p.data) return "";
        const [xIdx, yIdx, val] = p.data;
        const dayStr = yDays[yIdx] || "";
        const hourStr = xHours[xIdx] || "";

        const title = `${dayStr} at ${hourStr}`;
        const rows = [
          {
            seriesName: "Absolute Miss",
            value: val !== null ? `${val.toLocaleString()} MW` : "No data",
            color: val !== null && val >= 4000 ? THEME_COLORS.riskBand : THEME_COLORS.ink,
          },
          {
            seriesName: "Action",
            value: "Click cell to inspect day on /day-ahead",
            color: THEME_COLORS.muted,
          },
        ];

        return createNeoTooltipHtml(title, rows);
      },
    },
    series: [
      {
        name: "Day x Hour Error",
        type: "heatmap",
        data: seriesData,
        itemStyle: {
          borderColor: THEME_COLORS.ink,
          borderWidth: 1,
        },
        emphasis: {
          itemStyle: {
            borderColor: THEME_COLORS.ink,
            borderWidth: 2.5,
            shadowBlur: 0,
            shadowColor: THEME_COLORS.ink,
            shadowOffsetX: 2,
            shadowOffsetY: 2,
          },
        },
      },
    ],
  };
}
