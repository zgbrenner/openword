import type { ButtonHTMLAttributes, ReactNode } from "react";

interface RibbonButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  large?: boolean;
  shortcut?: string;
}

export function RibbonButton({
  label,
  icon,
  active = false,
  large = false,
  shortcut,
  className = "",
  ...props
}: RibbonButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      aria-pressed={active || undefined}
      className={`ribbon-button${active ? " is-active" : ""}${large ? " is-large" : ""} ${className}`.trim()}
      {...props}
    >
      {icon ? <span className="ribbon-button__icon" aria-hidden="true">{icon}</span> : null}
      <span className="ribbon-button__label">{label}</span>
    </button>
  );
}
