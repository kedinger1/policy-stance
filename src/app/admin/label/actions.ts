"use server";

import { revalidatePath } from "next/cache";
import { adminClient, isAdmin } from "@/lib/admin";

const LABELS = ["contradiction", "match", "not_testable", "unsure"] as const;

export async function labelPair(formData: FormData) {
  if (!(await isAdmin())) throw new Error("Not logged in.");

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(LABELS as readonly string[]).includes(label)) throw new Error("Bad request.");

  const { error } = await adminClient()
    .from("validation_pairs")
    .update({ human_label: label, human_note: note || null, labeled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/label");
}

// Lets a labeler change their mind: clears one pair so it returns to the queue.
export async function clearLabel(formData: FormData) {
  if (!(await isAdmin())) throw new Error("Not logged in.");
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Bad request.");

  const { error } = await adminClient()
    .from("validation_pairs")
    .update({ human_label: null, human_note: null, labeled_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/label");
}
