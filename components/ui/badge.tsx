import * as React from "react";
import type { LeadStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/** Generic pill badge. */
export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}

interface StatusStyle {
  label: string;
  dot: string;
  text: string;
  border: string;
  bg: string;
}

/**
 * `LeadStatus` is imported as a type only (it is erased at build time), so this
 * lookup is keyed by the string union without pulling the Prisma runtime into
 * the client bundle.
 */
const STATUS_STYLES: Record<LeadStatus, StatusStyle> = {
  RAW: {
    label: "Raw",
    dot: "#9CA3AF",
    text: "#D1D5DB",
    border: "rgba(156,163,175,0.30)",
    bg: "rgba(156,163,175,0.10)",
  },
  SKIP_TRACED: {
    label: "Skip-Traced",
    dot: "#3B82F6",
    text: "#93C5FD",
    border: "rgba(59,130,246,0.30)",
    bg: "rgba(59,130,246,0.10)",
  },
  AI_CONTACTED: {
    label: "AI Contacted",
    dot: "#8B5CF6",
    text: "#C4B5FD",
    border: "rgba(139,92,246,0.30)",
    bg: "rgba(139,92,246,0.10)",
  },
  QUALIFIED: {
    label: "Qualified",
    dot: "#10B981",
    text: "#6EE7B7",
    border: "rgba(16,185,129,0.30)",
    bg: "rgba(16,185,129,0.10)",
  },
  COLD: {
    label: "Cold",
    dot: "#F43F5E",
    text: "#FDA4AF",
    border: "rgba(244,63,94,0.30)",
    bg: "rgba(244,63,94,0.10)",
  },
};

/** Status badge with a colored indicator dot, keyed by LeadStatus. */
export function StatusBadge({ status }: { status: LeadStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{
        color: style.text,
        borderColor: style.border,
        backgroundColor: style.bg,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: style.dot }}
      />
      {style.label}
    </span>
  );
}
