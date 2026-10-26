import React from "react";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  size = "md",
  className = "",
}: SegmentedProps<T>): React.ReactElement {
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    currentIndex: number
  ) => {
    let nextIndex = currentIndex;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % options.length;
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + options.length) % options.length;
      e.preventDefault();
    } else {
      return;
    }

    const nextOption = options[nextIndex];
    if (nextOption && !nextOption.disabled) {
      onChange(nextOption.value);
    }
  };

  const padClass = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel || label || "Segmented control"}
      className={`inline-flex border-[3px] border-[#111] rounded-lg shadow-[3px_3px_0_#111] bg-white overflow-hidden p-0.5 gap-0.5 ${className}`}
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value;
        return (
          <div
            key={String(opt.value)}
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => !opt.disabled && onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`cursor-pointer select-none font-['Space_Grotesk'] font-bold rounded text-center transition-all duration-75 flex items-center justify-center focus-visible:outline-[2px] focus-visible:outline-[#4D7CFE] focus-visible:outline-offset-1 ${padClass} ${
              isSelected
                ? "bg-[#FFE94A] text-[#111] shadow-none translate-x-0"
                : "bg-transparent text-[#111] hover:bg-[#FFE94A]/25"
            } ${opt.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {opt.label}
          </div>
        );
      })}
    </div>
  );
}
