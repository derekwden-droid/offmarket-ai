import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared field chrome: dark surface, hairline border, cyber-blue focus ring. */
const baseField = [
  "w-full rounded-lg border border-[#1F2937] bg-[#0B0F19] px-3 text-sm text-gray-100",
  "placeholder:text-gray-600 transition-colors duration-150",
  "focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(baseField, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      baseField,
      "min-h-[120px] resize-y py-2.5 font-mono leading-relaxed",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

/** Native select styled to match the design system, with a custom chevron. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          baseField,
          "h-10 cursor-pointer appearance-none pr-9",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = "Select";
