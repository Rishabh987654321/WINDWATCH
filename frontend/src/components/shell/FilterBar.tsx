import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { useFilters } from "../../store/filters";
import { DateRange } from "../ui/DateRange";
import { Segmented } from "../ui/Segmented";
import { Slider } from "../ui/Slider";
import { Select } from "../ui/Select";
import { Sticker } from "../ui/Sticker";
import { Tooltip } from "../ui/Tooltip";
import { Button } from "../ui/Button";

const CUTOFF_OPTIONS = [
  { value: "07:30", label: "07:30 (Morning run)" },
  { value: "09:00", label: "09:00 (Standard D-1 Cutoff)" },
  { value: "09:30", label: "09:30 (Post-gate closure)" },
  { value: "11:30", label: "11:30 (Midday run)" },
  { value: "15:30", label: "15:30 (Afternoon run)" },
];

const QUANTILE_OPTIONS = [
  { value: 0.8, label: "80%" },
  { value: 0.9, label: "90%" },
  { value: 0.95, label: "95%" },
  { value: 0.99, label: "99%" },
];

export const FilterBar: React.FC = () => {
  const location = useLocation();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const {
    from,
    to,
    policy,
    horizonHours,
    cutoff,
    riskQuantile,
    meta,
    setFilter,
    setFilters,
  } = useFilters();

  const [localHorizon, setLocalHorizon] = useState(horizonHours);
  const deferredHorizon = React.useDeferredValue(localHorizon);
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    setLocalHorizon(horizonHours);
  }, [horizonHours]);

  const handleSliderChange = (newVal: number) => {
    setLocalHorizon(newVal);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setFilter("horizonHours", newVal, { replace: true });
    }, 150);
  };

  const handleSliderCommit = (newVal: number) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setFilter("horizonHours", newVal, { replace: false });
  };

  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const isDayAheadPage = location.pathname.startsWith("/day-ahead");
  const isMethodologyPage = location.pathname.startsWith("/methodology");

  if (isMethodologyPage) {
    return null;
  }

  const isThinData = deferredHorizon > meta.reliableHorizonHours;

  const content = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* 1. Date range picker */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5A5A5A]">
          Evaluation Window
        </span>
        <DateRange
          from={from}
          to={to}
          minDate={meta.coverageFrom}
          maxDate={meta.coverageTo}
          onChange={(newFrom, newTo) => {
            setFilters({ from: newFrom, to: newTo });
          }}
        />
      </div>

      {/* 2. Policy toggle */}
      {!isDayAheadPage && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5A5A5A]">
            Selection Policy
          </span>
          <Segmented
            value={policy}
            onChange={(val) => setFilter("policy", val)}
            options={[
              { value: "day_ahead", label: "As of day-ahead cutoff" },
              { value: "lead_time", label: "Latest forecast ≥ N h ahead" },
            ]}
          />
        </div>
      )}

      {/* 3. Lead time slider (if policy === lead_time) */}
      {!isDayAheadPage && policy === "lead_time" && (
        <div className="flex flex-col gap-1 min-w-[240px] max-w-xs flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5A5A5A]">
              Lead Horizon
            </span>
            {isThinData && (
              <Sticker size="sm" color="pink" rotate={2}>
                THIN DATA BEYOND {meta.reliableHorizonHours}H
              </Sticker>
            )}
          </div>
          <Slider
            min={0}
            max={meta.maxHorizonHours}
            step={1}
            value={localHorizon}
            reliableThreshold={meta.reliableHorizonHours}
            onChange={handleSliderChange}
            onCommit={handleSliderCommit}
          />
        </div>
      )}

      {/* 4. Cutoff select (if policy === day_ahead or on /day-ahead page) */}
      {(isDayAheadPage || policy === "day_ahead") && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5A5A5A]">
              Decision Cutoff
            </span>
            <Tooltip
              content={
                <p className="max-w-xs text-xs">
                  WINDFOR runs publish at :30 past 02, 04, 07, 09, 11, 15, 18, 22 UTC;
                  any cutoff in [07:30, 09:30) uses the 07:30 run.
                </p>
              }
            >
              <Sticker size="sm" color="yellow" rotate={-1}>
                ASSUMPTION
              </Sticker>
            </Tooltip>
          </div>
          <Select
            value={cutoff}
            onChange={(val) => setFilter("cutoff", val)}
            options={CUTOFF_OPTIONS}
          />
        </div>
      )}

      {/* 5. Risk Quantile (shown on Day-Ahead page) */}
      {isDayAheadPage && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5A5A5A]">
            Target Quantile (q)
          </span>
          <Segmented
            value={riskQuantile}
            onChange={(q) => setFilter("riskQuantile", q)}
            options={QUANTILE_OPTIONS}
          />
        </div>
      )}
    </div>
  );

  return (
    <section
      aria-label="Filter Controls"
      className="sticky top-16 z-30 bg-[#FFF8E1] border-b-[3px] border-[#111] py-3 px-4 sm:px-6 shadow-[0_4px_0_rgba(17,17,17,0.06)]"
    >
      <div className="max-w-7xl mx-auto">
        {/* Desktop View */}
        <div className="hidden lg:block">{content}</div>

        {/* Mobile View with Drawer Trigger */}
        <div className="flex lg:hidden items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold bg-white px-2 py-1 border-2 border-[#111] rounded">
              {from} → {to}
            </span>
            <span className="font-mono text-xs font-bold bg-[#FFE94A] px-2 py-1 border-2 border-[#111] rounded">
              {policy === "day_ahead" ? `Cutoff: ${cutoff}` : `H: ${horizonHours}h`}
            </span>
          </div>

          <Button
            size="sm"
            variant="primary"
            onClick={() => setMobileDrawerOpen((prev) => !prev)}
            aria-expanded={mobileDrawerOpen}
            aria-controls="mobile-filter-drawer"
          >
            {mobileDrawerOpen ? "✕ CLOSE" : "⚙ FILTERS"}
          </Button>
        </div>

        {/* Mobile Drawer */}
        {mobileDrawerOpen && (
          <div
            id="mobile-filter-drawer"
            className="lg:hidden mt-4 pt-4 border-t-2 border-[#111] space-y-4"
          >
            {content}
          </div>
        )}
      </div>
    </section>
  );
};
