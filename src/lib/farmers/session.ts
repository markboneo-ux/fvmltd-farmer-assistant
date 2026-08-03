import type { RegisteredFarmer } from "./types";

export const FARMER_SESSION_KEY = "fvmltd_registered_farmer";

/** Same-tab signal — native `storage` events only fire across tabs. */
export const FARMER_SESSION_CHANGE_EVENT = "fvmltd-farmer-session-change";

/**
 * Cached snapshot for useSyncExternalStore.
 * getSnapshot must return a stable reference when data is unchanged;
 * re-parsing JSON on every call creates a new object and triggers
 * React error #185 (maximum update depth exceeded).
 */
let cachedRaw: string | null | undefined;
let cachedFarmer: RegisteredFarmer | null = null;

function notifyFarmerSessionChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FARMER_SESSION_CHANGE_EVENT));
}

function parseFarmer(raw: string | null): RegisteredFarmer | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RegisteredFarmer;
    if (!parsed?.id || !parsed?.farmerCode || !parsed?.fullName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveRegisteredFarmer(farmer: RegisteredFarmer): void {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(farmer);
  window.localStorage.setItem(FARMER_SESSION_KEY, raw);
  cachedRaw = raw;
  cachedFarmer = farmer;
  notifyFarmerSessionChange();
}

export function loadRegisteredFarmer(): RegisteredFarmer | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(FARMER_SESSION_KEY);
  if (raw === cachedRaw) {
    return cachedFarmer;
  }

  cachedRaw = raw;
  cachedFarmer = parseFarmer(raw);
  return cachedFarmer;
}

export function clearRegisteredFarmer(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(FARMER_SESSION_KEY);
  cachedRaw = null;
  cachedFarmer = null;
  notifyFarmerSessionChange();
}
