import React from "react";
import { Link, useLocation } from "react-router-dom";
import { QualityPopover } from "./QualityPopover";
import type { MetaResponse } from "../../api/types";

export interface TopBarProps {
  meta?: MetaResponse;
  isLoadingMeta?: boolean;
}

interface NavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "OVERVIEW" },
  { to: "/day-ahead", label: "DAY-AHEAD" },
  { to: "/accuracy", label: "ACCURACY LAB" },
  { to: "/methodology", label: "METHODOLOGY" },
];

export const TopBar: React.FC<TopBarProps> = ({ meta, isLoadingMeta }) => {
  const location = useLocation();

  return (
    <header className="bg-white border-b-[3px] border-[#111] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand logo & tagline */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 group text-inherit no-underline focus-visible:outline-[3px] focus-visible:outline-[#4D7CFE] focus-visible:outline-offset-2"
          >
            <div className="font-['Archivo_Black'] text-xl sm:text-2xl tracking-tighter bg-[#FFE94A] text-[#111] px-2.5 py-1 border-[3px] border-[#111] rounded shadow-[3px_3px_0_#111] -rotate-2 transform transition-transform group-hover:rotate-0">
              WINDWATCH
            </div>
          </Link>
          <span className="hidden md:inline font-mono text-xs text-[#5A5A5A] italic">
            Know your wind before you buy.
          </span>
        </div>

        {/* Navigation tabs */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-1.5"
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.to);

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`font-['Space_Grotesk'] text-xs font-bold tracking-wider px-3 py-1.5 border-2 border-[#111] rounded-md transition-all duration-75 no-underline focus-visible:outline-[2px] focus-visible:outline-[#4D7CFE] focus-visible:outline-offset-1 ${
                  isActive
                    ? "bg-[#FFE94A] text-[#111] shadow-none translate-x-[1px] translate-y-[1px]"
                    : "bg-white text-[#111] shadow-[2px_2px_0_#111] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#111]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          {import.meta.env.DEV && (
            <Link
              to="/_kit"
              className={`font-mono text-xs font-bold px-2.5 py-1.5 border-2 border-[#111] rounded-md transition-all duration-75 no-underline ${
                location.pathname === "/_kit"
                  ? "bg-[#FF6B9E] text-[#111] shadow-none"
                  : "bg-white text-[#5A5A5A] shadow-[2px_2px_0_#111] hover:bg-[#FF6B9E]/20"
              }`}
            >
              UI KIT
            </Link>
          )}
        </nav>

        {/* Quality popover badge */}
        <div>
          <QualityPopover meta={meta} isLoading={isLoadingMeta} />
        </div>
      </div>

      {/* Mobile nav bar */}
      <div className="flex md:hidden border-t-2 border-[#111] bg-[#FFF8E1] px-4 py-2 overflow-x-auto gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`font-['Space_Grotesk'] text-xs font-bold whitespace-nowrap px-2.5 py-1 border-2 border-[#111] rounded no-underline ${
                isActive
                  ? "bg-[#FFE94A] text-[#111]"
                  : "bg-white text-[#111] shadow-[1px_1px_0_#111]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        {import.meta.env.DEV && (
          <Link
            to="/_kit"
            className="font-mono text-xs font-bold px-2 py-1 bg-white border-2 border-[#111] rounded no-underline"
          >
            KIT
          </Link>
        )}
      </div>
    </header>
  );
};
