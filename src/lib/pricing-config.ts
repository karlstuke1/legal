// Central pricing configuration used across PricingPage and BillingSettingsTab

export interface PlanConfig {
  key: string;
  label: string;
  price: number | null; // null = contact sales
  seats: number | null; // null = unlimited
  queries: string;
  uploads: string;
  pseudonymizations?: string;
  features: string[];
  popular?: boolean;
  badge?: string;
}

export const PLAN_CONFIGS: PlanConfig[] = [
  {
    key: "free",
    label: "Free",
    price: 0,
    seats: 2,
    queries: "25",
    uploads: "5",
    pseudonymizations: "5",
    features: [
      "25 Anfragen / Monat",
      "5 Uploads / Monat",
      "Basis-Quellen (RIS)",
      "Chat-Verlauf",
    ],
  },
  {
    key: "student",
    label: "Student",
    price: 19,
    seats: 1,
    queries: "100",
    uploads: "25",
    pseudonymizations: "15",
    badge: "Für Studenten",
    features: [
      "100 Anfragen / Monat",
      "25 Uploads / Monat",
      "Pseudonymisierung (lokal)",
      "Alle Quellen",
      "E-Mail-Support",
    ],
  },
  {
    key: "starter",
    label: "Starter",
    price: 49,
    seats: 3,
    queries: "300",
    uploads: "75",
    pseudonymizations: "40",
    features: [
      "300 Anfragen / Monat",
      "75 Uploads / Monat",
      "Pseudonymisierung (lokal)",
      "Alle Quellen",
      "3 Team-Plätze",
      "Dokumentenprüfung",
      "Export (Markdown)",
    ],
  },
  {
    key: "professional",
    label: "Professional",
    price: 99,
    seats: 10,
    queries: "1.000",
    uploads: "250",
    pseudonymizations: "150",
    popular: true,
    features: [
      "1.000 Anfragen / Monat",
      "250 Uploads / Monat",
      "Pseudonymisierung (lokal)",
      "Alle Modi (Research, Draft, Mandantenakten)",
      "10 Team-Plätze",
      "Priority Support",
      "Mandantenakten",
    ],
  },
  {
    key: "enterprise",
    label: "Enterprise",
    price: null,
    seats: null,
    queries: "Unbegrenzt",
    uploads: "Unbegrenzt",
    pseudonymizations: "Unbegrenzt",
    features: [
      "Unbegrenzte Anfragen",
      "Unbegrenzte Uploads",
      "Unbegrenzte Plätze",
      "SLA & Uptime-Garantie",
      "SSO / SAML",
      "Dedizierter Account Manager",
    ],
  },
];

// Plan limits for database updates (used in checkout/webhook)
export const PLAN_LIMITS: Record<string, {
  monthly_queries_limit: number;
  monthly_uploads_limit: number;
  monthly_pseudonymizations_limit: number;
  seats_limit: number;
}> = {
  free: { monthly_queries_limit: 25, monthly_uploads_limit: 5, monthly_pseudonymizations_limit: 5, seats_limit: 2 },
  student: { monthly_queries_limit: 100, monthly_uploads_limit: 25, monthly_pseudonymizations_limit: 15, seats_limit: 1 },
  starter: { monthly_queries_limit: 300, monthly_uploads_limit: 75, monthly_pseudonymizations_limit: 40, seats_limit: 3 },
  professional: { monthly_queries_limit: 1000, monthly_uploads_limit: 250, monthly_pseudonymizations_limit: 150, seats_limit: 10 },
  enterprise: { monthly_queries_limit: 999999, monthly_uploads_limit: 999999, monthly_pseudonymizations_limit: 999999, seats_limit: 999 },
};
