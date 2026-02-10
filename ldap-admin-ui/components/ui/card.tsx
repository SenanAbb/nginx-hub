import type React from "react";

import { cn } from "@/lib/utils";

export type CardProps = React.ComponentProps<"div">;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-xl border border-border bg-card py-6 text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: CardProps) {
  return (
    <div data-slot="card-header" className={cn("grid gap-2 px-6", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: CardProps) {
  return (
    <div data-slot="card-title" className={cn("font-semibold", className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: CardProps) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: CardProps) {
  return (
    <div data-slot="card-content" className={cn("px-6", className)} {...props} />
  );
}

export function CardFooter({ className, ...props }: CardProps) {
  return (
    <div data-slot="card-footer" className={cn("flex items-center px-6", className)} {...props} />
  );
}
