import { HTMLAttributes } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  noPadding?: boolean;
}

/** Flat, nearly square, with a faint teal inner edge so panels separate without heavy borders. */
export default function Panel({ elevated, noPadding, children, className = "", style, ...props }: PanelProps) {
  return (
    <div
      className={[noPadding ? "" : "p-5", className].join(" ")}
      style={{
        background: elevated ? "var(--bg-elevated)" : "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "2px",
        boxShadow: "inset 0 1px 0 rgba(45,212,191,0.06)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
