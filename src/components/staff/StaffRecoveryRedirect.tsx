"use client";

import { useEffect } from "react";
import {
  shouldRedirectToStaffReset,
  staffResetLocation,
} from "@/lib/staff/recovery";

/**
 * Dashboard "Send password recovery" uses the Supabase Site URL, which is
 * often `/`. Tokens then land on the farmer home as a URL hash. This redirect
 * is invisible to farmers and does not change farmer chat or account UI.
 */
export function StaffRecoveryRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !shouldRedirectToStaffReset({
        pathname: window.location.pathname,
        search: new URLSearchParams(window.location.search),
        hash: window.location.hash,
      })
    ) {
      return;
    }
    window.location.replace(
      staffResetLocation(window.location.search, window.location.hash),
    );
  }, []);
  return null;
}
