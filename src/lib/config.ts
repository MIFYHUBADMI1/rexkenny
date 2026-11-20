const truthy = (v: string | undefined): string | undefined =>
  v && v.trim().length > 0 ? v.trim() : undefined;

/**
 * The live origin. Canonicals, OG URLs, the sitemap and JSON-LD all resolve
 * against it, so a build that forgot NEXT_PUBLIC_SITE_URL must not publish
 * http://localhost:3000 as the authoritative address of every page — that URL
 * would then be shared, crawled and remembered.
 */
const LIVE_ORIGIN = "https://rexkenny.atai.ink";

export const env = {
  siteUrl: truthy(process.env.NEXT_PUBLIC_SITE_URL) ?? LIVE_ORIGIN,
  supabaseUrl: truthy(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: truthy(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  serviceRoleKey: truthy(process.env.SUPABASE_SERVICE_ROLE_KEY),
  smtpHost: truthy(process.env.SMTP_HOST),
  smtpPort: Number(process.env.SMTP_PORT) > 0 ? Number(process.env.SMTP_PORT) : 465,
  smtpUser: truthy(process.env.SMTP_USER),
  smtpPass: truthy(process.env.SMTP_PASS),
  emailFrom: truthy(process.env.EMAIL_FROM),
  ga4Id: truthy(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID),
  aiApiKey: truthy(process.env.AI_API_KEY),
  aiProvider: truthy(process.env.AI_PROVIDER)?.toLowerCase(),
  aiModel: truthy(process.env.AI_MODEL),
  aiBaseUrl: truthy(process.env.AI_BASE_URL),
} as const;

/** Server-only guard. Importing this from client code throws at build time. */
export function requireServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("env accessed from client code");
  }
  return env;
}

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey,
);

/** Admin writes need the service role; anon key alone is not enough. */
export const isSupabaseAdminConfigured = Boolean(
  env.supabaseUrl && env.serviceRoleKey,
);

export const isEmailConfigured = Boolean(
  env.smtpHost && env.smtpUser && env.smtpPass && env.emailFrom,
);
export const isAnalyticsConfigured = Boolean(env.ga4Id);
export const isAiConfigured = Boolean(env.aiApiKey && env.aiModel);

export type IntegrationState = {
  key: string;
  label: string;
  configured: boolean;
  /** What the admin still has to do — never shown as "working" when false. */
  action: string;
};

export function integrationStates(): IntegrationState[] {
  return [
    {
      key: "supabase",
      label: "Supabase database",
      configured: isSupabaseConfigured,
      action: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    },
    {
      key: "supabase-admin",
      label: "Supabase service role (admin writes)",
      configured: isSupabaseAdminConfigured,
      action: "Set SUPABASE_SERVICE_ROLE_KEY in the server environment only.",
    },
    {
      key: "email",
      label: "SMTP email (e.g. Gmail)",
      configured: isEmailConfigured,
      action:
        "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM. For Gmail use an App Password.",
    },
    {
      key: "analytics",
      label: "Google Analytics 4",
      configured: isAnalyticsConfigured,
      action: "Set NEXT_PUBLIC_GA4_MEASUREMENT_ID.",
    },
    {
      key: "ai",
      label: "AI assistant",
      configured: isAiConfigured,
      action:
        "Set AI_PROVIDER, AI_MODEL and AI_API_KEY (server-side only).",
    },
  ];
}
