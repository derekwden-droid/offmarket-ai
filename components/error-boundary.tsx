"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Class-based error boundary that isolates rendering failures in interactive
 * panels (simulation engines, tables) so a single faulty subtree does not blank
 * the entire dashboard.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message:
        error instanceof Error ? error.message : "An unexpected error occurred.",
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  reset(): void {
    this.setState({ hasError: false, message: "" });
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#1F2937] bg-[#111827] p-8 text-center">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(244,63,94,0.12)" }}
        >
          <AlertTriangle className="h-5 w-5" style={{ color: "#F43F5E" }} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-100">
            {this.props.fallbackTitle ?? "Something went wrong"}
          </p>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            {this.state.message}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={this.reset}>
          Try again
        </Button>
      </div>
    );
  }
}
