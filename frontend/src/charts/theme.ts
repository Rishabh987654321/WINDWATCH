/**
 * WindWatch Chart Theme & Series Styling Tokens
 * Neo-Brutalist Theme per docs/DESIGN.md §6
 * Single source of truth for chart series styling and ink-casing declarations.
 */

export const THEME_COLORS = {
  actual: "#111111",
  forecast: "#4D7CFE",
  firmWind: "#00C48C",
  riskBand: "#FF6B9E",
  highlight: "#FFE94A",
  ink: "#111111",
  paper: "#FFF8E1",
  card: "#FFFFFF",
  muted: "#5A5A5A",
} as const;

export interface SeriesCasingConfig {
  name: string;
  color: string;
  hasInkCasing: boolean;
  casingColor: string;
  casingWidth: number;
}

export const CHART_SERIES_CASING: Record<string, SeriesCasingConfig> = {
  forecast: {
    name: "Forecast line",
    color: THEME_COLORS.forecast,
    hasInkCasing: true,
    casingColor: THEME_COLORS.ink,
    casingWidth: 1.5,
  },
  firmWind: {
    name: "Firm wind line",
    color: THEME_COLORS.firmWind,
    hasInkCasing: true,
    casingColor: THEME_COLORS.ink,
    casingWidth: 1.5,
  },
  riskBand: {
    name: "Over-forecast / risk band",
    color: THEME_COLORS.riskBand,
    hasInkCasing: true,
    casingColor: THEME_COLORS.ink,
    casingWidth: 1.5,
  },
  actual: {
    name: "Actuals line",
    color: THEME_COLORS.actual,
    hasInkCasing: true, // Actual line is itself 3px solid ink (#111111)
    casingColor: THEME_COLORS.ink,
    casingWidth: 3.0,
  },
};

export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

export const windwatchTheme = {
  color: [
    THEME_COLORS.forecast,
    THEME_COLORS.actual,
    THEME_COLORS.firmWind,
    THEME_COLORS.riskBand,
    THEME_COLORS.highlight,
  ],
  backgroundColor: "transparent",
  textStyle: {
    fontFamily: "Space Grotesk, sans-serif",
    color: THEME_COLORS.ink,
  },
  title: {
    textStyle: {
      fontFamily: "Archivo Black, sans-serif",
      color: THEME_COLORS.ink,
      fontSize: 16,
    },
  },
  line: {
    itemStyle: {
      borderWidth: 2,
    },
    lineStyle: {
      width: 2.5,
    },
    symbolSize: 4,
    symbol: "circle",
    smooth: false,
  },
  categoryAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 2,
      },
    },
    axisTick: {
      show: true,
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 2,
      },
    },
    axisLabel: {
      fontFamily: "Space Mono, monospace",
      color: THEME_COLORS.ink,
      fontSize: 12,
    },
    splitLine: {
      show: false,
    },
  },
  valueAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 2,
      },
    },
    axisTick: {
      show: true,
      lineStyle: {
        color: THEME_COLORS.ink,
        width: 2,
      },
    },
    axisLabel: {
      fontFamily: "Space Mono, monospace",
      color: THEME_COLORS.ink,
      fontSize: 12,
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: "#111111",
        opacity: 0.15,
        type: "dashed",
      },
    },
  },
  tooltip: {
    backgroundColor: THEME_COLORS.card,
    borderColor: THEME_COLORS.ink,
    borderWidth: 2,
    borderRadius: 6,
    shadowColor: THEME_COLORS.ink,
    shadowBlur: 0,
    shadowOffsetX: 3,
    shadowOffsetY: 3,
    textStyle: {
      fontFamily: "Space Mono, monospace",
      color: THEME_COLORS.ink,
      fontSize: 12,
    },
    extraCssText: "padding: 8px 12px; pointer-events: none;",
  },
  dataZoom: {
    borderColor: THEME_COLORS.ink,
    textStyle: {
      fontFamily: "Space Mono, monospace",
      fontSize: 11,
      color: THEME_COLORS.ink,
    },
    fillerColor: "rgba(255, 233, 74, 0.3)",
    handleStyle: {
      color: THEME_COLORS.highlight,
      borderColor: THEME_COLORS.ink,
      borderWidth: 2,
    },
  },
};
