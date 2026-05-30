import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Shared "you are here" active-state treatment for sidebar & navigation items.
 * Keeps the soft accent tint and adds a 3px left accent rail (clipped to the
 * item's rounded corners). Hover stays tint-only, so the current item is
 * distinguishable at a glance without adding visual weight to the list.
 */
export const NAV_ACTIVE =
  "bg-sidebar-accent text-sidebar-accent-foreground font-medium relative before:content-[''] before:absolute before:left-0 before:inset-y-1.5 before:w-[3px] before:rounded-r-full before:bg-foreground";
