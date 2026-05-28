import { useEffect, lazy, Suspense, type ReactNode } from "react";
import { HelmetProvider } from "react-helmet-async";
import { useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { WorkspaceProvider } from "@/lib/workspace";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CookieBanner from "./components/CookieBanner";

// Eagerly loaded (small, always needed)
import Auth from "./pages/Auth";
import AppLayout from "./components/AppLayout";

// Lazy loaded (heavy pages)
const ChatPage = lazy(() => import("./pages/ChatPage"));
const ReferralPage = lazy(() => import("./pages/ReferralPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const UsagePage = lazy(() => import("./pages/UsagePage"));
const InvitePage = lazy(() => import("./pages/InvitePage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const MattersPage = lazy(() => import("./pages/MattersPage"));
const MatterDetailPage = lazy(() => import("./pages/MatterDetailPage"));
const AdminFeedbackPage = lazy(() => import("./pages/AdminFeedbackPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const KnowledgeBasePage = lazy(() => import("./pages/KnowledgeBasePage"));
const ContractComparePage = lazy(() => import("./pages/ContractComparePage"));
const PinnedPage = lazy(() => import("./pages/PinnedPage"));
const AdminBlogPage = lazy(() => import("./pages/AdminBlogPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DatenschutzPage = lazy(() => import("./pages/DatenschutzPage"));
const ImpressumPage = lazy(() => import("./pages/ImpressumPage"));
const AGBPage = lazy(() => import("./pages/AGBPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const SharedChatPage = lazy(() => import("./pages/SharedChatPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <div className="h-6 w-6 border-2 border-foreground/15 border-t-foreground rounded-full animate-spin" />
    </div>
  );
}

function GlobalAsyncErrorGuard() {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      event.preventDefault();
    };

    const handleError = (event: ErrorEvent) => {
      console.error("Global runtime error:", event.error || event.message);
    };

    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return null;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-foreground/15 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-foreground/15 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  if (user) return <Navigate to="/app/chat" replace />;
  return <Auth />;
}

function ReferralRedirect() {
  const { code } = useParams();
  useEffect(() => {
    if (code) {
      try { localStorage.setItem("ref_code", code.toUpperCase()); } catch {}
    }
    window.location.replace("/auth");
  }, [code]);
  return null;
}

const App = () => (
  <HelmetProvider>
  <QueryClientProvider client={queryClient}>
    <GlobalAsyncErrorGuard />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary fallbackTitle="Anwendungsfehler">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/r/:code" element={<ReferralRedirect />} />
                <Route path="/auth" element={<AuthRoute />} />
                <Route path="/datenschutz" element={<DatenschutzPage />} />
                <Route path="/impressum" element={<ImpressumPage />} />
                <Route path="/agb" element={<AGBPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/invite/:token" element={<InvitePage />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/shared/:token" element={<SharedChatPage />} />
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/blog/:slug" element={<BlogPage />} />
                <Route path="/" element={<LandingPage />} />
                <Route
                  path="/app"
                  element={
                    <ProtectedRoute>
                      <WorkspaceProvider>
                        <ErrorBoundary fallbackTitle="Layout-Fehler">
                          <AppLayout />
                        </ErrorBoundary>
                      </WorkspaceProvider>
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="chat" replace />} />
                  <Route path="onboarding" element={<OnboardingPage />} />
                  <Route path="chat/:chatId?" element={<ErrorBoundary fallbackTitle="Chat-Fehler"><ChatPage /></ErrorBoundary>} />
                  <Route path="matters" element={<MattersPage />} />
                  <Route path="matters/:matterId" element={<MatterDetailPage />} />
                  <Route path="knowledge" element={<KnowledgeBasePage />} />
                  <Route path="compare" element={<ContractComparePage />} />
                  <Route path="pinned" element={<PinnedPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="referral" element={<Suspense fallback={<PageLoader />}><ReferralPage /></Suspense>} />
                  <Route path="usage" element={<UsagePage />} />
                  <Route path="admin/feedback" element={<AdminFeedbackPage />} />
                  <Route path="admin/blog" element={<AdminBlogPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
        <CookieBanner />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
