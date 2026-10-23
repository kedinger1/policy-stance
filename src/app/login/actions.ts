"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HINT_COOKIE, passwordMatches, SESSION_COOKIE_NAME, sessionToken } from "@/lib/admin";

const WEEK = 60 * 60 * 24 * 7;

export async function login(formData: FormData) {
  const attempt = String(formData.get("password") ?? "");
  const token = sessionToken();

  if (!token || !passwordMatches(attempt)) {
    // A short delay on every failure takes the edge off password guessing.
    await new Promise((resolve) => setTimeout(resolve, 800));
    redirect("/login?error=1");
  }

  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  store.set(SESSION_COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: WEEK });
  store.set(HINT_COOKIE, "1", { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: WEEK });
  redirect("/admin/review");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  store.delete(HINT_COOKIE);
  redirect("/");
}
