import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

export function Button({
  variant = "default",
  className,
  suppressHydrationWarning,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: "default" | "primary" | "ghost";
  suppressHydrationWarning?: boolean;
}) {
  return (
    <button 
      {...props} 
      className={clsx("btn", variant === "primary" && "primary", variant === "ghost" && "ghost", className)} 
      suppressHydrationWarning={suppressHydrationWarning}
    />
  );
}
