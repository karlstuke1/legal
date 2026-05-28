export const APP_BASE_URL = (
  import.meta.env.VITE_APP_BASE_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://legal.vercel.app")
).replace(/\/$/, "");

export function absoluteUrl(path = "/"): string {
  return `${APP_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
