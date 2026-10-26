import React from "react";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeId,
  onChange,
  ariaLabel = "Navigation Tabs",
  className = "",
}) => {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex border-[3px] border-[#111] rounded-lg shadow-[4px_4px_0_#111] bg-white overflow-hidden p-1 gap-1 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-1.5 font-['Space_Grotesk'] font-bold text-sm rounded cursor-pointer transition-all duration-75 select-none focus-visible:outline-[2px] focus-visible:outline-[#4D7CFE] focus-visible:outline-offset-1 ${
              isActive
                ? "bg-[#FFE94A] text-[#111] shadow-none"
                : "bg-transparent text-[#111] hover:bg-[#FFE94A]/25"
            }`}
          >
            {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
