import { Outlet, Navigate, useLocation } from "react-router-dom";
import { createContext, useContext, useState, useCallback } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { QuickSwitcher } from "@/components/QuickSwitcher";
import { QuotaWarning } from "@/components/QuotaWarning";
import { ProductTour } from "@/components/ProductTour";
import { SupportWidget } from "@/components/SupportWidget";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { useOnboardingCheck } from "@/hooks/use-onboarding-check";
import { Scale } from "lucide-react";
import { motion } from "framer-motion";

const OnboardingContext = createContext<{ markComplete: () => void }>({ markComplete: () => {} });
export const useOnboardingContext = () => useContext(OnboardingContext);

const TOUR_SEEN_KEY = "product_tour_seen";

export default function AppLayout() {
  const { loading, activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const location = useLocation();
  const { needsOnboarding, loading: onboardingLoading, markComplete } = useOnboardingCheck();

  const [tourActive, setTourActive] = useState(false);

  // Auto-start tour on first visit after onboarding
  const handleOnboardingMarkComplete = useCallback(() => {
    markComplete();
    if (!localStorage.getItem(TOUR_SEEN_KEY)) {
      setTimeout(() => setTourActive(true), 600);
    }
  }, [markComplete]);

  const handleTourComplete = useCallback(() => {
    setTourActive(false);
    try { localStorage.setItem(TOUR_SEEN_KEY, "1"); } catch {}
  }, []);

  const handleStartTour = useCallback(() => {
    setTourActive(true);
  }, []);

  if (loading || onboardingLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="h-12 w-12 rounded-2xl bg-foreground/[0.04] border border-border/30 flex items-center justify-center">
            <Scale className="h-5 w-5 text-foreground/20" />
          </div>
          <div className="h-5 w-5 border-[1.5px] border-foreground/10 border-t-foreground/40 rounded-full animate-spin" />
        </motion.div>
      </div>
    );
  }

  // Redirect to onboarding if not completed (and not already there)
  if (needsOnboarding && !location.pathname.startsWith("/app/onboarding")) {
    return <Navigate to="/app/onboarding" replace />;
  }

  const isOnboarding = location.pathname.startsWith("/app/onboarding");

  return (
    <OnboardingContext.Provider value={{ markComplete: handleOnboardingMarkComplete }}>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          {!isOnboarding && (
            <div data-tour="sidebar">
              <AppSidebar />
            </div>
          )}
          <main className="flex-1 flex flex-col min-h-screen min-w-0">
            {!isOnboarding && <QuotaWarning />}
            <Outlet />
          </main>
        </div>
        {!isOnboarding && <QuickSwitcher />}
        <ProductTour isActive={tourActive} onComplete={handleTourComplete} />
        {!isOnboarding && <SupportWidget onStartTour={handleStartTour} />}
      </SidebarProvider>
    </OnboardingContext.Provider>
  );
}
