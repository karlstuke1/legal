import { NavigationHeader } from "@/components/landing/NavigationHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { TrustBar, ModesSection, SourcesSection, AgenticSection, MattersSection, DocumentSection, PersonalizationSection, StatsSection } from "@/components/landing/FeaturesSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { PartnerSection } from "@/components/landing/PartnerSection";
import { CtaSection, FooterSection } from "@/components/landing/FooterSection";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background gradient-mesh">
      <NavigationHeader />
      <HeroSection />
      <TrustBar />
      <ModesSection />
      <SourcesSection />
      <AgenticSection />
      <MattersSection />
      <DocumentSection />
      <PersonalizationSection />
      <StatsSection />
      <PricingSection />
      <PartnerSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}
