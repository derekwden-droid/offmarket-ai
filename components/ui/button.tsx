import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button primitive. Accent colors are applied with inline styles at the call
 * site where exact token fidelity (and glow shadows) matter; the variants here
 * cover the common cases using literal arbitrary values so rendering does not
 * depend on Tailwind theme configuration.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg",
    "text-sm font-medium transition-all duration-150 select-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "focus-visible:ring-offset-[#0B0F19] disabled:pointer-events-none disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[#10B981] text-[#04190F] hover:bg-[#059669] focus-visible:ring-[#10B981]",
        ai:
          "bg-[#3B82F6] text-white hover:bg-[#2563EB] focus-visible:ring-[#3B82F6]",
        secondary:
          "bg-[#1F2937] text-gray-100 hover:bg-[#273344] focus-visible:ring-[#374151]",
        outline:
          "border border-[#1F2937] bg-transparent text-gray-200 hover:bg-[#111827] focus-visible:ring-[#374151]",
        ghost:
          "bg-transparent text-gray-300 hover:bg-[#111827] hover:text-gray-100 focus-visible:ring-[#374151]",
        destructive:
          "bg-[#F43F5E] text-white hover:bg-[#E11D48] focus-visible:ring-[#F43F5E]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-10 w-10",
      },
      glow: {
        none: "",
        emerald: "shadow-[0_0_15px_rgba(16,185,129,0.30)]",
        cyber: "shadow-[0_0_15px_rgba(59,130,246,0.30)]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      glow: "none",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, glow, type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(buttonVariants({ variant, size, glow }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
