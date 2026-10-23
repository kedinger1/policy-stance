"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { SITE_NAME } from "@/lib/site";

const LINKS = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  { href: "/methodology", label: "Methodology", match: (p: string) => p.startsWith("/methodology") },
  { href: "/politicians", label: "Explore", match: (p: string) => p.startsWith("/politicians") },
];

// UI-only hint (set at login) so the nav can say "Review" instead of "Log in". It grants
// nothing: the review screen itself checks the real session on the server. Reading it
// through useSyncExternalStore keeps server and first client render identical.
const subscribeNothing = () => () => {};
const readReviewerHint = () => document.cookie.split("; ").includes("otr_admin_hint=1");

export function SiteNav() {
  const pathname = usePathname();
  const reviewer = useSyncExternalStore(subscribeNothing, readReviewerHint, () => false);

  return (
    <header className="border-b border-stone-200 dark:border-stone-800">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="shrink-0 whitespace-nowrap py-1 font-mono text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-50">
          {SITE_NAME}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-3 sm:gap-5">
          {LINKS.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`border-b-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors sm:text-xs sm:tracking-wider ${
                  active
                    ? "border-teal-700 text-stone-900 dark:border-teal-400 dark:text-stone-50"
                    : "border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-50"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href={reviewer ? "/admin/review" : "/login"}
            aria-label={reviewer ? "Review" : "Log in"}
            aria-current={pathname.startsWith("/admin") || pathname.startsWith("/login") ? "page" : undefined}
            className="flex h-8 items-center gap-1.5 rounded px-1.5 font-mono text-xs uppercase tracking-wider text-stone-500 transition-colors hover:text-stone-900 dark:hover:text-stone-50"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="hidden sm:inline">{reviewer ? "Review" : "Log in"}</span>
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
