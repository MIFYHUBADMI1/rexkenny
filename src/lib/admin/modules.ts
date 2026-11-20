import type { Role } from "@/lib/auth/roles";

export type AdminModule = {
  href: string;
  label: string;
  /** Short description shown under the label in the overview grid. */
  blurb: string;
  /** Roles allowed in. Editors and admins both pass; fans never do. */
  roles: Role[];
  /**
   * False until the page exists. Unbuilt modules are rendered as disabled
   * rows — never as links, because a dead link in the admin is worse than an
   * honest "not built yet".
   */
  built: boolean;
};

export const ADMIN_MODULES: AdminModule[] = [
  {
    href: "/admin",
    label: "Overview",
    blurb: "What is real, what is missing, what needs attention.",
    roles: ["super_admin", "admin", "editor", "marketing_manager", "analytics_viewer"],
    built: true,
  },
  {
    href: "/admin/assistant",
    label: "Assistant",
    blurb: "Ask about the catalogue and get onboarding help. Remembers the conversation.",
    roles: ["super_admin", "admin", "editor", "marketing_manager", "analytics_viewer"],
    built: true,
  },
  {
    href: "/admin/releases",
    label: "Releases",
    blurb: "Draft to released, with readiness checks and metadata export.",
    roles: ["super_admin", "admin", "editor"],
    built: true,
  },
  {
    href: "/admin/music",
    label: "Add music",
    blurb: "Upload a song, cover art and optional video from your device.",
    roles: ["super_admin", "admin", "editor"],
    built: true,
  },
  {
    href: "/admin/distribution",
    label: "Distribution",
    blurb: "Per-DSP submission state, backed only by verified or confirmed events.",
    roles: ["super_admin", "admin", "editor"],
    built: true,
  },
  {
    href: "/admin/seo",
    label: "SEO",
    blurb: "Titles, descriptions, canonicals, index controls and structured data.",
    roles: ["super_admin", "admin", "editor"],
    built: true,
  },
  {
    href: "/admin/media",
    label: "Media",
    blurb: "Artwork, press photos, video thumbnails, master files.",
    roles: ["super_admin", "admin", "editor"],
    built: false,
  },
  {
    href: "/admin/content",
    label: "Pages & posts",
    blurb: "News, biography and long-form pages.",
    roles: ["super_admin", "admin", "editor"],
    built: false,
  },
  {
    href: "/admin/fans",
    label: "Fans",
    blurb: "Accounts, favourites and activity.",
    roles: ["super_admin", "admin", "marketing_manager"],
    built: false,
  },
  {
    href: "/admin/enquiries",
    label: "Enquiries",
    blurb: "Booking, press, collaboration and licence requests.",
    roles: ["super_admin", "admin", "editor"],
    built: false,
  },
  {
    href: "/admin/newsletter",
    label: "Newsletter",
    blurb: "Double opt-in list and campaigns.",
    roles: ["super_admin", "admin", "marketing_manager"],
    built: false,
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    blurb: "First-party counts and connected provider data.",
    roles: ["super_admin", "admin", "marketing_manager", "analytics_viewer"],
    built: false,
  },
  {
    href: "/admin/trends",
    label: "Trends",
    blurb: "Scene intelligence with a citation for every number.",
    roles: ["super_admin", "admin", "marketing_manager", "analytics_viewer"],
    built: false,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    blurb: "Site copy, integrations and roles.",
    roles: ["super_admin", "admin"],
    built: false,
  },
  {
    href: "/admin/setup",
    label: "Setup status",
    blurb: "Which integrations this deployment actually resolves.",
    roles: ["super_admin", "admin", "editor", "marketing_manager", "analytics_viewer"],
    built: true,
  },
];

export function visibleModules(roles: Role[]): AdminModule[] {
  return ADMIN_MODULES.filter((m) => m.roles.some((r) => roles.includes(r)));
}
