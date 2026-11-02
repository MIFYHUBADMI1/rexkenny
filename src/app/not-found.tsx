import Link from "next/link";
import { SITE } from "@/lib/site";

export default function NotFound() {
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-black">
          Nothing here
        </h1>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-smoke">
          That page does not exist on {SITE.url}. If you followed a link from a poster,
          bio or social profile, tell us and we will fix it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-gold">Home</Link>
          <Link href="/music" className="btn-ghost">Music</Link>
          <Link href="/listen" className="btn-ghost">Listen</Link>
          <Link href="/search" className="btn-ghost">Search</Link>
        </div>
      </div>
    </div>
  );
}
