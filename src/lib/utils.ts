import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNow } from "date-fns";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Format currency — EGP by default, USD optional */
export function formatCurrency(
  amount: number,
  currency: "EGP" | "USD" = "EGP"
): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format date as "15 Mar 2026" */
export function formatDate(date: string | Date): string {
  return format(new Date(date), "dd MMM yyyy");
}

/** Relative time: "3 hours ago", "2 days ago" */
export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

/** Format large numbers with commas: 1,234,567 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

/** Format percentage: 85.3% */
export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}
