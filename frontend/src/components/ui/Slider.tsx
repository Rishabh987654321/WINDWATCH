import React, { useRef } from "react";

export interface SliderProps {
  id?: string;
  label?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  reliableThreshold?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  id,
  label,
  min,
  max,
  step = 1,
  value,
  unit = "h",
  reliableThreshold,
  onChange,
  onCommit,
  className = "",
}) => {
  const isDragging = useRef(false);

  const percentage = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  const reliablePercentage =
    reliableThreshold !== undefined && max > min
      ? Math.max(0, Math.min(100, ((reliableThreshold - min) / (max - min)) * 100))
      : undefined;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let nextValue = value;
    const multiplier = e.shiftKey ? 5 : 1;
    const stepDelta = step * multiplier;

    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      nextValue = Math.min(max, value + stepDelta);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      nextValue = Math.max(min, value - stepDelta);
      e.preventDefault();
    } else if (e.key === "Home") {
      nextValue = min;
      e.preventDefault();
    } else if (e.key === "End") {
      nextValue = max;
      e.preventDefault();
    } else {
      return;
    }

    onChange(nextValue);
    onCommit?.(nextValue);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const updateFromX = (clientX: number) => {
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const ratio = x / rect.width;
      const rawVal = min + ratio * (max - min);
      const stepped = Math.round(rawVal / step) * step;
      const clamped = Math.max(min, Math.min(max, stepped));
      onChange(clamped);
      return clamped;
    };

    isDragging.current = true;
    updateFromX(e.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (isDragging.current) {
        updateFromX(moveEvent.clientX);
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (isDragging.current) {
        isDragging.current = false;
        const finalVal = updateFromX(upEvent.clientX);
        onCommit?.(finalVal);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div className={`space-y-2 select-none ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs font-bold font-['Space_Grotesk'] text-[#111] uppercase tracking-wide">
          <span>{label}</span>
          <span className="font-mono bg-[#FFE94A] px-2 py-0.5 border-2 border-[#111] rounded shadow-[1px_1px_0_#111]">
            {value} {unit}
          </span>
        </div>
      )}

      <div
        id={id}
        className="relative py-3 flex items-center cursor-pointer focus-visible:outline-[2px] focus-visible:outline-[#4D7CFE] focus-visible:outline-offset-2 rounded"
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        tabIndex={0}
        role="slider"
        aria-label={label || "Slider"}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} ${unit}`}
      >
        {/* Track container */}
        <div className="relative w-full h-3 bg-white border-2 border-[#111] rounded shadow-[2px_2px_0_#111] overflow-hidden">
          {/* Active fill */}
          <div
            className="absolute top-0 left-0 h-full bg-[#FFE94A] border-r-2 border-[#111]"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Reliable threshold marker */}
        {reliablePercentage !== undefined && (
          <div
            className="absolute top-1 bottom-1 w-0.5 bg-[#FF6B9E] z-10 pointer-events-none"
            style={{ left: `${reliablePercentage}%` }}
            title={`Reliable data threshold (${reliableThreshold} ${unit})`}
          />
        )}

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 bg-[#FFE94A] border-[3px] border-[#111] rounded shadow-[2px_2px_0_#111] pointer-events-none flex items-center justify-center"
          style={{ left: `${percentage}%` }}
        >
          <div className="w-1.5 h-1.5 bg-[#111] rounded-full" />
        </div>
      </div>

      {reliableThreshold !== undefined && (
        <div className="flex justify-between text-[11px] font-mono font-bold text-[#5A5A5A]">
          <span>{min}{unit}</span>
          <span className="bg-[#FF6B9E] text-[#111] px-1.5 py-0.5 rounded border border-[#111] font-bold text-[10px]">
            ▲ {reliableThreshold}{unit} (reliable limit)
          </span>
          <span>{max}{unit}</span>
        </div>
      )}
    </div>
  );
};
