"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Dashboard render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: "rgba(244,63,94,0.12)" }}
      >
        <AlertTriangle className="h-6 w-6" style={{ color: "#F43F5E" }} />
      </span>
      <div>
        <p className="text-lg font-semibold text-gray-100">
          This view failed to load
        </p>
        <p className="mt-1 max-w-md text-sm text-gray-500">
          {error.message || "An unexpected error occurred while rendering."}
        </p>
      </div>
      <Button variant="primary" glow="emerald" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
