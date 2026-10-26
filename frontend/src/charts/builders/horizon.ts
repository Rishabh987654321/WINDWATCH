
import type { EChartsOption, LineSeriesOption } from "../../components/charts/echarts-setup";
import { THEME_COLORS } from "../theme";
import { createNeoTooltipHtml, type TooltipRow } from "../../components/charts/tooltip";

export interface HorizonPointInput {
  horizon_hours: number;
  mae_mw?: number | null;
  rmse_mw?: number | null;
  bias_mw?: number | null;
  p90_abs_error_mw?: number | null;
  coverage_pct?: number;
  n?: number;
  n_expected?: number;
}

export interface BuildHorizonOptionOptions {
  reliableHorizonHours?: number;
  maxHorizonHours?: number;
  reliableH?: number;
  selectedH?: number;
}

export function buildHorizonOption(
  points: HorizonPointInput[],
  options: BuildHorizonOptionOptions = {}
): EChartsOption {
  const reliableHorizonHours = options.reliableH ?? options.reliableHorizonHours ?? 44;
  const maxHorizonHours = options.maxHorizonHours ?? 66;
  const selectedH = options.selectedH;

  const sortedPoints = [...points].sort((a, b) => a.horizon_hours - b.horizon_hours);
  const xCategories = sortedPoints.map((p) => `${p.horizon_hours}h`);

  const series: LineSeriesOption[] = [];

  // Selected H markLine
  const selectedMarkLine = selectedH != null ? {
    symbol: ["none", "none"] as ["none", "none"],
    silent: true,
    data: [
      {
        xAxis: `${selectedH}h`,
        lineStyle: {
          color: THEME_COLORS.ink,
          width: 2,
          type: "solid" as const,
        },
        label: {
          show: true,
          position: "end" as const,
          formatter: `SELECTED (${selectedH}H)`,
          color: THEME_COLORS.ink,
          backgroundColor: THEME_COLORS.highlight,
          borderColor: THEME_COLORS.ink,
          borderWidth: 1.5,
          padding: [2, 6],
          fontFamily: "Space Mono",
          fontSize: 10,
          fontWeight: "bold" as const,
        },
      },
    ],
  } : undefined;

  // 1. MAE Casing Underlay
  series.push({
    name: "MAE (casing)",
    type: "line",
    data: sortedPoints.map((p) => p.mae_mw ?? null),
    silent: true,
    showSymbol: false,
    lineStyle: {
      color: THEME_COLORS.ink,
      width: 5.5,
    },
    tooltip: { show: false },
  });

  // 2. MAE Line (Yellow / Highlight with casing)
  series.push({
    name: "MAE",
    type: "line",
    data: sortedPoints.map((p) => p.mae_mw ?? null),
    showSymbol: true,
    symbol: "circle",
    symbolSize: 6,
    markLine: selectedMarkLine,
    itemStyle: {
      color: THEME_COLORS.highlight,
      borderColor: THEME_COLORS.ink,
      borderWidth: 2,
    },
    lineStyle: {
      color: THEME_COLORS.highlight,
      width: 2.5,
    },
  });

  // 3. RMSE Casing Underlay
  series.push({
    name: "RMSE (casing)",
    type: "line",
    data: sortedPoints.map((p) => p.rmse_mw ?? null),
    silent: true,
    showSymbol: false,
    lineStyle: {
      color: THEME_COLORS.ink,
      width: 5.5,
    },
    tooltip: { show: false },
  });

  // 4. RMSE Line (Blue)
  series.push({
    name: "RMSE",
    type: "line",
    data: sortedPoints.map((p) => p.rmse_mw ?? null),
    showSymbol: true,
    symbol: "circle",
    symbolSize: 6,
    itemStyle: {
      color: THEME_COLORS.forecast,
      borderColor: THEME_COLORS.ink,
      borderWidth: 2,
    },
    lineStyle: {
      color: THEME_COLORS.forecast,
      width: 2.5,
    },
  });

  // 5. P90 |Error| Line (Dashed Ink)
  series.push({
    name: "P90 |error|",
    type: "line",
    data: sortedPoints.map((p) => p.p90_abs_error_mw ?? null),
    showSymbol: false,
    lineStyle: {
      color: THEME_COLORS.ink,
      width: 2.0,
      type: "dashed",
    },
    itemStyle: {
      color: THEME_COLORS.ink,
    },
  });

  // 6. Signed Bias Line (Pink with casing)
  series.push({
    name: "Bias (casing)",
    type: "line",
    data: sortedPoints.map((p) => p.bias_mw ?? null),
    silent: true,
    showSymbol: false,
    lineStyle: {
      color: THEME_COLORS.ink,
      width: 4.5,
    },
    tooltip: { show: false },
  });

  // 7. Signed Bias Line
  series.push({
    name: "Bias",
    type: "line",
    data: sortedPoints.map((p) => p.bias_mw ?? null),
    showSymbol: false,
    lineStyle: {
      color: THEME_COLORS.riskBand,
      width: 1.5,
    },
    itemStyle: {
      color: THEME_COLORS.riskBand,
    },
    markLine: {
      symbol: ["none", "none"],
      silent: true,
      data: [
        {
          xAxis: `${reliableHorizonHours}h`,
          lineStyle: {
            color: THEME_COLORS.riskBand,
            width: 2,
            type: "dashed",
          },
          label: {
            show: true,
            position: "end",
            formatter: `RELIABLE LIMIT (${reliableHorizonHours}H)`,
            color: THEME_COLORS.ink,
            backgroundColor: THEME_COLORS.highlight,
            borderColor: THEME_COLORS.ink,
            borderWidth: 1.5,
            padding: [2, 6],
            fontFamily: "Space Mono",
            fontSize: 10,
            fontWeight: "bold",
          },
        },
      ],
    },
    markArea: {
      silent: true,
      itemStyle: {
        color: "rgba(255, 107, 158, 0.12)",
      },
      data: [
        [
          {
            name: "THIN DATA — covers a subset of hours",
            xAxis: `${reliableHorizonHours}h`,
            label: {
              show: true,
              position: "insideTopRight",
              color: THEME_COLORS.ink,
              fontFamily: "Space Mono",
              fontSize: 10,
              fontWeight: "bold",
              padding: [8, 8],
            },
          },
          {
            xAxis: `${maxHorizonHours}h`,
          },
        ],
      ],
    },
  });

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
      data: ["MAE", "RMSE", "P90 |error|", "Bias"],
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
      name: "Lead Horizon (Hours Ahead)",
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
        fontSize: 11,
        color: THEME_COLORS.ink,
        interval: 3,
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
        const idx = pList[0].dataIndex;
        const pt = sortedPoints[idx];
        if (!pt) return "";

        const title = `Horizon ${pt.horizon_hours} Hours Ahead`;
        const covText = pt.coverage_pct !== undefined ? `${pt.coverage_pct.toFixed(1)}%` : undefined;
        const sampleText =
          pt.n !== undefined && pt.n_expected !== undefined
            ? `${pt.n}/${pt.n_expected} h`
            : undefined;

        const rows: TooltipRow[] = [
          {
            seriesName: "MAE",
            value: pt.mae_mw != null ? `${pt.mae_mw.toFixed(1)} MW` : "-",
            color: THEME_COLORS.highlight,
          },
          {
            seriesName: "RMSE",
            value: pt.rmse_mw != null ? `${pt.rmse_mw.toFixed(1)} MW` : "-",
            color: THEME_COLORS.forecast,
          },
          {
            seriesName: "Bias",
            value: pt.bias_mw != null ? `${pt.bias_mw > 0 ? "+" : ""}${pt.bias_mw.toFixed(1)} MW` : "-",
            color: THEME_COLORS.riskBand,
          },
        ];

        if (pt.p90_abs_error_mw != null) {
          rows.push({
            seriesName: "P90 |error|",
            value: `${pt.p90_abs_error_mw.toFixed(1)} MW`,
            color: THEME_COLORS.ink,
          });
        }

        if (sampleText || covText) {
          rows.push({
            seriesName: "Sample / Coverage",
            value: `${sampleText ?? ""} (${covText ?? ""})`.trim(),
            color: THEME_COLORS.ink,
          });
        }

        const notice = pt.horizon_hours > reliableHorizonHours ? "THIN DATA — covers a subset of hours" : undefined;
        return createNeoTooltipHtml(title, rows, notice);
      },
    },
    series: series as any,
  };
}

export const buildByHorizonOption = buildHorizonOption;
