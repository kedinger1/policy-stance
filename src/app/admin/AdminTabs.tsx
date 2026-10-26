"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/review", label: "Contradictions" },
  { href: "/admin/label", label: "Accuracy sample" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Reviewer tools" className="mb-6 flex gap-5 border-b border-stone-200 dark:border-stone-800">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
              active
                ? "border-teal-700 text-stone-900 dark:border-teal-400 dark:text-stone-50"
                : "border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-50"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
