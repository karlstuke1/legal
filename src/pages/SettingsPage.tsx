import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Building2, Users, CreditCard, Shield, BarChart3, ThumbsUp, TicketCheck } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { SidebarTrigger } from "@/components/ui/sidebar";
import ProfileSettingsTab from "@/components/settings/ProfileSettingsTab";
import WorkspaceSettingsTab from "@/components/settings/WorkspaceSettingsTab";
import TeamSettingsTab from "@/components/settings/TeamSettingsTab";
import BillingSettingsTab from "@/components/settings/BillingSettingsTab";
import AuditLogTab from "@/components/settings/AuditLogTab";
import UsageSettingsTab from "@/components/settings/UsageSettingsTab";
import FeedbackSettingsTab from "@/components/settings/FeedbackSettingsTab";
import SupportTicketsTab from "@/components/settings/SupportTicketsTab";

import { useIsAdmin } from "@/hooks/use-admin";

const tabTriggerClass =
  "text-[12px] gap-1.5 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border-border/30 py-2.5 font-medium text-muted-foreground/50 data-[state=active]:text-foreground transition-all";

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "profile";
  const { isAdmin } = useIsAdmin();
  const colCount = isAdmin ? 7 : 5;

  return (
    <PageContainer maxWidth="sm">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="h-7 w-7 shrink-0" />
        <PageHeader
          title="Einstellungen"
          description="Verwalten Sie Ihr Profil, Ihre Kanzlei und Ihr Abonnement."
        />
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList
          className="w-full bg-muted/20 p-1.5 rounded-2xl h-auto border border-border/20 overflow-x-auto scrollbar-none"
          style={{ display: "flex", gap: "2px" }}
        >
          <TabsTrigger value="profile" className={tabTriggerClass}>
            <User className="h-3.5 w-3.5" />
            <span className="text-[10px] sm:text-[12px]">Profil</span>
          </TabsTrigger>
          <TabsTrigger value="workspace" className={tabTriggerClass}>
            <Building2 className="h-3.5 w-3.5" />
            <span className="text-[10px] sm:text-[12px]">Kanzlei</span>
          </TabsTrigger>
          <TabsTrigger value="team" className={tabTriggerClass}>
            <Users className="h-3.5 w-3.5" />
            <span className="text-[10px] sm:text-[12px]">Team</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className={tabTriggerClass}>
            <CreditCard className="h-3.5 w-3.5" />
            <span className="text-[10px] sm:text-[12px]">Abo</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className={tabTriggerClass}>
            <Shield className="h-3.5 w-3.5" />
            <span className="text-[10px] sm:text-[12px]">Audit</span>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="usage" className={tabTriggerClass}>
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nutzung</span>
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="feedback" className={tabTriggerClass}>
              <ThumbsUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Feedback</span>
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="support" className={tabTriggerClass}>
              <TicketCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Support</span>
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="profile"><ProfileSettingsTab /></TabsContent>
        <TabsContent value="workspace"><WorkspaceSettingsTab /></TabsContent>
        <TabsContent value="team"><TeamSettingsTab /></TabsContent>
        <TabsContent value="billing"><BillingSettingsTab /></TabsContent>
        <TabsContent value="audit"><AuditLogTab /></TabsContent>
        
        {isAdmin && <TabsContent value="usage"><UsageSettingsTab /></TabsContent>}
        {isAdmin && <TabsContent value="feedback"><FeedbackSettingsTab /></TabsContent>}
        {isAdmin && <TabsContent value="support"><SupportTicketsTab /></TabsContent>}
      </Tabs>
    </PageContainer>
  );
}
