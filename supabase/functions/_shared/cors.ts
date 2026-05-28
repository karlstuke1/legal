const CORS_ALLOW_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
].join(", ");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

function getEnv(name: string): string | undefined {
  return (globalThis as any).Deno?.env?.get?.(name);
}

function configuredOrigins(): string[] {
  const appBaseUrl = getEnv("APP_BASE_URL");
  const configured = getEnv("CORS_ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) || [];

  return Array.from(new Set([
    ...configured,
    ...(appBaseUrl ? [appBaseUrl] : []),
    ...DEFAULT_ALLOWED_ORIGINS,
  ].map((origin) => origin.replace(/\/$/, ""))));
}

export function makeCorsHeaders(req: Request): Record<string, string> {
  const origin = (req.headers.get("Origin") || "").replace(/\/$/, "");
  const allowedOrigins = configuredOrigins();
  const fallbackOrigin = getEnv("APP_BASE_URL")?.replace(/\/$/, "") || allowedOrigins[0] || "*";
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : fallbackOrigin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Vary": "Origin",
  };
}
