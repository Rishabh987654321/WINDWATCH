import {
  use as echartsUse,
  registerTheme,
  init,
  type ComposeOption,
  type EChartsType,
} from "echarts/core";
import {
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  type LineSeriesOption,
  type BarSeriesOption,
  type ScatterSeriesOption,
  type HeatmapSeriesOption,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  LegendComponent,
  VisualMapComponent,
  VisualMapPiecewiseComponent,
  type GridComponentOption,
  type TooltipComponentOption,
  type DataZoomComponentOption,
  type MarkLineComponentOption,
  type MarkAreaComponentOption,
  type LegendComponentOption,
  type VisualMapComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { windwatchTheme } from "./theme";

// Register modular ECharts features
echartsUse([
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  LegendComponent,
  VisualMapComponent,
  VisualMapPiecewiseComponent,
  CanvasRenderer,
]);

// Register the custom Neo-Brutalist WindWatch theme
registerTheme("windwatch", windwatchTheme);

export type EChartsOption = ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | ScatterSeriesOption
  | HeatmapSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | MarkLineComponentOption
  | MarkAreaComponentOption
  | LegendComponentOption
  | VisualMapComponentOption
>;

export { init, echartsUse as use, registerTheme };
export type {
  EChartsType,
  LineSeriesOption,
  BarSeriesOption,
  ScatterSeriesOption,
  HeatmapSeriesOption,
};
