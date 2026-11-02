import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Dashboard",
    description: "Private administration area.",
    path: "/admin",
    noindex: true,
  });
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
