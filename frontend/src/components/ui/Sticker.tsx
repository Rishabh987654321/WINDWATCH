import React from "react";

export type StickerColor = "yellow" | "pink" | "blue" | "green" | "ink" | "white";
export type StickerRotation = -3 | -2 | -1 | 0 | 1 | 2 | 3;

export interface StickerProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: StickerColor;
  rotate?: StickerRotation;
  size?: "sm" | "md";
  children: React.ReactNode;
}

const COLOR_CLASSES: Record<StickerColor, string> = {
  yellow: "bg-[#FFE94A] text-[#111]",
  pink: "bg-[#FF6B9E] text-[#111]",
  blue: "bg-[#4D7CFE] text-[#111]",
  green: "bg-[#00C48C] text-[#111]",
  ink: "bg-[#111] text-[#FFE94A]",
  white: "bg-white text-[#111]",
};

const ROTATE_CLASSES: Record<StickerRotation, string> = {
  [-3]: "-rotate-3",
  [-2]: "-rotate-2",
  [-1]: "-rotate-1",
  [0]: "rotate-0",
  [1]: "rotate-1",
  [2]: "rotate-2",
  [3]: "rotate-3",
};

export const Sticker: React.FC<StickerProps> = ({
  color = "yellow",
  rotate = 0,
  size = "md",
  children,
  className = "",
  ...props
}) => {
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-block font-mono font-bold uppercase tracking-wider border-2 border-[#111] rounded shadow-[2px_2px_0_#111] transform transition-transform hover:rotate-0 select-none ${COLOR_CLASSES[color]} ${ROTATE_CLASSES[rotate]} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

export const Badge = Sticker;
