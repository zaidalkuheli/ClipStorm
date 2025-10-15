import { ReactNode } from "react";
import clsx from "clsx";

export function Panel({
  title,
  right,
  children,
  className
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("panel flex min-w-0 flex-col", className)}>
      {title !== undefined && (
        <div className="panel-header flex items-center justify-between">
          <span>{title}</span>
          <div className="flex items-center gap-2">{right}</div>
        </div>
      )}
      <div className="panel-body">{children}</div>
    </div>
  );
}
