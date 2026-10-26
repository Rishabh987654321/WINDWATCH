import React from "react";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className = "",
}) => {
  return (
    <div className={`relative inline-block group ${className}`}>
      {children}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block group-focus-within:block z-50 whitespace-normal min-w-max max-w-xs"
      >
        <div className="bg-white border-2 border-[#111] rounded shadow-[3px_3px_0_#111] p-2 text-xs font-['Space_Grotesk'] font-medium text-[#111] animate-in fade-in-0 zoom-in-95">
          {content}
        </div>
      </div>
    </div>
  );
};
