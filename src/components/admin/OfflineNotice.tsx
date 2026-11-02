import Link from "next/link";
import { Database, TriangleAlert } from "lucide-react";

/**
 * Shown in place of a table or a form when the read behind it failed. Split
 * between "no database configured" and "configured but the query failed",
 * because those need different fixes and an admin who is told "empty" will
 * look in the wrong place.
 */
export function OfflineNotice({
  offline,
  message,
}: {
  offline: boolean;
  message: string;
}) {
  const Icon = offline ? Database : TriangleAlert;

  return (
    <section className="rounded-lg border border-charcoal bg-ink-raised p-6">
      <div className="flex items-start gap-4">
        <Icon className="mt-1 h-5 w-5 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-paper">
            {offline ? "No database connected" : "The database did not answer"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-smoke">
            {message}
          </p>
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-smoke">
            Nothing on this screen is filled in from sample data while the real
            read is failing: an empty list here means the query did not succeed,
            not that there is nothing to show.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/admin/setup" className="btn-ghost text-xs">
              Setup status
            </Link>
            <Link href="/admin" className="btn-ghost text-xs">
              Back to overview
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
