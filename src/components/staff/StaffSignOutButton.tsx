"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function StaffSignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/staff/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-surface px-3 text-sm font-semibold text-canopy ring-1 ring-line transition hover:bg-sky/60"
    >
      Sign out
    </button>
  );
}
