import { requireStaff } from "@/lib/auth/session";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

/**
 * The dashboard shares the public site's header (root layout) — there is one
 * navigation, not two. This layout only provides the admin sidebar column and
 * the content grid; auth controls live in the shared header via AccountLink.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireStaff();

  return (
    <div className="min-h-screen bg-ink text-paper">
      <div className="mx-auto grid max-w-[110rem] gap-8 px-5 py-8 lg:grid-cols-[15rem_1fr]">
        <aside>
          <AdminSidebar roles={session.roles} />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
