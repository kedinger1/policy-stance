import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { login } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect("/admin/review");
  const { error } = await searchParams;
  const configured = Boolean(process.env.ADMIN_PASSWORD);

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">Reviewer log in</h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        For the person confirming flagged verdicts. There are no public accounts.
      </p>

      {!configured ? (
        <p className="mt-6 rounded border border-stone-200 p-4 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
          Log in isn&apos;t configured on this deployment.
        </p>
      ) : (
        <form action={login} className="mt-6 space-y-3">
          <label htmlFor="password" className="block font-mono text-xs uppercase tracking-wider text-stone-500">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-50"
          />
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              That password didn&apos;t match.
            </p>
          )}
          <button
            type="submit"
            className="rounded bg-teal-700 px-4 py-2 font-mono text-sm text-white transition-colors hover:bg-teal-800 dark:bg-teal-400 dark:text-stone-950 dark:hover:bg-teal-300"
          >
            Log in
          </button>
        </form>
      )}
    </div>
  );
}
