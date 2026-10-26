import React, { useEffect, useRef, useState } from "react";
import { init, type EChartsType } from "echarts/core";
import "./echarts-setup";
import type { EChartsOption } from "./echarts-setup";
import { prefersReducedMotion } from "./theme";
import { Button } from "../ui/Button";
import { Table, type Column } from "../ui/Table";

export interface ChartTableData<T extends object> {
  columns: Column<T>[];
  data: T[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ChartProps<T extends object = any> {
  option: EChartsOption;
  height?: string | number;
  width?: string | number;
  ariaLabel: string;
  tableData?: ChartTableData<T>;
  onChartReady?: (chart: EChartsType) => void;
  className?: string;
}

export const Chart = <T extends object>({
  option,
  height = 360,
  width = "100%",
  ariaLabel,
  tableData,
  onChartReady,
  className = "",
}: ChartProps<T>): React.ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<EChartsType | null>(null);
  const [showTable, setShowTable] = useState(false);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (!containerRef.current || showTable) return;

    if (!chartInstance.current) {
      chartInstance.current = init(containerRef.current, "windwatch", {
        renderer: "canvas",
      });
      onChartReady?.(chartInstance.current);
    }

    const chart = chartInstance.current;
    const reducedMotion = prefersReducedMotion();

    // Disable animation on subsequent slider updates per DESIGN.md §6
    const finalOption: EChartsOption = {
      animation: isFirstMount.current && !reducedMotion,
      animationDuration: reducedMotion ? 0 : 400,
      ...option,
    };

    chart.setOption(finalOption, { notMerge: false, lazyUpdate: true });
    isFirstMount.current = false;
  }, [option, showTable, onChartReady]);

  // ResizeObserver for responsive chart sizing
  useEffect(() => {
    if (!containerRef.current || showTable) return;

    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [showTable]);

  // Clean disposal on unmount
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  const heightStyle = typeof height === "number" ? `${height}px` : height;

  return (
    <div className={`relative flex flex-col ${className}`}>
      {tableData && (
        <div className="flex justify-end mb-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowTable((prev) => !prev)}
            aria-label={showTable ? "VIEW CHART" : "VIEW AS TABLE"}
            className="text-xs py-1 px-2.5 font-mono"
          >
            {showTable ? "📊 VIEW CHART" : "📋 VIEW AS TABLE"}
          </Button>
        </div>
      )}

      {showTable && tableData ? (
        <div style={{ minHeight: heightStyle }} className="w-full">
          <Table
            columns={tableData.columns}
            data={tableData.data}
            caption={`Tabular data for ${ariaLabel}`}
          />
        </div>
      ) : (
        <div
          ref={containerRef}
          role="img"
          aria-label={ariaLabel}
          style={{ width, height: heightStyle }}
          className="w-full"
        />
      )}
    </div>
  );
};
