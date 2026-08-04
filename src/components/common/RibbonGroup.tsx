import type { ReactNode } from "react";

interface RibbonGroupProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function RibbonGroup({ label, children, className = "" }: RibbonGroupProps) {
  return (
    <section className={`ribbon-group ${className}`.trim()} aria-label={label}>
      <div className="ribbon-group__content">{children}</div>
      <div className="ribbon-group__label">{label}</div>
    </section>
  );
}
