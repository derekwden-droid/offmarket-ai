"use client";

import * as React from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastRecord extends Required<Omit<ToastOptions, "description">> {
  id: string;
  description?: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4500;

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: LucideIcon; color: string }
> = {
  success: { icon: CheckCircle2, color: "#10B981" },
  error: { icon: XCircle, color: "#F43F5E" },
  warning: { icon: AlertTriangle, color: "#F59E0B" },
  info: { icon: Info, color: "#3B82F6" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback(
    (options: ToastOptions): string => {
      const id = crypto.randomUUID();
      const record: ToastRecord = {
        id,
        title: options.title,
        description: options.description,
        variant: options.variant ?? "info",
        duration: options.duration ?? DEFAULT_DURATION,
      };
      setToasts((current) => [...current, record]);

      const timer = setTimeout(() => dismiss(id), record.duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({ toast, dismiss }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider.");
  }
  return context;
}

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((item) => {
        const { icon: Icon, color } = VARIANT_STYLES[item.variant];
        return (
          <div
            key={item.id}
            role="status"
            aria-live="polite"
            className={cn(
              "om-line pointer-events-auto flex items-start gap-3 rounded-lg border bg-[#111827] p-4 shadow-lg",
            )}
            style={{ borderColor: `${color}55` }}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color }} />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-100">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-sm text-gray-400">
                  {item.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-[#1F2937] hover:text-gray-200"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
