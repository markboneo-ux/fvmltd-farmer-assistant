import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { resolveRequestIdentity } from "./session";
import type { AppIdentity } from "./identity";

export async function getAuthUser(): Promise<{
  id: string;
  email: string | null;
} | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

export async function resolveIdentityFromRequest(guestSessionId?: string | null): Promise<AppIdentity> {
  const user = await getAuthUser();
  let farmerProfileId: string | null = null;
  if (user) {
    const admin = tryCreateAdminClient();
    if (admin.ok) {
      const { data } = await admin.client
        .from("farmer_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      farmerProfileId = (data?.id as string | undefined) ?? null;
    }
  }
  return resolveRequestIdentity({
    authUserId: user?.id ?? null,
    email: user?.email ?? null,
    farmerProfileId,
    guestSessionId,
  });
}
