import React from "react";
import { Sticker, type StickerColor } from "./Sticker";

export type StatEdgeColor = "yellow" | "blue" | "pink" | "green" | "ink";

export interface StatProps {
  label: string;
  value: string | number;
  unit?: string;
  edgeColor?: StatEdgeColor;
  delta?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  sticker?: {
    text: string;
    color?: StickerColor;
  };
  helpText?: string;
  className?: string;
}

const EDGE_COLORS: Record<StatEdgeColor, string> = {
  yellow: "border-l-[#FFE94A]",
  blue: "border-l-[#4D7CFE]",
  pink: "border-l-[#FF6B9E]",
  green: "border-l-[#00C48C]",
  ink: "border-l-[#111]",
};

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  unit,
  edgeColor = "yellow",
  delta,
  sticker,
  helpText,
  className = "",
}) => {
  return (
    <div
      className={`bg-white border-[3px] border-[#111] rounded-lg shadow-[6px_6px_0_#111] p-4 border-l-[8px] ${EDGE_COLORS[edgeColor]} ${className}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-['Space_Grotesk'] text-xs font-bold uppercase tracking-wider text-[#5A5A5A]">
          {label}
        </span>
        {sticker && (
          <Sticker size="sm" color={sticker.color ?? "yellow"} rotate={-2}>
            {sticker.text}
          </Sticker>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-3xl sm:text-4xl font-bold text-[#111] tabular-nums">
          {value}
        </span>
        {unit && (
          <span className="font-mono text-sm font-bold text-[#5A5A5A] uppercase">
            {unit}
          </span>
        )}
      </div>

      {(delta || helpText) && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#111]/10 text-xs">
          {delta && (
            <span
              className={`font-mono font-bold px-1.5 py-0.5 rounded border border-[#111] text-[11px] ${
                delta.isPositive
                  ? "bg-[#00C48C]/20 text-[#008A62]"
                  : "bg-[#FF6B9E]/20 text-[#CC295F]"
              }`}
            >
              {delta.value}
            </span>
          )}
          {helpText && <span className="text-[#5A5A5A] truncate">{helpText}</span>}
        </div>
      )}
    </div>
  );
};
