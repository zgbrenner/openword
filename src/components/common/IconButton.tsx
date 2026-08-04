import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  active?: boolean;
  compact?: boolean;
  tooltip?: string;
}

export function IconButton({
  label,
  icon,
  active = false,
  compact = false,
  tooltip,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      title={tooltip ?? label}
      className={`icon-button${active ? " is-active" : ""}${compact ? " is-compact" : ""} ${className}`.trim()}
      {...props}
    >
      {icon}
    </button>
  );
}
