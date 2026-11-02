import type { ReactNode } from "react";
import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";

export function Section({
  eyebrow,
  title,
  description,
  action,
  children,
  id,
  tone = "default",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  children: ReactNode;
  id?: string;
  tone?: "default" | "raised";
}) {
  return (
    <section
      id={id}
      className={`border-b border-charcoal/60 py-16 md:py-24 ${
        tone === "raised" ? "bg-ink-soft" : ""
      }`}
    >
      <div className="container-page">
        <Reveal className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 className="mt-2 text-3xl font-bold md:text-4xl">{title}</h2>
            {description && (
              <p className="mt-3 leading-relaxed text-smoke">{description}</p>
            )}
          </div>
          {action && (
            <Link href={action.href} className="btn-ghost shrink-0">
              {action.label}
            </Link>
          )}
        </Reveal>
        <Reveal delay={90}>{children}</Reveal>
      </div>
    </section>
  );
}
