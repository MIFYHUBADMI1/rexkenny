import Link from "next/link";

export function PageHeader({
  crumbs,
  title,
  lede,
}: {
  crumbs: { name: string; path: string }[];
  title: string;
  lede: string;
}) {
  return (
    <header className="border-b border-charcoal bg-ink-soft py-14 md:py-20">
      <div className="container-page">
        <nav aria-label="Breadcrumb" className="text-xs text-smoke">
          {crumbs.map((c, i) => (
            <span key={c.path}>
              {i > 0 && <span className="mx-2">/</span>}
              {i === crumbs.length - 1 ? (
                <span aria-current="page" className="text-gold">
                  {c.name}
                </span>
              ) : (
                <Link href={c.path} className="hover:text-gold">
                  {c.name}
                </Link>
              )}
            </span>
          ))}
        </nav>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-black md:text-6xl">
          {title}
        </h1>
        <div className="gold-rule rk-rule rk-head-rule" aria-hidden />
        <p className="mt-4 max-w-2xl leading-relaxed text-smoke">{lede}</p>
      </div>
    </header>
  );
}
