import React from "react";

export interface MarqueeProps {
  items: React.ReactNode[];
  speedSeconds?: number;
  className?: string;
}

export const Marquee: React.FC<MarqueeProps> = ({
  items,
  speedSeconds = 35,
  className = "",
}) => {
  return (
    <div
      className={`relative w-full overflow-hidden bg-[#111] text-[#FFE94A] border-y-[3px] border-[#111] py-2 select-none group ${className}`}
      role="region"
      aria-label="Headline Key Metrics Ticker"
    >
      <div
        className="flex gap-8 whitespace-nowrap will-change-transform animate-[marquee_35s_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:transform-none"
        style={{ animationDuration: `${speedSeconds}s` }}
      >
        {/* Render twice for continuous loop */}
        <div className="flex items-center gap-8 font-mono text-xs sm:text-sm font-bold tracking-wider">
          {items.map((item, idx) => (
            <React.Fragment key={`m1-${idx}`}>
              <span>{item}</span>
              <span className="text-white">★</span>
            </React.Fragment>
          ))}
        </div>
        <div
          className="flex items-center gap-8 font-mono text-xs sm:text-sm font-bold tracking-wider motion-reduce:hidden"
          aria-hidden="true"
        >
          {items.map((item, idx) => (
            <React.Fragment key={`m2-${idx}`}>
              <span>{item}</span>
              <span className="text-white">★</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
