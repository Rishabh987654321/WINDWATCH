import React from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "ink";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[#FFE94A] text-[#111] hover:bg-[#FFF066]",
  secondary: "bg-white text-[#111] hover:bg-[#F9F9F9]",
  danger: "bg-[#FF6B9E] text-[#111] hover:bg-[#FF85B0]",
  ghost: "bg-transparent text-[#111] shadow-none border-transparent hover:bg-[#FFE94A]/30",
  ink: "bg-[#111] text-[#FFE94A] hover:bg-[#222]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  children,
  className = "",
  ...props
}) => {
  const isGhost = variant === "ghost";
  const borderClasses = isGhost ? "" : "border-[3px] border-[#111] rounded-lg shadow-[3px_3px_0_#111]";
  const motionClasses = isGhost
    ? "transition-colors"
    : "transition-all duration-75 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#111] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none";

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center font-bold font-['Space_Grotesk'] cursor-pointer select-none focus-visible:outline-[3px] focus-visible:outline-[#4D7CFE] focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_#111] disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[3px_3px_0_#111] ${borderClasses} ${VARIANTS[variant]} ${SIZES[size]} ${motionClasses} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-[#111] border-t-transparent rounded-full animate-spin" />
          <span>Loading...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
