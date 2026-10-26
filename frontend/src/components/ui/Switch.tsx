import React from "react";

export interface SwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = "",
}) => {
  const toggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-label={label || "Toggle switch"}
        aria-checked={checked}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-lg border-[3px] border-[#111] shadow-[3px_3px_0_#111] transition-colors duration-100 ease-in-out focus-visible:outline-[3px] focus-visible:outline-[#4D7CFE] focus-visible:outline-offset-2 ${
          checked ? "bg-[#FFE94A]" : "bg-white"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded border-2 border-[#111] bg-[#111] shadow-none transition duration-100 ease-in-out my-auto ml-1 ${
            checked ? "translate-x-6 bg-[#111]" : "translate-x-0 bg-[#111]"
          }`}
        />
      </button>

      {(label || description) && (
        <div className="flex flex-col cursor-pointer" onClick={toggle}>
          {label && (
            <span className="font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wide text-[#111]">
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11px] text-[#5A5A5A]">{description}</span>
          )}
        </div>
      )}
    </div>
  );
};
