import React from "react";

export type CalloutVariant = "yellow" | "pink" | "blue" | "green";

export interface CalloutProps {
  variant?: CalloutVariant;
  title?: string;
  icon?: React.ReactNode;
  headingLevel?: "h2" | "h3";
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

const CALLOUT_STYLES: Record<
  CalloutVariant,
  { bg: string; border: string; text: string; iconBg: string }
> = {
  yellow: {
    bg: "bg-[#FFFDE7]",
    border: "border-[#111]",
    text: "text-[#111]",
    iconBg: "bg-[#FFE94A]",
  },
  pink: {
    bg: "bg-[#FFF0F5]",
    border: "border-[#111]",
    text: "text-[#111]",
    iconBg: "bg-[#FF6B9E]",
  },
  blue: {
    bg: "bg-[#F0F5FF]",
    border: "border-[#111]",
    text: "text-[#111]",
    iconBg: "bg-[#4D7CFE] text-white",
  },
  green: {
    bg: "bg-[#F0FDF8]",
    border: "border-[#111]",
    text: "text-[#111]",
    iconBg: "bg-[#00C48C]",
  },
};

export const Callout: React.FC<CalloutProps> = ({
  variant = "yellow",
  title,
  icon,
  headingLevel = "h2",
  children,
  action,
  className = "",
}) => {
  const style = CALLOUT_STYLES[variant];
  const HeadingTag = headingLevel;

  return (
    <div
      role="alert"
      className={`border-[3px] ${style.border} ${style.bg} ${style.text} rounded-lg shadow-[4px_4px_0_#111] p-3.5 sm:p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div
            className={`flex-shrink-0 w-7 h-7 rounded border-2 border-[#111] flex items-center justify-center text-sm font-bold shadow-[1px_1px_0_#111] ${style.iconBg}`}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {title && (
            <HeadingTag className="font-['Space_Grotesk'] font-bold text-sm tracking-wide uppercase mb-1">
              {title}
            </HeadingTag>
          )}
          <div className="font-['Space_Grotesk'] text-xs sm:text-sm font-medium leading-relaxed">
            {children}
          </div>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
};
