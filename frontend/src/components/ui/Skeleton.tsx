import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  variant?: "solid" | "yellow" | "pink";
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  variant = "solid",
  className = "",
  style,
  ...props
}) => {
  const patternClass =
    variant === "pink"
      ? "pattern-hatch-pink"
      : variant === "yellow"
      ? "pattern-hatch-yellow"
      : "pattern-hatch-solid";

  return (
    <div
      aria-hidden="true"
      className={`border-2 border-[#111] rounded shadow-[2px_2px_0_#111] opacity-70 ${patternClass} ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        ...style,
      }}
      {...props}
    />
  );
};
