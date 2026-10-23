"use server";

import { revalidatePath } from "next/cache";
import { adminClient, isAdmin } from "@/lib/admin";

// Confirming makes a flagged contradiction count; overriding says it isn't one, which
// reclassifies it "not a clean test" so it no longer counts either way. Only matches
// that are currently flagged possible contradictions can be touched from here.
export async function resolveMatches(formData: FormData) {
  if (!(await isAdmin())) throw new Error("Not logged in.");

  const decision = formData.get("decision");
  const ids = String(formData.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0 || (decision !== "confirm" && decision !== "override")) throw new Error("Bad request.");

  const patch = decision === "confirm" ? { status: "human_confirmed" } : { status: "human_overridden", classification: "na" };

  const { error } = await adminClient()
    .from("matches")
    .update({ ...patch, reviewed_by: "local-admin", reviewed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "needs_review")
    .eq("classification", "broken");
  if (error) throw new Error(error.message);

  revalidatePath("/admin/review");
  revalidatePath("/politicians", "layout");
}
