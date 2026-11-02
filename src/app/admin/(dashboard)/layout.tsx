import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { signOutAction } from "@/actions/auth";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireStaff();

  return (
    <div className="min-h-screen bg-ink text-paper">
      <header className="border-b border-charcoal bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-4 px-5 py-4">
          <Link
            href="/admin"
            className="font-[family-name:var(--font-display)] text-lg font-black tracking-tight"
          >
            {SITE.shortName} <span className="text-gold">HQ</span>
          </Link>
          <span className="rounded-full border border-charcoal px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-smoke">
            Private
          </span>

          <div className="ml-auto flex items-center gap-4">
            <span className="hidden text-sm text-mist sm:inline">
              {session.email ?? "signed in"}
              <span className="ml-2 text-xs uppercase tracking-[0.14em] text-gold">
                {session.roles.join(" · ") || "no role"}
              </span>
            </span>
            <Link
              href="/"
              className="hidden items-center gap-1.5 text-sm text-smoke hover:text-paper sm:flex"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              View site
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md border border-charcoal px-3 py-1.5 text-sm text-mist hover:border-gold hover:text-gold"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[110rem] gap-8 px-5 py-8 lg:grid-cols-[15rem_1fr]">
        <aside>
          <AdminSidebar roles={session.roles} />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
