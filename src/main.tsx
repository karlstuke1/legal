import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root wurde nicht gefunden.");
}

const root = createRoot(rootElement);

const BOOTSTRAP_RELOAD_KEY = "app_bootstrap_reload_once";

const renderFatalError = (title: string, details: string) => {
  root.render(
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-3">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{details}</p>
        <button
          onClick={() => {
            sessionStorage.removeItem(BOOTSTRAP_RELOAD_KEY);
            window.location.reload();
          }}
          className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted transition-colors"
        >
          Neu laden
        </button>
      </div>
    </div>
  );
};

const getBootstrapErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Unbekannter Startfehler";
};

const isRecoverableChunkError = (error: unknown) => {
  const message = getBootstrapErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("chunkloaderror")
  );
};

import("./App.tsx")
  .then(({ default: App }) => {
    sessionStorage.removeItem(BOOTSTRAP_RELOAD_KEY);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  })
  .catch((error) => {
    console.error("App bootstrap failed:", error);

    const hasRetriedBootstrap = sessionStorage.getItem(BOOTSTRAP_RELOAD_KEY);

    if (isRecoverableChunkError(error) && !hasRetriedBootstrap) {
      sessionStorage.setItem(BOOTSTRAP_RELOAD_KEY, "1");
      window.location.reload();
      return;
    }

    renderFatalError(
      "Anwendung konnte nicht geladen werden",
      `Beim Start ist ein Fehler aufgetreten: ${getBootstrapErrorMessage(error)}. Bitte laden Sie die Seite neu.`
    );
  });
