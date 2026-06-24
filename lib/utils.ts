import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names and resolve Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");

/** Format a number as whole-dollar USD (e.g. 1450 -> "$1,450"). */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return currencyFormatter.format(value);
}

/** Format a number with thousands separators (e.g. 12000 -> "12,000"). */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return numberFormatter.format(value);
}

/**
 * Format a 0..1 ratio as a rounded percentage string (e.g. 0.7234 -> "72%").
 * Values are clamped defensively so display never shows NaN or >100%.
 */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  if (!Number.isFinite(ratio)) return "0%";
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return `${(clamped * 100).toFixed(fractionDigits)}%`;
}
