import type { SelectHTMLAttributes } from "react";

interface SelectControlProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  visuallyHiddenLabel?: boolean;
}

export function SelectControl({ label, visuallyHiddenLabel = true, className = "", ...props }: SelectControlProps) {
  return (
    <label className={`select-control ${className}`.trim()}>
      <span className={visuallyHiddenLabel ? "sr-only" : "select-control__label"}>{label}</span>
      <select aria-label={label} {...props} />
    </label>
  );
}
