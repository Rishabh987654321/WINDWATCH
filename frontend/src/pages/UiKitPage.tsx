import React, { useState } from "react";
import {
  Card,
  Button,
  Stat,
  Sticker,
  Slider,
  Segmented,
  Tabs,
  Switch,
  Select,
  DateRange,
  Callout,
  Skeleton,
  Table,
  Tooltip,
  Popover,
} from "../components/ui";
import { Chart } from "../components/charts/Chart";
import type { EChartsOption } from "../components/charts/echarts-setup";

export const UiKitPage: React.FC = () => {
  const [sliderVal, setSliderVal] = useState(24);
  const [segmentedVal, setSegmentedVal] = useState<string>("day_ahead");
  const [tabVal, setTabVal] = useState<string>("tab1");
  const [switchVal, setSwitchVal] = useState<boolean>(true);
  const [selectVal, setSelectVal] = useState<string>("09:00");
  const [dateRange, setDateRange] = useState({ from: "2026-01-01", to: "2026-01-31" });

  // Demo chart options with synthetic data
  const demoChartOption: EChartsOption = {
    title: {
      text: "SYNTHETIC DEMO WIND SERIES",
      subtext: "ECharts modular integration verification",
    },
    tooltip: {
      trigger: "axis",
    },
    legend: {
      data: ["Actual Generation", "Day-Ahead Forecast", "Firm Wind Limit"],
      bottom: 0,
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "12%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"],
    },
    yAxis: {
      type: "value",
      name: "MW",
    },
    series: [
      {
        name: "Actual Generation",
        type: "line",
        lineStyle: { color: "#111111", width: 2.5 },
        data: [12000, 13400, 11800, 14200, 16000, 14800, 13900],
      },
      {
        name: "Day-Ahead Forecast",
        type: "line",
        lineStyle: { color: "#4D7CFE", width: 2.5 },
        data: [13500, 14500, 13200, 15800, 17200, 16100, 15000],
      },
      {
        name: "Firm Wind Limit",
        type: "line",
        step: "end",
        lineStyle: { color: "#00C48C", width: 2 },
        data: [9000, 10500, 9200, 11800, 13200, 12100, 11000],
      },
    ],
  };

  const demoTableData = {
    columns: [
      { key: "time", header: "Hour (UTC)" },
      { key: "actual", header: "Actual (MW)", align: "right" as const },
      { key: "forecast", header: "Forecast (MW)", align: "right" as const },
      { key: "firm", header: "Firm Wind (MW)", align: "right" as const },
    ],
    data: [
      { time: "00:00", actual: 12000, forecast: 13500, firm: 9000 },
      { time: "04:00", actual: 13400, forecast: 14500, firm: 10500 },
      { time: "08:00", actual: 11800, forecast: 13200, firm: 9200 },
      { time: "12:00", actual: 14200, forecast: 15800, firm: 11800 },
      { time: "16:00", actual: 16000, forecast: 17200, firm: 13200 },
      { time: "20:00", actual: 14800, forecast: 16100, firm: 12100 },
    ],
  };

  return (
    <div className="space-y-12 max-w-7xl mx-auto py-8 px-4 sm:px-6">
      {/* Header */}
      <div className="border-b-[3px] border-[#111] pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-['Archivo_Black'] text-3xl sm:text-4xl text-[#111] uppercase tracking-tight">
            UI Primitive Kit (/_kit)
          </h1>
          <p className="font-['Space_Grotesk'] text-sm text-[#5A5A5A] font-bold mt-1">
            Visual QA test harness validating all Neo-Brutalist primitives per docs/DESIGN.md.
          </p>
        </div>
        <Sticker color="pink" rotate={2}>
          DEV-ONLY ROUTE
        </Sticker>
      </div>

      {/* 1. Typography Showcase */}
      <section className="space-y-4">
        <h2 className="font-['Archivo_Black'] text-xl uppercase tracking-wider">
          1. Typography & Tokens
        </h2>
        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-mono text-[#5A5A5A] uppercase">Display / H1 (Archivo Black)</div>
              <div className="font-['Archivo_Black'] text-3xl sm:text-4xl uppercase text-[#111]">
                KNOW YOUR WIND BEFORE YOU BUY.
              </div>
            </div>
            <div>
              <div className="text-xs font-mono text-[#5A5A5A] uppercase">Body / UI (Space Grotesk)</div>
              <p className="font-['Space_Grotesk'] text-base text-[#111] font-medium leading-relaxed max-w-3xl">
                Day-ahead wind forecasts frequently overestimate generation during extreme weather regimes.
                WindWatch visualizes published gate-closure vintages and quantifies downside delivery risk.
              </p>
            </div>
            <div>
              <div className="text-xs font-mono text-[#5A5A5A] uppercase">Numbers / KPIs (Space Mono - Tabular Nums)</div>
              <div className="font-mono text-3xl font-bold text-[#111] tabular-nums">
                +1,851.5 MW (MAE: 2,127.5 MW) · 14,801.74 MWh
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* 2. Buttons */}
      <section className="space-y-4">
        <h2 className="font-['Archivo_Black'] text-xl uppercase tracking-wider">
          2. Buttons (Default, Hover, Active Translate, Disabled, Loading)
        </h2>
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary">PRIMARY (YELLOW)</Button>
            <Button variant="secondary">SECONDARY (WHITE)</Button>
            <Button variant="danger">DANGER (PINK)</Button>
            <Button variant="ghost">GHOST ACTION</Button>
            <Button variant="primary" size="sm">SMALL</Button>
            <Button variant="primary" size="lg">LARGE CTA</Button>
            <Button variant="primary" disabled>DISABLED</Button>
            <Button variant="primary" isLoading>LOADING</Button>
          </div>
        </Card>
      </section>

      {/* 3. Stat Tiles */}
      <section className="space-y-4">
        <h2 className="font-['Archivo_Black'] text-xl uppercase tracking-wider">
          3. Stat (KPI Tiles with Colored Edge)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            label="Mean Absolute Error"
            value="2,127.5"
            unit="MW"
            edgeColor="yellow"
            helpText="Day-ahead 09:00 cutoff"
          />
          <Stat
            label="Realized Bias"
            value="+1,851.5"
            unit="MW"
            edgeColor="pink"
            delta={{ value: "+16.0% actual", isPositive: false }}
            sticker={{ text: "OVER-FORECAST", color: "pink" }}
          />
          <Stat
            label="Firm Wind Limit"
            value="6,834.6"
            unit="MW"
            edgeColor="green"
            delta={{ value: "90% Target", isPositive: true }}
            sticker={{ text: "D-2 SAFE", color: "green" }}
          />
          <Stat
            label="Evaluated Targets"
            value="744"
            unit="hrs"
            edgeColor="blue"
            helpText="100% January coverage"
          />
        </div>
      </section>

      {/* 4. Stickers & Badges */}
      <section className="space-y-4">
        <h2 className="font-['Archivo_Black'] text-xl uppercase tracking-wider">
          4. Stickers & Badges (Rotated -3° to +3°)
        </h2>
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <Sticker color="yellow" rotate={-3}>FORECAST AGE 1.5H</Sticker>
            <Sticker color="pink" rotate={2}>LEAKAGE-SAFE</Sticker>
            <Sticker color="green" rotate={-1}>FIRM 90%</Sticker>
            <Sticker color="blue" rotate={3}>LEAD TIME 24H</Sticker>
            <Sticker color="ink" rotate={-2}>ASSUMPTION A1</Sticker>
            <Sticker color="white" rotate={1}>OFFICIAL BMRS</Sticker>
          </div>
        </Card>
      </section>

      {/* 5. Controls: Sliders, Segmented, Switches, Select */}
      <section className="space-y-4">
        <h2 className="font-['Archivo_Black'] text-xl uppercase tracking-wider">
          5. Controls (Sliders, Segmented, Switch, Select, DateRange)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card headerColor="yellow" headerTitle="Interactive Slider">
            <Slider
              label="Lead Time Horizon"
              min={0}
              max={66}
              value={sliderVal}
              reliableThreshold={44}
              onChange={setSliderVal}
            />
            <p className="mt-3 text-xs text-[#5A5A5A] font-medium">
              Tip: Press arrow keys to nudge, Shift + arrow for ×5 step, Home/End for boundaries.
            </p>
          </Card>

          <Card headerColor="blue" headerTitle="Segmented, Tabs & Switch">
            <div className="space-y-4">
              <div>
                <div className="text-xs font-bold uppercase mb-1">Policy Segmented:</div>
                <Segmented
                  value={segmentedVal}
                  onChange={setSegmentedVal}
                  options={[
                    { value: "day_ahead", label: "Day-Ahead Cutoff" },
                    { value: "lead_time", label: "Horizon Grid (H)" },
                  ]}
                />
              </div>
              <div className="pt-2 border-t border-[#111]/10">
                <div className="text-xs font-bold uppercase mb-1">Navigation Tabs:</div>
                <Tabs
                  activeId={tabVal}
                  onChange={setTabVal}
                  tabs={[
                    { id: "tab1", label: "METRICS" },
                    { id: "tab2", label: "ERROR DIST" },
                    { id: "tab3", label: "HEATMAP" },
                  ]}
                />
              </div>
              <div className="pt-2 border-t border-[#111]/10">
                <Switch
                  checked={switchVal}
                  onChange={setSwitchVal}
                  label="REVEAL ACTUALS"
                  description="Toggle historical realized generation line"
                />
              </div>
            </div>
          </Card>

          <Card headerColor="pink" headerTitle="Select & Tooltip">
            <div className="space-y-4">
              <Select
                label="Decision Cutoff Time (London)"
                value={selectVal}
                onChange={setSelectVal}
                options={[
                  { value: "07:30", label: "07:30 (Morning run)" },
                  { value: "09:00", label: "09:00 (Standard D-1 Cutoff)" },
                  { value: "09:30", label: "09:30 (Post-gate closure)" },
                  { value: "11:30", label: "11:30 (Midday run)" },
                ]}
              />
              <div className="pt-2 flex items-center gap-3">
                <span className="text-xs font-bold">Tooltip demo:</span>
                <Tooltip content={<p className="text-xs">WINDFOR publishes at :30 past hours 02, 04, 07, 09, 11, 15, 18, 22 UTC.</p>}>
                  <Button size="sm" variant="secondary">HOVER FOR INFO</Button>
                </Tooltip>
              </div>
            </div>
          </Card>

          <Card headerColor="green" headerTitle="DateRange with Presets">
            <DateRange
              from={dateRange.from}
              to={dateRange.to}
              onChange={(f, t) => setDateRange({ from: f, to: t })}
            />
            <div className="mt-3 text-xs font-mono">
              Selected: <strong>{dateRange.from}</strong> to <strong>{dateRange.to}</strong>
            </div>
          </Card>
        </div>
      </section>

      {/* 6. Callouts & Skeletons */}
      <section className="space-y-4">
        <h2 className="font-['Archivo_Black'] text-xl uppercase tracking-wider">
          6. Callouts & Hatched Skeletons (No Gradients)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Callout variant="yellow" title="Assumption A1" icon="💡">
            Under the day-ahead policy, cutoffs in [07:30, 09:30) use the 07:30 UTC publication.
          </Callout>
          <Callout
            variant="pink"
            title="Warning / Error State"
            icon="⚠"
            action={<Button size="sm" variant="danger">RELOAD SNAPSHOT</Button>}
          >
            Failed to fetch evaluation window metrics for delivery day 2026-01-15.
          </Callout>
          <div className="space-y-2 p-4 bg-white border-[3px] border-[#111] rounded-lg">
            <div className="text-xs font-mono font-bold mb-2">Hatched Skeletons:</div>
            <Skeleton height={24} width="80%" variant="solid" />
            <Skeleton height={48} width="100%" variant="yellow" />
            <Skeleton height={24} width="60%" variant="pink" />
          </div>
          <div className="flex items-center justify-center p-6 bg-white border-[3px] border-[#111] rounded-lg">
            <Popover
              trigger={<Button variant="primary">OPEN POPOVER DEMO</Button>}
              align="center"
            >
              <div className="space-y-2 text-xs">
                <div className="font-bold border-b border-[#111] pb-1">POPOVER TITLE</div>
                <p>This is a reusable Neo-Brutalist popover card with hard 6px offset shadow and click-outside dismissal.</p>
              </div>
            </Popover>
          </div>
        </div>
      </section>

      {/* 7. Table & Chart Foundation */}
      <section className="space-y-4">
        <h2 className="font-['Archivo_Black'] text-xl uppercase tracking-wider">
          7. Chart Foundation & View As Table Toggle
        </h2>
        <Card headerColor="ink" headerTitle="ECharts Foundation Demo">
          <Chart
            option={demoChartOption}
            height={380}
            ariaLabel="Demo Synthetic Wind Power Curve"
            tableData={demoTableData}
          />
        </Card>

        <Card headerColor="yellow" headerTitle="Standalone Data Table Primitive">
          <Table
            columns={demoTableData.columns}
            data={demoTableData.data.slice(0, 3)}
            caption="Sample preview of hourly generation data"
          />
        </Card>
      </section>
    </div>
  );
};

export default UiKitPage;
