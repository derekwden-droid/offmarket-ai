"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type LogKind =
  | "info"
  | "data"
  | "success"
  | "warn"
  | "error"
  | "inbound";

export interface LogLine {
  id: string;
  kind: LogKind;
  text: string;
  ts: string;
}

const KIND_COLOR: Record<LogKind, string> = {
  info: "#9CA3AF",
  data: "#3B82F6",
  success: "#10B981",
  warn: "#F59E0B",
  error: "#F43F5E",
  inbound: "#F59E0B",
};

const KIND_LABEL: Record<LogKind, string> = {
  info: "INFO",
  data: "DATA",
  success: " OK ",
  warn: "WARN",
  error: "ERR ",
  inbound: "IN  ",
};

interface LogConsoleProps {
  lines: LogLine[];
  running?: boolean;
  emptyHint?: string;
  className?: string;
}

/**
 * Terminal-style streaming console shared by the Scrape and Outreach screens.
 * Auto-scrolls to the newest line and shows a blinking cursor while `running`.
 */
export function LogConsole({
  lines,
  running = false,
  emptyHint = "Awaiting activity…",
  className,
}: LogConsoleProps) {
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-[#1F2937] bg-[#0B0F19]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-[#1F2937] bg-[#111827] px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F43F5E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
        </span>
        <span className="ml-1 font-mono text-xs text-gray-500">
          live-stream
        </span>
        {running ? (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "#10B981" }}
            />
            streaming
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-gray-600">{emptyHint}</p>
        ) : (
          lines.map((line) => (
            <div key={line.id} className="om-line flex gap-3 py-0.5">
              <span className="shrink-0 text-gray-600">{line.ts}</span>
              <span
                className="shrink-0 font-semibold"
                style={{ color: KIND_COLOR[line.kind] }}
              >
                {KIND_LABEL[line.kind]}
              </span>
              <span className="break-all text-gray-300">{line.text}</span>
            </div>
          ))
        )}
        <div ref={endRef} className={running ? "om-cursor" : undefined} />
      </div>
    </div>
  );
}
