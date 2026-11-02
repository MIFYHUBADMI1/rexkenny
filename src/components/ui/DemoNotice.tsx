import Link from "next/link";
import { Play, Disc3 } from "lucide-react";

/**
 * Honest demo banner: shown whenever content comes from the bundled
 * placeholder file instead of the configured Supabase project.
 */
export function DemoNotice() {
  return (
    <div className="border-y border-gold-deep/40 bg-gold/10">
      <div className="container-page flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold text-gold">
          <Disc3 size={15} /> Demo content
        </span>
        <span className="text-mist">
          Supabase is not connected, so this page shows structural placeholders —
          not real releases.
        </span>
        <Link href="/admin/setup" className="font-semibold text-gold underline">
          Connect your project
        </Link>
      </div>
    </div>
  );
}

/** Reusable "no data yet" state that never implies fake numbers. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-ash bg-ink-raised p-10 text-center">
      <Play className="mx-auto text-gold/60" size={22} />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-smoke">{body}</p>
      {action && (
        <Link href={action.href} className="btn-ghost mt-6">
          {action.label}
        </Link>
      )}
    </div>
  );
}
