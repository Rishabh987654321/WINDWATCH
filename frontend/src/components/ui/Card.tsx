import React from "react";

export type CardHeaderColor = "yellow" | "blue" | "pink" | "green" | "ink" | "none";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  headerColor?: CardHeaderColor;
  headerTitle?: string;
  headerAction?: React.ReactNode;
  headingLevel?: "h2" | "h3";
  children: React.ReactNode;
}

const HEADER_BG: Record<CardHeaderColor, string> = {
  yellow: "bg-[#FFE94A] text-[#111]",
  blue: "bg-[#4D7CFE] text-[#111]",
  pink: "bg-[#FF6B9E] text-[#111]",
  green: "bg-[#00C48C] text-[#111]",
  ink: "bg-[#111] text-[#FFE94A]",
  none: "bg-white text-[#111]",
};

export const Card: React.FC<CardProps> = ({
  headerColor = "none",
  headerTitle,
  headerAction,
  headingLevel = "h2",
  children,
  className = "",
  ...props
}) => {
  const HeadingTag = headingLevel;

  return (
    <div
      className={`bg-white border-[3px] border-[#111] rounded-lg shadow-[6px_6px_0_#111] overflow-hidden ${className}`}
      {...props}
    >
      {(headerTitle || headerAction) && (
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b-[3px] border-[#111] ${HEADER_BG[headerColor]}`}
        >
          {headerTitle && (
            <HeadingTag className="font-['Archivo_Black'] text-sm tracking-wide uppercase">
              {headerTitle}
            </HeadingTag>
          )}
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
};
