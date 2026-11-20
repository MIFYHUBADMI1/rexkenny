"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  Circle,
  Disc3,
  Image,
  Inbox,
  LayoutDashboard,
  Mail,
  Music,
  Search,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { visibleModules, type AdminModule } from "@/lib/admin/modules";
import type { Role } from "@/lib/auth/roles";

const ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/assistant": Sparkles,
  "/admin/releases": Disc3,
  "/admin/music": Music,
  "/admin/distribution": Send,
  "/admin/seo": Search,
  "/admin/media": Image,
  "/admin/content": FileText,
  "/admin/fans": Users,
  "/admin/enquiries": Inbox,
  "/admin/newsletter": Mail,
  "/admin/analytics": BarChart3,
  "/admin/trends": TrendingUp,
  "/admin/settings": Settings,
  "/admin/setup": CheckCircle2,
};

export function NavItem({ module, active }: { module: AdminModule; active: boolean }) {
  const Icon = ICONS[module.href] ?? Circle;

  if (!module.built) {
    return (
      <li>
        <span
          aria-disabled="true"
          title="Not built yet"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-smoke/60"
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{module.label}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.14em]">soon</span>
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={module.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
          active
            ? "bg-gold/10 text-gold"
            : "text-mist hover:bg-ink-raised hover:text-paper"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{module.label}</span>
      </Link>
    </li>
  );
}

/**
 * The shared list of dashboard sections. Rendered by the desktop sidebar and
 * by the Workspace group inside the header's mobile menu, so both always show
 * the same items.
 */
export function AdminNavList({ roles }: { roles: Role[] }) {
  const pathname = usePathname();
  const modules = visibleModules(roles);

  return (
    <>
      <p className="eyebrow px-3">Workspace</p>
      <ul className="mt-3 space-y-1">
        {modules.map((m) => (
          <NavItem key={m.href} module={m} active={pathname === m.href} />
        ))}
      </ul>
      <p className="mt-4 px-3 text-xs leading-relaxed text-smoke">
        Greyed items are not built yet, so they are not links.
      </p>
    </>
  );
}

/**
 * Desktop sidebar column. Below lg the header's mobile menu carries the same
 * links, so this is hidden there to keep the page free of duplicate nav.
 */
export function AdminSidebar({ roles }: { roles: Role[] }) {
  return (
    <nav aria-label="Dashboard" className="hidden lg:sticky lg:top-24 lg:block">
      <AdminNavList roles={roles} />
    </nav>
  );
}
