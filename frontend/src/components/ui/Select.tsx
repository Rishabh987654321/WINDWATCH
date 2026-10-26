import React from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  value,
  onChange,
  className = "",
  disabled,
  id,
  ...props
}) => {
  const generatedId = React.useId();
  const selectId = id || generatedId;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-bold font-['Space_Grotesk'] text-[#111] uppercase tracking-wide"
        >
          {label}
        </label>
      )}
      <div className="relative inline-block w-full">
        <select
          id={selectId}
          aria-label={label || props["aria-label"] || "Select option"}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none bg-white border-[3px] border-[#111] rounded-lg shadow-[3px_3px_0_#111] px-3.5 py-2 pr-10 text-sm font-['Space_Grotesk'] font-bold text-[#111] cursor-pointer focus-visible:outline-[3px] focus-visible:outline-[#4D7CFE] focus-visible:outline-offset-2 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#111] disabled:opacity-50 disabled:cursor-not-allowed`}
          {...props}
        >
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
              className="font-mono text-sm py-1"
            >
              {opt.label}
            </option>
          ))}
        </select>
        {/* Custom brutalist chevron arrow */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 border-l-[2px] border-[#111] bg-[#FFE94A] rounded-r-md">
          <span className="font-mono font-bold text-xs">▼</span>
        </div>
      </div>
    </div>
  );
};
