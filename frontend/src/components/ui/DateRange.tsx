import React from "react";
import { Button } from "./Button";

export interface DateRangeProps {
  from: string;
  to: string;
  minDate?: string;
  maxDate?: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

interface Preset {
  label: string;
  from: string;
  to: string;
}

const PRESETS: Preset[] = [
  { label: "Jan 2026", from: "2026-01-01", to: "2026-01-31" },
  { label: "W1", from: "2026-01-01", to: "2026-01-04" },
  { label: "W2", from: "2026-01-05", to: "2026-01-11" },
  { label: "W3", from: "2026-01-12", to: "2026-01-18" },
  { label: "W4", from: "2026-01-19", to: "2026-01-25" },
  { label: "W5", from: "2026-01-26", to: "2026-01-31" },
];

export const DateRange: React.FC<DateRangeProps> = ({
  from,
  to,
  minDate = "2025-12-01",
  maxDate = "2026-01-31",
  onChange,
  className = "",
}) => {
  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val && (!to || val <= to)) {
      onChange(val, to || val);
    }
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val && (!from || val >= from)) {
      onChange(from || val, val);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-white border-[3px] border-[#111] rounded-lg shadow-[3px_3px_0_#111] px-2.5 py-1.5">
          <input
            type="date"
            aria-label="Start Date"
            value={from}
            min={minDate}
            max={maxDate}
            onChange={handleFromChange}
            className="font-mono text-xs font-bold text-[#111] bg-transparent focus:outline-none cursor-pointer"
          />
          <span className="font-mono font-bold text-xs text-[#5A5A5A]">→</span>
          <input
            type="date"
            aria-label="End Date"
            value={to}
            min={from || minDate}
            max={maxDate}
            onChange={handleToChange}
            className="font-mono text-xs font-bold text-[#111] bg-transparent focus:outline-none cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-1">
          {PRESETS.map((p) => {
            const isSelected = from === p.from && to === p.to;
            return (
              <Button
                key={p.label}
                size="sm"
                variant={isSelected ? "primary" : "secondary"}
                onClick={() => onChange(p.from, p.to)}
                className="py-1 px-2 text-[11px] font-mono h-8"
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
