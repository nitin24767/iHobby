"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth";
import { isApplicationCurrency } from "@/lib/currency";
import { setApplicationCurrency } from "@/lib/server/application-settings";

export async function updateCurrencyAction(formData: FormData) {
  const actor = await getCurrentActor();
  const currency = formData.get("currency");
  if (!isApplicationCurrency(currency)) redirect("/admin/settings?status=invalid");

  const result = await setApplicationCurrency(actor, currency);
  if (result.mode === "updated") revalidatePath("/", "layout");
  redirect(`/admin/settings?status=${result.mode}`);
}
