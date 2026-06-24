import * as React from "react";
import { cn } from "@/lib/utils";

/** Pulsing placeholder block used by loading states. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[#1F2937]/60", className)}
      {...props}
    />
  );
}
