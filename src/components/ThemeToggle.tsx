"use client";

// Both icons are always rendered and CSS picks one off the <html> .dark class,
// so there's no theme state to hydrate and nothing to mismatch with the server.
export function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("policy-stance-theme", dark ? "dark" : "light");
    } catch {
      // Private mode or blocked storage: the toggle still works for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark mode"
      className="flex h-8 w-8 items-center justify-center rounded text-stone-500 transition-colors hover:text-stone-900 dark:hover:text-stone-50"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="hidden dark:block">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="block dark:hidden">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
